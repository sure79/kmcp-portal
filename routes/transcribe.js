const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// 임시 파일 저장 디렉토리
const tmpDir = path.join(os.tmpdir(), 'kmcp-audio');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(mp3|mp4|m4a|wav|ogg|aac|webm|flac)$/i.test(file.originalname);
    cb(ok ? null : new Error('지원하지 않는 파일 형식입니다. (mp3, m4a, wav, ogg 등)'), ok);
  },
});

const MIME_MAP = {
  '.mp3': 'audio/mpeg', '.mp4': 'audio/mp4', '.m4a': 'audio/mp4',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.aac': 'audio/aac',
  '.webm': 'audio/webm', '.flac': 'audio/flac',
};

// Google Files API — 재개형 업로드 (파일 크기 제한 없음)
async function uploadToGoogleFiles(apiKey, filePath, mimeType, displayName) {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  // 1단계: 업로드 세션 시작
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSize),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { displayName } }),
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`업로드 세션 시작 실패 (${initRes.status}): ${errText}`);
  }

  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Google에서 업로드 URL을 반환하지 않았습니다.');

  // 2단계: 파일 데이터 전송
  const fileBuffer = fs.readFileSync(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(fileSize),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`파일 전송 실패 (${uploadRes.status}): ${errText}`);
  }

  const json = await uploadRes.json();
  if (!json.file?.uri) throw new Error('업로드 응답에서 파일 URI를 찾을 수 없습니다.');
  return json.file.uri;
}

// 이 API 키에서 실제 사용 가능한 모델을 ListModels로 조회
async function findAvailableModel(apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`,
    { method: 'GET' }
  );

  if (!res.ok) {
    const errText = await res.text();
    // API 키 자체가 잘못됐거나 Generative Language API 미활성화
    throw new Error(`API 키 오류 (${res.status}): Google AI Studio(https://aistudio.google.com/app/apikey)에서 키를 재발급 후 Railway 환경변수 GOOGLE_AI_API_KEY를 업데이트하세요.`);
  }

  const json = await res.json();
  const models = json.models || [];
  console.log(`사용 가능한 모델 수: ${models.length}`);
  models.forEach(m => console.log(' -', m.name));

  // generateContent 지원 + 이름에 gemini 포함 + 큰 컨텍스트 선호
  const candidates = models.filter(m =>
    m.supportedGenerationMethods?.includes('generateContent') &&
    m.name.toLowerCase().includes('gemini')
  );

  if (!candidates.length) {
    throw new Error('generateContent를 지원하는 Gemini 모델이 없습니다. API 키를 확인해주세요.');
  }

  // 선호 순서: flash > pro (속도 우선)
  const preferred = candidates.find(m => m.name.includes('flash')) || candidates[0];
  const modelId = preferred.name.replace('models/', '');
  console.log(`선택된 모델: ${modelId}`);
  return modelId;
}

async function generateMeetingMinutes(apiKey, fileUri, mimeType, modelName) {
  const prompt = `이 오디오 파일은 회사 내부 회의 녹음입니다.
한국어로 회의록을 작성하고 반드시 아래 JSON 형식으로만 응답하세요 (JSON 외 다른 텍스트 없이):

{
  "title": "회의 내용을 기반으로 한 구체적인 제목 (예: 3월 4주차 SM-300 기술검토회의)",
  "agenda": "논의된 주요 안건들 (각 항목을 줄바꿈으로 구분, 번호 매기기)",
  "minutes": "회의 내용 상세 요약 (발언자별 또는 주제별로 구분하여 상세히 기록)",
  "decisions": "회의에서 결정된 사항들 (각 항목을 줄바꿈으로 구분, 담당자 포함)"
}

주의사항:
- 발언자 이름이 들리면 반드시 포함
- 결정사항은 담당자와 기한 포함
- 전문 용어는 그대로 사용
- 내용이 없는 항목은 빈 문자열로`;

  // fileData는 반드시 v1beta 엔드포인트 사용
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { fileData: { mimeType, fileUri } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0.1 },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini 응답 오류 (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini가 빈 응답을 반환했습니다.');
  return text.trim();
}

// 녹음 파일 업로드 → Gemini 분석 → 회의록 반환
router.post('/', upload.single('audio'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: '오디오 파일을 업로드해주세요.' });

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GOOGLE_AI_API_KEY 환경변수가 설정되지 않았습니다.' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const mimeType = MIME_MAP[ext] || req.file.mimetype || 'audio/mpeg';

    console.log(`음성 분석 시작: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)}MB)`);

    // 0단계: 이 API 키에서 실제 사용 가능한 모델 조회
    console.log('사용 가능한 Gemini 모델 조회 중...');
    const modelName = process.env.GEMINI_MODEL || await findAvailableModel(apiKey);
    console.log(`사용 모델: ${modelName}`);

    // 1단계: Google Files API에 업로드
    console.log('Google Files API 업로드 중...');
    const fileUri = await uploadToGoogleFiles(apiKey, filePath, mimeType, req.file.originalname);
    console.log('업로드 완료:', fileUri);

    // 2단계: Gemini로 회의록 생성
    console.log('Gemini 분석 중...');
    const text = await generateMeetingMinutes(apiKey, fileUri, mimeType, modelName);
    console.log('Gemini 응답 수신');

    // JSON 파싱
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      parsed = { title: '회의록', agenda: '', minutes: text, decisions: '' };
    }

    try { fs.unlinkSync(filePath); } catch {}
    res.json({ success: true, data: parsed });

  } catch (e) {
    try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    console.error('음성 분석 오류:', e.message);
    res.status(500).json({ error: '음성 분석 중 오류가 발생했습니다: ' + e.message });
  }
});

module.exports = router;
