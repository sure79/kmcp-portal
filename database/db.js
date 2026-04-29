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
      is_approved INTEGER DEFAULT 0,
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

  // 건의사항 테이블
  await db.exec(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      author_id INTEGER,
      status TEXT DEFAULT 'open',
      admin_reply TEXT DEFAULT '',
      replied_at DATETIME,
      is_anonymous INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS suggestion_likes (
      suggestion_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (suggestion_id, user_id),
      FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      allow_multiple INTEGER DEFAULT 0,
      is_anonymous INTEGER DEFAULT 0,
      deadline DATETIME,
      created_by INTEGER,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS poll_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 댓글 테이블 (회의/작업/건의에 공통 사용)
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_type TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  } catch(e) { console.error('comments/chat 테이블:', e.message); }

  // 개인 To-do 테이블
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        done INTEGER DEFAULT 0,
        due_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  } catch(e) { console.error('todos 테이블:', e.message); }

  // 연구소 일정 테이블
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        all_day INTEGER DEFAULT 1,
        color TEXT DEFAULT '#4573D2',
        category TEXT DEFAULT 'general',
        created_by INTEGER NOT NULL,
        created_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch(e) { console.error('events 테이블:', e.message); }

  // 알림 히스토리 테이블
  try {
    await db.run(`CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, action TEXT NOT NULL, title TEXT NOT NULL, message TEXT DEFAULT '', actor_id INTEGER, actor_name TEXT DEFAULT '', target_page TEXT DEFAULT '', target_id INTEGER, is_read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    console.log('activity_log 테이블 준비 완료');
  } catch(e) {
    console.error('activity_log 테이블 생성 실패:', e.message);
  }

  // 마이그레이션: is_approved 컬럼 추가
  try { await db.exec('ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0'); } catch(e) { /* 이미 존재 */ }
  // 마이그레이션: 업무보고 진행상태 컬럼 추가
  try { await db.exec("ALTER TABLE daily_reports ADD COLUMN work_status TEXT DEFAULT 'in_progress'"); } catch(e) { /* 이미 존재 */ }
  // 마이그레이션: 회의 AI 요약·액션아이템·Fireflies URL 컬럼 추가
  try { await db.exec("ALTER TABLE meetings ADD COLUMN ai_summary TEXT DEFAULT ''"); } catch(e) { /* 이미 존재 */ }
  try { await db.exec("ALTER TABLE meetings ADD COLUMN action_items TEXT DEFAULT '[]'"); } catch(e) { /* 이미 존재 */ }
  try { await db.exec("ALTER TABLE meetings ADD COLUMN fireflies_url TEXT DEFAULT ''"); } catch(e) { /* 이미 존재 */ }
  // 마이그레이션: 프로젝트 국가과제 컬럼 추가
  try { await db.exec("ALTER TABLE projects ADD COLUMN project_type TEXT DEFAULT 'regular'"); } catch(e) { /* 이미 존재 */ }
  try { await db.exec("ALTER TABLE projects ADD COLUMN org_name TEXT DEFAULT ''"); } catch(e) { /* 이미 존재 */ }
  try { await db.exec("ALTER TABLE projects ADD COLUMN total_budget TEXT DEFAULT ''"); } catch(e) { /* 이미 존재 */ }
  try { await db.exec("ALTER TABLE projects ADD COLUMN grant_number TEXT DEFAULT ''"); } catch(e) { /* 이미 존재 */ }
  // 마이그레이션: 댓글 익명 플래그
  try { await db.exec("ALTER TABLE comments ADD COLUMN is_anonymous INTEGER DEFAULT 0"); } catch(e) { /* 이미 존재 */ }
  // 마이그레이션: 댓글/채팅 첨부파일 참조
  try { await db.exec("ALTER TABLE comments ADD COLUMN attachment_id INTEGER"); } catch(e) { /* 이미 존재 */ }
  try { await db.exec("ALTER TABLE chat_messages ADD COLUMN attachment_id INTEGER"); } catch(e) { /* 이미 존재 */ }

  // 첨부파일 테이블 (보고서/회의/공지 등 공통)
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_type TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        size INTEGER DEFAULT 0,
        mimetype TEXT DEFAULT '',
        uploader_id INTEGER,
        uploader_name TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_attach_target ON attachments(target_type, target_id);
    `);
  } catch (e) { console.error('attachments 테이블:', e.message); }

  // 즐겨찾기 테이블 (사용자별 핀)
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        user_id INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, target_type, target_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  } catch (e) { console.error('favorites 테이블:', e.message); }
  // 기존 사용자 전부 승인 처리
  await db.run('UPDATE users SET is_approved = 1 WHERE is_approved = 0 OR is_approved IS NULL');

  // 국가과제 마일스톤 테이블
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS project_milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        due_date DATE NOT NULL,
        milestone_type TEXT DEFAULT 'general',
        status TEXT DEFAULT 'pending',
        description TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
  } catch(e) { console.error('project_milestones 테이블:', e.message); }

  // 외근/출장 기록 테이블
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS field_trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        trip_date DATE NOT NULL,
        trip_type TEXT DEFAULT 'outside',
        destination TEXT NOT NULL,
        organization TEXT DEFAULT '',
        purpose TEXT DEFAULT '',
        depart_time TEXT DEFAULT '',
        return_time TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  } catch(e) { console.error('field_trips 테이블:', e.message); }
  // 마이그레이션: trip_type 컬럼 추가
  try { await db.exec("ALTER TABLE field_trips ADD COLUMN trip_type TEXT DEFAULT 'outside'"); } catch(e) { /* 이미 존재 */ }

  // 휴가 기록 테이블
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS leaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        leave_date DATE NOT NULL,
        leave_type TEXT DEFAULT 'annual',
        note TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, leave_date)
      );
    `);
  } catch(e) { console.error('leaves 테이블:', e.message); }

  // 기본 관리자 계정 생성
  const adminExists = await db.get('SELECT id FROM users WHERE username = ?', 'admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin1234', 10);
    await db.run(
      'INSERT INTO users (name, department, position, username, password, is_admin, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?)',
      '관리자', '관리', '관리자', 'admin', hash, 1, 1
    );
    console.log('기본 관리자 계정 생성: admin / admin1234');
  }
}

db.init = initDB;
module.exports = db;
