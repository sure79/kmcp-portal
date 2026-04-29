const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// 첨부파일 메타를 메시지에 합쳐주는 헬퍼
async function hydrateAttachments(messages) {
  const ids = messages.map(m => m.attachment_id).filter(Boolean);
  if (!ids.length) return messages;
  const placeholders = ids.map(() => '?').join(',');
  const atts = await db.all(
    `SELECT id, original_name, size, mimetype FROM attachments WHERE id IN (${placeholders})`,
    ...ids
  );
  const byId = new Map(atts.map(a => [a.id, a]));
  return messages.map(m => ({
    ...m,
    attachment: m.attachment_id ? (byId.get(m.attachment_id) || null) : null,
  }));
}

// 최근 메시지 조회 (최대 100개)
router.get('/', async (req, res) => {
  try {
    const rows = await db.all(
      'SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 100'
    );
    const enriched = await hydrateAttachments(rows.reverse());
    res.json(enriched);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 메시지 전송 — content 또는 attachment_id 둘 중 하나 이상 필요
router.post('/', async (req, res) => {
  try {
    const { content = '', attachment_id = null } = req.body;
    const userId = req.session.userId || req.session.user?.id;
    const userName = req.session.user?.name || (await db.get('SELECT name FROM users WHERE id=?', userId))?.name || '';
    const trimmed = (content || '').trim();
    if (!trimmed && !attachment_id) {
      return res.status(400).json({ error: '내용이나 첨부파일 중 하나는 필요합니다' });
    }

    const result = await db.run(
      'INSERT INTO chat_messages (user_id, user_name, content, attachment_id) VALUES (?,?,?,?)',
      userId, userName, trimmed, attachment_id || null
    );

    // 첨부 메타 같이 내려주기
    let attachment = null;
    if (attachment_id) {
      attachment = await db.get('SELECT id, original_name, size, mimetype FROM attachments WHERE id=?', attachment_id);
    }

    const msg = {
      id: result.lastInsertRowid,
      user_id: userId,
      user_name: userName,
      content: trimmed,
      attachment_id: attachment_id || null,
      attachment,
      created_at: new Date().toISOString(),
    };

    // Socket.io로 실시간 브로드캐스트
    req.io.emit('chat:message', msg);

    res.json(msg);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
