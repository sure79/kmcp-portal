const express = require('express');
const router = express.Router();
const db = require('../database/db');

// 사용자별 알림 목록 조회
router.get('/', async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.json([]);

    const today = new Date().toISOString().split('T')[0];
    const dayOfWeek = new Date().getDay(); // 0=Sun
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

    // 2) 회의 알림
    if (dayOfWeek === 1) {
      notifications.push({
        id: 'meeting-weekly', type: 'info', icon: '📋',
        title: '주간회의 예정',
        message: '오늘 08:30 주간회의가 있습니다.',
        action: 'meetings', priority: 0,
      });
    }
    if (dayOfWeek === 4) {
      notifications.push({
        id: 'meeting-tech', type: 'info', icon: '🔧',
        title: '기술회의 예정',
        message: '오늘 10:00~12:00 기술회의가 있습니다.',
        action: 'meetings', priority: 0,
      });
    }
    if (dayOfWeek === 0) {
      notifications.push({
        id: 'meeting-weekly-tomorrow', type: 'info', icon: '📋',
        title: '내일 주간회의',
        message: '내일(월) 08:30 주간회의가 있습니다.',
        action: 'meetings', priority: 2,
      });
    }
    if (dayOfWeek === 3) {
      notifications.push({
        id: 'meeting-tech-tomorrow', type: 'info', icon: '🔧',
        title: '내일 기술회의',
        message: '내일(목) 10:00~12:00 기술회의가 있습니다.',
        action: 'meetings', priority: 2,
      });
    }

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

    // 4) 대기중인 내 작업 수
    const pendingCount = await db.get(
      "SELECT COUNT(*) as cnt FROM tasks WHERE assignee_id = ? AND status = 'pending'", userId);
    if (pendingCount && pendingCount.cnt > 3) {
      notifications.push({
        id: 'tasks-pending', type: 'info', icon: '📋',
        title: `대기 작업 ${pendingCount.cnt}건`,
        message: '처리가 필요한 대기 작업이 있습니다.',
        action: 'kanban', priority: 3,
      });
    }

    // 5) 관리자: 승인 대기 사용자
    const user = req.session.user;
    if (user.is_admin) {
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

    // 정렬: priority 오름차순 (낮을수록 긴급)
    notifications.sort((a, b) => a.priority - b.priority);

    res.json(notifications);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
