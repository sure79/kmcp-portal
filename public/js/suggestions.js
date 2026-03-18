const SUGGESTION_CATEGORIES = {
  general: { label: '일반', color: 'var(--blue)', bg: 'var(--blue-light)' },
  improvement: { label: '업무개선', color: 'var(--green)', bg: 'var(--green-light)' },
  facility: { label: '시설/환경', color: 'var(--purple)', bg: 'var(--purple-light)' },
  welfare: { label: '복지', color: 'var(--coral)', bg: 'var(--coral-light)' },
  safety: { label: '안전', color: 'var(--red)', bg: 'var(--red-light)' },
  other: { label: '기타', color: 'var(--text-tertiary)', bg: 'var(--bg)' },
};

const SUGGESTION_STATUS = {
  open: { label: '접수', color: 'var(--blue)' },
  reviewing: { label: '검토중', color: 'var(--yellow)' },
  answered: { label: '답변완료', color: 'var(--green)' },
  resolved: { label: '반영완료', color: 'var(--purple)' },
  rejected: { label: '반려', color: 'var(--red)' },
};

async function renderSuggestions() {
  const page = document.getElementById('page-suggestions');
  const isAdmin = window._currentUser?.is_admin;

  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">건의사항</h2>
        <p class="page-subtitle">개선 아이디어나 건의사항을 자유롭게 제안하세요</p>
      </div>
      <button class="btn btn-coral" onclick="openSuggestionForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        건의하기
      </button>
    </div>
    <div class="sg-filter-bar">
      <button class="btn btn-sm sg-filter active" data-filter="all" onclick="filterSuggestions('all', this)">전체</button>
      ${Object.entries(SUGGESTION_CATEGORIES).map(([k, v]) =>
        `<button class="btn btn-sm sg-filter" data-filter="${k}" onclick="filterSuggestions('${k}', this)">${v.label}</button>`
      ).join('')}
    </div>
    <div id="suggestions-list"></div>
  `;
  loadSuggestions();
}

let allSuggestions = [];
let sgFilter = 'all';

async function loadSuggestions() {
  allSuggestions = await api.suggestions.list().catch(() => []);
  renderSuggestionList();
}

function filterSuggestions(filter, btn) {
  sgFilter = filter;
  document.querySelectorAll('.sg-filter').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderSuggestionList();
}

function renderSuggestionList() {
  const list = document.getElementById('suggestions-list');
  let items = sgFilter === 'all' ? allSuggestions : allSuggestions.filter(s => s.category === sgFilter);

  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">💡</div><p>등록된 건의사항이 없습니다</p></div>`;
    return;
  }

  const isAdmin = window._currentUser?.is_admin;
  const userId = window._currentUser?.id;

  list.innerHTML = items.map(s => {
    const cat = SUGGESTION_CATEGORIES[s.category] || SUGGESTION_CATEGORIES.general;
    const st = SUGGESTION_STATUS[s.status] || SUGGESTION_STATUS.open;
    const authorName = s.is_anonymous ? '익명' : (s.author_name || '알 수 없음');
    const timeAgo = getTimeAgo(s.created_at);

    return `
      <div class="card sg-card" onclick="viewSuggestion(${s.id})">
        <div class="sg-card-header">
          <span class="sg-cat-badge" style="background:${cat.bg};color:${cat.color}">${cat.label}</span>
          <span class="sg-status-badge" style="color:${st.color}">● ${st.label}</span>
          <span class="sg-time">${timeAgo}</span>
        </div>
        <h3 class="sg-title">${s.title}</h3>
        <p class="sg-preview">${(s.content || '').substring(0, 120)}${s.content?.length > 120 ? '...' : ''}</p>
        <div class="sg-card-footer">
          <span class="sg-author">${s.is_anonymous ? '🎭' : '👤'} ${authorName}</span>
          <div class="sg-actions">
            <button class="btn btn-ghost btn-sm sg-like-btn" onclick="event.stopPropagation();likeSuggestion(${s.id})">
              👍 ${s.like_count || 0}
            </button>
            ${s.admin_reply ? '<span class="sg-replied-badge">💬 답변있음</span>' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openSuggestionForm() {
  const catOptions = Object.entries(SUGGESTION_CATEGORIES).map(([k, v]) =>
    `<option value="${k}">${v.label}</option>`
  ).join('');

  modal.show(
    '건의사항 작성',
    `<div class="form-group"><label>카테고리</label><select id="sg-category">${catOptions}</select></div>
     <div class="form-group"><label>제목 *</label><input type="text" id="sg-title" placeholder="건의 제목을 입력하세요"></div>
     <div class="form-group"><label>내용</label><textarea id="sg-content" rows="6" placeholder="건의 내용을 자세히 작성해주세요"></textarea></div>
     <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);cursor:pointer">
       <input type="checkbox" id="sg-anonymous"> 익명으로 제출
     </label>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveSuggestion()">제출</button>`
  );
}

