const db = require('../database/db');

let tableReady = false;

// 테이블 없으면 자동 생성
async function ensureTable() {
  if (tableReady) return;
  await db.run(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT DEFAULT '',
    actor_id INTEGER,
    actor_name TEXT DEFAULT '',
    target_page TEXT DEFAULT '',
    target_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  tableReady = true;
}

// 활동 로그 기록
async function logActivity({ type, action, title, message, actor_id, actor_name, target_page, target_id }) {
  try {
    await ensureTable();
    await db.run(
      'INSERT INTO activity_log (type, action, title, message, actor_id, actor_name, target_page, target_id) VALUES (?,?,?,?,?,?,?,?)',
      type || '', action || '', title || '', message || '', actor_id || 0, actor_name || '', target_page || '', target_id || 0
    );
    console.log(`활동 로그: [${type}] ${title}`);
  } catch(e) {
    console.error('활동 로그 기록 실패:', e.message);
  }
}

// Socket.io로 실시간 알림 전송
function emitNotification(io, data) {
  if (io) {
    io.emit('notification', {
      type: data.type,
      action: data.action,
      title: data.title,
      message: data.message,
      actor_name: data.actor_name,
      target_page: data.target_page,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = { logActivity, emitNotification };
