const STATUS_OPTIONS = {
  office: { label: '출근', icon: '🏢', color: '#5DA283', bg: '#E8F5EE' },
  meeting: { label: '회의', icon: '📋', color: '#AA62E3', bg: '#F3EDFF' },
  outside: { label: '외근', icon: '🚗', color: '#4573D2', bg: '#EDF1FC' },
  remote: { label: '재택', icon: '🏠', color: '#F1BD6C', bg: '#FEF6E7' },
  off: { label: '휴가', icon: '🌴', color: '#9CA6AF', bg: '#F6F8FA' },
  business_trip: { label: '출장', icon: '✈️', color: '#E8384F', bg: '#FDE8E8' },
};

async function renderTeam() {
  const page = document.getElementById('page-team');
  const today = new Date().toISOString().split('T')[0];

  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">팀 현황</h2>
        <p class="page-subtitle">팀원 상태, 업무보고를 한눈에 확인하세요</p>
      </div>
      <div class="filter-bar" style="margin-bottom:0">
        <input type="date" id="team-date" value="${today}">
        <button class="btn btn-secondary" onclick="loadTeamData()">조회</button>
      </div>
    </div>

    <!-- 상태 보드 -->
    <div class="card mb-16" id="status-board-card">
      <div class="card-header">
        <div class="card-title">근무 상태 보드</div>
        <button class="btn btn-coral btn-sm" onclick="openMyStatusForm()">내 상태 변경</button>
      </div>
      <div id="status-board" class="status-board"></div>
    </div>

    <!-- 팀원 보고서 -->
    <div id="team-grid" class="team-grid"></div>
  `;

  loadTeamData();
}

async function loadTeamData() {
  const date = document.getElementById('team-date')?.value || new Date().toISOString().split('T')[0];
  const [users, reports, statuses, fieldtrips] = await Promise.all([
    api.users.list(),
    api.reports.team(date),
    api.status.list(date),
    api.fieldtrips.list({ date }).catch(() => []),
  ]);
  const reportMap = {};
  reports.forEach(r => reportMap[r.user_id] = r);
  const statusMap = {};
  statuses.forEach(s => statusMap[s.user_id] = s);
  // 오늘 외근 기록 (user_id → 배열)
  const tripMap = {};
  fieldtrips.forEach(ft => {
    if (!tripMap[ft.user_id]) tripMap[ft.user_id] = [];
    tripMap[ft.user_id].push(ft);
  });

  // 상태 보드 렌더
  renderStatusBoard(users, statusMap, tripMap);

  // 팀 보고서 그리드
  const grid = document.getElementById('team-grid');
  if (!users.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>등록된 사용자가 없습니다</p></div>`;
    return;
  }

  // 부서별 그룹화
  const depts = {};
  users.forEach(u => {
    const dept = u.department || '기타';
    if (!depts[dept]) depts[dept] = [];
    depts[dept].push(u);
  });

  grid.innerHTML = Object.entries(depts).map(([dept, members]) => `
    <div class="team-dept-section">
      <h3 class="team-dept-title">${dept}</h3>
      <div class="team-dept-grid">
        ${members.map(u => {
          const r = reportMap[u.id];
          const st = statusMap[u.id];
          const stInfo = STATUS_OPTIONS[st?.status] || STATUS_OPTIONS.office;
          const initials = u.name.slice(0, 1);
          const colorClass = getAvatarColor(u.name);
          const trips = tripMap[u.id] || [];
          const isOutside = st?.status === 'outside' || st?.status === 'business_trip';
          return `
            <div class="card team-member-card">
              <div class="team-member-header">
                <div class="avatar ${colorClass}">${initials}</div>
                <div style="flex:1">
                  <div class="member-name">${escHtml(u.name)}</div>
                  <div class="member-dept">${escHtml(u.position || '')}</div>
                </div>
                <span class="status-chip" style="background:${stInfo.bg};color:${stInfo.color}">${stInfo.icon} ${stInfo.label}</span>
              </div>
              ${isOutside && trips.length > 0 ? `
                <div class="ft-team-box">
                  ${trips.map(ft => `
                    <div class="ft-team-row">
                      <span class="ft-team-dest">📍 ${escHtml(ft.destination)}</span>
                      ${ft.organization ? `<span class="ft-team-org">${escHtml(ft.organization)}</span>` : ''}
                      ${ft.purpose ? `<span class="ft-team-purpose">· ${escHtml(ft.purpose)}</span>` : ''}
                      ${ft.return_time ? `<span class="ft-team-return">복귀 ${ft.return_time}</span>` : ''}
                    </div>`).join('')}
                </div>` : ''}
              <div class="team-member-body">
                ${r ? `
                  <div class="report-item">
                    <span class="report-label">금일작업</span>
                    <span class="report-content">${formatMultiline(escHtml(r.work_done))}</span>
                  </div>
                  <div class="report-item">
                    <span class="report-label">예정작업</span>
                    <span class="report-content">${formatMultiline(escHtml(r.work_planned))}</span>
                  </div>
                  ${r.special_notes ? `<div class="report-item">
                    <span class="report-label">특이사항</span>
                    <span class="report-content" style="color:var(--coral)">${escHtml(r.special_notes)}</span>
                  </div>` : ''}
                  ${r.safety_notes ? `<div class="report-item">
                    <span class="report-label">안전사항</span>
                    <span class="report-content" style="color:var(--red)">${escHtml(r.safety_notes)}</span>
                  </div>` : ''}
                ` : `<div class="no-report">보고서 미제출</div>`}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

function renderStatusBoard(users, statusMap, tripMap = {}) {
  const board = document.getElementById('status-board');
  const groups = {};
  Object.keys(STATUS_OPTIONS).forEach(k => groups[k] = []);

  users.forEach(u => {
    const st = statusMap[u.id]?.status || 'office';
    if (!groups[st]) groups[st] = [];
    groups[st].push({ ...u, note: statusMap[u.id]?.note || '', trips: tripMap[u.id] || [] });
  });

  board.innerHTML = Object.entries(STATUS_OPTIONS).map(([key, info]) => {
    const members = groups[key] || [];
    if (key !== 'office' && members.length === 0) return '';
    const isOutsideType = key === 'outside' || key === 'business_trip';
    return `
      <div class="status-group">
        <div class="status-group-header" style="border-left:3px solid ${info.color}">
          <span class="status-group-icon">${info.icon}</span>
          <span class="status-group-label">${info.label}</span>
          <span class="status-group-count">${members.length}</span>
        </div>
        <div class="status-group-members">
          ${members.length === 0 ? '<span class="text-muted" style="font-size:12px;padding:4px 8px">-</span>' :
            members.map(u => `
              <div class="status-member-chip ${isOutsideType && u.trips.length ? 'has-trip' : ''}" title="${escHtml(u.note || '')}">
                <span class="avatar avatar-sm ${getAvatarColor(u.name)}">${escHtml(u.name.slice(0,1))}</span>
                <div style="display:flex;flex-direction:column;gap:1px">
                  <span>${escHtml(u.name)}</span>
                  ${isOutsideType && u.trips.length > 0
                    ? `<span class="status-trip-detail">📍 ${escHtml(u.trips[0].destination)}${u.trips[0].return_time ? ' · 복귀 '+u.trips[0].return_time : ''}</span>`
                    : (u.note ? `<span class="status-note">${escHtml(u.note)}</span>` : '')}
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `;
  }).filter(Boolean).join('');
}

function openMyStatusForm() {
  const user = window._currentUser;
  if (!user) return;

  const optionsHTML = Object.entries(STATUS_OPTIONS).map(([key, info]) => `
    <label class="status-radio-option" onclick="document.getElementById('status-${key}').checked=true">
      <input type="radio" name="my-status" id="status-${key}" value="${key}">
      <span class="status-radio-label" style="border-color:${info.color}">
        <span style="font-size:20px">${info.icon}</span>
        <span>${info.label}</span>
      </span>
    </label>
  `).join('');

  modal.show(
    '내 상태 변경',
    `<div class="status-radio-grid">${optionsHTML}</div>
     <div class="form-group" style="margin-top:16px">
       <label>메모 (선택)</label>
       <input type="text" id="status-note" placeholder="예: 거제 출장, 14시 복귀 예정">
     </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveMyStatus()">저장</button>`
  );
}

async function saveMyStatus() {
  const status = document.querySelector('input[name="my-status"]:checked')?.value;
  const note = document.getElementById('status-note')?.value || '';
  if (!status) { toast('상태를 선택하세요', 'error'); return; }

  try {
    await api.status.set({ user_id: window._currentUser.id, status, note });
    modal.hide();
    toast('상태가 변경되었습니다');
    if (window._socket) window._socket.emit('status:changed', { name: window._currentUser.name, status });
    loadTeamData();
  } catch(e) { toast(e.message, 'error'); }
}

function formatMultiline(text) {
  if (!text) return '-';
  return text.replace(/\n/g, '<br>');
}
