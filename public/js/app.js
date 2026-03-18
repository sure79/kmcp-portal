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
  'weekly-report': renderWeeklyReport,
  reports: renderReports,
  calendar: renderCalendar,
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

// 회원가입 폼 전환
function showRegisterForm() {
  document.getElementById('login-form').style.display = 'none';
  document.querySelector('.login-divider').style.display = 'none';
  document.querySelector('.login-screen .btn-secondary').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
  document.getElementById('register-error').style.display = 'none';
  document.getElementById('register-success').style.display = 'none';
}

function showLoginForm() {
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
  document.querySelector('.login-divider').style.display = 'flex';
  document.querySelector('.login-screen .btn-secondary').style.display = 'flex';
  document.getElementById('login-error').style.display = 'none';
}

// 회원가입
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  const successEl = document.getElementById('register-success');
  errEl.style.display = 'none';
  successEl.style.display = 'none';

  const name = document.getElementById('reg-name').value.trim();
  const department = document.getElementById('reg-dept').value.trim();
  const position = document.getElementById('reg-position').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const password2 = document.getElementById('reg-password2').value;

  if (!name || !username || !password) {
    errEl.textContent = '이름, 아이디, 비밀번호는 필수입니다.';
    errEl.style.display = 'block';
    return;
  }
  if (password !== password2) {
    errEl.textContent = '비밀번호가 일치하지 않습니다.';
    errEl.style.display = 'block';
    return;
  }
  if (password.length < 4) {
    errEl.textContent = '비밀번호는 4자 이상이어야 합니다.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const result = await api.users.register({ name, department, position, username, password });
    successEl.textContent = result.message || '가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.';
    successEl.style.display = 'block';
    // 폼 초기화
    document.getElementById('register-form').reset();
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

  // 알림 로드
  loadNotifications();
  setInterval(loadNotifications, 5 * 60 * 1000); // 5분마다 갱신

  navigateTo('dashboard');
}

// ===== 알림 시스템 =====
async function loadNotifications() {
  try {
    const notifs = await api.notifications.list();
    const badge = document.getElementById('notif-badge');
    if (notifs.length > 0) {
      badge.textContent = notifs.length;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
    window._notifications = notifs;
  } catch (e) {}
}

function toggleNotifications() {
  const dd = document.getElementById('notif-dropdown');
  const isOpen = dd.style.display !== 'none';
  if (isOpen) { closeNotifications(); return; }

  const notifs = window._notifications || [];
  const list = document.getElementById('notif-list');

  if (notifs.length === 0) {
    list.innerHTML = '<div class="notif-empty">새로운 알림이 없습니다</div>';
  } else {
    list.innerHTML = notifs.map(n => `
      <div class="notif-item notif-${n.type}" onclick="closeNotifications();navigateTo('${n.action}')">
        <div class="notif-icon">${n.icon}</div>
        <div class="notif-content">
          <div class="notif-title">${n.title}</div>
          <div class="notif-msg">${n.message}</div>
        </div>
      </div>
    `).join('');
  }
  dd.style.display = 'block';
}

function closeNotifications() {
  document.getElementById('notif-dropdown').style.display = 'none';
}

// ===== 글로벌 검색 =====
let searchTimeout = null;

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

// 글로벌 검색 이벤트
document.getElementById('global-search').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  if (q.length < 2) { document.getElementById('search-dropdown').style.display = 'none'; return; }
  searchTimeout = setTimeout(async () => {
    try {
      const results = await api.search(q);
      renderSearchResults(results, q);
    } catch (e) {}
  }, 300);
});

document.getElementById('global-search').addEventListener('focus', (e) => {
  if (e.target.value.trim().length >= 2) {
    document.getElementById('search-dropdown').style.display = 'block';
  }
});

// 바깥 클릭 시 검색/알림 닫기
document.addEventListener('click', (e) => {
  if (!e.target.closest('.topbar-search') && !e.target.closest('.search-dropdown')) {
    document.getElementById('search-dropdown').style.display = 'none';
  }
  if (!e.target.closest('.notif-wrapper')) {
    document.getElementById('notif-dropdown').style.display = 'none';
  }
});

function renderSearchResults(results, query) {
  const dd = document.getElementById('search-dropdown');
  const container = document.getElementById('search-results');
  const total = (results.tasks?.length||0) + (results.reports?.length||0) + (results.meetings?.length||0) + (results.projects?.length||0) + (results.notices?.length||0);

  if (total === 0) {
    container.innerHTML = '<div class="search-empty">검색 결과가 없습니다</div>';
    dd.style.display = 'block';
    return;
  }

  const highlight = (text) => {
    if (!text) return '';
    const safe = text.replace(/</g, '&lt;').substring(0, 100);
    return safe.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<mark>$&</mark>');
  };

  let html = '';
  if (results.tasks?.length) {
    html += `<div class="search-section-title">작업 (${results.tasks.length})</div>`;
    html += results.tasks.map(t => `
      <div class="search-item" onclick="document.getElementById('search-dropdown').style.display='none';navigateTo('kanban');setTimeout(()=>openTaskDetail(${t.id}),500)">
        <span class="search-item-icon">📌</span>
        <div><div class="search-item-title">${highlight(t.title)}</div>
        <div class="search-item-meta">${t.project_name||'미분류'} · ${t.assignee_name||'미배정'}</div></div>
      </div>
    `).join('');
  }
  if (results.projects?.length) {
    html += `<div class="search-section-title">프로젝트 (${results.projects.length})</div>`;
    html += results.projects.map(p => `
      <div class="search-item" onclick="document.getElementById('search-dropdown').style.display='none';navigateTo('projects');setTimeout(()=>viewProject(${p.id}),500)">
        <span class="search-item-icon">📁</span>
        <div><div class="search-item-title">${highlight(p.name)}</div>
        <div class="search-item-meta">진행률 ${p.progress||0}%</div></div>
      </div>
    `).join('');
  }
  if (results.meetings?.length) {
    html += `<div class="search-section-title">회의 (${results.meetings.length})</div>`;
    html += results.meetings.map(m => `
      <div class="search-item" onclick="document.getElementById('search-dropdown').style.display='none';navigateTo('meetings')">
        <span class="search-item-icon">${m.type==='weekly'?'📋':'🔧'}</span>
        <div><div class="search-item-title">${highlight(m.title || (m.type==='weekly'?'주간회의':'기술회의'))}</div>
        <div class="search-item-meta">${m.meeting_date}</div></div>
      </div>
    `).join('');
  }
  if (results.reports?.length) {
    html += `<div class="search-section-title">보고서 (${results.reports.length})</div>`;
    html += results.reports.map(r => `
      <div class="search-item" onclick="document.getElementById('search-dropdown').style.display='none';navigateTo('reports')">
        <span class="search-item-icon">📝</span>
        <div><div class="search-item-title">${r.name} - ${r.report_date}</div>
        <div class="search-item-meta">${highlight((r.work_done||'').split('\n')[0])}</div></div>
      </div>
    `).join('');
  }
  if (results.notices?.length) {
    html += `<div class="search-section-title">공지 (${results.notices.length})</div>`;
    html += results.notices.map(n => `
      <div class="search-item" onclick="document.getElementById('search-dropdown').style.display='none';navigateTo('notices')">
        <span class="search-item-icon">📢</span>
        <div><div class="search-item-title">${highlight(n.title)}</div></div>
      </div>
    `).join('');
  }

  container.innerHTML = html;
  dd.style.display = 'block';
}

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
