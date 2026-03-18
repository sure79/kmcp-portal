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

// API 라우터
app.use('/api/users', require('./routes/users'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/notices', require('./routes/notices'));
app.use('/api/status', require('./routes/status'));
app.use('/api/lunch', require('./routes/lunch'));

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
    console.log(`  KMCP 업무포털 서버 시작`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  사내 접속: http://[서버IP]:${PORT}`);
    console.log(`  기본 계정: admin / admin1234`);
    console.log(`========================================\n`);
  });
}).catch(err => {
  console.error('DB 초기화 실패:', err);
  process.exit(1);
});
