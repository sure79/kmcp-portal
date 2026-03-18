async function renderNotices() {
  const page = document.getElementById('page-notices');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">공지사항</h2>
        <p class="page-subtitle">사내 공지 및 안내사항</p>
      </div>
      <button class="btn btn-coral" onclick="openNoticeForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        공지 작성
      </button>
    </div>
    <div class="card" style="padding:0">
      <div id="notices-list" class="notice-list"></div>
    </div>
  `;
  loadNotices();
}

async function loadNotices() {
  const notices = await api.notices.list().catch(() => []);
  const list = document.getElementById('notices-list');
  if (!notices.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📢</div><p>등록된 공지사항이 없습니다</p></div>`;
    return;
  }
  list.innerHTML = notices.map(n => `
    <div class="notice-item ${n.is_pinned ? 'pinned' : ''}" onclick="viewNotice(${n.id})">
      ${n.is_pinned ? '<span class="notice-pin" style="color:var(--coral)">📌</span>' : '<span style="width:18px;flex-shrink:0"></span>'}
      <div class="notice-title">${n.title}</div>
      <div class="notice-meta">${n.author_name||''} · ${n.created_at?.split('T')[0]||''}</div>
      <div style="display:flex;gap:4px;margin-left:8px;flex-shrink:0" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="openNoticeForm(${n.id})">수정</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteNotice(${n.id})">삭제</button>
      </div>
    </div>
  `).join('');
}

async function openNoticeForm(noticeId) {
  let notice = null;
  if (noticeId) {
    const all = await api.notices.list().catch(() => []);
    notice = all.find(n => n.id == noticeId);
  }
  modal.show(
    noticeId ? '공지 수정' : '새 공지',
    `<div class="form-group"><label>제목 *</label><input type="text" id="n-title" value="${notice?.title||''}" placeholder="공지 제목을 입력하세요"></div>
     <div class="form-group"><label>내용</label><textarea id="n-content" rows="8" placeholder="공지 내용을 입력하세요">${notice?.content||''}</textarea></div>
     <div class="form-group">
       <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
         <input type="checkbox" id="n-pinned" ${notice?.is_pinned ? 'checked' : ''}> 상단 고정
       </label>
     </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveNotice(${noticeId||'null'})">저장</button>`
  );
}

async function saveNotice(noticeId) {
  const data = {
    title: document.getElementById('n-title').value.trim(),
    content: document.getElementById('n-content').value.trim(),
    is_pinned: document.getElementById('n-pinned').checked,
    author_id: window._currentUser?.id,
  };
  if (!data.title) { toast('제목을 입력하세요', 'error'); return; }
  try {
    if (noticeId) await api.notices.update(noticeId, data);
    else await api.notices.create(data);
    modal.hide();
    toast(noticeId ? '수정되었습니다' : '공지가 등록되었습니다');
    loadNotices();
  } catch(e) { toast(e.message, 'error'); }
}

async function viewNotice(id) {
  const all = await api.notices.list().catch(() => []);
  const n = all.find(x => x.id == id);
  if (!n) return;
  modal.show(
    n.title,
    `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;display:flex;align-items:center;gap:8px">
       ${n.author_name||''} · ${n.created_at?.split('T')[0]||''} ${n.is_pinned ? '<span class="badge badge-admin">고정</span>' : ''}
     </div>
     <div style="font-size:14px;line-height:1.8;white-space:pre-wrap;color:var(--text)">${n.content || '(내용 없음)'}</div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">닫기</button>`
  );
}

async function deleteNotice(id) {
  if (!confirm('공지사항을 삭제하시겠습니까?')) return;
  await api.notices.delete(id);
  toast('삭제되었습니다');
  loadNotices();
}
