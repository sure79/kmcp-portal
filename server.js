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

// io + 활동로그 헬퍼를 라우트에서 사용할 수 있도록 전달
const { logActivity, emitNotification } = require('./utils/activity');
app.use((req, res, next) => {
  req.io = io;
  // 라우트에서 req.logAndNotify(data) 호출하면 활동 로그 + 실시간 알림
  req.logAndNotify = async (data) => {
    try {
      await logActivity(data);
      emitNotification(io, data);
    } catch(e) { console.error('알림 오류:', e.message); }
  };
  next();
});

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
