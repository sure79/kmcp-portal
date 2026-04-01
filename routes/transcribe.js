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

// fileData는 v1beta에서만 지원 — v1beta 엔드포인트 사용, 모델 자동 폴백
const MODEL_FALLBACKS = [
  'gemini-2.0-flash-exp',     // 2.0 실험버전 (v1beta에서 지원)
  'gemini-2.0-flash',         // 2.0 정식 (일부 키에서 v1beta 지원)
  'gemini-1.5-flash-002',     // 1.5 최신 안정버전
  'gemini-1.5-flash-001',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-002',
  'gemini-1.5-pro',
];

async function generateMeetingMinutes(apiKey, fileUri, mimeType, preferredModel) {
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

  // 우선 시도할 모델 목록 (환경변수 > 폴백 순)
  const modelsToTry = preferredModel
    ? [preferredModel, ...MODEL_FALLBACKS.filter(m => m !== preferredModel)]
    : MODEL_FALLBACKS;

  let lastError = null;
  for (const modelName of modelsToTry) {
    console.log(`Gemini 모델 시도: ${modelName}`);
    // fileData 는 반드시 v1beta 엔드포인트
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

    if (res.ok) {
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        console.log(`성공 모델: ${modelName}`);
        return text.trim();
      }
      lastError = new Error('Gemini가 빈 응답을 반환했습니다.');
      continue;
    }

    const errText = await res.text();
    console.log(`모델 ${modelName} 실패 (${res.status}): ${errText.slice(0, 200)}`);
    // 404(모델 없음) → 다음 모델 시도 / 다른 오류 → 즉시 중단
    if (res.status !== 404) {
      throw new Error(`Gemini 응답 오류 (${res.status}): ${errText}`);
    }
    lastError = new Error(`모델 없음: ${modelName}`);
  }

  throw lastError || new Error('사용 가능한 Gemini 모델을 찾을 수 없습니다.');
}

// 녹음 파일 업로드 → Gemini 분석 → 회의록 반환
router.post('/', upload.single('audio'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: '오디오 파일을 업로드해주세요.' });

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GOOGLE_AI_API_KEY 환경변수가 설정되지 않았습니다.' });

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const ext = path.extname(req.file.originalname).toLowerCase();
    const mimeType = MIME_MAP[ext] || req.file.mimetype || 'audio/mpeg';

    console.log(`음성 분석 시작: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)}MB), 모델: ${modelName}`);

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
