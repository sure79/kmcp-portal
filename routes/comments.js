const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// 댓글 목록 조회
router.get('/', async (req, res) => {
  try {
    const { type, id } = req.query;
    if (!type || !id) return res.status(400).json({ error: 'type과 id가 필요합니다' });
    const rows = await db.all(
      'SELECT * FROM comments WHERE target_type=? AND target_id=? ORDER BY created_at ASC',
      type, id
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 댓글 작성
router.post('/', async (req, res) => {
  try {
    const { target_type, target_id, content } = req.body;
    const userId = req.session.userId || req.session.user?.id;
    const userName = req.session.user?.name || (await db.get('SELECT name FROM users WHERE id=?', userId))?.name || '';
    if (!target_type || !target_id || !content?.trim()) return res.status(400).json({ error: '필수 항목 누락' });
    const result = await db.run(
      'INSERT INTO comments (target_type, target_id, user_id, user_name, content) VALUES (?,?,?,?,?)',
      target_type, target_id, userId, userName, content.trim()
    );
    res.json({ id: result.lastInsertRowid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 댓글 삭제 (본인 또는 관리자)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId || req.session.user?.id;
    const isAdmin = req.session.isAdmin;
    if (!isAdmin) {
      const row = await db.get('SELECT user_id FROM comments WHERE id=?', req.params.id);
      if (!row || row.user_id != userId) return res.status(403).json({ error: '본인 댓글만 삭제할 수 있습니다' });
    }
    await db.run('DELETE FROM comments WHERE id=?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
