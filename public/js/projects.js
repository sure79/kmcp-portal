async function renderProjects() {
  const page = document.getElementById('page-projects');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">프로젝트</h2>
        <p class="page-subtitle">공통 프로젝트 진행 현황을 관리하세요</p>
      </div>
      <button class="btn btn-coral" onclick="openProjectForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        프로젝트 추가
      </button>
    </div>
    <div id="projects-grid" class="grid grid-2"></div>
  `;
  loadProjects();
}

async function loadProjects() {
  const projects = await api.projects.list().catch(() => []);
  const grid = document.getElementById('projects-grid');
  if (!projects.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📁</div><p>등록된 프로젝트가 없습니다</p></div>`;
    return;
  }
  grid.innerHTML = projects.map(p => {
    const progress = p.auto_progress || p.progress || 0;
    const statusLabel = { active: '진행중', completed: '완료', paused: '보류' };
    return `
      <div class="card project-card" onclick="viewProject(${p.id})">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
          <div class="project-name">${p.name}</div>
          <span class="badge badge-${p.status === 'active' ? 'active' : p.status === 'completed' ? 'completed' : 'pending'}">${statusLabel[p.status]||'진행중'}</span>
        </div>
        <div class="project-desc">${p.description || '설명 없음'}</div>
        <div class="progress-label"><span>진행률</span><span>${progress}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
        <div class="progress-label">
          <span>작업 ${p.done_tasks||0}/${p.total_tasks||0} 완료</span>
          ${p.end_date ? `<span>마감 ${p.end_date}</span>` : ''}
        </div>
        <div class="project-meta">
          <div class="member-chips">
            ${(p.members||[]).map(m=>`<span class="member-chip">${m.name}</span>`).join('')}
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
    `<div class="form-group"><label>프로젝트명 *</label><input type="text" id="p-name" value="${project?.name||''}" placeholder="프로젝트 이름을 입력하세요"></div>
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

async function saveProject(projectId) {
  const memberIds = Array.from(document.querySelectorAll('input[name="p-member"]:checked')).map(el => parseInt(el.value));
  const data = {
    name: document.getElementById('p-name').value.trim(),
    description: document.getElementById('p-desc').value.trim(),
    start_date: document.getElementById('p-start').value || null,
    end_date: document.getElementById('p-end').value || null,
    status: document.getElementById('p-status').value,
    progress: parseInt(document.getElementById('p-progress').value) || 0,
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

  modal.show(
    p.name,
    `<div class="meeting-section">
       <h4>설명</h4><p>${p.description || '-'}</p>
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
     <div class="meeting-section">
       <h4>참여 인원</h4>
       <div class="attendee-list">${(p.members||[]).map(m=>`<span class="attendee-chip">${m.name} <small style="color:var(--text-tertiary)">${m.role}</small></span>`).join('')||'<span class="text-muted text-sm">없음</span>'}</div>
     </div>
     ${totalTasks > 0 ? `
     <div class="meeting-section">
       <h4>작업 목록</h4>
       ${(p.tasks||[]).map(t=>`
         <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
           <span class="badge badge-${t.status}" style="min-width:54px;justify-content:center">${{pending:'대기',in_progress:'진행',review:'검토',done:'완료'}[t.status]}</span>
           <span style="flex:1;font-size:13px">${t.title}</span>
           <span style="font-size:12px;color:var(--text-tertiary)">${t.assignee_name||'미배정'}</span>
         </div>`).join('')}
     </div>` : ''}`,
    `<button class="btn btn-secondary" onclick="modal.hide()">닫기</button>
     <button class="btn btn-coral" onclick="modal.hide();openProjectForm(${id})">수정</button>`,
    { large: true }
  );
}

async function deleteProject(id) {
  if (!confirm('프로젝트를 삭제하시겠습니까?\n관련 작업도 모두 삭제됩니다.')) return;
  await api.projects.delete(id);
  toast('삭제되었습니다');
  loadProjects();
}
