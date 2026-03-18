const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const poll = await db.get('SELECT * FROM lunch_polls WHERE poll_date = ?', date);
    if (!poll) return res.json(null);

    const options = await db.all('SELECT * FROM lunch_options WHERE poll_id = ?', poll.id);
    const votes = await db.all(
      `SELECT v.option_id, v.user_id, u.name FROM lunch_votes v
       JOIN users u ON v.user_id = u.id JOIN lunch_options o ON v.option_id = o.id WHERE o.poll_id = ?`, poll.id);

    options.forEach(opt => {
      opt.votes = votes.filter(v => v.option_id === opt.id);
      opt.vote_count = opt.votes.length;
    });
    res.json({ ...poll, options });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { date, title, options, created_by } = req.body;
    const pollDate = date || new Date().toISOString().split('T')[0];
    if (!options || options.length < 2) return res.status(400).json({ error: '최소 2개 옵션 필요' });

    const existing = await db.get('SELECT id FROM lunch_polls WHERE poll_date = ?', pollDate);
    if (existing) await db.run('DELETE FROM lunch_polls WHERE id = ?', existing.id);

    const result = await db.run('INSERT INTO lunch_polls (poll_date, title, created_by) VALUES (?,?,?)',
      pollDate, title || '점심 메뉴 투표', created_by || null);
    const pollId = result.lastInsertRowid;

    for (const opt of options) {
      await db.run('INSERT INTO lunch_options (poll_id, name) VALUES (?,?)', pollId, opt);
    }
    res.json({ id: pollId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/vote', async (req, res) => {
  try {
    const { option_id, user_id } = req.body;
    if (!option_id || !user_id) return res.status(400).json({ error: '필수 항목 누락' });

    const option = await db.get('SELECT poll_id FROM lunch_options WHERE id = ?', option_id);
    if (!option) return res.status(404).json({ error: '옵션을 찾을 수 없습니다' });

    const existingVotes = await db.all(
      'SELECT v.id FROM lunch_votes v JOIN lunch_options o ON v.option_id = o.id WHERE o.poll_id = ? AND v.user_id = ?',
      option.poll_id, user_id);
    for (const v of existingVotes) {
      await db.run('DELETE FROM lunch_votes WHERE id = ?', v.id);
    }

    await db.run('INSERT INTO lunch_votes (option_id, user_id) VALUES (?,?)', option_id, user_id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM lunch_polls WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
