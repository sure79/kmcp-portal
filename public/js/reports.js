let currentUser = null;

async function renderReports() {
  const page = document.getElementById('page-reports');
  const today = new Date().toISOString().split('T')[0];
  const users = await api.users.list().catch(() => []);

  // 이전 필터 복원
  const saved = filterStore.get('reports');
  const startVal = saved['report-filter-start'] || getWeekStart();
  const endVal = saved['report-filter-end'] || today;
  const userVal = saved['report-filter-user'] || '';

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
        <select id="report-filter-user" aria-label="직원 필터">
          <option value="">전체 직원</option>
          ${users.map(u => `<option value="${u.id}" ${String(u.id) === String(userVal) ? 'selected' : ''}>${u.name}</option>`).join('')}
        </select>
        <input type="date" id="report-filter-start" value="${startVal}" aria-label="시작 날짜">
        <span style="font-size:13px;color:var(--text-tertiary)">~</span>
        <input type="date" id="report-filter-end" value="${endVal}" aria-label="종료 날짜">
        <button class="btn btn-secondary" onclick="loadReports()">조회</button>
        <button class="btn btn-ghost" onclick="setDateRange('week')">이번주</button>
        <button class="btn btn-ghost" onclick="setDateRange('month')">이번달</button>
      </div>
      <div id="reports-list"></div>
    </div>
  `;
  filterStore.bindInputs('reports', ['report-filter-user', 'report-filter-start', 'report-filter-end'], loadReports);
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
  // 필터 값 저장
  filterStore.set('reports', 'report-filter-start', document.getElementById('report-filter-start').value);
  filterStore.set('reports', 'report-filter-end', document.getElementById('report-filter-end').value);
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
    </div>
    ${report?.id ? `<div id="r-attach-${report.id}"></div>` : '<div class="form-hint">💡 보고서를 먼저 저장하면 첨부파일을 추가할 수 있습니다.</div>'}`,
    `<button class="btn btn-secondary" onclick="modal._tryClose()">취소</button>
     <button class="btn btn-coral" onclick="saveReport()">저장</button>`
  );
  // 기존 보고서면 첨부파일 위젯 렌더링
  if (report?.id) {
    setTimeout(() => renderAttachments(`r-attach-${report.id}`, 'report', report.id), 50);
  }
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
    `<div class="meeting-section"><h4>금일 작업 내용</h4><p>${escHtmlReport(r.work_done) || '-'}</p></div>
     <div class="meeting-section"><h4>내일 예정 작업</h4><p>${escHtmlReport(r.work_planned) || '-'}</p></div>
     ${r.special_notes ? `<div class="meeting-section"><h4>특이사항</h4><p>${escHtmlReport(r.special_notes)}</p></div>` : ''}
     <div id="report-attach-${id}" style="margin-top:16px"></div>`,
    `<button class="btn btn-ghost btn-sm" onclick="printReport(${id})" aria-label="인쇄">🖨 인쇄</button>
     <div style="flex:1"></div>
     <button class="btn btn-secondary" onclick="modal.hide()">닫기</button>
     <button class="btn btn-coral" onclick="modal.hide();editReport(${id})">수정</button>`
  );
  setTimeout(() => renderAttachments(`report-attach-${id}`, 'report', id), 50);
}

function escHtmlReport(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// 단일 보고서 인쇄 (브라우저 인쇄 다이얼로그)
function printReport(id) {
  api.reports.list({}).then(reports => {
    const r = reports.find(x => x.id == id);
    if (!r) return;
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) { toast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.', 'error'); return; }
    w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>업무보고 ${r.report_date} ${r.name}</title>
      <style>
        body{font-family:'Pretendard','Inter',-apple-system,sans-serif;color:#1E1F21;padding:32px;line-height:1.6;font-size:13px}
        h1{font-size:22px;margin-bottom:4px;letter-spacing:-0.4px}
        .meta{color:#6F7782;font-size:12px;margin-bottom:24px;border-bottom:1px solid #E8ECEE;padding-bottom:14px}
        h2{font-size:14px;font-weight:700;color:#C85C4F;margin-top:18px;margin-bottom:6px;letter-spacing:-0.2px}
        p{white-space:pre-wrap;margin-bottom:14px}
        .footer{margin-top:32px;font-size:11px;color:#9CA6AF;text-align:right}
        @media print { body{padding:18mm} .no-print{display:none} }
      </style></head><body>
      <h1>업무보고서</h1>
      <div class="meta">${r.name} · ${r.report_date} · 진행상태 ${r.work_status||'in_progress'}</div>
      <h2>금일 작업 내용</h2><p>${(r.work_done||'-').replace(/</g,'&lt;')}</p>
      <h2>내일 예정 작업</h2><p>${(r.work_planned||'-').replace(/</g,'&lt;')}</p>
      ${r.special_notes ? `<h2>특이사항</h2><p>${r.special_notes.replace(/</g,'&lt;')}</p>` : ''}
      <div class="footer">KMCP 연구소 · 출력일 ${new Date().toLocaleString('ko-KR')}</div>
      <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`);
    w.document.close();
  });
}

async function editReport(id) { openReportForm(id); }

async function deleteReport(id) {
  if (!confirm('보고서를 삭제하시겠습니까?')) return;
  await api.reports.delete(id);
  toast('삭제되었습니다');
  loadReports();
}
