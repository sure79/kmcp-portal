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
        const isMine = c.user_id === userId;
        return `
          <div class="comment-item" id="comment-${c.id}">
            <div class="comment-avatar ${getAvatarColorClass(c.user_name)}">${c.user_name.slice(0,1)}</div>
            <div class="comment-body">
              <div class="comment-header">
                <span class="comment-author">${c.user_name}</span>
                <span class="comment-time">${getTimeAgoShort(c.created_at)}</span>
                ${isMine || isAdmin
                  ? `<button class="comment-delete-btn" onclick="deleteComment(${c.id},'${containerId}','${targetType}',${targetId})" title="삭제">×</button>`
                  : ''}
              </div>
              <div class="comment-text">${escapeHtml(c.content)}</div>
            </div>
          </div>`;
      }).join('')
    : `<div class="comments-empty">아직 댓글이 없습니다. 첫 댓글을 남겨보세요!</div>`;

  container.innerHTML = `
    <div class="comments-section">
      <h4 class="comments-title">💬 댓글 <span class="comments-count">${comments.length}</span></h4>
      <div class="comments-list" id="${containerId}-list">${commentsList}</div>
      <div class="comment-input-row">
        <div class="comment-avatar ${getAvatarColorClass(window._currentUser?.name||'')} comment-avatar-sm">${(window._currentUser?.name||'?').slice(0,1)}</div>
        <input type="text" class="comment-input" id="${containerId}-input"
          placeholder="댓글을 입력하세요..."
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitComment('${containerId}','${targetType}',${targetId})}">
        <button class="btn btn-coral btn-sm" onclick="submitComment('${containerId}','${targetType}',${targetId})">등록</button>
      </div>
    </div>`;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}

async function submitComment(containerId, targetType, targetId) {
  const input = document.getElementById(`${containerId}-input`);
  const content = input?.value?.trim();
  if (!content) return;
  try {
    await api.comments.create({ target_type: targetType, target_id: targetId, content });
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
