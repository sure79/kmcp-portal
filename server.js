const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const db = require('./database/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'kmcp-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// io 객체를 라우트에서 사용할 수 있도록 전달
const { logActivity, emitNotification } = require('./utils/activity');
app.use((req, res, next) => {
  req.io = io;
  // POST 활동 자동 로그 (응답 후)
  if (req.method === 'POST' || req.method === 'PUT') {
    const origJson = res.json.bind(res);
    res.json = function(data) {
      // 성공 응답만 로그
      if (res.statusCode < 400 && data && !data.error) {
        autoLogActivity(req, data).catch(err => console.error('활동 로그 오류:', err.message));
      }
      return origJson(data);
    };
  }
  next();
});

// 자동 활동 로그 기록
async function autoLogActivity(req, resData) {
  const url = req.originalUrl;
  const body = req.body || {};
  const session = req.session?.user;
  const actorId = session?.id || body.author_id || body.user_id || body.created_by || null;
  const actorName = session?.name || '';

  let log = null;

  // 보고서 작성/수정
  if (url === '/api/reports' && req.method === 'POST') {
    const userName = actorName || (await db.get('SELECT name FROM users WHERE id=?', body.user_id))?.name || '';
    log = { type: 'report', action: resData.updated ? 'update' : 'create',
      title: `${userName}님이 업무보고 ${resData.updated ? '수정' : '제출'}`,
      message: `${body.report_date} 업무보고서`, actor_id: body.user_id, actor_name: userName, target_page: 'reports', target_id: resData.id };
  }
  // 작업 생성
  else if (url === '/api/tasks' && req.method === 'POST') {
    log = { type: 'task', action: 'create', title: `새 작업: ${body.title}`,
      message: body.description?.substring(0, 100) || '', actor_id: actorId, actor_name: actorName, target_page: 'kanban', target_id: resData.id };
  }
  // 회의 생성
  else if (url === '/api/meetings' && req.method === 'POST') {
    log = { type: 'meeting', action: 'create', title: `새 회의: ${body.title || (body.type === 'weekly' ? '주간회의' : '기술회의')}`,
      message: `${body.meeting_date} ${body.start_time || ''}`, actor_id: actorId, actor_name: actorName, target_page: 'meetings', target_id: resData.id };
  }
  // 공지사항 생성
  else if (url === '/api/notices' && req.method === 'POST') {
    log = { type: 'notice', action: 'create', title: `새 공지: ${body.title}`,
      message: '', actor_id: actorId, actor_name: actorName, target_page: 'notices', target_id: resData.id };
  }
  // 프로젝트 생성
  else if (url === '/api/projects' && req.method === 'POST') {
    log = { type: 'project', action: 'create', title: `새 프로젝트: ${body.name}`,
      message: body.description?.substring(0, 100) || '', actor_id: actorId, actor_name: actorName, target_page: 'projects', target_id: resData.id };
  }
  // 건의사항 생성
  else if (url === '/api/suggestions' && req.method === 'POST') {
    log = { type: 'suggestion', action: 'create', title: `새 건의: ${body.title}`,
      message: '', actor_id: body.is_anonymous ? null : actorId, actor_name: body.is_anonymous ? '익명' : actorName, target_page: 'suggestions', target_id: resData.id };
  }
  // 투표 생성
  else if (url === '/api/polls' && req.method === 'POST') {
    log = { type: 'poll', action: 'create', title: `새 투표: ${body.title}`,
      message: `${body.options?.length || 0}개 선택지`, actor_id: actorId, actor_name: actorName, target_page: 'polls', target_id: resData.id };
  }
  // 건의사항 답변
  else if (url.match(/\/api\/suggestions\/\d+\/reply/) && req.method === 'POST') {
    log = { type: 'suggestion', action: 'reply', title: `건의사항 답변 등록`,
      message: body.status || '', actor_id: actorId, actor_name: actorName, target_page: 'suggestions' };
  }

  if (log) {
    await logActivity(log);
    emitNotification(io, log);
  }
}

// API 라우터
app.use('/api/users', require('./routes/users'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/notices', require('./routes/notices'));
app.use('/api/status', require('./routes/status'));
app.use('/api/lunch', require('./routes/lunch'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/polls', require('./routes/polls'));

// 글로벌 검색 API
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ tasks: [], reports: [], meetings: [], projects: [], notices: [] });
    const like = `%${q}%`;
    const [tasks, reports, meetings, projects, notices] = await Promise.all([
      db.all(`SELECT t.id, t.title, t.description, t.status, u.name as assignee_name, p.name as project_name
              FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id LEFT JOIN projects p ON t.project_id=p.id
              WHERE t.title LIKE ? OR t.description LIKE ? LIMIT 10`, like, like),
      db.all(`SELECT r.id, r.report_date, r.work_done, u.name FROM daily_reports r
              LEFT JOIN users u ON r.user_id=u.id
              WHERE r.work_done LIKE ? OR r.work_planned LIKE ? OR r.special_notes LIKE ? LIMIT 10`, like, like, like),
      db.all(`SELECT id, title, type, meeting_date, agenda, minutes FROM meetings
              WHERE title LIKE ? OR agenda LIKE ? OR minutes LIKE ? OR decisions LIKE ? LIMIT 10`, like, like, like, like),
      db.all(`SELECT id, name, description, status, progress FROM projects
              WHERE name LIKE ? OR description LIKE ? LIMIT 10`, like, like),
      db.all(`SELECT id, title, content FROM notices
              WHERE title LIKE ? OR content LIKE ? LIMIT 10`, like, like),
    ]);
    res.json({ tasks, reports, meetings, projects, notices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io
io.on('connection', (socket) => {
  console.log(`클라이언트 연결: ${socket.id}`);
  socket.on('task:move', (data) => socket.broadcast.emit('task:moved', data));
  socket.on('report:submitted', (data) => socket.broadcast.emit('report:new', data));
  socket.on('status:changed', (data) => socket.broadcast.emit('status:updated', data));
  socket.on('lunch:voted', (data) => socket.broadcast.emit('lunch:voted', data));
  socket.on('lunch:created', (data) => socket.broadcast.emit('lunch:new', data));
  socket.on('disconnect', () => console.log(`클라이언트 연결 해제: ${socket.id}`));
});

// DB 초기화 후 서버 시작
const PORT = process.env.PORT || 3000;

db.init().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`  KMCP 연구소 업무포털 서버 시작`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  사내 접속: http://[서버IP]:${PORT}`);
    console.log(`  기본 계정: admin / admin1234`);
    console.log(`========================================\n`);
  });
}).catch(err => {
  console.error('DB 초기화 실패:', err);
  process.exit(1);
});
