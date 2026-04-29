const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// R2 클라이언트 (첨부 정리에 사용) — attachments.js와 동일 환경변수 공유
const R2_ENABLED = !!(process.env.R2_ACCESS_KEY_ID
  && process.env.R2_SECRET_ACCESS_KEY
  && process.env.R2_ENDPOINT
  && process.env.R2_BUCKET);
let _s3 = null, _DeleteObjectCommand = null;
if (R2_ENABLED) {
  const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  _DeleteObjectCommand = DeleteObjectCommand;
  _s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT.replace(/\/+$/, ''),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}
const localUploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

// 첨부 1건 정리 (R2 객체 + DB row) — 채팅 메시지 삭제 시 호출
async function purgeAttachment(attachmentId) {
  if (!attachmentId) return;
  const att = await db.get('SELECT * FROM attachments WHERE id=?', attachmentId);
  if (!att) return;
  if (R2_ENABLED) {
    try {
      await _s3.send(new _DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: att.filename }));
    } catch (e) { console.error('[chat] R2 객체 삭제 실패 (DB는 정리):', e.message); }
  } else {
    try { fs.unlinkSync(path.join(localUploadDir, att.filename)); } catch {}
  }
  await db.run('DELETE FROM attachments WHERE id=?', attachmentId);
}

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

// 메시지 삭제 (작성자 본인 또는 관리자) — 첨부도 함께 정리
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    const isAdmin = req.session.isAdmin;
    const row = await db.get('SELECT * FROM chat_messages WHERE id=?', req.params.id);
    if (!row) return res.status(404).json({ error: '메시지를 찾을 수 없습니다.' });
    if (!isAdmin && row.user_id !== userId) {
      return res.status(403).json({ error: '본인 메시지만 삭제할 수 있습니다.' });
    }
    // 첨부 먼저 정리
    if (row.attachment_id) await purgeAttachment(row.attachment_id);
    await db.run('DELETE FROM chat_messages WHERE id=?', req.params.id);

    // Socket.io로 실시간 브로드캐스트
    req.io.emit('chat:deleted', { id: Number(req.params.id) });

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
