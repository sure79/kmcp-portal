async function renderUsers() {
  const page = document.getElementById('page-users');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">설정</h2>
        <p class="page-subtitle">사용자 계정 및 가입 승인을 관리하세요</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="resetDemoData()" style="background:#f0f4ff;color:#4573D2;border:1px solid #c5d3f5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
          시연 데이터 초기화
        </button>
        <button class="btn btn-coral" onclick="openUserForm()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          사용자 추가
        </button>
      </div>
    </div>

    <!-- 승인 대기 -->
    <div id="pending-section"></div>

    <!-- 전체 사용자 -->
    <div class="card" style="padding:0;overflow:hidden">
      <table class="user-table">
        <thead>
          <tr><th>이름</th><th>부서</th><th>직급</th><th>아이디</th><th>상태</th><th>등록일</th><th style="text-align:right">관리</th></tr>
        </thead>
        <tbody id="users-tbody"></tbody>
      </table>
    </div>
  `;
  loadPendingUsers();
  loadUsers();
}

async function loadPendingUsers() {
  const pending = await api.users.pending().catch(() => []);
  const section = document.getElementById('pending-section');

  if (pending.length === 0) {
    section.innerHTML = '';
    return;
  }

  section.innerHTML = `
    <div class="card mb-16 pending-card">
      <div class="card-header">
        <div class="card-title">가입 승인 대기 (${pending.length}명)</div>
      </div>
      <div class="pending-list">
        ${pending.map(u => `
          <div class="pending-item">
            <div class="avatar avatar-sm ${getAvatarColor(u.name)}">${u.name.slice(0,1)}</div>
            <div class="pending-info">
              <div class="pending-name">${u.name}</div>
              <div class="pending-meta">${u.department || '-'} · ${u.position || '-'} · @${u.username}</div>
              <div class="pending-date">${u.created_at?.split('T')[0] || ''} 가입 신청</div>
            </div>
            <div class="pending-actions">
              <button class="btn btn-success btn-sm" onclick="approveUser(${u.id}, '${u.name}')">승인</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="rejectUser(${u.id}, '${u.name}')">거절</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function approveUser(id, name) {
  if (!confirm(`"${name}" 님의 가입을 승인하시겠습니까?`)) return;
  try {
    await api.users.approve(id);
    toast(`${name} 님이 승인되었습니다`);
    loadPendingUsers();
    loadUsers();
  } catch(e) { toast(e.message, 'error'); }
}

async function rejectUser(id, name) {
  if (!confirm(`"${name}" 님의 가입을 거절하시겠습니까? (계정이 삭제됩니다)`)) return;
  try {
    await api.users.reject(id);
    toast(`${name} 님의 가입이 거절되었습니다`);
    loadPendingUsers();
    loadUsers();
  } catch(e) { toast(e.message, 'error'); }
}

async function loadUsers() {
  const users = await api.users.list(true).catch(() => []);
  const tbody = document.getElementById('users-tbody');
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:32px">등록된 사용자가 없습니다</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => {
    const colorClass = getAvatarColor(u.name);
    const statusBadge = !u.is_approved
      ? '<span class="badge badge-high">대기중</span>'
      : u.is_admin
        ? '<span class="badge badge-admin">관리자</span>'
        : '<span class="badge badge-active">승인됨</span>';
    return `
    <tr style="${!u.is_approved ? 'opacity:0.6' : ''}">
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar avatar-sm ${colorClass}">${u.name.slice(0,1)}</div>
          <strong>${u.name}</strong>
        </div>
      </td>
      <td>${u.department||'-'}</td>
      <td>${u.position||'-'}</td>
      <td><code style="background:var(--bg);padding:2px 8px;border-radius:4px;font-size:12px">${u.username}</code></td>
      <td>${statusBadge}</td>
      <td style="font-size:12px;color:var(--text-tertiary)">${u.created_at?.split('T')[0]||''}</td>
      <td style="text-align:right">
        ${!u.is_approved ? `<button class="btn btn-success btn-sm" onclick="approveUser(${u.id}, '${u.name}')">승인</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="openUserForm(${u.id})">수정</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteUser(${u.id}, '${u.name}')">삭제</button>
      </td>
    </tr>
  `}).join('');
}

async function openUserForm(userId) {
  let user = null;
  if (userId) {
    const users = await api.users.list(true).catch(() => []);
    user = users.find(u => u.id == userId);
  }
  modal.show(
    userId ? '사용자 수정' : '새 사용자',
    `<div class="form-row">
       <div class="form-group"><label>이름 *</label><input type="text" id="u-name" value="${user?.name||''}" placeholder="이름"></div>
       <div class="form-group"><label>아이디 *</label><input type="text" id="u-username" value="${user?.username||''}" ${userId?'readonly style="background:var(--bg)"':''} placeholder="로그인 아이디"></div>
     </div>
     <div class="form-row">
       <div class="form-group"><label>부서</label>
         <input type="text" id="u-dept" list="dept-options" value="${user?.department||''}" placeholder="예: 전기팀" autocomplete="off">
       </div>
       <div class="form-group"><label>직급</label>
         <input type="text" id="u-position" list="position-options" value="${user?.position||''}" placeholder="예: 담당자" autocomplete="off">
       </div>
     </div>
     <div class="form-row">
       <div class="form-group"><label>${userId ? '새 비밀번호 (변경시만)' : '비밀번호 *'}</label>
         <input type="password" id="u-pw" placeholder="${userId ? '변경하지 않으면 비워두세요' : '비밀번호 입력'}">
       </div>
       <div class="form-group"><label>권한</label>
         <select id="u-admin">
           <option value="0" ${!user?.is_admin?'selected':''}>일반 사용자</option>
           <option value="1" ${user?.is_admin?'selected':''}>관리자</option>
         </select>
       </div>
     </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveUser(${userId||'null'})">저장</button>`
  );
}

async function saveUser(userId) {
  const data = {
    name: document.getElementById('u-name').value.trim(),
    username: document.getElementById('u-username').value.trim(),
    department: document.getElementById('u-dept').value.trim(),
    position: document.getElementById('u-position').value.trim(),
    is_admin: parseInt(document.getElementById('u-admin').value),
  };
  const pw = document.getElementById('u-pw').value;
  if (pw) data.password = pw;
  if (!data.name || !data.username) { toast('이름과 아이디는 필수입니다', 'error'); return; }
  if (!userId && !pw) { toast('비밀번호를 입력하세요', 'error'); return; }

  try {
    if (userId) await api.users.update(userId, data);
    else await api.users.create(data);
    modal.hide();
    toast(userId ? '수정되었습니다' : '사용자가 추가되었습니다');
    loadUsers();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteUser(id, name) {
  if (!confirm(`"${name}" 사용자를 삭제하시겠습니까?`)) return;
  await api.users.delete(id);
  toast('삭제되었습니다');
  loadPendingUsers();
  loadUsers();
}

async function resetDemoData() {
  if (!confirm('⚠️ 기존 데이터를 모두 삭제하고 시연용 예시 데이터를 새로 넣습니다.\n계속하시겠습니까?')) return;

  const btn = event.target.closest('button');
  btn.disabled = true;
  btn.textContent = '초기화 중...';

  try {
    const res = await fetch('/api/demo/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const s = data.summary;
    toast(`✅ 시연 데이터 초기화 완료!\n사용자 ${s.users}명 · 프로젝트 ${s.projects}개 · 작업 ${s.tasks}개 · 보고서 ${s.reports}개`, 'success');

    // 페이지 새로고침
    setTimeout(() => location.reload(), 1500);
  } catch(e) {
    toast('초기화 실패: ' + e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg> 시연 데이터 초기화';
  }
}
