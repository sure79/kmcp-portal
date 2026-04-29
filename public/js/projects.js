let _projTab = 'all';

async function renderProjects() {
  const page = document.getElementById('page-projects');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">프로젝트</h2>
        <p class="page-subtitle">일반 프로젝트 및 국가과제 현황을 관리하세요</p>
      </div>
      <button class="btn btn-coral" onclick="openProjectForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        프로젝트 추가
      </button>
    </div>
    <div class="meeting-tabs" style="margin-bottom:16px">
      <button class="meeting-tab ${_projTab==='all'?'active':''}" onclick="filterProjects('all',this)">전체</button>
      <button class="meeting-tab ${_projTab==='regular'?'active':''}" onclick="filterProjects('regular',this)">일반 프로젝트</button>
      <button class="meeting-tab ${_projTab==='national'?'active':''}" onclick="filterProjects('national',this)">🏛 국가과제</button>
    </div>
    <div id="projects-grid" class="grid grid-2"></div>
  `;
  loadProjects();
}

function filterProjects(tab, btn) {
  _projTab = tab;
  document.querySelectorAll('.meeting-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadProjects();
}

async function loadProjects() {
  const [allProjects, favs] = await Promise.all([
    api.projects.list().catch(() => []),
    api.favorites.list('project').catch(() => []),
  ]);
  const favSet = new Set(favs.map(f => f.target_id));
  const projects = _projTab === 'all' ? allProjects
    : allProjects.filter(p => (p.project_type||'regular') === _projTab);
  const grid = document.getElementById('projects-grid');
  if (!projects.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📁</div><p>등록된 프로젝트가 없습니다</p></div>`;
    return;
  }
  grid.innerHTML = projects.map(p => {
    const progress = p.auto_progress || p.progress || 0;
    const statusLabel = { active: '진행중', completed: '완료', paused: '보류' };
    const isNational = (p.project_type||'regular') === 'national';
    const isFav = favSet.has(p.id);
    return `
      <div class="card project-card ${isNational ? 'national-project' : ''}" onclick="viewProject(${p.id})">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
          <div class="project-name">
            ${isNational ? '<span class="national-badge">🏛 국가과제</span>' : ''}
            ${escHtml(p.name)}
          </div>
          <div style="display:flex;align-items:center;gap:6px" onclick="event.stopPropagation()">
            <button class="fav-star ${isFav?'fav-on':''}" onclick="toggleFavorite('project',${p.id},this)" title="${isFav?'즐겨찾기 해제':'즐겨찾기'}" aria-label="즐겨찾기 토글" aria-pressed="${isFav}">${isFav?'★':'☆'}</button>
            <span class="badge badge-${p.status === 'active' ? 'active' : p.status === 'completed' ? 'completed' : 'pending'}">${statusLabel[p.status]||'진행중'}</span>
          </div>
        </div>
        ${isNational && p.org_name ? `<div style="font-size:12px;color:var(--blue);margin-bottom:4px">🏢 ${escHtml(p.org_name)}</div>` : ''}
        ${isNational && p.grant_number ? `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">과제번호: ${escHtml(p.grant_number)}</div>` : ''}
        <div class="project-desc">${escHtml(p.description || '설명 없음')}</div>
        <div class="progress-label"><span>진행률</span><span>${progress}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
        <div class="progress-label">
          <span>작업 ${p.done_tasks||0}/${p.total_tasks||0} 완료</span>
          ${p.end_date ? `<span>마감 ${p.end_date}</span>` : ''}
        </div>
        <div class="project-meta">
          <div class="member-chips">
            ${(p.members||[]).map(m=>`<span class="member-chip">${escHtml(m.name)}</span>`).join('')}
            ${!p.members?.length ? '<span class="text-muted text-sm">참여자 없음</span>' : ''}
          </div>
          <div style="margin-left:auto;display:flex;gap:4px" onclick="event.stopPropagation()">
            <button class="btn btn-ghost btn-sm" onclick="openProjectForm(${p.id})">수정</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteProject(${p.id})">삭제</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function openProjectForm(projectId) {
  const users = await api.users.list().catch(() => []);
  let project = null;
  if (projectId) project = await api.projects.get(projectId).catch(() => null);
  const memberIds = project?.members?.map(m => m.id) || [];

  modal.show(
    projectId ? '프로젝트 수정' : '새 프로젝트',
    `<div class="form-group"><label>프로젝트 유형 *</label>
       <select id="p-type" onchange="toggleNationalFields(this.value)">
         <option value="regular" ${(project?.project_type||'regular')==='regular'?'selected':''}>일반 프로젝트</option>
         <option value="national" ${project?.project_type==='national'?'selected':''}>🏛 국가과제</option>
       </select>
     </div>
     <div id="national-fields" style="${project?.project_type==='national'?'':'display:none'}">
       <div class="form-row">
         <div class="form-group"><label>주관/수탁기관</label><input type="text" id="p-org" value="${project?.org_name||''}" placeholder="예: 과학기술정보통신부, IITP"></div>
         <div class="form-group"><label>과제번호</label><input type="text" id="p-grant" value="${project?.grant_number||''}" placeholder="예: RS-2024-00XXXXXX"></div>
       </div>
       <div class="form-group"><label>총 연구비</label><input type="text" id="p-budget" value="${project?.total_budget||''}" placeholder="예: 5억원 (직접비 4억 + 간접비 1억)"></div>
     </div>
     <div class="form-group"><label>프로젝트명 *</label><input type="text" id="p-name" value="${project?.name||''}" placeholder="프로젝트 이름을 입력하세요"></div>
     <div class="form-group"><label>설명</label><textarea id="p-desc" rows="3" placeholder="프로젝트에 대한 설명을 입력하세요">${project?.description||''}</textarea></div>
     <div class="form-row">
       <div class="form-group"><label>시작일</label><input type="date" id="p-start" value="${project?.start_date||''}"></div>
       <div class="form-group"><label>종료일</label><input type="date" id="p-end" value="${project?.end_date||''}"></div>
     </div>
     <div class="form-row">
       <div class="form-group"><label>상태</label>
         <select id="p-status">
           <option value="active" ${project?.status=='active'||!project?'selected':''}>진행중</option>
           <option value="completed" ${project?.status=='completed'?'selected':''}>완료</option>
           <option value="paused" ${project?.status=='paused'?'selected':''}>보류</option>
         </select>
       </div>
       <div class="form-group"><label>진행률 (%)</label><input type="number" id="p-progress" min="0" max="100" value="${project?.progress||0}"></div>
     </div>
     <div class="form-group">
       <label>참여 인원</label>
       <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
         ${users.map(u=>`
           <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;transition:all 0.15s">
             <input type="checkbox" name="p-member" value="${u.id}" ${memberIds.includes(u.id)?'checked':''}>
             ${u.name}
           </label>
         `).join('')}
       </div>
     </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveProject(${projectId||'null'})">저장</button>`,
    { large: true }
  );
}

function toggleNationalFields(val) {
  const el = document.getElementById('national-fields');
  if (el) el.style.display = val === 'national' ? '' : 'none';
}

async function saveProject(projectId) {
  const memberIds = Array.from(document.querySelectorAll('input[name="p-member"]:checked')).map(el => parseInt(el.value));
  const pType = document.getElementById('p-type')?.value || 'regular';
  const data = {
    name: document.getElementById('p-name').value.trim(),
    description: document.getElementById('p-desc').value.trim(),
    start_date: document.getElementById('p-start').value || null,
    end_date: document.getElementById('p-end').value || null,
    status: document.getElementById('p-status').value,
    progress: parseInt(document.getElementById('p-progress').value) || 0,
    project_type: pType,
    org_name: pType === 'national' ? (document.getElementById('p-org')?.value.trim()||'') : '',
    grant_number: pType === 'national' ? (document.getElementById('p-grant')?.value.trim()||'') : '',
    total_budget: pType === 'national' ? (document.getElementById('p-budget')?.value.trim()||'') : '',
    created_by: window._currentUser?.id,
    member_ids: memberIds,
  };
  if (!data.name) { toast('프로젝트명을 입력하세요', 'error'); return; }
  try {
    if (projectId) await api.projects.update(projectId, data);
    else await api.projects.create(data);
    modal.hide();
    toast(projectId ? '수정되었습니다' : '프로젝트가 추가되었습니다');
    loadProjects();
  } catch(e) { toast(e.message, 'error'); }
}

async function viewProject(id) {
  const p = await api.projects.get(id).catch(() => null);
  if (!p) return;
  const progress = p.progress || 0;
  const doneTasks = (p.tasks||[]).filter(t => t.status === 'done').length;
  const totalTasks = (p.tasks||[]).length;
  const isNational = (p.project_type||'regular') === 'national';
  const milestones = p.milestones || [];
  const today = new Date().toISOString().split('T')[0];

  const msTypeLabel = { general:'일반', report:'보고', review:'검토', final:'최종보고', submit:'제출', other:'기타' };
  const msStatusColor = { pending:'var(--text-tertiary)', done:'var(--green)', overdue:'var(--red)' };

  document.getElementById('modal').classList.add('modal-xl');

  modal.show(
    escHtml(p.name),
    `${isNational ? `
      <div class="national-info-box">
        <div class="national-info-row">
          <span class="national-info-label">주관기관</span>
          <span>${escHtml(p.org_name||'-')}</span>
          ${p.grant_number ? `<span class="national-info-label" style="margin-left:16px">과제번호</span><span>${escHtml(p.grant_number)}</span>` : ''}
          ${p.total_budget ? `<span class="national-info-label" style="margin-left:16px">연구비</span><span>${escHtml(p.total_budget)}</span>` : ''}
        </div>
      </div>` : ''}
     <div class="meeting-section">
       <h4>설명</h4><p>${escHtml(p.description || '-')}</p>
     </div>
     <div class="form-row">
       <div class="meeting-section"><h4>기간</h4><p>${p.start_date||'-'} ~ ${p.end_date||'-'}</p></div>
       <div class="meeting-section"><h4>상태</h4><p>${{active:'진행중',completed:'완료',paused:'보류'}[p.status]}</p></div>
     </div>
     <div class="meeting-section">
       <h4>진행률</h4>
       <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:${progress}%"></div></div>
       <div class="progress-label"><span>작업 ${doneTasks}/${totalTasks} 완료</span><span>${progress}%</span></div>
     </div>

     <!-- 마일스톤 -->
     <div class="meeting-section">
       <h4 style="display:flex;align-items:center;gap:8px">
         🏁 마일스톤 / 보고 일정
         <button class="btn btn-ghost btn-sm" onclick="openMilestoneForm(${id})">+ 추가</button>
       </h4>
       <div id="milestone-list-${id}">
         ${milestones.length === 0 ? '<p class="text-muted text-sm">등록된 마일스톤이 없습니다</p>' :
           milestones.map(ms => {
             const isOverdue = ms.due_date < today && ms.status !== 'done';
             const statusKey = ms.status === 'done' ? 'done' : (isOverdue ? 'overdue' : 'pending');
             return `
               <div class="milestone-row" id="ms-row-${ms.id}">
                 <div class="milestone-dot" style="background:${msStatusColor[statusKey]}"></div>
                 <div class="milestone-body">
                   <div class="milestone-title">${escHtml(ms.title)}</div>
                   <div class="milestone-meta">
                     <span style="color:${isOverdue?'var(--red)':'var(--text-tertiary)'}">${ms.due_date}</span>
                     ${ms.milestone_type ? `<span class="milestone-type-tag">${msTypeLabel[ms.milestone_type]||ms.milestone_type}</span>` : ''}
                     ${ms.description ? `<span>· ${escHtml(ms.description)}</span>` : ''}
                   </div>
                 </div>
                 <div style="display:flex;gap:4px;margin-left:auto;flex-shrink:0">
                   ${ms.status !== 'done' ? `<button class="btn btn-ghost btn-sm" onclick="toggleMilestone(${id},${ms.id},'done')">완료</button>` : `<button class="btn btn-ghost btn-sm" style="color:var(--text-tertiary)" onclick="toggleMilestone(${id},${ms.id},'pending')">되돌리기</button>`}
                   <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteMilestone(${id},${ms.id})">삭제</button>
                 </div>
               </div>`;
           }).join('')}
       </div>
     </div>

     <div class="meeting-section">
       <h4>참여 인원</h4>
       <div class="attendee-list">${(p.members||[]).map(m=>`<span class="attendee-chip">${escHtml(m.name)} <small style="color:var(--text-tertiary)">${escHtml(m.role)}</small></span>`).join('')||'<span class="text-muted text-sm">없음</span>'}</div>
     </div>
     ${totalTasks > 0 ? `
     <div class="meeting-section">
       <h4>작업 목록</h4>
       ${(p.tasks||[]).map(t=>`
         <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
           <span class="badge badge-${t.status}" style="min-width:54px;justify-content:center">${{pending:'대기',in_progress:'진행',review:'검토',done:'완료'}[t.status]}</span>
           <span style="flex:1;font-size:13px">${escHtml(t.title)}</span>
           <span style="font-size:12px;color:var(--text-tertiary)">${escHtml(t.assignee_name||'미배정')}</span>
         </div>`).join('')}
     </div>` : ''}`,
    `<button class="btn btn-secondary" onclick="modal.hide()">닫기</button>
     <button class="btn btn-coral" onclick="modal.hide();openProjectForm(${id})">수정</button>`,
    { large: true }
  );

  const origHide = modal._origHide2 || modal.hide;
  if (!modal._origHide2) modal._origHide2 = modal.hide;
  modal.hide = () => {
    document.getElementById('modal').classList.remove('modal-xl');
    origHide.call(modal);
    modal.hide = origHide;
    delete modal._origHide2;
  };
}

function openMilestoneForm(projectId, milestoneId) {
  const msTypes = [
    { value:'general', label:'일반' },
    { value:'report', label:'📋 보고' },
    { value:'review', label:'🔍 검토' },
    { value:'final', label:'🏁 최종보고' },
    { value:'submit', label:'📤 제출' },
    { value:'other', label:'기타' },
  ];
  modal.show('마일스톤 추가',
    `<div class="form-group"><label>제목 *</label><input type="text" id="ms-title" placeholder="예: 1차년도 연차보고서 제출"></div>
     <div class="form-row">
       <div class="form-group"><label>마감일 *</label><input type="date" id="ms-due"></div>
       <div class="form-group"><label>유형</label>
         <select id="ms-type">${msTypes.map(t=>`<option value="${t.value}">${t.label}</option>`).join('')}</select>
       </div>
     </div>
     <div class="form-group"><label>메모 (선택)</label><input type="text" id="ms-desc" placeholder="간단한 메모"></div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveMilestone(${projectId})">추가</button>`
  );
}

async function saveMilestone(projectId) {
  const title = document.getElementById('ms-title')?.value.trim();
  const due_date = document.getElementById('ms-due')?.value;
  if (!title || !due_date) { toast('제목과 날짜를 입력하세요', 'error'); return; }
  const data = {
    title,
    due_date,
    milestone_type: document.getElementById('ms-type')?.value || 'general',
    description: document.getElementById('ms-desc')?.value.trim() || '',
  };
  try {
    await api.projects.milestones.create(projectId, data);
    modal.hide();
    toast('마일스톤이 추가되었습니다');
    viewProject(projectId);
  } catch(e) { toast(e.message, 'error'); }
}

async function toggleMilestone(projectId, milestoneId, newStatus) {
  try {
    await api.projects.milestones.update(projectId, milestoneId, { status: newStatus });
    viewProject(projectId);
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteMilestone(projectId, milestoneId) {
  if (!confirm('마일스톤을 삭제하시겠습니까?')) return;
  try {
    await api.projects.milestones.delete(projectId, milestoneId);
    viewProject(projectId);
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteProject(id) {
  if (!confirm('프로젝트를 삭제하시겠습니까?\n관련 작업도 모두 삭제됩니다.')) return;
  await api.projects.delete(id);
  toast('삭제되었습니다');
  loadProjects();
}
