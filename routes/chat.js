const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// 최근 메시지 조회 (최대 100개)
router.get('/', async (req, res) => {
  try {
    const rows = await db.all(
      'SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 100'
    );
    res.json(rows.reverse());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 메시지 전송
router.post('/', async (req, res) => {
  try {
    const { content } = req.body;
    const userId = req.session.userId || req.session.user?.id;
    const userName = req.session.user?.name || (await db.get('SELECT name FROM users WHERE id=?', userId))?.name || '';
    if (!content?.trim()) return res.status(400).json({ error: '내용을 입력하세요' });

    const result = await db.run(
      'INSERT INTO chat_messages (user_id, user_name, content) VALUES (?,?,?)',
      userId, userName, content.trim()
    );

    const msg = {
      id: result.lastInsertRowid,
      user_id: userId,
      user_name: userName,
      content: content.trim(),
      created_at: new Date().toISOString(),
    };

    // Socket.io로 실시간 브로드캐스트
    req.io.emit('chat:message', msg);

    res.json(msg);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
