const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

router.use(requireLogin);

// 목록
router.get('/', async (req, res) => {
  try {
    const polls = await db.all(`
      SELECT p.*, u.name as creator_name FROM polls p
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
    `);
    // 각 투표의 옵션 + 투표수
    for (const poll of polls) {
      poll.options = await db.all(`
        SELECT o.*, COUNT(v.id) as vote_count FROM poll_options o
        LEFT JOIN poll_votes v ON o.id = v.option_id
        WHERE o.poll_id = ? GROUP BY o.id ORDER BY o.id
      `, poll.id);
      poll.total_votes = poll.options.reduce((s, o) => s + (o.vote_count || 0), 0);
      // 투표자 목록 (비익명일 때)
      if (!poll.is_anonymous) {
        for (const opt of poll.options) {
          opt.voters = await db.all(`
            SELECT u.name FROM poll_votes v JOIN users u ON v.user_id = u.id WHERE v.option_id = ?
          `, opt.id);
        }
      }
    }
    res.json(polls);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 생성 (관리자만)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, description, category, options, allow_multiple, is_anonymous, deadline, created_by } = req.body;
    if (!title || !options || options.length < 2) return res.status(400).json({ error: '제목과 2개 이상의 선택지가 필요합니다' });

    const result = await db.run(
      'INSERT INTO polls (title, description, category, allow_multiple, is_anonymous, deadline, created_by) VALUES (?,?,?,?,?,?,?)',
      title, description || '', category || 'general', allow_multiple ? 1 : 0, is_anonymous ? 1 : 0, deadline || null, created_by
    );
    const pollId = result.lastInsertRowid;
    for (const opt of options) {
      if (opt.trim()) await db.run('INSERT INTO poll_options (poll_id, text) VALUES (?,?)', pollId, opt.trim());
    }
    await req.logAndNotify({ type: 'poll', action: 'create', title: `새 투표: ${title}`, message: `${options.length}개 선택지`, actor_id: created_by || 0, actor_name: req.session?.user?.name || '', target_page: 'polls', target_id: pollId });
    res.json({ id: pollId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 투표
router.post('/:id/vote', async (req, res) => {
  try {
    const { user_id, option_ids } = req.body;
    const pollId = req.params.id;
    const poll = await db.get('SELECT * FROM polls WHERE id=?', pollId);
    if (!poll) return res.status(404).json({ error: '투표를 찾을 수 없습니다' });
    if (poll.status !== 'active') return res.status(400).json({ error: '마감된 투표입니다' });
    if (poll.deadline && new Date(poll.deadline) < new Date()) return res.status(400).json({ error: '투표 기한이 지났습니다' });

    // 기존 투표 삭제
    const oldOptions = await db.all('SELECT id FROM poll_options WHERE poll_id=?', pollId);
    for (const opt of oldOptions) {
      await db.run('DELETE FROM poll_votes WHERE option_id=? AND user_id=?', opt.id, user_id);
    }

    // 새 투표
    const ids = Array.isArray(option_ids) ? option_ids : [option_ids];
    if (!poll.allow_multiple && ids.length > 1) return res.status(400).json({ error: '하나만 선택 가능합니다' });
    for (const optId of ids) {
      await db.run('INSERT INTO poll_votes (option_id, user_id) VALUES (?,?)', optId, user_id);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 마감 (관리자만)
router.post('/:id/close', requireAdmin, async (req, res) => {
  try {
    await db.run('UPDATE polls SET status=? WHERE id=?', 'closed', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 삭제 (관리자만)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM polls WHERE id=?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
