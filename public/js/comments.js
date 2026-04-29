// 댓글 컴포넌트 — meetings, kanban, suggestions에서 공통 사용
// 첨부파일(이미지/파일) 지원

const _commentPending = {}; // containerId -> { id, original_name, size, mimetype }

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

function _isImage(mt) { return (mt || '').startsWith('image/'); }
function _fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return b + 'B';
  if (b < 1048576) return (b/1024).toFixed(1) + 'KB';
  return (b/1048576).toFixed(1) + 'MB';
}

function _renderCommentAttachment(att) {
  if (!att) return '';
  if (_isImage(att.mimetype)) {
    return `<a class="comment-image-wrap" href="/api/attachments/${att.id}/download" target="_blank" title="${escapeHtml(att.original_name)} - 새창에서 열기">
      <img class="comment-image" src="/api/attachments/${att.id}/download" alt="${escapeHtml(att.original_name)}" loading="lazy">
    </a>`;
  }
  return `<a class="comment-file" href="/api/attachments/${att.id}/download" download>
    <span class="comment-file-icon">📎</span>
    <span class="comment-file-info">
      <span class="comment-file-name">${escapeHtml(att.original_name)}</span>
      <span class="comment-file-size">${_fmtSize(att.size)}</span>
    </span>
  </a>`;
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
        const displayName = c.is_anonymous ? '익명' : c.user_name;
        const avatarLabel = c.is_anonymous ? '?' : (c.user_name || '?').slice(0,1);
        const attachmentHtml = _renderCommentAttachment(c.attachment);
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
              ${c.content ? `<div class="comment-text">${escapeHtml(c.content)}</div>` : ''}
              ${attachmentHtml}
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
      <div class="comment-attach-preview" id="${containerId}-att-preview" style="display:none"></div>
      <div class="comment-input-row">
        <div class="comment-avatar ${getAvatarColorClass(window._currentUser?.name||'')} comment-avatar-sm" aria-hidden="true">${(window._currentUser?.name||'?').slice(0,1)}</div>
        <input type="file" id="${containerId}-file" style="display:none" onchange="onCommentFilePicked('${containerId}', this)" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip">
        <button class="btn-icon-ghost comment-attach-btn" onclick="document.getElementById('${containerId}-file').click()" title="파일 첨부" aria-label="파일 첨부">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </button>
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

async function onCommentFilePicked(containerId, input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) {
    toast('25MB 이하 파일만 업로드할 수 있습니다', 'error');
    input.value = '';
    return;
  }
  _showCommentAttachmentPreview(containerId, { uploading: true, name: file.name });
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/attachments/comment/0', { method: 'POST', body: form });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '업로드 실패');
    _commentPending[containerId] = {
      id: json.id,
      original_name: json.original_name || file.name,
      size: json.size || file.size,
      mimetype: file.type || '',
    };
    _showCommentAttachmentPreview(containerId, _commentPending[containerId]);
  } catch (e) {
    toast(e.message || '업로드 실패', 'error');
    delete _commentPending[containerId];
    _showCommentAttachmentPreview(containerId, null);
  } finally {
    input.value = '';
  }
}

function _showCommentAttachmentPreview(containerId, att) {
  const wrap = document.getElementById(`${containerId}-att-preview`);
  if (!wrap) return;
  if (!att) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  if (att.uploading) {
    wrap.style.display = 'flex';
    wrap.innerHTML = `<span class="chat-attach-chip">업로드 중... ${escapeHtml(att.name)}</span>`;
    return;
  }
  wrap.style.display = 'flex';
  const icon = _isImage(att.mimetype) ? '🖼️' : '📎';
  wrap.innerHTML = `
    <span class="chat-attach-chip">
      ${icon} ${escapeHtml(att.original_name)} <span class="chat-attach-size">(${_fmtSize(att.size)})</span>
      <button class="chat-attach-x" onclick="cancelCommentAttachment('${containerId}')" aria-label="첨부 취소" title="첨부 취소">×</button>
    </span>`;
}

function cancelCommentAttachment(containerId) {
  delete _commentPending[containerId];
  _showCommentAttachmentPreview(containerId, null);
}

async function submitComment(containerId, targetType, targetId) {
  const input = document.getElementById(`${containerId}-input`);
  const anonCheckbox = document.getElementById(`${containerId}-anon`);
  const isAnon = !!(anonCheckbox && anonCheckbox.checked);
  const content = input?.value?.trim() || '';
  const att = _commentPending[containerId];
  if (!content && !att) return;
  try {
    await api.comments.create({
      target_type: targetType,
      target_id: targetId,
      content,
      is_anonymous: isAnon,
      attachment_id: att?.id || null,
    });
    input.value = '';
    delete _commentPending[containerId];
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
