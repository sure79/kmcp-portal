let currentUser = null;

async function renderReports() {
  const page = document.getElementById('page-reports');
  const today = new Date().toISOString().split('T')[0];
  const users = await api.users.list().catch(() => []);

  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">업무보고</h2>
        <p class="page-subtitle">일일 업무보고서를 작성하고 관리하세요</p>
      </div>
      <button class="btn btn-coral" onclick="openReportForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        보고서 작성
      </button>
    </div>
    <div class="card">
      <div class="filter-bar">
        <select id="report-filter-user">
          <option value="">전체 직원</option>
          ${users.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
        </select>
        <input type="date" id="report-filter-start" value="${getWeekStart()}">
        <span style="font-size:13px;color:var(--text-tertiary)">~</span>
        <input type="date" id="report-filter-end" value="${today}">
        <button class="btn btn-secondary" onclick="loadReports()">조회</button>
        <button class="btn btn-ghost" onclick="setDateRange('week')">이번주</button>
        <button class="btn btn-ghost" onclick="setDateRange('month')">이번달</button>
      </div>
      <div id="reports-list"></div>
    </div>
  `;
  loadReports();
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function setDateRange(type) {
  const today = new Date();
  if (type === 'week') {
    document.getElementById('report-filter-start').value = getWeekStart();
    document.getElementById('report-filter-end').value = today.toISOString().split('T')[0];
  } else {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('report-filter-start').value = start.toISOString().split('T')[0];
    document.getElementById('report-filter-end').value = today.toISOString().split('T')[0];
  }
  loadReports();
}

async function loadReports() {
  const userId = document.getElementById('report-filter-user')?.value;
  const start = document.getElementById('report-filter-start')?.value;
  const end = document.getElementById('report-filter-end')?.value;
  const params = {};
  if (userId) params.user_id = userId;
  if (start) params.start = start;
  if (end) params.end = end;

  const reports = await api.reports.list(params).catch(() => []);
  const list = document.getElementById('reports-list');

  if (!reports.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>조회된 보고서가 없습니다</p></div>`;
    return;
  }

  const statusInfo = {
    in_progress: { label: '진행중', color: 'var(--blue)' },
    review:      { label: '검토중', color: 'var(--yellow)' },
    done:        { label: '완료',   color: 'var(--green)' },
    blocked:     { label: '지연/보류', color: 'var(--red)' },
  };

  list.innerHTML = reports.map(r => {
    const st = statusInfo[r.work_status] || statusInfo.in_progress;
    return `
    <div class="report-list-item" onclick="viewReport(${r.id})">
      <div class="avatar avatar-sm ${getAvatarColor(r.name)}">${(r.name||'?').slice(0,1)}</div>
      <div class="report-date">${r.report_date}</div>
      <div class="report-author" style="font-weight:500">${r.name}</div>
      <span class="report-status-badge" style="background:${st.color}22;color:${st.color};border:1px solid ${st.color}44">${st.label}</span>
      <div class="report-preview">${r.work_done || '(내용 없음)'}</div>
      <div style="display:flex;gap:4px;margin-left:auto;flex-shrink:0" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="editReport(${r.id})">수정</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteReport(${r.id})">삭제</button>
      </div>
    </div>`; }).join('');
}

async function openReportForm(reportId) {
  const users = await api.users.list().catch(() => []);
  const today = new Date().toISOString().split('T')[0];
  let report = null;
  if (reportId) report = await api.reports.list({ }).then(rs => rs.find(r => r.id == reportId)).catch(() => null);

  const session = window._currentUser;
  const defaultUserId = session ? session.id : '';

  modal.show(
    reportId ? '보고서 수정' : '업무보고 작성',
    `<div class="form-row">
      <div class="form-group">
        <label>직원</label>
        <select id="r-user">
          ${users.map(u => `<option value="${u.id}" ${(report ? report.user_id : defaultUserId) == u.id ? 'selected' : ''}>${u.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>날짜</label>
        <input type="date" id="r-date" value="${report ? report.report_date : today}">
      </div>
    </div>
    <div class="form-group">
      <label>금일 작업 내용</label>
      <textarea id="r-done" rows="3" placeholder="오늘 진행한 작업을 입력하세요">${report ? report.work_done : ''}</textarea>
    </div>
    <div class="form-group">
      <label>내일 예정 작업</label>
      <textarea id="r-planned" rows="3" placeholder="내일 예정된 작업을 입력하세요">${report ? report.work_planned : ''}</textarea>
    </div>
    <div class="form-group">
      <label>특이사항</label>
      <textarea id="r-special" rows="2" placeholder="특이사항이 있으면 입력하세요">${report ? report.special_notes : ''}</textarea>
    </div>
    <div class="form-group">
      <label>진행 상태</label>
      <select id="r-status">
        <option value="in_progress" ${(!report || report.work_status === 'in_progress') ? 'selected' : ''}>🔵 진행중</option>
        <option value="review"      ${report?.work_status === 'review'      ? 'selected' : ''}>🟡 검토중</option>
        <option value="done"        ${report?.work_status === 'done'        ? 'selected' : ''}>🟢 완료</option>
        <option value="blocked"     ${report?.work_status === 'blocked'     ? 'selected' : ''}>🔴 지연/보류</option>
      </select>
    </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveReport()">저장</button>`
  );
}

async function saveReport() {
  const data = {
    user_id: document.getElementById('r-user').value,
    report_date: document.getElementById('r-date').value,
    work_done: document.getElementById('r-done').value,
    work_planned: document.getElementById('r-planned').value,
    special_notes: document.getElementById('r-special').value,
    work_status: document.getElementById('r-status')?.value || 'in_progress',
  };
  if (!data.user_id || !data.report_date) { toast('직원과 날짜를 선택하세요', 'error'); return; }
  try {
    await api.reports.save(data);
    modal.hide();
    toast('보고서가 저장되었습니다');
    loadReports();
    if (window._socket) window._socket.emit('report:submitted', { name: window._currentUser?.name, date: data.report_date });
  } catch(e) { toast(e.message, 'error'); }
}

async function viewReport(id) {
  const reports = await api.reports.list({});
  const r = reports.find(x => x.id == id);
  if (!r) return;
  modal.show(
    `업무보고 · ${r.name} · ${r.report_date}`,
    `<div class="meeting-section"><h4>금일 작업 내용</h4><p>${r.work_done || '-'}</p></div>
     <div class="meeting-section"><h4>내일 예정 작업</h4><p>${r.work_planned || '-'}</p></div>
     ${r.special_notes ? `<div class="meeting-section"><h4>특이사항</h4><p>${r.special_notes}</p></div>` : ''}`,
    `<button class="btn btn-secondary" onclick="modal.hide()">닫기</button>
     <button class="btn btn-coral" onclick="modal.hide();editReport(${id})">수정</button>`
  );
}

async function editReport(id) { openReportForm(id); }

async function deleteReport(id) {
  if (!confirm('보고서를 삭제하시겠습니까?')) return;
  await api.reports.delete(id);
  toast('삭제되었습니다');
  loadReports();
}
