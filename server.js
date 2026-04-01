const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./database/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const isProd = process.env.NODE_ENV === 'production';

// Railway HTTPS 프록시 신뢰
if (isProd) app.set('trust proxy', 1);

// ===== 보안 헤더 (Helmet) =====
app.use(helmet({
  contentSecurityPolicy: false, // 인라인 스크립트 사용 허용
  crossOriginEmbedderPolicy: false,
}));

// ===== Rate Limiting =====
// 로그인 API: 15분에 10회 제한
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '로그인 시도가 너무 많습니다. 15분 후에 다시 시도하세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 일반 API: 1분에 200회 제한
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== 세션 (보안 강화) =====
app.use(session({
  secret: process.env.SESSION_SECRET || 'kmcp-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: isProd,      // Railway에서 HTTPS로 전달
    httpOnly: true,      // JS에서 쿠키 접근 불가 (XSS 방어)
    sameSite: 'lax',     // CSRF 방어
  },
}));

// ===== 활동 로그 + 실시간 알림 헬퍼 =====
const { logActivity, emitNotification } = require('./utils/activity');
app.use((req, res, next) => {
  req.io = io;
  req.logAndNotify = async (data) => {
    try {
      await logActivity(data);
      emitNotification(io, data);
    } catch (e) {
      console.error('알림 오류:', e.message);
    }
  };
  next();
});

// ===== API 라우터 =====
app.use('/api/users/login', loginLimiter);       // 로그인만 강한 제한
app.use('/api', apiLimiter);                     // 전체 API 일반 제한

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
app.use('/api/demo', require('./routes/demo'));
app.use('/api/transcribe', require('./routes/transcribe'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/weather', require('./routes/weather'));
app.use('/api/events', require('./routes/events'));
app.use('/api/todos', require('./routes/todos'));

// ===== 글로벌 검색 =====
app.get('/api/search', (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
  next();
}, async (req, res) => {
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
  } catch (e) {
    res.status(500).json({ error: isProd ? '검색 중 오류가 발생했습니다.' : e.message });
  }
});

// ===== 헬스체크 (Railway 배포 상태 확인) =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== SPA Fallback =====
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Socket.io =====
io.on('connection', (socket) => {
  socket.on('task:move', (data) => socket.broadcast.emit('task:moved', data));
  socket.on('report:submitted', (data) => socket.broadcast.emit('report:new', data));
  socket.on('status:changed', (data) => socket.broadcast.emit('status:updated', data));
  socket.on('lunch:voted', (data) => socket.broadcast.emit('lunch:voted', data));
  socket.on('lunch:created', (data) => socket.broadcast.emit('lunch:new', data));
});

// ===== 예상치 못한 오류 처리 =====
process.on('unhandledRejection', (reason) => {
  console.error('처리되지 않은 오류:', reason);
});

// ===== 서버 시작 =====
const PORT = process.env.PORT || 3000;

db.init().then(() => {
  // 음성 분석 등 장시간 요청을 위해 타임아웃 15분으로 설정
  server.timeout = 15 * 60 * 1000;        // 15분
  server.keepAliveTimeout = 15 * 60 * 1000;
  server.headersTimeout = 15 * 60 * 1000 + 1000;

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`  KMCP 연구소 업무포털`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  환경: ${isProd ? '프로덕션' : '개발'}`);
    console.log(`========================================\n`);
  });
}).catch(err => {
  console.error('DB 초기화 실패:', err);
  process.exit(1);
});
