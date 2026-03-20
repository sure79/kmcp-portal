const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT m.*, u.name as creator_name FROM meetings m LEFT JOIN users u ON m.created_by = u.id WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND m.type = ?'; params.push(type); }
    sql += ' ORDER BY m.meeting_date DESC';
    const meetings = await db.all(sql, ...params);
    res.json(meetings);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const meeting = await db.get(
      'SELECT m.*, u.name as creator_name FROM meetings m LEFT JOIN users u ON m.created_by = u.id WHERE m.id = ?',
      req.params.id);
    if (!meeting) return res.status(404).json({ error: '회의를 찾을 수 없습니다.' });

    const attendees = await db.all(
      `SELECT ma.confirmed, u.id, u.name, u.department, u.position
       FROM meeting_attendees ma JOIN users u ON ma.user_id = u.id WHERE ma.meeting_id = ?`,
      req.params.id);
    res.json({ ...meeting, attendees });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { type, meeting_date, start_time, end_time, title, agenda, minutes, decisions, created_by, attendee_ids } = req.body;
    if (!type || !meeting_date) return res.status(400).json({ error: '회의 유형과 날짜는 필수입니다.' });

    const result = await db.run(
      'INSERT INTO meetings (type, meeting_date, start_time, end_time, title, agenda, minutes, decisions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      type, meeting_date, start_time||'', end_time||'', title||'', agenda||'', minutes||'', decisions||'', created_by||null);

    const meetingId = result.lastInsertRowid;
    if (attendee_ids && attendee_ids.length > 0) {
      for (const uid of attendee_ids) {
        await db.run('INSERT OR IGNORE INTO meeting_attendees (meeting_id, user_id) VALUES (?, ?)', meetingId, uid);
      }
    }
    await req.logAndNotify({ type: 'meeting', action: 'create', title: `새 회의: ${title || (type === 'weekly' ? '주간회의' : '기술회의')}`, message: `${meeting_date} ${start_time||''}`, actor_id: created_by || 0, actor_name: req.session?.user?.name || '', target_page: 'meetings', target_id: meetingId });
    res.json({ id: meetingId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { type, meeting_date, start_time, end_time, title, agenda, minutes, decisions, attendee_ids } = req.body;
    await db.run(
      'UPDATE meetings SET type=?, meeting_date=?, start_time=?, end_time=?, title=?, agenda=?, minutes=?, decisions=? WHERE id=?',
      type, meeting_date, start_time||'', end_time||'', title||'', agenda||'', minutes||'', decisions||'', req.params.id);

    if (attendee_ids !== undefined) {
      await db.run('DELETE FROM meeting_attendees WHERE meeting_id = ?', req.params.id);
      for (const uid of attendee_ids) {
        await db.run('INSERT OR IGNORE INTO meeting_attendees (meeting_id, user_id) VALUES (?, ?)', req.params.id, uid);
      }
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM meetings WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/confirm', async (req, res) => {
  try {
    await db.run('UPDATE meeting_attendees SET confirmed=1 WHERE meeting_id=? AND user_id=?', req.params.id, req.body.user_id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
