const express = require('express');
const router = express.Router();
const db = require('../database/db');

function auth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: '로그인 필요' });
  next();
}

// 내 할일 목록
router.get('/', auth, async (req, res) => {
  try {
    const rows = await db.all(
      'SELECT * FROM todos WHERE user_id = ? ORDER BY done ASC, created_at DESC',
      req.session.userId
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 할일 추가
router.post('/', auth, async (req, res) => {
  try {
    const { content, due_date } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '내용을 입력하세요' });
    const result = await db.run(
      'INSERT INTO todos (user_id, content, due_date) VALUES (?, ?, ?)',
      req.session.userId, content.trim(), due_date || null
    );
    const row = await db.get('SELECT * FROM todos WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 완료 토글
router.patch('/:id/toggle', auth, async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM todos WHERE id = ? AND user_id = ?', req.params.id, req.session.userId);
    if (!row) return res.status(404).json({ error: '없음' });
    await db.run('UPDATE todos SET done = ? WHERE id = ?', row.done ? 0 : 1, req.params.id);
    res.json({ done: !row.done });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 삭제
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.run('DELETE FROM todos WHERE id = ? AND user_id = ?', req.params.id, req.session.userId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
