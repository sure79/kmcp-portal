let meetingType = 'all';

async function renderMeetings() {
  const page = document.getElementById('page-meetings');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">회의</h2>
        <p class="page-subtitle">주간회의 (월 08:30) · 기술회의 (목 10:00~12:00)</p>
      </div>
      <button class="btn btn-coral" onclick="openMeetingForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        회의 등록
      </button>
    </div>
    <div class="meeting-tabs">
      <button class="meeting-tab active" onclick="filterMeetings('all', this)">전체</button>
      <button class="meeting-tab" onclick="filterMeetings('weekly', this)">주간회의</button>
      <button class="meeting-tab" onclick="filterMeetings('technical', this)">기술회의</button>
    </div>
    <div id="meetings-list"></div>
  `;
  loadMeetings();
}

function filterMeetings(type, btn) {
  meetingType = type;
  document.querySelectorAll('.meeting-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadMeetings();
}

async function loadMeetings() {
  const params = meetingType !== 'all' ? { type: meetingType } : {};
  const meetings = await api.meetings.list(params).catch(() => []);
  const list = document.getElementById('meetings-list');

  if (!meetings.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>등록된 회의가 없습니다</p></div>`;
    return;
  }

  // 월별 그룹화
  const grouped = {};
  meetings.forEach(m => {
    const monthKey = m.meeting_date.slice(0, 7);
    if (!grouped[monthKey]) grouped[monthKey] = [];
    grouped[monthKey].push(m);
  });

  list.innerHTML = Object.entries(grouped).map(([month, items]) => {
    const [y, mo] = month.split('-');
    return `
      <div class="meeting-month-group">
        <div class="meeting-month-header">${y}년 ${parseInt(mo)}월</div>
        <div class="card" style="padding:0">
          ${items.map(m => {
            // 안건·회의록·결정사항 중 하나라도 있으면 기록 있음
            const hasContent = !!(m.agenda || m.minutes || m.decisions);
            const previewText = (m.minutes || m.agenda || m.decisions || '').replace(/\n/g, ' ').trim();
            const preview = previewText.length > 90 ? previewText.slice(0, 90) + '…' : previewText;
            return `
              <div class="meeting-list-item" onclick="viewMeeting(${m.id})">
                <div class="meeting-date-badge">
                  <div class="month">${m.meeting_date.slice(5,7)}월</div>
                  <div class="day">${m.meeting_date.slice(8,10)}</div>
                </div>
                <div class="meeting-info" style="flex:1;min-width:0">
                  <div class="meeting-title">${m.title || (m.type === 'weekly' ? '주간회의' : '기술회의')}</div>
                  <div class="meeting-time">
                    ${m.start_time || ''} ${m.end_time ? '~ '+m.end_time : ''} · ${m.creator_name||''}
                  </div>
                  ${hasContent ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${preview}</div>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                  ${hasContent ? '<span class="badge badge-done" style="font-size:10px">회의록</span>' : '<span class="badge badge-pending" style="font-size:10px">기록없음</span>'}
                  ${m.ai_summary ? '<span class="badge" style="font-size:10px;background:#FF6B3522;color:#FF6B35;border:1px solid #FF6B3544">🔥 AI요약</span>' : ''}
                  ${(()=>{try{const a=JSON.parse(m.action_items||'[]');return a.length?`<span class="badge badge-active" style="font-size:10px">✅ ${a.length}액션</span>`:''}catch(e){return ''}})()}
                  <span class="badge badge-${m.type}">${m.type === 'weekly' ? '주간' : '기술'}</span>
                </div>
                <div style="display:flex;gap:4px;margin-left:8px;flex-shrink:0" onclick="event.stopPropagation()">
                  <button class="btn btn-ghost btn-sm" onclick="openMeetingForm(${m.id})">수정</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteMeeting(${m.id})">삭제</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

async function openMeetingForm(meetingId) {
  const users = await api.users.list().catch(() => []);
  let meeting = null, attendeeIds = [];
  if (meetingId) {
    meeting = await api.meetings.get(meetingId).catch(() => null);
    attendeeIds = meeting?.attendees?.map(a => a.id) || [];
  }

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('modal').classList.add('modal-xl');

  modal.show(
    meetingId ? '회의 수정' : '새 회의 등록',
    `<!-- AI 녹음 자동 작성 -->
     <div class="ai-record-box" id="ai-record-box">
       <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
         <span style="font-size:18px">🎙️</span>
         <div>
           <div style="font-weight:600;font-size:14px">녹음 파일로 회의록 자동 작성</div>
           <div style="font-size:12px;color:var(--text-secondary)">핸드폰 녹음 파일을 업로드하면 AI가 회의록을 자동으로 정리합니다</div>
         </div>
         <label class="btn btn-coral btn-sm" style="cursor:pointer;margin-left:auto">
           파일 선택
           <input type="file" id="m-audio-file" accept=".mp3,.m4a,.mp4,.wav,.ogg,.aac,.webm,.flac" style="display:none" onchange="transcribeAudio(this)">
         </label>
       </div>
       <div id="ai-progress" style="display:none;margin-top:12px">
         <div class="ai-progress-bar"><div class="ai-progress-fill"></div></div>
         <div id="ai-status" style="font-size:12px;color:var(--text-secondary);margin-top:6px;text-align:center">AI가 분석 중입니다...</div>
       </div>
     </div>

     <div class="form-row">
       <div class="form-group"><label>회의 유형 *</label>
         <select id="m-type">
           <option value="weekly" ${meeting?.type=='weekly'||!meeting?'selected':''}>주간회의</option>
           <option value="technical" ${meeting?.type=='technical'?'selected':''}>기술회의</option>
         </select>
       </div>
       <div class="form-group"><label>날짜 *</label><input type="date" id="m-date" value="${meeting?.meeting_date||today}"></div>
     </div>
     <div class="form-row">
       <div class="form-group"><label>시작 시간</label><input type="time" id="m-start" value="${meeting?.start_time||''}"></div>
       <div class="form-group"><label>종료 시간</label><input type="time" id="m-end" value="${meeting?.end_time||''}"></div>
     </div>
     <div class="form-group"><label>회의 제목</label><input type="text" id="m-title" value="${meeting?.title||''}" placeholder="예: 3월 2주차 주간회의"></div>
     <div class="form-group"><label>안건</label><textarea id="m-agenda" rows="3" placeholder="회의 안건을 입력하세요">${meeting?.agenda||''}</textarea></div>
     <div class="form-group"><label>회의록</label><textarea id="m-minutes" rows="5" placeholder="직접 입력하거나 위 녹음 파일 업로드를 사용하세요">${meeting?.minutes||''}</textarea></div>
     <div class="form-group"><label>결정사항</label><textarea id="m-decisions" rows="3" placeholder="회의에서 결정된 사항을 입력하세요">${meeting?.decisions||''}</textarea></div>

     <!-- Fireflies AI 요약 섹션 -->
     <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
       <div class="form-group">
         <label style="display:flex;align-items:center;gap:8px">
           🔥 Fireflies AI 요약
           <span style="font-size:11px;font-weight:400;color:var(--text-tertiary)">fireflies.ai 에서 복사한 요약을 붙여넣으세요</span>
         </label>
         <textarea id="m-ai-summary" rows="4" placeholder="Fireflies 회의 요약 내용을 여기에 붙여넣으세요...">${meeting?.ai_summary||''}</textarea>
       </div>
       <div class="form-group">
         <label>Fireflies 링크 <span style="font-size:11px;font-weight:400;color:var(--text-tertiary)">(선택)</span></label>
         <input type="url" id="m-fireflies-url" value="${meeting?.fireflies_url||''}" placeholder="https://app.fireflies.ai/...">
       </div>
       <div class="form-group">
         <label style="display:flex;align-items:center;gap:8px">
           ✅ 액션 아이템
           <span style="font-size:11px;font-weight:400;color:var(--text-tertiary)">한 줄에 하나씩 입력 — 저장 후 칸반으로 바로 생성 가능</span>
         </label>
         <textarea id="m-action-items" rows="3" placeholder="예:\n보고서 초안 작성 (@홍길동)\n장비 발주 확인 (@이순신)\n다음 회의 일정 조율">${(()=>{try{const a=JSON.parse(meeting?.action_items||'[]');return Array.isArray(a)?a.join('\n'):''}catch(e){return meeting?.action_items||''}})()}</textarea>
       </div>
     </div>
     <div class="form-group">
       <label>참석자</label>
       <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
         ${users.map(u=>`
           <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;transition:all 0.15s">
             <input type="checkbox" name="m-attendee" value="${u.id}" ${attendeeIds.includes(u.id)?'checked':''}>
             ${u.name}
           </label>
         `).join('')}
       </div>
     </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveMeeting(${meetingId||'null'})">저장</button>`
  );

  const origHide = modal._origHide || modal.hide;
  if (!modal._origHide) modal._origHide = modal.hide;
  modal.hide = () => {
    document.getElementById('modal').classList.remove('modal-xl');
    origHide.call(modal);
    modal.hide = origHide;
  };
}

async function transcribeAudio(input) {
  const file = input.files[0];
  if (!file) return;

  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  const progress = document.getElementById('ai-progress');
  const status = document.getElementById('ai-status');

  progress.style.display = 'block';
  status.textContent = `파일 업로드 중... (${sizeMB}MB)`;

  // 폼 입력 잠금
  ['m-title','m-agenda','m-minutes','m-decisions'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });

  try {
    status.textContent = 'Google AI가 녹음을 분석 중입니다... (파일 크기에 따라 1~3분 소요)';
    const result = await api.transcribe.audio(file);
    const d = result.data;

    // 폼 자동 입력
    if (d.title) document.getElementById('m-title').value = d.title;
    if (d.agenda) document.getElementById('m-agenda').value = d.agenda;
    if (d.minutes) document.getElementById('m-minutes').value = d.minutes;
    if (d.decisions) document.getElementById('m-decisions').value = d.decisions;

    progress.style.display = 'none';
    document.getElementById('ai-record-box').style.background = 'var(--green-light)';
    document.getElementById('ai-record-box').style.borderColor = 'var(--green)';
    document.getElementById('ai-record-box').querySelector('div > div > div').textContent = '✅ AI 분석 완료 — 내용을 확인하고 필요시 수정하세요';

    toast('회의록이 자동으로 작성되었습니다!', 'success');
  } catch (e) {
    progress.style.display = 'none';
    toast('분석 실패: ' + e.message, 'error');
  } finally {
    ['m-title','m-agenda','m-minutes','m-decisions'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });
  }
}

async function saveMeeting(meetingId) {
  const attendeeIds = Array.from(document.querySelectorAll('input[name="m-attendee"]:checked')).map(el => parseInt(el.value));
  const actionText = document.getElementById('m-action-items')?.value || '';
  const action_items = actionText.split('\n').map(s => s.trim()).filter(Boolean);
  const data = {
    type: document.getElementById('m-type').value,
    meeting_date: document.getElementById('m-date').value,
    start_time: document.getElementById('m-start').value,
    end_time: document.getElementById('m-end').value,
    title: document.getElementById('m-title').value,
    agenda: document.getElementById('m-agenda').value,
    minutes: document.getElementById('m-minutes').value,
    decisions: document.getElementById('m-decisions').value,
    ai_summary: document.getElementById('m-ai-summary')?.value || '',
    action_items,
    fireflies_url: document.getElementById('m-fireflies-url')?.value || '',
    created_by: window._currentUser?.id,
    attendee_ids: attendeeIds,
  };
  if (!data.meeting_date) { toast('날짜를 입력하세요', 'error'); return; }
  try {
    if (meetingId) await api.meetings.update(meetingId, data);
    else await api.meetings.create(data);
    modal.hide();
    toast(meetingId ? '수정되었습니다' : '회의가 등록되었습니다');
    loadMeetings();
  } catch(e) { toast(e.message, 'error'); }
}

async function viewMeeting(id) {
  const m = await api.meetings.get(id).catch(() => null);
  if (!m) return;

  document.getElementById('modal').classList.add('modal-xl');

  modal.show(
    '',
    `<div class="meeting-view">
      <div class="meeting-view-header">
        <span class="badge badge-${m.type}" style="font-size:13px;padding:4px 14px">${m.type === 'weekly' ? '주간회의' : '기술회의'}</span>
        <h2 class="meeting-view-title">${m.title || (m.type === 'weekly' ? '주간회의' : '기술회의')}</h2>
        <div class="meeting-view-meta">
          ${m.meeting_date} · ${m.start_time||''} ${m.end_time ? '~ '+m.end_time : ''} · 작성: ${m.creator_name||'-'}
        </div>
      </div>

      ${m.agenda ? `
        <div class="meeting-section">
          <h4>안건</h4>
          <div class="meeting-content-box" style="white-space:pre-wrap">${m.agenda}</div>
        </div>
      ` : ''}

      ${m.minutes ? `
        <div class="meeting-section">
          <h4>회의록</h4>
          <div class="meeting-content-box minutes" style="white-space:pre-wrap">${m.minutes}</div>
        </div>
      ` : ''}

      ${m.decisions ? `
        <div class="meeting-section">
          <h4>결정사항</h4>
          <div class="decisions-box" style="white-space:pre-wrap">${m.decisions}</div>
        </div>
      ` : ''}

      ${m.ai_summary ? `
        <div class="meeting-section">
          <h4 style="display:flex;align-items:center;gap:8px">🔥 Fireflies AI 요약
            ${m.fireflies_url ? `<a href="${escHtml(m.fireflies_url)}" target="_blank" style="font-size:11px;font-weight:400;color:var(--blue)">원본 보기 →</a>` : ''}
          </h4>
          <div class="meeting-content-box" style="white-space:pre-wrap;background:var(--surface-2,var(--surface));border-left:3px solid #FF6B35">${escHtml(m.ai_summary)}</div>
        </div>
      ` : ''}

      ${(()=>{
        try {
          const items = JSON.parse(m.action_items||'[]');
          if (!Array.isArray(items) || !items.length) return '';
          return `
            <div class="meeting-section">
              <h4 style="display:flex;align-items:center;gap:8px">✅ 액션 아이템 (${items.length}개)
                <button class="btn btn-ghost btn-sm" onclick="createTasksFromMeeting(${id})" style="margin-left:auto">
                  📌 칸반에 추가
                </button>
              </h4>
              <div class="action-items-list">
                ${items.map((item,i) => `
                  <div class="action-item-row">
                    <span class="action-item-num">${i+1}</span>
                    <span class="action-item-text">${escHtml(item)}</span>
                  </div>`).join('')}
              </div>
            </div>`;
        } catch(e) { return ''; }
      })()}

      ${!m.agenda && !m.minutes && !m.decisions && !m.ai_summary ? `
        <div class="empty-state" style="padding:32px">
          <div class="empty-icon">📝</div>
          <p>아직 회의록이 작성되지 않았습니다</p>
          <button class="btn btn-coral btn-sm" style="margin-top:12px" onclick="modal.hide();openMeetingForm(${id})">회의록 작성</button>
        </div>
      ` : ''}

      ${m.attendees?.length ? `
        <div class="meeting-section">
          <h4>참석자 (${m.attendees.length}명)</h4>
          <div class="attendee-list">
            ${m.attendees.map(a => `<span class="attendee-chip ${a.confirmed?'confirmed':''}">
              ${a.confirmed ? '✔ ' : ''}${a.name}
            </span>`).join('')}
          </div>
          <button class="btn btn-success btn-sm" style="margin-top:10px" onclick="confirmAttendance(${id})">참석 확인</button>
        </div>
      ` : ''}

      <div id="meeting-attach-${id}" class="meeting-section"></div>
      <div id="meeting-comments-${id}" class="meeting-section"></div>
    </div>`,
    `<button class="btn btn-ghost btn-sm" onclick="printMeeting(${id})" aria-label="회의록 인쇄">🖨 인쇄</button>
     <div style="flex:1"></div>
     <button class="btn btn-secondary" onclick="modal.hide()">닫기</button>
     <button class="btn btn-coral" onclick="modal.hide();openMeetingForm(${id})">수정</button>`
  );
  setTimeout(() => renderAttachments(`meeting-attach-${id}`, 'meeting', id), 50);

  const origHide = modal._origHide || modal.hide;
  if (!modal._origHide) modal._origHide = modal.hide;
  modal.hide = () => {
    document.getElementById('modal').classList.remove('modal-xl');
    origHide.call(modal);
    modal.hide = origHide;
  };

  // 댓글 렌더링
  renderComments(`meeting-comments-${id}`, 'meeting', id);
}

async function createTasksFromMeeting(meetingId) {
  const m = await api.meetings.get(meetingId).catch(() => null);
  if (!m) return;
  let items = [];
  try { items = JSON.parse(m.action_items || '[]'); } catch(e) {}
  if (!items.length) { toast('액션 아이템이 없습니다', 'error'); return; }

  const users = await api.users.list().catch(() => []);
  const today = new Date().toISOString().split('T')[0];

  const userOpts = users.map(u => `<option value="${u.id}">${escHtml(u.name)}</option>`).join('');
  const itemRows = items.map((item, i) => `
    <div class="action-kanban-row">
      <span class="action-item-num">${i+1}</span>
      <span class="action-item-text" style="flex:1">${escHtml(item)}</span>
      <select class="action-assignee" data-idx="${i}" style="width:100px;font-size:12px">
        <option value="">담당자</option>${userOpts}
      </select>
    </div>`).join('');

  modal.show('📌 칸반에 추가',
    `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
       아래 액션 아이템들이 칸반 보드 "대기중"에 추가됩니다.
     </p>
     <div style="margin-bottom:16px">${itemRows}</div>
     <div class="form-row">
       <div class="form-group">
         <label>마감일 (선택)</label>
         <input type="date" id="action-due-date" value="">
       </div>
       <div class="form-group">
         <label>프로젝트 연결 (선택)</label>
         <select id="action-project"><option value="">미연결</option></select>
       </div>
     </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="_doCreateTasksFromMeeting(${meetingId}, ${JSON.stringify(items).replace(/'/g,'&#39;')})">추가</button>`
  );

  // 프로젝트 목록 로드
  api.projects.list().then(projs => {
    const sel = document.getElementById('action-project');
    if (!sel) return;
    projs.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  });
}

async function _doCreateTasksFromMeeting(meetingId, items) {
  const dueDate = document.getElementById('action-due-date')?.value || null;
  const projectId = document.getElementById('action-project')?.value || null;
  const assignees = document.querySelectorAll('.action-assignee');
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    const assigneeId = assignees[i]?.value || null;
    try {
      await api.tasks.create({
        title: items[i],
        assignee_id: assigneeId || null,
        project_id: projectId || null,
        due_date: dueDate || null,
        status: 'pending',
        priority: 'medium',
      });
      count++;
    } catch(e) {}
  }
  modal.hide();
  toast(`${count}개 작업이 칸반에 추가되었습니다`);
}

