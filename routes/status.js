const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const statuses = await db.all(
      `SELECT s.*, u.name, u.department, u.position FROM user_status s
       JOIN users u ON s.user_id = u.id WHERE s.status_date = ? ORDER BY u.department, u.name`, date);
    res.json(statuses);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { user_id, status, note } = req.body;
    const date = new Date().toISOString().split('T')[0];
    if (!user_id || !status) return res.status(400).json({ error: '필수 항목 누락' });

    const existing = await db.get('SELECT id FROM user_status WHERE user_id=? AND status_date=?', user_id, date);
    if (existing) {
      await db.run('UPDATE user_status SET status=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        status, note || '', existing.id);
    } else {
      await db.run('INSERT INTO user_status (user_id, status_date, status, note) VALUES (?,?,?,?)',
        user_id, date, status, note || '');
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
