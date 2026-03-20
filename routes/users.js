const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');

// 전체 사용자 목록 (승인된 사용자만, 관리자는 전체)
router.get('/', async (req, res) => {
  try {
    const showAll = req.query.all === '1';
    const sql = showAll
      ? 'SELECT id, name, department, position, username, is_admin, is_approved, created_at FROM users ORDER BY is_approved ASC, id'
      : 'SELECT id, name, department, position, username, is_admin, is_approved, created_at FROM users WHERE is_approved = 1 ORDER BY id';
    const users = await db.all(sql);
    res.json(users);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 승인 대기 목록
router.get('/pending', async (req, res) => {
  try {
    const users = await db.all('SELECT id, name, department, position, username, created_at FROM users WHERE is_approved = 0 ORDER BY created_at DESC');
    res.json(users);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 회원가입
router.post('/register', async (req, res) => {
  try {
    const { name, department, position, username, password } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: '이름, 아이디, 비밀번호는 필수입니다.' });
    if (password.length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });

    const exists = await db.get('SELECT id FROM users WHERE username = ?', username);
    if (exists) return res.status(400).json({ error: '이미 사용 중인 아이디입니다.' });

    const hash = bcrypt.hashSync(password, 10);
    await db.run(
      'INSERT INTO users (name, department, position, username, password, is_admin, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?)',
      name, department || '', position || '', username, hash, 0, 0
    );
    res.json({ success: true, message: '가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 관리자: 승인
router.post('/:id/approve', async (req, res) => {
  try {
    await db.run('UPDATE users SET is_approved = 1 WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 관리자: 거절 (삭제)
router.post('/:id/reject', async (req, res) => {
  try {
    await db.run('DELETE FROM users WHERE id = ? AND is_approved = 0', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 사용자 추가 (관리자가 직접 추가 - 바로 승인)
router.post('/', async (req, res) => {
  try {
    const { name, department, position, username, password, is_admin } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: '이름, 아이디, 비밀번호는 필수입니다.' });

    const exists = await db.get('SELECT id FROM users WHERE username = ?', username);
    if (exists) return res.status(400).json({ error: '이미 사용 중인 아이디입니다.' });

    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run(
      'INSERT INTO users (name, department, position, username, password, is_admin, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?)',
      name, department || '', position || '', username, hash, is_admin ? 1 : 0, 1
    );
    res.json({ id: result.lastInsertRowid, name, department, position, username, is_admin: is_admin ? 1 : 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, department, position, password, is_admin } = req.body;
    const user = await db.get('SELECT id FROM users WHERE id = ?', req.params.id);
    if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      await db.run('UPDATE users SET name=?, department=?, position=?, password=?, is_admin=? WHERE id=?',
        name, department || '', position || '', hash, is_admin ? 1 : 0, req.params.id);
    } else {
      await db.run('UPDATE users SET name=?, department=?, position=?, is_admin=? WHERE id=?',
        name, department || '', position || '', is_admin ? 1 : 0, req.params.id);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM users WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 로그인 (승인 체크 포함)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

    if (!user.is_approved) return res.status(403).json({ error: '관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.' });

    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.isAdmin = user.is_admin;
    req.session.user = { id: user.id, name: user.name, department: user.department, position: user.position, is_admin: user.is_admin };
    res.json({ id: user.id, name: user.name, department: user.department, position: user.position, is_admin: user.is_admin });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const user = await db.get('SELECT id, name, department, position, username, is_admin FROM users WHERE id = ?', req.session.userId);
    res.json(user);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
