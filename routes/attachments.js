const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// 첨부파일 저장 디렉토리 (Railway는 영구 볼륨 마운트 권장)
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// 허용 대상 타입 화이트리스트
const ALLOWED_TYPES = new Set(['report', 'meeting', 'notice', 'project', 'task', 'suggestion']);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    // 안전한 파일명 생성: <timestamp>-<random>.<ext>
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 10);
    cb(null, `${stamp}-${rand}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file
  fileFilter: (req, file, cb) => {
    // 실행 가능한 형식은 차단 (보안)
    const blocked = /\.(exe|bat|cmd|sh|ps1|com|scr|jar|msi)$/i;
    if (blocked.test(file.originalname)) {
      return cb(new Error('실행 파일은 업로드할 수 없습니다.'));
    }
    cb(null, true);
  },
});

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
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: '지원하지 않는 type입니다.' });
    }
    if (!req.file) return res.status(400).json({ error: '파일이 누락되었습니다.' });
    const userId = req.session.userId;
    const userName = req.session.user?.name ||
      (await db.get('SELECT name FROM users WHERE id=?', userId))?.name || '';
    const result = await db.run(
      'INSERT INTO attachments (target_type, target_id, filename, original_name, size, mimetype, uploader_id, uploader_name) VALUES (?,?,?,?,?,?,?,?)',
      type, id, req.file.filename, req.file.originalname, req.file.size, req.file.mimetype || '', userId, userName
    );
    res.json({ id: result.lastInsertRowid, original_name: req.file.originalname, size: req.file.size });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 다운로드
router.get('/:id/download', async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM attachments WHERE id=?', req.params.id);
    if (!row) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    const filePath = path.join(uploadDir, row.filename);
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
    const filePath = path.join(uploadDir, row.filename);
    try { fs.unlinkSync(filePath); } catch {}
    await db.run('DELETE FROM attachments WHERE id=?', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
