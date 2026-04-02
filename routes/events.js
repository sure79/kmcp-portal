const express = require('express');
const router = express.Router();
const db = require('../database/db');

function auth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: '로그인 필요' });
  next();
}

// 목록 조회 (날짜 범위)
router.get('/', auth, async (req, res) => {
  try {
    const { start, end } = req.query;
    let sql = 'SELECT * FROM events';
    const args = [];
    if (start && end) {
      sql += ' WHERE start_date <= ? AND end_date >= ?';
      args.push(end, start);
    } else if (start) {
      sql += ' WHERE end_date >= ?';
      args.push(start);
    }
    sql += ' ORDER BY start_date, start_time';
    const rows = await db.all(sql, ...args);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 단건 조회
router.get('/:id', auth, async (req, res) => {
  const row = await db.get('SELECT * FROM events WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: '없음' });
  res.json(row);
});

// 생성
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, start_date, end_date, start_time, end_time, all_day, color, category } = req.body;
    if (!title || !start_date) return res.status(400).json({ error: '제목과 시작일은 필수입니다' });
    if (end_date && end_date < start_date) return res.status(400).json({ error: '종료일은 시작일 이후여야 합니다' });
    const result = await db.run(
      `INSERT INTO events (title, description, start_date, end_date, start_time, end_time, all_day, color, category, created_by, created_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      title, description || '', start_date, end_date || start_date,
      start_time || null, end_time || null, all_day ? 1 : 0,
      color || '#4573D2', category || 'general',
      req.session.userId, req.session.userName
    );
    const created = await db.get('SELECT * FROM events WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 수정
router.put('/:id', auth, async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM events WHERE id = ?', req.params.id);
    if (!row) return res.status(404).json({ error: '없음' });
    const isAdmin = req.session.isAdmin;
    if (row.created_by !== req.session.userId && !isAdmin)
      return res.status(403).json({ error: '권한 없음' });

    const { title, description, start_date, end_date, start_time, end_time, all_day, color, category } = req.body;
    await db.run(
      `UPDATE events SET title=?, description=?, start_date=?, end_date=?, start_time=?, end_time=?, all_day=?, color=?, category=? WHERE id=?`,
      title, description || '', start_date, end_date || start_date,
      start_time || null, end_time || null, all_day ? 1 : 0,
      color || '#4573D2', category || 'general', req.params.id
    );
    const updated = await db.get('SELECT * FROM events WHERE id = ?', req.params.id);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 삭제
router.delete('/:id', auth, async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM events WHERE id = ?', req.params.id);
    if (!row) return res.status(404).json({ error: '없음' });
    const isAdmin = req.session.isAdmin;
    if (row.created_by !== req.session.userId && !isAdmin)
      return res.status(403).json({ error: '권한 없음' });
    await db.run('DELETE FROM events WHERE id = ?', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
