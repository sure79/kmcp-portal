const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// 목록 조회
router.get('/', async (req, res) => {
  try {
    const { user_id, start, end, date } = req.query;
    let sql = `SELECT ft.*, u.name, u.department, u.position
               FROM field_trips ft JOIN users u ON ft.user_id = u.id WHERE 1=1`;
    const params = [];
    if (user_id) { sql += ' AND ft.user_id = ?'; params.push(user_id); }
    if (date)    { sql += ' AND ft.trip_date = ?'; params.push(date); }
    if (start)   { sql += ' AND ft.trip_date >= ?'; params.push(start); }
    if (end)     { sql += ' AND ft.trip_date <= ?'; params.push(end); }
    sql += ' ORDER BY ft.trip_date DESC, ft.depart_time ASC';
    const rows = await db.all(sql, ...params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 단건 조회
router.get('/:id', async (req, res) => {
  try {
    const row = await db.get(
      `SELECT ft.*, u.name, u.department FROM field_trips ft JOIN users u ON ft.user_id = u.id WHERE ft.id = ?`,
      req.params.id);
    if (!row) return res.status(404).json({ error: '없음' });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 등록
router.post('/', async (req, res) => {
  try {
    const { trip_date, destination, organization, purpose, depart_time, return_time, note } = req.body;
    const user_id = req.session.userId;
    if (!trip_date || !destination) return res.status(400).json({ error: '날짜와 목적지는 필수입니다.' });
    const result = await db.run(
      'INSERT INTO field_trips (user_id, trip_date, destination, organization, purpose, depart_time, return_time, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      user_id, trip_date, destination, organization||'', purpose||'', depart_time||'', return_time||'', note||'');
    const userName = req.session.userName || '';
    await req.logAndNotify({ type: 'fieldtrip', action: 'create', title: `${userName}님 외근: ${destination}`, message: `${trip_date} ${purpose||''}`, actor_id: user_id, actor_name: userName, target_page: 'fieldtrips', target_id: result.lastInsertRowid });
    res.json({ id: result.lastInsertRowid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 수정
router.put('/:id', async (req, res) => {
  try {
    const row = await db.get('SELECT user_id FROM field_trips WHERE id = ?', req.params.id);
    if (!row) return res.status(404).json({ error: '없음' });
    if (row.user_id !== req.session.userId && !req.session.isAdmin)
      return res.status(403).json({ error: '본인 기록만 수정할 수 있습니다.' });
    const { trip_date, destination, organization, purpose, depart_time, return_time, note } = req.body;
    await db.run(
      'UPDATE field_trips SET trip_date=?, destination=?, organization=?, purpose=?, depart_time=?, return_time=?, note=? WHERE id=?',
      trip_date, destination, organization||'', purpose||'', depart_time||'', return_time||'', note||'', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 삭제
router.delete('/:id', async (req, res) => {
  try {
    const row = await db.get('SELECT user_id FROM field_trips WHERE id = ?', req.params.id);
    if (!row) return res.status(404).json({ error: '없음' });
    if (row.user_id !== req.session.userId && !req.session.isAdmin)
      return res.status(403).json({ error: '본인 기록만 삭제할 수 있습니다.' });
    await db.run('DELETE FROM field_trips WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