async function saveSuggestion() {
  const data = {
    title: document.getElementById('sg-title').value.trim(),
    content: document.getElementById('sg-content').value.trim(),
    category: document.getElementById('sg-category').value,
    author_id: window._currentUser?.id,
    is_anonymous: document.getElementById('sg-anonymous').checked,
  };
  if (!data.title) { toast('제목을 입력하세요', 'error'); return; }
  try {
    await api.suggestions.create(data);
    modal.hide();
    toast('건의사항이 접수되었습니다');
    loadSuggestions();
  } catch(e) { toast(e.message, 'error'); }
}

async function likeSuggestion(id) {
  try {
    const result = await api.suggestions.like(id, window._currentUser?.id);
    toast(result.liked ? '공감했습니다' : '공감을 취소했습니다');
    loadSuggestions();
  } catch(e) { toast(e.message, 'error'); }
}

async function viewSuggestion(id) {
  const s = allSuggestions.find(x => x.id === id);
  if (!s) return;
  const cat = SUGGESTION_CATEGORIES[s.category] || SUGGESTION_CATEGORIES.general;
  const st = SUGGESTION_STATUS[s.status] || SUGGESTION_STATUS.open;
  const isAdmin = window._currentUser?.is_admin;

  let replySection = '';
  if (s.admin_reply) {
    replySection = `
      <div class="sg-reply-box">
        <h4>관리자 답변</h4>
        <p>${s.admin_reply.replace(/\n/g, '<br>')}</p>
        <span class="text-muted" style="font-size:11px">${s.replied_at || ''}</span>
      </div>`;
  }

  let adminActions = '';
  if (isAdmin) {
    const statusOpts = Object.entries(SUGGESTION_STATUS).map(([k, v]) =>
      `<option value="${k}" ${s.status === k ? 'selected' : ''}>${v.label}</option>`
    ).join('');
    adminActions = `
      <div class="sg-admin-section" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-light)">
        <h4 style="font-size:13px;font-weight:700;color:var(--text-secondary);margin-bottom:8px">관리자 답변</h4>
        <div class="form-group"><select id="sg-reply-status">${statusOpts}</select></div>
        <div class="form-group"><textarea id="sg-reply-text" rows="3" placeholder="답변을 입력하세요">${s.admin_reply || ''}</textarea></div>
        <button class="btn btn-coral btn-sm" onclick="replySuggestion(${s.id})">답변 저장</button>
      </div>`;
  }

  modal.show(
    '',
    `<div style="margin-bottom:12px;display:flex;gap:8px;align-items:center">
       <span class="sg-cat-badge" style="background:${cat.bg};color:${cat.color}">${cat.label}</span>
       <span class="sg-status-badge" style="color:${st.color}">● ${st.label}</span>
     </div>
     <h3 style="font-size:18px;font-weight:700;margin-bottom:12px">${s.title}</h3>
     <p style="font-size:14px;line-height:1.7;color:var(--text);white-space:pre-wrap">${s.content || ''}</p>
     <div style="margin-top:16px;font-size:12px;color:var(--text-tertiary)">
       ${s.is_anonymous ? '🎭 익명' : `👤 ${s.author_name}`} · ${getTimeAgo(s.created_at)} · 👍 ${s.like_count || 0}
     </div>
     ${replySection}
     ${adminActions}`,
    `${isAdmin || s.author_id === window._currentUser?.id ? `<button class="btn btn-danger btn-sm" onclick="deleteSuggestion(${s.id})">삭제</button>` : ''}
     <div style="flex:1"></div>
     <button class="btn btn-secondary" onclick="modal.hide()">닫기</button>`
  );
}

async function replySuggestion(id) {
  const reply = document.getElementById('sg-reply-text').value.trim();
  const status = document.getElementById('sg-reply-status').value;
  try {
    await api.suggestions.reply(id, { admin_reply: reply, status });
    modal.hide();
    toast('답변이 저장되었습니다');
    loadSuggestions();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteSuggestion(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  await api.suggestions.delete(id);
  modal.hide();
  toast('삭제되었습니다');
  loadSuggestions();
}

function getTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff/86400)}일 전`;
  return dateStr.split('T')[0];
}
