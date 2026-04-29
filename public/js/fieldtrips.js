const TRIP_TYPES = {
  outside:       { label: '외근',  icon: '🚗', color: '#4573D2' },
  business_trip: { label: '출장',  icon: '✈️', color: '#E8384F' },
  off:           { label: '휴가',  icon: '🌴', color: '#9CA6AF' },
};

async function renderFieldTrips() {
  const page = document.getElementById('page-fieldtrips');
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';
  const users = await api.users.list().catch(() => []);

  // 이전 필터 복원 (없으면 본인 + 이번달 기본)
  const saved = filterStore.get('fieldtrips');
  const startVal = saved['ft-filter-start'] || monthStart;
  const endVal = saved['ft-filter-end'] || today;
  const userVal = saved['ft-filter-user'] !== undefined ? saved['ft-filter-user'] : (window._currentUser?.id ?? '');

  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">외근 · 출장 · 휴가</h2>
        <p class="page-subtitle">외근, 출장, 휴가 기록을 관리하고 팀 현황과 자동 연동됩니다</p>
      </div>
      <button class="btn btn-coral" onclick="openFieldTripForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        등록
      </button>
    </div>
    <div class="card">
      <div class="filter-bar">
        <select id="ft-filter-user" aria-label="직원 필터">
          <option value="">전체 직원</option>
          ${users.map(u => `<option value="${u.id}" ${String(u.id) === String(userVal) ? 'selected' : ''}>${escHtml(u.name)}</option>`).join('')}
        </select>
        <input type="date" id="ft-filter-start" value="${startVal}" aria-label="시작 날짜">
        <span style="font-size:13px;color:var(--text-tertiary)">~</span>
        <input type="date" id="ft-filter-end" value="${endVal}" aria-label="종료 날짜">
        <button class="btn btn-secondary" onclick="loadFieldTrips()">조회</button>
        <button class="btn btn-ghost" onclick="setFTDateRange('month')">이번달</button>
      </div>
      <div id="fieldtrips-list"></div>
    </div>
  `;
  filterStore.bindInputs('fieldtrips', ['ft-filter-user', 'ft-filter-start', 'ft-filter-end'], loadFieldTrips);
  loadFieldTrips();
}

function setFTDateRange(type) {
  const today = new Date();
  if (type === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('ft-filter-start').value = start.toISOString().split('T')[0];
    document.getElementById('ft-filter-end').value = today.toISOString().split('T')[0];
  }
  filterStore.set('fieldtrips', 'ft-filter-start', document.getElementById('ft-filter-start').value);
  filterStore.set('fieldtrips', 'ft-filter-end', document.getElementById('ft-filter-end').value);
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
          ${items.map(ft => {
            const typeInfo = TRIP_TYPES[ft.trip_type||'outside'] || TRIP_TYPES.outside;
            const isOff = ft.trip_type === 'off';
            return `
            <div class="ft-item">
              <div class="avatar avatar-sm ${getAvatarColor(ft.name)}">${(ft.name||'?').slice(0,1)}</div>
              <div class="ft-item-body">
                <div class="ft-item-name" style="display:flex;align-items:center;gap:8px">
                  ${escHtml(ft.name)}
                  <span class="ft-type-tag" style="background:${typeInfo.color}22;color:${typeInfo.color};border:1px solid ${typeInfo.color}44">
                    ${typeInfo.icon} ${typeInfo.label}
                  </span>
                </div>
                ${!isOff ? `
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
                ` : ''}
                ${ft.note ? `<div class="ft-item-note">${escHtml(ft.note)}</div>` : ''}
              </div>
              <div style="display:flex;gap:4px;margin-left:auto;flex-shrink:0" onclick="event.stopPropagation()">
                <button class="btn btn-ghost btn-sm" onclick="openFieldTripForm(${ft.id})">수정</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteFieldTrip(${ft.id})">삭제</button>
              </div>
            </div>`;
          }).join('')}
        </div>`;
    }).join('');
}

async function openFieldTripForm(tripId) {
  const today = new Date().toISOString().split('T')[0];
  let ft = null;
  if (tripId) ft = await api.fieldtrips.get(tripId).catch(() => null);
  const currentType = ft?.trip_type || 'outside';
  const isOff = currentType === 'off';

  modal.show(
    tripId ? '수정' : '외근 · 출장 · 휴가 등록',
    `<div class="form-row">
       <div class="form-group">
         <label>유형 *</label>
         <select id="ft-type" onchange="_toggleFtFields(this.value)">
           ${Object.entries(TRIP_TYPES).map(([k,v]) =>
             `<option value="${k}" ${currentType===k?'selected':''}>${v.icon} ${v.label}</option>`
           ).join('')}
         </select>
       </div>
       <div class="form-group">
         <label>날짜 *</label>
         <input type="date" id="ft-date" value="${ft?.trip_date || today}">
       </div>
     </div>
     <div id="ft-trip-fields" style="${isOff?'display:none':''}">
       <div class="form-row">
         <div class="form-group">
           <label>목적지 *</label>
           <input type="text" id="ft-dest" value="${escHtml(ft?.destination || '')}" placeholder="예: 서울대학교, 한국기술센터">
         </div>
         <div class="form-group">
           <label>방문기관</label>
           <input type="text" id="ft-org" value="${escHtml(ft?.organization || '')}" placeholder="예: 과기부, LG전자 R&D">
         </div>
       </div>
       <div class="form-group">
         <label>목적</label>
         <input type="text" id="ft-purpose" value="${escHtml(ft?.purpose || '')}" placeholder="예: 협약 미팅, 기술 발표">
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
     </div>
     <div class="form-group">
       <label>메모</label>
       <textarea id="ft-note" rows="2" placeholder="추가 메모사항">${escHtml(ft?.note || '')}</textarea>
     </div>
     <div style="font-size:12px;color:var(--blue);margin-top:8px">
       💡 오늘 날짜로 등록하면 팀 현황 상태가 자동으로 업데이트됩니다
     </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveFieldTrip(${tripId || 'null'})">저장</button>`
  );
}

function _toggleFtFields(type) {
  const el = document.getElementById('ft-trip-fields');
  if (el) el.style.display = type === 'off' ? 'none' : '';
}

async function saveFieldTrip(tripId) {
  const tripType = document.getElementById('ft-type')?.value || 'outside';
  const isOff = tripType === 'off';
  const data = {
    trip_date: document.getElementById('ft-date').value,
    trip_type: tripType,
    destination: isOff ? '휴가' : (document.getElementById('ft-dest')?.value.trim() || ''),
    organization: isOff ? '' : (document.getElementById('ft-org')?.value.trim() || ''),
    purpose: isOff ? '' : (document.getElementById('ft-purpose')?.value.trim() || ''),
    depart_time: isOff ? '' : (document.getElementById('ft-depart')?.value || ''),
    return_time: isOff ? '' : (document.getElementById('ft-return')?.value || ''),
    note: document.getElementById('ft-note')?.value.trim() || '',
  };
  if (!data.trip_date) { toast('날짜를 입력하세요', 'error'); return; }
  if (!isOff && !data.destination) { toast('목적지를 입력하세요', 'error'); return; }
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
