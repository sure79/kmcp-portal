const db = require('../database/db');

// 활동 로그 기록
async function logActivity({ type, action, title, message, actor_id, actor_name, target_page, target_id }) {
  try {
    await db.run(
      'INSERT INTO activity_log (type, action, title, message, actor_id, actor_name, target_page, target_id) VALUES (?,?,?,?,?,?,?,?)',
      type || '', action || '', title || '', message || '', actor_id || null, actor_name || '', target_page || '', target_id || null
    );
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
