const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const { project_id, assignee_id } = req.query;
    let sql = `SELECT t.*, u.name as assignee_name, u.department as assignee_dept, p.name as project_name
               FROM tasks t LEFT JOIN users u ON t.assignee_id = u.id LEFT JOIN projects p ON t.project_id = p.id WHERE 1=1`;
    const params = [];
    if (project_id) { sql += ' AND t.project_id = ?'; params.push(project_id); }
    if (assignee_id) { sql += ' AND t.assignee_id = ?'; params.push(assignee_id); }
    sql += ' ORDER BY t.sort_order, t.id';
    const tasks = await db.all(sql, ...params);
    res.json(tasks);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const task = await db.get(
      `SELECT t.*, u.name as assignee_name, u.department as assignee_dept, p.name as project_name
       FROM tasks t LEFT JOIN users u ON t.assignee_id = u.id LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ?`,
      req.params.id);
    if (!task) return res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
    res.json(task);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { title, description, assignee_id, project_id, status, priority, due_date, target_week } = req.body;
    if (!title) return res.status(400).json({ error: '제목은 필수입니다.' });

    const maxOrder = await db.get('SELECT MAX(sort_order) as max FROM tasks WHERE status = ?', status || 'pending');
    const sortOrder = ((maxOrder && maxOrder.max) || 0) + 1;

    const result = await db.run(
      'INSERT INTO tasks (title, description, assignee_id, project_id, status, priority, due_date, target_week, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      title, description||'', assignee_id||null, project_id||null, status||'pending', priority||'medium', due_date||null, target_week||'', sortOrder);
    req.logAndNotify({ type: 'task', action: 'create', title: `새 작업: ${title}`, message: (description||'').substring(0,100), actor_id: req.session?.user?.id || 0, actor_name: req.session?.user?.name || '', target_page: 'kanban', target_id: result.lastInsertRowid });
    res.json({ id: result.lastInsertRowid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, description, assignee_id, project_id, status, priority, due_date, target_week } = req.body;
    await db.run(
      'UPDATE tasks SET title=?, description=?, assignee_id=?, project_id=?, status=?, priority=?, due_date=?, target_week=? WHERE id=?',
      title, description||'', assignee_id||null, project_id||null, status, priority, due_date||null, target_week||'', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/move', async (req, res) => {
  try {
    const { status, sort_order, target_week, project_id } = req.body;
    const fields = [];
    const params = [];
    if (status !== undefined) { fields.push('status=?'); params.push(status); }
    if (sort_order !== undefined) { fields.push('sort_order=?'); params.push(sort_order); }
    if (target_week !== undefined) { fields.push('target_week=?'); params.push(target_week); }
    if (project_id !== undefined) { fields.push('project_id=?'); params.push(project_id); }
    if (fields.length === 0) return res.status(400).json({ error: '변경할 필드가 없습니다.' });

    params.push(req.params.id);
    await db.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id=?`, ...params);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/reorder', async (req, res) => {
  try {
    const { items } = req.body;
    for (const item of items) {
      await db.run('UPDATE tasks SET status=?, sort_order=? WHERE id=?', item.status, item.sort_order, item.id);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM tasks WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
