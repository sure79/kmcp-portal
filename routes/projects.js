const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

router.get('/', async (req, res) => {
  try {
    const projects = await db.all(`
      SELECT p.*, u.name as creator_name,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'done') as done_tasks
      FROM projects p LEFT JOIN users u ON p.created_by = u.id ORDER BY p.created_at DESC
    `);

    const result = [];
    for (const p of projects) {
      const members = await db.all(
        'SELECT u.id, u.name, u.department, u.position, pm.role FROM project_members pm JOIN users u ON pm.user_id = u.id WHERE pm.project_id = ?', p.id);
      const auto_progress = p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : p.progress;
      result.push({ ...p, members, auto_progress });
    }
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const project = await db.get(
      'SELECT p.*, u.name as creator_name FROM projects p LEFT JOIN users u ON p.created_by = u.id WHERE p.id = ?',
      req.params.id);
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    const members = await db.all(
      'SELECT u.id, u.name, u.department, u.position, pm.role FROM project_members pm JOIN users u ON pm.user_id = u.id WHERE pm.project_id = ?',
      req.params.id);
    const tasks = await db.all(
      'SELECT t.*, u.name as assignee_name FROM tasks t LEFT JOIN users u ON t.assignee_id = u.id WHERE t.project_id = ? ORDER BY t.status, t.sort_order',
      req.params.id);
    res.json({ ...project, members, tasks });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, start_date, end_date, created_by, member_ids } = req.body;
    if (!name) return res.status(400).json({ error: '프로젝트명은 필수입니다.' });

    const result = await db.run(
      'INSERT INTO projects (name, description, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?)',
      name, description||'', start_date||null, end_date||null, created_by||null);
    const pid = result.lastInsertRowid;

    if (member_ids && member_ids.length > 0) {
      for (const uid of member_ids) {
        await db.run('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)', pid, uid);
      }
    }
    await req.logAndNotify({ type: 'project', action: 'create', title: `새 프로젝트: ${name}`, message: (description||'').substring(0,100), actor_id: created_by || 0, actor_name: req.session?.user?.name || '', target_page: 'projects', target_id: pid });
    res.json({ id: pid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, description, progress, start_date, end_date, status, member_ids } = req.body;
    await db.run(
      'UPDATE projects SET name=?, description=?, progress=?, start_date=?, end_date=?, status=? WHERE id=?',
      name, description||'', progress||0, start_date||null, end_date||null, status||'active', req.params.id);

    if (member_ids !== undefined) {
      await db.run('DELETE FROM project_members WHERE project_id = ?', req.params.id);
      for (const uid of member_ids) {
        await db.run('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)', req.params.id, uid);
      }
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM projects WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
