const express = require('express');
const router = express.Router();
const db = require('../database/db');

// 사용자별 알림 목록 조회
router.get('/', async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.json([]);

    const today = new Date().toISOString().split('T')[0];
    const dayOfWeek = new Date().getDay();
    const notifications = [];

    // 1) 업무보고 미제출 (오늘, 평일만)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const report = await db.get(
        'SELECT id FROM daily_reports WHERE user_id = ? AND report_date = ?', userId, today);
      if (!report) {
        notifications.push({
          id: 'report-today', type: 'warning', icon: '📝',
          title: '오늘 업무보고 미제출',
          message: '오늘의 업무보고서를 아직 작성하지 않았습니다.',
          action: 'reports', priority: 1,
        });
      }
    }

    // 2) 최근 공지사항 (3일 이내)
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 3);
    const recentStr = recentDate.toISOString().split('T')[0];
    const recentNotices = await db.all(
      `SELECT n.id, n.title, n.created_at, u.name as author_name
       FROM notices n LEFT JOIN users u ON n.author_id = u.id
       WHERE date(n.created_at) >= ? ORDER BY n.created_at DESC LIMIT 3`, recentStr);
    recentNotices.forEach(n => {
      notifications.push({
        id: `notice-${n.id}`, type: 'info', icon: '📢',
        title: `공지: ${n.title}`,
        message: `${n.author_name || ''} · ${n.created_at ? n.created_at.slice(0,10) : ''}`,
        action: 'notices', priority: 2,
      });
    });

    // 3) 마감 임박 작업 (7일 이내)
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 7);
    const soonStr = soonDate.toISOString().split('T')[0];
    const urgentTasks = await db.all(
      `SELECT id, title, due_date FROM tasks
       WHERE assignee_id = ? AND status != 'done' AND due_date IS NOT NULL
       AND due_date != '' AND due_date <= ?
       ORDER BY due_date`, userId, soonStr);
    urgentTasks.forEach(t => {
      const isOverdue = t.due_date < today;
      notifications.push({
        id: `task-due-${t.id}`, type: isOverdue ? 'danger' : 'warning', icon: isOverdue ? '🚨' : '⏰',
        title: isOverdue ? `마감일 초과: ${t.title}` : `마감 임박: ${t.title}`,
        message: `마감일: ${t.due_date}`,
        action: 'kanban', priority: isOverdue ? -1 : 1,
      });
    });

    // 4) 오늘 회의 일정
    const todayMeetings = await db.all(
      'SELECT id, title, type, start_time FROM meetings WHERE meeting_date = ? ORDER BY start_time', today);
    todayMeetings.forEach(m => {
      notifications.push({
        id: `meeting-today-${m.id}`, type: 'info', icon: '📋',
        title: `오늘 회의: ${m.title || (m.type === 'weekly' ? '주간회의' : '기술회의')}`,
        message: m.start_time ? `${m.start_time} 시작` : '오늘 예정',
        action: 'meetings', priority: 0,
      });
    });

    // 5) 관리자: 승인 대기 사용자
    const user = req.session.user;
    if (user && user.is_admin) {
      const pendingUsers = await db.all("SELECT id, name FROM users WHERE is_approved = 0");
      if (pendingUsers.length > 0) {
        notifications.push({
          id: 'pending-users', type: 'warning', icon: '👤',
          title: `가입 승인 대기 ${pendingUsers.length}명`,
          message: pendingUsers.map(u => u.name).join(', '),
          action: 'users', priority: 0,
        });
      }
    }

    // 6) 프로젝트 마감 임박 (14일 이내)
    const projSoonDate = new Date();
    projSoonDate.setDate(projSoonDate.getDate() + 14);
    const projSoonStr = projSoonDate.toISOString().split('T')[0];
    const urgentProjects = await db.all(
      `SELECT p.id, p.name, p.end_date, p.progress FROM projects p
       INNER JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = ? AND p.status = 'active' AND p.end_date IS NOT NULL
       AND p.end_date != '' AND p.end_date <= ?
       ORDER BY p.end_date`, userId, projSoonStr);
    urgentProjects.forEach(p => {
      const isOverdue = p.end_date < today;
      notifications.push({
        id: `proj-due-${p.id}`, type: isOverdue ? 'danger' : 'warning', icon: '📁',
        title: isOverdue ? `프로젝트 마감 초과: ${p.name}` : `프로젝트 마감 임박: ${p.name}`,
        message: `마감: ${p.end_date} · 진행률: ${p.progress || 0}%`,
        action: 'projects', priority: isOverdue ? -1 : 1,
      });
    });

    notifications.sort((a, b) => a.priority - b.priority);
    res.json(notifications);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 활동 히스토리 — 기존 테이블에서 직접 조회 (activity_log 불필요)
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const since = new Date();
    since.setDate(since.getDate() - 30); // 최근 30일
    const sinceStr = since.toISOString().split('T')[0];

    const [notices, reports, meetings, tasks, projects, suggestions, polls] = await Promise.all([
      db.all(
        `SELECT n.id, 'notice' as type, 'create' as action,
                '새 공지: ' || n.title as title,
                '' as message,
                COALESCE(u.name, '') as actor_name,
                'notices' as target_page,
                n.created_at
         FROM notices n LEFT JOIN users u ON n.author_id = u.id
         WHERE date(n.created_at) >= ? ORDER BY n.created_at DESC LIMIT 20`, sinceStr),

      db.all(
        `SELECT r.id, 'report' as type, 'create' as action,
                u.name || '님이 업무보고 제출' as title,
                r.report_date as message,
                u.name as actor_name,
                'reports' as target_page,
                r.created_at
         FROM daily_reports r JOIN users u ON r.user_id = u.id
         WHERE date(r.created_at) >= ? ORDER BY r.created_at DESC LIMIT 20`, sinceStr),

      db.all(
        `SELECT m.id, 'meeting' as type, 'create' as action,
                '새 회의: ' || COALESCE(m.title, CASE WHEN m.type='weekly' THEN '주간회의' ELSE '기술회의' END) as title,
                m.meeting_date as message,
                COALESCE(u.name, '') as actor_name,
                'meetings' as target_page,
                m.created_at
         FROM meetings m LEFT JOIN users u ON m.created_by = u.id
         WHERE date(m.created_at) >= ? ORDER BY m.created_at DESC LIMIT 10`, sinceStr),

      db.all(
        `SELECT t.id, 'task' as type, 'create' as action,
                '새 작업: ' || t.title as title,
                '' as message,
                COALESCE(u.name, '') as actor_name,
                'kanban' as target_page,
                t.created_at
         FROM tasks t LEFT JOIN users u ON t.assignee_id = u.id
         WHERE date(t.created_at) >= ? ORDER BY t.created_at DESC LIMIT 20`, sinceStr),

      db.all(
        `SELECT p.id, 'project' as type, 'create' as action,
                '새 프로젝트: ' || p.name as title,
                '' as message,
                COALESCE(u.name, '') as actor_name,
                'projects' as target_page,
                p.created_at
         FROM projects p LEFT JOIN users u ON p.created_by = u.id
         WHERE date(p.created_at) >= ? ORDER BY p.created_at DESC LIMIT 10`, sinceStr),

      db.all(
        `SELECT s.id, 'suggestion' as type, 'create' as action,
                '새 건의: ' || s.title as title,
                '' as message,
                CASE WHEN s.is_anonymous=1 THEN '익명' ELSE COALESCE(u.name,'') END as actor_name,
                'suggestions' as target_page,
                s.created_at
         FROM suggestions s LEFT JOIN users u ON s.author_id = u.id
         WHERE date(s.created_at) >= ? ORDER BY s.created_at DESC LIMIT 10`, sinceStr),

      db.all(
        `SELECT p.id, 'poll' as type, 'create' as action,
                '새 투표: ' || p.title as title,
                '' as message,
                COALESCE(u.name, '') as actor_name,
                'polls' as target_page,
                p.created_at
         FROM polls p LEFT JOIN users u ON p.created_by = u.id
         WHERE date(p.created_at) >= ? ORDER BY p.created_at DESC LIMIT 10`, sinceStr),
    ]);

    // 전부 합쳐서 최신순 정렬
    const all = [...notices, ...reports, ...meetings, ...tasks, ...projects, ...suggestions, ...polls];
    all.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    const logs = all.slice(0, limit).map((item, i) => ({
      ...item,
      is_read: 0,
    }));

    res.json({ logs, total: all.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// 읽음 처리 (activity_log 없어도 오류 안 남)
router.post('/read-all', async (req, res) => {
  try {
    await db.run('UPDATE activity_log SET is_read = 1 WHERE is_read = 0').catch(() => {});
    res.json({ success: true });
  } catch(e) {
    res.json({ success: true });
  }
});

module.exports = router;
