const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

router.use(requireLogin);

// 목록
router.get('/', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT s.*, u.name as author_name, u.department,
        (SELECT COUNT(*) FROM suggestion_likes WHERE suggestion_id=s.id) as like_count
      FROM suggestions s
      LEFT JOIN users u ON s.author_id = u.id
      ORDER BY s.created_at DESC
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 생성
router.post('/', async (req, res) => {
  try {
    const { title, content, category, author_id, is_anonymous } = req.body;
    if (!title) return res.status(400).json({ error: '제목을 입력하세요' });
    const result = await db.run(
      'INSERT INTO suggestions (title, content, category, author_id, is_anonymous) VALUES (?,?,?,?,?)',
      title, content || '', category || 'general', author_id, is_anonymous ? 1 : 0
    );
    await req.logAndNotify({ type: 'suggestion', action: 'create', title: `새 건의: ${title}`, message: '', actor_id: is_anonymous ? 0 : (author_id || 0), actor_name: is_anonymous ? '익명' : (req.session?.user?.name || ''), target_page: 'suggestions', target_id: result.lastInsertRowid });
    res.json({ id: result.lastInsertRowid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 좋아요
router.post('/:id/like', async (req, res) => {
  try {
    const { user_id } = req.body;
    const exists = await db.get('SELECT 1 FROM suggestion_likes WHERE suggestion_id=? AND user_id=?', req.params.id, user_id);
    if (exists) {
      await db.run('DELETE FROM suggestion_likes WHERE suggestion_id=? AND user_id=?', req.params.id, user_id);
    } else {
      await db.run('INSERT INTO suggestion_likes (suggestion_id, user_id) VALUES (?,?)', req.params.id, user_id);
    }
    const count = await db.get('SELECT COUNT(*) as c FROM suggestion_likes WHERE suggestion_id=?', req.params.id);
    res.json({ liked: !exists, count: count.c });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 관리자 답변
router.post('/:id/reply', requireAdmin, async (req, res) => {
  try {
    const { admin_reply, status } = req.body;
    await db.run('UPDATE suggestions SET admin_reply=?, status=?, replied_at=CURRENT_TIMESTAMP WHERE id=?',
      admin_reply || '', status || 'answered', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 삭제 (관리자 또는 본인만)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const isAdmin = req.session.isAdmin;
    if (!isAdmin) {
      const row = await db.get('SELECT author_id FROM suggestions WHERE id=?', req.params.id);
      if (!row || row.author_id != userId) return res.status(403).json({ error: '본인 건의만 삭제할 수 있습니다.' });
    }
    await db.run('DELETE FROM suggestions WHERE id=?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
