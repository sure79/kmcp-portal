// 댓글 컴포넌트 — meetings, kanban, suggestions에서 공통 사용

function getTimeAgoShort(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

function getAvatarColorClass(name) {
  const colors = ['avatar-coral','avatar-purple','avatar-blue','avatar-green','avatar-yellow'];
  if (!name) return colors[0];
  return colors[name.charCodeAt(0) % colors.length];
}

// containerId: 댓글 섹션을 렌더링할 DOM 요소 id
// targetType: 'meeting' | 'task' | 'suggestion'
// targetId: 대상 아이템의 id
async function renderComments(containerId, targetType, targetId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div class="comments-loading">댓글 불러오는 중...</div>`;

  let comments = [];
  try {
    comments = await api.comments.list(targetType, targetId);
  } catch(e) {
    container.innerHTML = `<div class="comments-error">댓글을 불러올 수 없습니다</div>`;
    return;
  }

  const userId = window._currentUser?.id;
  const isAdmin = window._currentUser?.is_admin;

  const commentsList = comments.length
    ? comments.map(c => {
        // 익명 댓글: server에서 user_id가 본인일 때만 채워서 보냄
        const isMine = c.is_anonymous ? (c.user_id === userId) : (c.user_id === userId);
        const displayName = c.is_anonymous ? '익명' : c.user_name;
        const avatarLabel = c.is_anonymous ? '?' : (c.user_name || '?').slice(0,1);
        return `
          <div class="comment-item ${c.is_anonymous ? 'comment-anonymous' : ''}" id="comment-${c.id}">
            <div class="comment-avatar ${getAvatarColorClass(displayName)}" aria-label="${escapeHtml(displayName)} 아바타">${avatarLabel}</div>
            <div class="comment-body">
              <div class="comment-header">
                <span class="comment-author">${escapeHtml(displayName)}${c.is_anonymous ? ' <span class="comment-anon-tag">익명</span>' : ''}</span>
                <span class="comment-time">${getTimeAgoShort(c.created_at)}</span>
                ${isMine || isAdmin
                  ? `<button class="comment-delete-btn" onclick="deleteComment(${c.id},'${containerId}','${targetType}',${targetId})" title="삭제" aria-label="댓글 삭제">×</button>`
                  : ''}
              </div>
              <div class="comment-text">${escapeHtml(c.content)}</div>
            </div>
          </div>`;
      }).join('')
    : `<div class="comments-empty">아직 댓글이 없습니다. 첫 댓글을 남겨보세요!</div>`;

  // 건의사항(suggestion)에서만 익명 댓글 토글 표시
  const showAnonToggle = targetType === 'suggestion';

  container.innerHTML = `
    <div class="comments-section">
      <h4 class="comments-title">💬 댓글 <span class="comments-count">${comments.length}</span></h4>
      <div class="comments-list" id="${containerId}-list">${commentsList}</div>
      <div class="comment-input-row">
        <div class="comment-avatar ${getAvatarColorClass(window._currentUser?.name||'')} comment-avatar-sm" aria-hidden="true">${(window._currentUser?.name||'?').slice(0,1)}</div>
        <input type="text" class="comment-input" id="${containerId}-input"
          placeholder="댓글을 입력하세요..." aria-label="댓글 입력"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitComment('${containerId}','${targetType}',${targetId})}">
        <button class="btn btn-coral btn-sm" onclick="submitComment('${containerId}','${targetType}',${targetId})">등록</button>
      </div>
      ${showAnonToggle ? `
        <label class="comment-anon-toggle">
          <input type="checkbox" id="${containerId}-anon"> <span>익명으로 작성</span>
        </label>` : ''}
    </div>`;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}

async function submitComment(containerId, targetType, targetId) {
  const input = document.getElementById(`${containerId}-input`);
  const anonCheckbox = document.getElementById(`${containerId}-anon`);
  const isAnon = !!(anonCheckbox && anonCheckbox.checked);
  const content = input?.value?.trim();
  if (!content) return;
  try {
    await api.comments.create({ target_type: targetType, target_id: targetId, content, is_anonymous: isAnon });
    input.value = '';
    await renderComments(containerId, targetType, targetId);
    // 새 댓글로 스크롤
    const list = document.getElementById(`${containerId}-list`);
    if (list) list.scrollTop = list.scrollHeight;
  } catch(e) {
    toast(e.message || '댓글 등록 실패', 'error');
  }
}

async function deleteComment(commentId, containerId, targetType, targetId) {
  if (!confirm('댓글을 삭제하시겠습니까?')) return;
  try {
    await api.comments.delete(commentId);
    await renderComments(containerId, targetType, targetId);
  } catch(e) {
    toast(e.message || '삭제 실패', 'error');
  }
}
