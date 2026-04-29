const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

const ALLOWED_TYPES = new Set(['project', 'meeting']);

// 내 즐겨찾기 목록 (대시보드/사이드바 위젯용)
// 옵션: ?type=project 로 필터
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { type } = req.query;
    let rows = await db.all(
      'SELECT target_type, target_id FROM favorites WHERE user_id=? ORDER BY created_at DESC',
      userId
    );
    if (type) rows = rows.filter(r => r.target_type === type);

    // 각 타입별로 추가 메타 hydration
    const projectIds = rows.filter(r => r.target_type === 'project').map(r => r.target_id);
    const meetingIds = rows.filter(r => r.target_type === 'meeting').map(r => r.target_id);

    const [projects, meetings] = await Promise.all([
      projectIds.length
        ? db.all(`SELECT id, name, status, progress FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')})`, ...projectIds)
        : [],
      meetingIds.length
        ? db.all(`SELECT id, title, type, meeting_date FROM meetings WHERE id IN (${meetingIds.map(() => '?').join(',')})`, ...meetingIds)
        : [],
    ]);

    const enriched = rows.map(r => {
      if (r.target_type === 'project') {
        const meta = projects.find(p => p.id === r.target_id);
        return meta ? { ...r, ...meta, target_id: r.target_id, name: meta.name } : null;
      }
      if (r.target_type === 'meeting') {
        const meta = meetings.find(m => m.id === r.target_id);
        return meta ? { ...r, ...meta, target_id: r.target_id, title: meta.title } : null;
      }
      return r;
    }).filter(Boolean);

    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 토글 (있으면 삭제, 없으면 추가)
router.post('/toggle', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { target_type, target_id } = req.body;
    if (!ALLOWED_TYPES.has(target_type)) return res.status(400).json({ error: '지원하지 않는 type입니다.' });
    const exists = await db.get(
      'SELECT 1 FROM favorites WHERE user_id=? AND target_type=? AND target_id=?',
      userId, target_type, target_id
    );
    if (exists) {
      await db.run('DELETE FROM favorites WHERE user_id=? AND target_type=? AND target_id=?', userId, target_type, target_id);
      res.json({ favorited: false });
    } else {
      await db.run('INSERT INTO favorites (user_id, target_type, target_id) VALUES (?,?,?)', userId, target_type, target_id);
      res.json({ favorited: true });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
