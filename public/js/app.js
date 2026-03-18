// 전역 상태
window._currentUser = null;
window._socket = null;

// 아바타 색상 팔레트
const AVATAR_COLORS = ['avatar-coral', 'avatar-purple', 'avatar-blue', 'avatar-green', 'avatar-yellow'];
function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name||'').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// 페이지 렌더러 맵
const pageRenderers = {
  dashboard: renderDashboard,
  team: renderTeam,
  reports: renderReports,
  kanban: renderKanban,
  projects: renderProjects,
  meetings: renderMeetings,
  notices: renderNotices,
  users: renderUsers,
};

let currentPage = 'dashboard';

// 로그인
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  try {
    const user = await api.users.login({ username, password });
    window._currentUser = user;
    initApp(user);
  } catch(err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

function initApp(user) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // 사용자 정보 표시
  document.getElementById('user-name-display').textContent = user.name;
  document.getElementById('user-dept-display').textContent = (user.department||'') + (user.position ? ' · '+user.position : '');
  const avatarEl = document.getElementById('user-avatar');
  avatarEl.textContent = user.name.slice(0,1);
  avatarEl.className = `avatar avatar-sm ${getAvatarColor(user.name)}`;

  // 상단바 날짜
  const today = new Date();
  const days = ['일','월','화','수','목','금','토'];
  document.getElementById('topbar-today').textContent =
    `${today.getFullYear()}. ${today.getMonth()+1}. ${today.getDate()}. (${days[today.getDay()]})`;

  // 관리자 메뉴 표시
  if (user.is_admin) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
  }

  // Socket.io 연결
  window._socket = io();
  window._socket.on('task:moved', (data) => {
    if (currentPage === 'kanban') loadKanban();
    toast(`${data.movedBy||'누군가'}님이 작업을 이동했습니다`, 'info');
  });
  window._socket.on('report:new', (data) => {
    if (currentPage === 'team') loadTeamData();
    if (currentPage === 'dashboard') renderDashboard();
    toast(`${data.name||'누군가'}님이 보고서를 제출했습니다`, 'info');
  });
  window._socket.on('status:updated', (data) => {
    if (currentPage === 'team') loadTeamData();
    toast(`${data.name||'누군가'}님이 상태를 변경했습니다: ${data.status}`, 'info');
  });
  window._socket.on('lunch:voted', (data) => {
    if (currentPage === 'dashboard') renderDashboard();
  });
  window._socket.on('lunch:new', (data) => {
    if (currentPage === 'dashboard') renderDashboard();
    toast(`${data.name||'누군가'}님이 점심 투표를 시작했습니다!`, 'info');
  });

  navigateTo('dashboard');
}

async function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  currentPage = page;

  // 모바일에서 사이드바 닫기
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.add('collapsed');
  }

  if (pageRenderers[page]) {
    try { await pageRenderers[page](); } catch(e) { console.error(e); }
  }
}

// 네비게이션 클릭
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

// 사이드바 토글
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});

// 로그아웃
document.getElementById('logout-btn').addEventListener('click', async () => {
  await api.users.logout().catch(() => {});
  window._currentUser = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-password').value = '';
});

// 세션 복구 시도
(async () => {
  try {
    const user = await api.users.me();
    window._currentUser = user;
    initApp(user);
  } catch {
    // 로그인 화면 유지
  }
})();
