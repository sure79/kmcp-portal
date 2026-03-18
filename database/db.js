const { createClient } = require('@libsql/client');
const path = require('path');
const bcrypt = require('bcryptjs');

// Turso 클라우드 또는 로컬 SQLite 자동 선택
const client = createClient({
  url: process.env.TURSO_URL || `file:${path.join(__dirname, 'kmcp.db')}`,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

// node:sqlite 호환 래퍼 (동기 → 비동기)
const db = {
  // SELECT 단일 행
  async get(sql, ...params) {
    const result = await client.execute({ sql, args: params });
    return result.rows[0] || undefined;
  },

  // SELECT 여러 행
  async all(sql, ...params) {
    const result = await client.execute({ sql, args: params });
    return result.rows;
  },

  // INSERT/UPDATE/DELETE
  async run(sql, ...params) {
    const result = await client.execute({ sql, args: params });
    return {
      lastInsertRowid: Number(result.lastInsertRowid),
      changes: result.rowsAffected,
    };
  },

  // 다중 SQL문 실행 (테이블 생성 등)
  async exec(sql) {
    await client.executeMultiple(sql);
  },

  // 트랜잭션 배치
  async batch(statements) {
    return await client.batch(statements, 'write');
  },
};

// 테이블 초기화
async function initDB() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      department TEXT DEFAULT '',
      position TEXT DEFAULT '',
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      report_date DATE NOT NULL,
      work_done TEXT DEFAULT '',
      work_planned TEXT DEFAULT '',
      special_notes TEXT DEFAULT '',
      safety_notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, report_date)
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      meeting_date DATE NOT NULL,
      start_time TEXT DEFAULT '',
      end_time TEXT DEFAULT '',
      title TEXT DEFAULT '',
      agenda TEXT DEFAULT '',
      minutes TEXT DEFAULT '',
      decisions TEXT DEFAULT '',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS meeting_attendees (
      meeting_id INTEGER,
      user_id INTEGER,
      confirmed INTEGER DEFAULT 0,
      PRIMARY KEY (meeting_id, user_id),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      progress INTEGER DEFAULT 0,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'active',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER,
      user_id INTEGER,
      role TEXT DEFAULT '참여',
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      assignee_id INTEGER,
      project_id INTEGER,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      due_date DATE,
      target_week TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      author_id INTEGER,
      is_pinned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status_date DATE NOT NULL,
      status TEXT DEFAULT 'office',
      note TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, status_date)
    );

    CREATE TABLE IF NOT EXISTS lunch_polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_date DATE NOT NULL UNIQUE,
      title TEXT DEFAULT '',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS lunch_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (poll_id) REFERENCES lunch_polls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lunch_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      FOREIGN KEY (option_id) REFERENCES lunch_options(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(option_id, user_id)
    );
  `);

  // 기본 관리자 계정 생성
  const adminExists = await db.get('SELECT id FROM users WHERE username = ?', 'admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin1234', 10);
    await db.run(
      'INSERT INTO users (name, department, position, username, password, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
      '관리자', '관리', '관리자', 'admin', hash, 1
    );
    console.log('기본 관리자 계정 생성: admin / admin1234');
  }
}

db.init = initDB;
module.exports = db;
