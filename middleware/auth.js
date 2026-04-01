// 인증 미들웨어

// 로그인 여부 확인
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  next();
}

// 관리자 권한 확인
function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
