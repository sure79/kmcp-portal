const POLL_CATEGORIES = {
  lunch: { label: '점심 메뉴', icon: '🍽️' },
  dinner: { label: '회식', icon: '🍻' },
  schedule: { label: '일정 조율', icon: '📅' },
  general: { label: '일반', icon: '📊' },
  event: { label: '행사/이벤트', icon: '🎉' },
};

async function renderPolls() {
  const page = document.getElementById('page-polls');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">투표</h2>
        <p class="page-subtitle">점심 메뉴, 회식, 일정 등을 투표로 결정하세요</p>
      </div>
      <button class="btn btn-coral" onclick="openPollForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        투표 만들기
      </button>
    </div>
    <div class="poll-tabs">
      <button class="btn btn-sm poll-tab active" onclick="filterPolls('active', this)">진행중</button>
      <button class="btn btn-sm poll-tab" onclick="filterPolls('closed', this)">마감</button>
      <button class="btn btn-sm poll-tab" onclick="filterPolls('all', this)">전체</button>
    </div>
    <div id="polls-list"></div>
  `;
  loadPolls();
}

let allPolls = [];
let pollFilter = 'active';

async function loadPolls() {
  allPolls = await api.polls.list().catch(() => []);
  renderPollList();
}

function filterPolls(filter, btn) {
  pollFilter = filter;
  document.querySelectorAll('.poll-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderPollList();
}

function renderPollList() {
  const list = document.getElementById('polls-list');
  let items = allPolls;
  if (pollFilter === 'active') items = allPolls.filter(p => p.status === 'active');
  else if (pollFilter === 'closed') items = allPolls.filter(p => p.status === 'closed');

  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>${pollFilter === 'active' ? '진행중인 투표가 없습니다' : '투표가 없습니다'}</p></div>`;
    return;
  }

  const userId = window._currentUser?.id;

  list.innerHTML = items.map(p => {
    const cat = POLL_CATEGORIES[p.category] || POLL_CATEGORIES.general;
    const isActive = p.status === 'active';
    const isClosed = p.status === 'closed';
    const isExpired = p.deadline && new Date(p.deadline) < new Date();
    const myVotes = [];
    p.options.forEach(o => {
      if (o.voters && o.voters.some(v => v.name === window._currentUser?.name)) myVotes.push(o.id);
    });
    const hasVoted = myVotes.length > 0;
    const maxVotes = Math.max(...p.options.map(o => o.vote_count || 0), 1);

    return `
      <div class="card poll-card ${isClosed ? 'poll-closed' : ''}">
        <div class="poll-header">
          <span class="poll-cat">${cat.icon} ${cat.label}</span>
          ${isClosed || isExpired ? '<span class="badge badge-done">마감</span>' : '<span class="badge badge-in_progress">진행중</span>'}
          ${p.deadline ? `<span class="poll-deadline">⏰ ~${p.deadline.split('T')[0]}</span>` : ''}
          ${p.is_anonymous ? '<span class="poll-anon">🎭 익명투표</span>' : ''}
          ${p.allow_multiple ? '<span class="poll-multi">✅ 복수선택</span>' : ''}
        </div>
        <h3 class="poll-title">${p.title}</h3>
        ${p.description ? `<p class="poll-desc">${p.description}</p>` : ''}

        <div class="poll-options">
          ${p.options.map(o => {
            const pct = p.total_votes > 0 ? Math.round((o.vote_count / p.total_votes) * 100) : 0;
            const isMyVote = myVotes.includes(o.id);
            const isWinner = isClosed && o.vote_count === maxVotes && o.vote_count > 0;
            return `
              <div class="poll-option ${isMyVote ? 'my-vote' : ''} ${isWinner ? 'winner' : ''} ${isActive && !isExpired ? 'votable' : ''}"
                   ${isActive && !isExpired ? `onclick="votePoll(${p.id}, ${o.id}, ${p.allow_multiple})"` : ''}>
                <div class="poll-option-bar" style="width:${pct}%"></div>
                <div class="poll-option-content">
                  <span class="poll-option-text">${isMyVote ? '✓ ' : ''}${o.text}</span>
                  <span class="poll-option-count">${o.vote_count || 0}표 (${pct}%)</span>
                </div>
                ${!p.is_anonymous && o.voters && o.voters.length ? `
                  <div class="poll-voters">${o.voters.map(v => v.name).join(', ')}</div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>

        <div class="poll-footer">
          <span class="text-muted">${p.creator_name || '알 수 없음'} · 총 ${p.total_votes}표</span>
          <div class="poll-footer-actions">
            ${isActive && window._currentUser?.is_admin ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();closePoll(${p.id})">마감하기</button>` : ''}
            ${(window._currentUser?.is_admin || p.created_by === userId) ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="event.stopPropagation();deletePoll(${p.id})">삭제</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openPollForm() {
  const catOptions = Object.entries(POLL_CATEGORIES).map(([k, v]) =>
    `<option value="${k}">${v.icon} ${v.label}</option>`
  ).join('');

  modal.show(
    '투표 만들기',
    `<div class="form-row">
       <div class="form-group"><label>카테고리</label><select id="poll-category">${catOptions}</select></div>
       <div class="form-group"><label>마감일 (선택)</label><input type="datetime-local" id="poll-deadline"></div>
     </div>
     <div class="form-group"><label>제목 *</label><input type="text" id="poll-title" placeholder="예: 금요일 점심 어디서 먹을까요?"></div>
     <div class="form-group"><label>설명 (선택)</label><input type="text" id="poll-desc" placeholder="추가 설명"></div>
     <div class="form-group">
       <label>선택지 *</label>
       <div id="poll-options-container">
         <input type="text" class="poll-option-input" placeholder="선택지 1">
         <input type="text" class="poll-option-input" placeholder="선택지 2">
         <input type="text" class="poll-option-input" placeholder="선택지 3">
       </div>
       <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="addPollOption()">+ 선택지 추가</button>
     </div>
     <div class="form-row" style="gap:24px">
       <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
         <input type="checkbox" id="poll-multiple"> 복수 선택 허용
       </label>
       <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
         <input type="checkbox" id="poll-anonymous"> 익명 투표
       </label>
     </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="savePoll()">만들기</button>`
  );
}

function addPollOption() {
  const container = document.getElementById('poll-options-container');
  const count = container.children.length + 1;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'poll-option-input';
  input.placeholder = `선택지 ${count}`;
  container.appendChild(input);
}

async function savePoll() {
  const options = Array.from(document.querySelectorAll('.poll-option-input'))
    .map(el => el.value.trim()).filter(Boolean);
  const data = {
    title: document.getElementById('poll-title').value.trim(),
    description: document.getElementById('poll-desc').value.trim(),
    category: document.getElementById('poll-category').value,
    deadline: document.getElementById('poll-deadline').value || null,
    allow_multiple: document.getElementById('poll-multiple').checked,
    is_anonymous: document.getElementById('poll-anonymous').checked,
    options,
    created_by: window._currentUser?.id,
  };
  if (!data.title) { toast('제목을 입력하세요', 'error'); return; }
  if (options.length < 2) { toast('선택지를 2개 이상 입력하세요', 'error'); return; }
  try {
    await api.polls.create(data);
    modal.hide();
    toast('투표가 생성되었습니다');
    loadPolls();
  } catch(e) { toast(e.message, 'error'); }
}

async function votePoll(pollId, optionId, allowMultiple) {
  try {
    await api.polls.vote(pollId, window._currentUser?.id, [optionId]);
    toast('투표했습니다');
    loadPolls();
  } catch(e) { toast(e.message, 'error'); }
}

async function closePoll(id) {
  if (!confirm('투표를 마감하시겠습니까?')) return;
  await api.polls.close(id);
  toast('투표가 마감되었습니다');
  loadPolls();
}

async function deletePoll(id) {
  if (!confirm('투표를 삭제하시겠습니까?')) return;
  await api.polls.delete(id);
  toast('삭제되었습니다');
  loadPolls();
}
