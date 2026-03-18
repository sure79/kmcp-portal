const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');

router.get('/', async (req, res) => {
  try {
    const users = await db.all('SELECT id, name, department, position, username, is_admin, created_at FROM users ORDER BY id');
    res.json(users);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, department, position, username, password, is_admin } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: '이름, 아이디, 비밀번호는 필수입니다.' });

    const exists = await db.get('SELECT id FROM users WHERE username = ?', username);
    if (exists) return res.status(400).json({ error: '이미 사용 중인 아이디입니다.' });

    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run(
      'INSERT INTO users (name, department, position, username, password, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
      name, department || '', position || '', username, hash, is_admin ? 1 : 0
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

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.isAdmin = user.is_admin;
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
