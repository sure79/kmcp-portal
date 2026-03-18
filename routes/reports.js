const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/team', async (req, res) => {
  try {
    const targetDate = req.query.date || new Date().toISOString().split('T')[0];
    const reports = await db.all(
      `SELECT r.*, u.name, u.department, u.position FROM daily_reports r
       JOIN users u ON r.user_id = u.id WHERE r.report_date = ? ORDER BY u.name`, targetDate);
    res.json(reports);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 주간 종합 보고서
router.get('/weekly-summary', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: '기간을 지정하세요' });

    // 모든 사용자
    const users = await db.all('SELECT id, name, department, position FROM users WHERE is_approved=1 ORDER BY department, name');

    // 해당 기간 보고서
    const reports = await db.all(
      `SELECT r.*, u.name, u.department, u.position FROM daily_reports r
       JOIN users u ON r.user_id = u.id
       WHERE r.report_date >= ? AND r.report_date <= ?
       ORDER BY r.report_date ASC, u.name`, start, end);

    // 해당 기간 작업 (칸반)
    const tasks = await db.all(
      `SELECT t.*, u.name as assignee_name, p.name as project_name FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.status != 'done'
       ORDER BY t.priority DESC, t.title`);

    // 사용자별 그룹화
    const result = users.map(u => {
      const userReports = reports.filter(r => r.user_id === u.id);
      const userTasks = tasks.filter(t => t.assignee_id === u.id);
      const reportDates = userReports.map(r => r.report_date);

      // 해당 기간 평일 계산
      const weekdays = [];
      const d = new Date(start);
      const endD = new Date(end);
      while (d <= endD) {
        if (d.getDay() >= 1 && d.getDay() <= 5) weekdays.push(d.toISOString().split('T')[0]);
        d.setDate(d.getDate() + 1);
      }
      const missingDates = weekdays.filter(wd => !reportDates.includes(wd));

      return {
        ...u,
        reports: userReports,
        tasks: userTasks,
        reportCount: userReports.length,
        totalWeekdays: weekdays.length,
        missingDates,
        missingCount: missingDates.length,
      };
    });

    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { user_id, start, end } = req.query;
    let sql = 'SELECT r.*, u.name, u.department FROM daily_reports r JOIN users u ON r.user_id = u.id WHERE 1=1';
    const params = [];
    if (user_id) { sql += ' AND r.user_id = ?'; params.push(user_id); }
    if (start) { sql += ' AND r.report_date >= ?'; params.push(start); }
    if (end) { sql += ' AND r.report_date <= ?'; params.push(end); }
    sql += ' ORDER BY r.report_date DESC, u.name';
    const reports = await db.all(sql, ...params);
    res.json(reports);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const report = await db.get(
      `SELECT r.*, u.name, u.department, u.position FROM daily_reports r
       JOIN users u ON r.user_id = u.id WHERE r.id = ?`, req.params.id);
    if (!report) return res.status(404).json({ error: '보고서를 찾을 수 없습니다.' });
    res.json(report);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { user_id, report_date, work_done, work_planned, special_notes, safety_notes } = req.body;
    if (!user_id || !report_date) return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });

    const existing = await db.get('SELECT id FROM daily_reports WHERE user_id=? AND report_date=?', user_id, report_date);
    if (existing) {
      await db.run(
        'UPDATE daily_reports SET work_done=?, work_planned=?, special_notes=?, safety_notes=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND report_date=?',
        work_done||'', work_planned||'', special_notes||'', safety_notes||'', user_id, report_date);
      res.json({ id: existing.id, updated: true });
    } else {
      const result = await db.run(
        'INSERT INTO daily_reports (user_id, report_date, work_done, work_planned, special_notes, safety_notes) VALUES (?, ?, ?, ?, ?, ?)',
        user_id, report_date, work_done||'', work_planned||'', special_notes||'', safety_notes||'');
      res.json({ id: result.lastInsertRowid, updated: false });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM daily_reports WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
