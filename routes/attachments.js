const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// ===== R2 (Cloudflare) 또는 로컬 디스크 자동 선택 =====
// R2 환경변수 4개가 모두 있으면 R2 사용, 없으면 로컬 디스크 (개발용)
const R2_ENABLED = !!(process.env.R2_ACCESS_KEY_ID
  && process.env.R2_SECRET_ACCESS_KEY
  && process.env.R2_ENDPOINT
  && process.env.R2_BUCKET);

let s3Client = null;
let PutObjectCommand, GetObjectCommand, DeleteObjectCommand, getSignedUrl;

if (R2_ENABLED) {
  const { S3Client, PutObjectCommand: P, GetObjectCommand: G, DeleteObjectCommand: D } = require('@aws-sdk/client-s3');
  const { getSignedUrl: gsu } = require('@aws-sdk/s3-request-presigner');
  PutObjectCommand = P; GetObjectCommand = G; DeleteObjectCommand = D; getSignedUrl = gsu;

  s3Client = new S3Client({
    region: 'auto',  // R2는 region 'auto' 사용
    endpoint: process.env.R2_ENDPOINT.replace(/\/+$/, ''),  // 끝 슬래시 제거
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  console.log('[attachments] R2 사용:', process.env.R2_BUCKET);
} else {
  console.log('[attachments] R2 미설정 — 로컬 디스크 사용 (개발 모드)');
}

// 로컬 디스크 폴백 (R2 미설정 시)
const localUploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!R2_ENABLED && !fs.existsSync(localUploadDir)) fs.mkdirSync(localUploadDir, { recursive: true });

// 허용 대상 타입 화이트리스트
// 'chat'/'comment'는 부모 ID가 업로드 시점엔 없을 수 있음 (target_id=0 허용)
// 메시지/댓글 INSERT 시 attachment_id로 연결됨
const ALLOWED_TYPES = new Set(['report', 'meeting', 'notice', 'project', 'task', 'suggestion', 'chat', 'comment']);

// multer: 메모리에 보관 후 R2로 스트리밍 (R2 모드) / 디스크에 저장 (로컬 모드)
const upload = R2_ENABLED
  ? multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: blockExecutables,
    })
  : multer({
      storage: multer.diskStorage({
        destination: localUploadDir,
        filename: (req, file, cb) => cb(null, generateKey(file.originalname)),
      }),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: blockExecutables,
    });

function blockExecutables(req, file, cb) {
  const blocked = /\.(exe|bat|cmd|sh|ps1|com|scr|jar|msi)$/i;
  if (blocked.test(file.originalname)) {
    return cb(new Error('실행 파일은 업로드할 수 없습니다.'));
  }
  cb(null, true);
}

function generateKey(originalName) {
  const ext = path.extname(originalName).toLowerCase().slice(0, 10);
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${stamp}-${rand}${ext}`;
}

// multer 1.x는 파일명을 latin1로 디코딩해서 한글이 깨짐 — UTF-8로 재해석
// 브라우저는 RFC 7578에 따라 UTF-8 바이트로 보내므로 latin1 → utf8 재해석이 정답
function fixUtf8Filename(file) {
  if (!file?.originalname) return;
  try {
    const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
    file.originalname = decoded;
  } catch { /* 무시 — 원본 유지 */ }
}

// ===== 라우트 =====

// 목록 조회
router.get('/', async (req, res) => {
  try {
    const { type, id } = req.query;
    if (!type || !id) return res.status(400).json({ error: 'type, id가 필요합니다.' });
    if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ error: '지원하지 않는 type입니다.' });
    const rows = await db.all(
      'SELECT id, target_type, target_id, original_name, size, mimetype, uploader_id, uploader_name, created_at FROM attachments WHERE target_type=? AND target_id=? ORDER BY created_at DESC',
      type, id
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 업로드
router.post('/:type/:id', upload.single('file'), async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!ALLOWED_TYPES.has(type)) {
      // 로컬 모드면 실패한 파일 정리
      if (!R2_ENABLED && req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: '지원하지 않는 type입니다.' });
    }
    if (!req.file) return res.status(400).json({ error: '파일이 누락되었습니다.' });
    // 한글 파일명 mojibake 수정 (latin1 → utf8)
    fixUtf8Filename(req.file);

    const userId = req.session.userId;
    const userName = req.session.user?.name ||
      (await db.get('SELECT name FROM users WHERE id=?', userId))?.name || '';

    let storedKey;
    if (R2_ENABLED) {
      // R2: 메모리 버퍼를 PutObject로 업로드
      storedKey = generateKey(req.file.originalname);
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: storedKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype || 'application/octet-stream',
        }));
      } catch (e) {
        return res.status(500).json({ error: 'R2 업로드 실패: ' + e.message });
      }
    } else {
      // 로컬: multer가 이미 디스크에 저장. filename이 키
      storedKey = req.file.filename;
    }

    const result = await db.run(
      'INSERT INTO attachments (target_type, target_id, filename, original_name, size, mimetype, uploader_id, uploader_name) VALUES (?,?,?,?,?,?,?,?)',
      type, id, storedKey, req.file.originalname, req.file.size, req.file.mimetype || '', userId, userName
    );
    res.json({ id: result.lastInsertRowid, original_name: req.file.originalname, size: req.file.size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 다운로드
router.get('/:id/download', async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM attachments WHERE id=?', req.params.id);
    if (!row) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });

    if (R2_ENABLED) {
      // R2: presigned URL을 만들어 클라이언트가 R2에 직접 다운로드
      // (15분 TTL — 충분히 길면서 키 노출은 없음)
      try {
        const cmd = new GetObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: row.filename,
          ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
        });
        const url = await getSignedUrl(s3Client, cmd, { expiresIn: 60 * 15 });
        return res.redirect(url);
      } catch (e) {
        return res.status(500).json({ error: 'R2 다운로드 URL 생성 실패: ' + e.message });
      }
    }

    // 로컬: 디스크에서 직접 전송
    const filePath = path.join(localUploadDir, row.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일이 서버에 없습니다.' });
    res.download(filePath, row.original_name);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 삭제 (업로더 또는 관리자)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const isAdmin = req.session.isAdmin;
    const row = await db.get('SELECT * FROM attachments WHERE id=?', req.params.id);
    if (!row) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    if (!isAdmin && row.uploader_id !== userId) {
      return res.status(403).json({ error: '본인이 업로드한 파일만 삭제할 수 있습니다.' });
    }

    if (R2_ENABLED) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: row.filename,
        }));
      } catch (e) {
        // R2 삭제 실패해도 DB row는 정리 — 추후 정리 작업으로 고아 객체 회수
        console.error('[attachments] R2 객체 삭제 실패 (DB는 정리):', e.message);
      }
    } else {
      const filePath = path.join(localUploadDir, row.filename);
      try { fs.unlinkSync(filePath); } catch {}
    }

    await db.run('DELETE FROM attachments WHERE id=?', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
