const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// 첨부 메타 hydration 헬퍼
async function hydrateCommentAttachments(rows) {
  const ids = rows.map(r => r.attachment_id).filter(Boolean);
  if (!ids.length) return rows;
  const placeholders = ids.map(() => '?').join(',');
  const atts = await db.all(
    `SELECT id, original_name, size, mimetype FROM attachments WHERE id IN (${placeholders})`,
    ...ids
  );
  const byId = new Map(atts.map(a => [a.id, a]));
  return rows.map(r => ({
    ...r,
    attachment: r.attachment_id ? (byId.get(r.attachment_id) || null) : null,
  }));
}

// 댓글 목록 조회 — 익명 댓글은 user_name/user_id 마스킹 (본인은 식별 가능)
router.get('/', async (req, res) => {
  try {
    const { type, id } = req.query;
    const sessionUserId = req.session.userId;
    if (!type || !id) return res.status(400).json({ error: 'type과 id가 필요합니다' });
    const rows = await db.all(
      'SELECT * FROM comments WHERE target_type=? AND target_id=? ORDER BY created_at ASC',
      type, id
    );
    const enriched = await hydrateCommentAttachments(rows);
    const masked = enriched.map(r => {
      if (!r.is_anonymous) return r;
      const isMine = r.user_id === sessionUserId;
      return { ...r, user_name: '익명', user_id: isMine ? r.user_id : null };
    });
    res.json(masked);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 댓글 작성 — content 또는 attachment_id 중 하나는 필요. is_anonymous 플래그 지원
router.post('/', async (req, res) => {
  try {
    const { target_type, target_id, content = '', is_anonymous, attachment_id = null } = req.body;
    const userId = req.session.userId || req.session.user?.id;
    const userName = req.session.user?.name || (await db.get('SELECT name FROM users WHERE id=?', userId))?.name || '';
    if (!target_type || !target_id) return res.status(400).json({ error: 'target_type/id가 필요합니다' });
    const trimmed = (content || '').trim();
    if (!trimmed && !attachment_id) return res.status(400).json({ error: '내용이나 첨부파일 중 하나는 필요합니다' });
    const anon = is_anonymous ? 1 : 0;
    const result = await db.run(
      'INSERT INTO comments (target_type, target_id, user_id, user_name, content, is_anonymous, attachment_id) VALUES (?,?,?,?,?,?,?)',
      target_type, target_id, userId, anon ? '익명' : userName, trimmed, anon, attachment_id || null
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
