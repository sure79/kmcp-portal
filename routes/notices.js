const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const notices = await db.all(
      'SELECT n.*, u.name as author_name FROM notices n LEFT JOIN users u ON n.author_id = u.id ORDER BY n.is_pinned DESC, n.created_at DESC');
    res.json(notices);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { title, content, author_id, is_pinned } = req.body;
    if (!title) return res.status(400).json({ error: '제목은 필수입니다.' });
    const result = await db.run(
      'INSERT INTO notices (title, content, author_id, is_pinned) VALUES (?, ?, ?, ?)',
      title, content||'', author_id||null, is_pinned ? 1 : 0);
    req.logAndNotify({ type: 'notice', action: 'create', title: `새 공지: ${title}`, message: '', actor_id: author_id || 0, actor_name: req.session?.user?.name || '', target_page: 'notices', target_id: result.lastInsertRowid });
    res.json({ id: result.lastInsertRowid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, content, is_pinned } = req.body;
    await db.run('UPDATE notices SET title=?, content=?, is_pinned=? WHERE id=?',
      title, content||'', is_pinned ? 1 : 0, req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM notices WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
