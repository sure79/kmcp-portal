const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
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

// 녹음 파일 업로드 → Gemini 분석 → 회의록 반환
router.post('/', upload.single('audio'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: '오디오 파일을 업로드해주세요.' });

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GOOGLE_AI_API_KEY 환경변수가 설정되지 않았습니다.' });

    console.log(`음성 분석 시작: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)}MB)`);

    const fileManager = new GoogleAIFileManager(apiKey);
    const genAI = new GoogleGenerativeAI(apiKey);

    // MIME 타입 결정
    const ext = path.extname(req.file.originalname).toLowerCase();
    const mimeMap = {
      '.mp3': 'audio/mpeg', '.mp4': 'audio/mp4', '.m4a': 'audio/mp4',
      '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.aac': 'audio/aac',
      '.webm': 'audio/webm', '.flac': 'audio/flac',
    };
    const mimeType = mimeMap[ext] || req.file.mimetype || 'audio/mpeg';

    // 1단계: Google에 파일 업로드
    console.log('Google Files API 업로드 중...');
    const uploadResponse = await fileManager.uploadFile(filePath, {
      mimeType,
      displayName: req.file.originalname,
    });
    const fileUri = uploadResponse.file.uri;
    console.log('업로드 완료:', fileUri);

    // 2단계: Gemini로 회의록 생성
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

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

    console.log('Gemini 분석 중...');
    const result = await model.generateContent([
      { fileData: { mimeType, fileUri } },
      { text: prompt },
    ]);

    const text = result.response.text().trim();
    console.log('Gemini 응답 수신');

    // JSON 파싱
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      // JSON 파싱 실패 시 전체 텍스트를 minutes로
      parsed = { title: '회의록', agenda: '', minutes: text, decisions: '' };
    }

    // 임시 파일 정리
    try { fs.unlinkSync(filePath); } catch {}

    res.json({ success: true, data: parsed });

  } catch (e) {
    try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    console.error('음성 분석 오류:', e.message);
    const msg = e.message?.includes('API_KEY') ? 'API 키가 유효하지 않습니다.'
      : e.message?.includes('quota') ? 'API 사용량 한도를 초과했습니다.'
      : e.message?.includes('size') ? '파일 크기가 너무 큽니다.'
      : '음성 분석 중 오류가 발생했습니다: ' + e.message;
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
