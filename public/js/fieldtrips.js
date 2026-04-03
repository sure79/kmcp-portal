async function renderFieldTrips() {
  const page = document.getElementById('page-fieldtrips');
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';
  const users = await api.users.list().catch(() => []);

  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">외근 · 출장</h2>
        <p class="page-subtitle">외근 및 출장 기록을 관리하세요</p>
      </div>
      <button class="btn btn-coral" onclick="openFieldTripForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        외근 등록
      </button>
    </div>
    <div class="card">
      <div class="filter-bar">
        <select id="ft-filter-user">
          <option value="">전체 직원</option>
          ${users.map(u => `<option value="${u.id}" ${window._currentUser?.id == u.id ? 'selected' : ''}>${escHtml(u.name)}</option>`).join('')}
        </select>
        <input type="date" id="ft-filter-start" value="${monthStart}">
        <span style="font-size:13px;color:var(--text-tertiary)">~</span>
        <input type="date" id="ft-filter-end" value="${today}">
        <button class="btn btn-secondary" onclick="loadFieldTrips()">조회</button>
        <button class="btn btn-ghost" onclick="setFTDateRange('month')">이번달</button>
      </div>
      <div id="fieldtrips-list"></div>
    </div>
  `;
  loadFieldTrips();
}

function setFTDateRange(type) {
  const today = new Date();
  if (type === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('ft-filter-start').value = start.toISOString().split('T')[0];
    document.getElementById('ft-filter-end').value = today.toISOString().split('T')[0];
  }
  loadFieldTrips();
}

async function loadFieldTrips() {
  const userId = document.getElementById('ft-filter-user')?.value;
  const start = document.getElementById('ft-filter-start')?.value;
  const end = document.getElementById('ft-filter-end')?.value;
  const params = {};
  if (userId) params.user_id = userId;
  if (start) params.start = start;
  if (end) params.end = end;

  const trips = await api.fieldtrips.list(params).catch(() => []);
  const list = document.getElementById('fieldtrips-list');

  if (!trips.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🚗</div><p>조회된 외근 기록이 없습니다</p></div>`;
    return;
  }

  // 날짜별 그룹화
  const grouped = {};
  trips.forEach(t => {
    if (!grouped[t.trip_date]) grouped[t.trip_date] = [];
    grouped[t.trip_date].push(t);
  });

  list.innerHTML = Object.entries(grouped)
    .sort(([a],[b]) => b.localeCompare(a))
    .map(([date, items]) => {
      const d = new Date(date);
      const dayNames = ['일','월','화','수','목','금','토'];
      const isToday = date === new Date().toISOString().split('T')[0];
      return `
        <div class="ft-date-group">
          <div class="ft-date-header ${isToday ? 'ft-today' : ''}">
            ${date} (${dayNames[d.getDay()]}) ${isToday ? '<span class="ft-today-tag">오늘</span>' : ''}
          </div>
          ${items.map(ft => `
            <div class="ft-item">
              <div class="avatar avatar-sm ${getAvatarColor(ft.name)}">${(ft.name||'?').slice(0,1)}</div>
              <div class="ft-item-body">
                <div class="ft-item-name">${escHtml(ft.name)}</div>
                <div class="ft-item-dest">
                  <span class="ft-dest-tag">📍 ${escHtml(ft.destination)}</span>
                  ${ft.organization ? `<span style="color:var(--text-secondary)">· ${escHtml(ft.organization)}</span>` : ''}
                </div>
                ${ft.purpose ? `<div class="ft-item-purpose">${escHtml(ft.purpose)}</div>` : ''}
                ${(ft.depart_time || ft.return_time) ? `
                  <div class="ft-item-time">
                    ${ft.depart_time ? `🕐 출발 ${ft.depart_time}` : ''}
                    ${ft.return_time ? ` · 복귀 ${ft.return_time}` : ''}
                  </div>` : ''}
                ${ft.note ? `<div class="ft-item-note">${escHtml(ft.note)}</div>` : ''}
              </div>
              <div style="display:flex;gap:4px;margin-left:auto;flex-shrink:0" onclick="event.stopPropagation()">
                <button class="btn btn-ghost btn-sm" onclick="openFieldTripForm(${ft.id})">수정</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteFieldTrip(${ft.id})">삭제</button>
              </div>
            </div>`).join('')}
        </div>`;
    }).join('');
}

async function openFieldTripForm(tripId) {
  const today = new Date().toISOString().split('T')[0];
  let ft = null;
  if (tripId) ft = await api.fieldtrips.get(tripId).catch(() => null);

  modal.show(
    tripId ? '외근 수정' : '외근 등록',
    `<div class="form-row">
       <div class="form-group">
         <label>날짜 *</label>
         <input type="date" id="ft-date" value="${ft?.trip_date || today}">
       </div>
       <div class="form-group">
         <label>목적지 *</label>
         <input type="text" id="ft-dest" value="${ft?.destination || ''}" placeholder="예: 서울대학교, 한국기술센터">
       </div>
     </div>
     <div class="form-row">
       <div class="form-group">
         <label>방문기관</label>
         <input type="text" id="ft-org" value="${ft?.organization || ''}" placeholder="예: 과기부, LG전자 R&D">
       </div>
       <div class="form-group">
         <label>목적</label>
         <input type="text" id="ft-purpose" value="${ft?.purpose || ''}" placeholder="예: 협약 미팅, 기술 발표">
       </div>
     </div>
     <div class="form-row">
       <div class="form-group">
         <label>출발 시간</label>
         <input type="time" id="ft-depart" value="${ft?.depart_time || ''}">
       </div>
       <div class="form-group">
         <label>복귀 예정</label>
         <input type="time" id="ft-return" value="${ft?.return_time || ''}">
       </div>
     </div>
     <div class="form-group">
       <label>메모</label>
       <textarea id="ft-note" rows="2" placeholder="추가 메모사항">${ft?.note || ''}</textarea>
     </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveFieldTrip(${tripId || 'null'})">저장</button>`
  );
}

async function saveFieldTrip(tripId) {
  const data = {
    trip_date: document.getElementById('ft-date').value,
    destination: document.getElementById('ft-dest').value.trim(),
    organization: document.getElementById('ft-org').value.trim(),
    purpose: document.getElementById('ft-purpose').value.trim(),
    depart_time: document.getElementById('ft-depart').value,
    return_time: document.getElementById('ft-return').value,
    note: document.getElementById('ft-note').value.trim(),
  };
  if (!data.trip_date || !data.destination) { toast('날짜와 목적지를 입력하세요', 'error'); return; }
  try {
    if (tripId) await api.fieldtrips.update(tripId, data);
    else await api.fieldtrips.create(data);
    modal.hide();
    toast(tripId ? '수정되었습니다' : '외근이 등록되었습니다');
    loadFieldTrips();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteFieldTrip(id) {
  if (!confirm('외근 기록을 삭제하시겠습니까?')) return;
  await api.fieldtrips.delete(id);
  toast('삭제되었습니다');
  loadFieldTrips();
}
