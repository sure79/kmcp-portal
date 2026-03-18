async function renderUsers() {
  const page = document.getElementById('page-users');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">설정</h2>
        <p class="page-subtitle">사용자 계정을 관리하세요</p>
      </div>
      <button class="btn btn-coral" onclick="openUserForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        사용자 추가
      </button>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <table class="user-table">
        <thead>
          <tr><th>이름</th><th>부서</th><th>직급</th><th>아이디</th><th>권한</th><th>등록일</th><th style="text-align:right">관리</th></tr>
        </thead>
        <tbody id="users-tbody"></tbody>
      </table>
    </div>
  `;
  loadUsers();
}

async function loadUsers() {
  const users = await api.users.list().catch(() => []);
  const tbody = document.getElementById('users-tbody');
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:32px">등록된 사용자가 없습니다</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => {
    const colorClass = getAvatarColor(u.name);
    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar avatar-sm ${colorClass}">${u.name.slice(0,1)}</div>
          <strong>${u.name}</strong>
        </div>
      </td>
      <td>${u.department||'-'}</td>
      <td>${u.position||'-'}</td>
      <td><code style="background:var(--bg);padding:2px 8px;border-radius:4px;font-size:12px">${u.username}</code></td>
      <td>${u.is_admin ? '<span class="badge badge-admin">관리자</span>' : '<span class="badge badge-pending">일반</span>'}</td>
      <td style="font-size:12px;color:var(--text-tertiary)">${u.created_at?.split('T')[0]||''}</td>
      <td style="text-align:right">
        <button class="btn btn-ghost btn-sm" onclick="openUserForm(${u.id})">수정</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteUser(${u.id}, '${u.name}')">삭제</button>
      </td>
    </tr>
  `}).join('');
}

async function openUserForm(userId) {
  let user = null;
  if (userId) {
    const users = await api.users.list().catch(() => []);
    user = users.find(u => u.id == userId);
  }
  modal.show(
    userId ? '사용자 수정' : '새 사용자',
    `<div class="form-row">
       <div class="form-group"><label>이름 *</label><input type="text" id="u-name" value="${user?.name||''}" placeholder="이름"></div>
       <div class="form-group"><label>아이디 *</label><input type="text" id="u-username" value="${user?.username||''}" ${userId?'readonly style="background:var(--bg)"':''} placeholder="로그인 아이디"></div>
     </div>
     <div class="form-row">
       <div class="form-group"><label>부서</label><input type="text" id="u-dept" value="${user?.department||''}" placeholder="예: 전기팀"></div>
       <div class="form-group"><label>직급</label><input type="text" id="u-position" value="${user?.position||''}" placeholder="예: 담당자"></div>
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
  loadUsers();
}