async function confirmAttendance(meetingId) {
  if (!window._currentUser) return;
  await api.meetings.confirm(meetingId, window._currentUser.id);
  toast('참석 확인되었습니다');
  viewMeeting(meetingId);
}

async function deleteMeeting(id) {
  if (!confirm('회의를 삭제하시겠습니까?')) return;
  await api.meetings.delete(id);
  toast('삭제되었습니다');
  loadMeetings();
}

// 단일 회의록 인쇄
async function printMeeting(id) {
  const m = await api.meetings.get(id).catch(() => null);
  if (!m) return;
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) { toast('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.', 'error'); return; }
  const esc = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  let actions = '';
  try {
    const items = JSON.parse(m.action_items||'[]');
    if (Array.isArray(items) && items.length) {
      actions = `<h2>액션 아이템</h2><ol>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ol>`;
    }
  } catch {}
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>회의록 ${m.meeting_date} ${m.title||''}</title>
    <style>
      body{font-family:'Pretendard','Inter',-apple-system,sans-serif;color:#1E1F21;padding:32px;line-height:1.6;font-size:13px}
      h1{font-size:22px;margin-bottom:4px;letter-spacing:-0.4px}
      .meta{color:#6F7782;font-size:12px;margin-bottom:24px;border-bottom:1px solid #E8ECEE;padding-bottom:14px}
      h2{font-size:14px;font-weight:700;color:#C85C4F;margin-top:18px;margin-bottom:6px;letter-spacing:-0.2px}
      p,ol,ul{white-space:pre-wrap;margin-bottom:14px;padding-left:0}
      ol,ul{padding-left:18px}
      .attendees{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
      .chip{padding:2px 10px;border:1px solid #E8ECEE;border-radius:12px;font-size:11px}
      .footer{margin-top:32px;font-size:11px;color:#9CA6AF;text-align:right}
      @media print { body{padding:18mm} }
    </style></head><body>
    <h1>${m.type === 'weekly' ? '주간회의' : '기술회의'} ${m.title ? '· '+esc(m.title) : ''}</h1>
    <div class="meta">${m.meeting_date} ${m.start_time||''} ${m.end_time?'~ '+m.end_time:''} · 작성: ${esc(m.creator_name||'-')}</div>
    ${m.agenda ? `<h2>안건</h2><p>${esc(m.agenda)}</p>` : ''}
    ${m.minutes ? `<h2>회의록</h2><p>${esc(m.minutes)}</p>` : ''}
    ${m.decisions ? `<h2>결정사항</h2><p>${esc(m.decisions)}</p>` : ''}
    ${actions}
    ${m.attendees?.length ? `<h2>참석자 (${m.attendees.length}명)</h2><div class="attendees">${m.attendees.map(a => `<span class="chip">${a.confirmed?'✔ ':''}${esc(a.name)}</span>`).join('')}</div>` : ''}
    <div class="footer">KMCP 연구소 · 출력일 ${new Date().toLocaleString('ko-KR')}</div>
    <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`);
  w.document.close();
}
