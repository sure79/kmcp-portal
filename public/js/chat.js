// 실시간 팀 채팅 패널 — 이미지/파일 첨부 지원

let chatOpen = false;
let chatUnread = 0;
let chatInitialized = false;
let chatPendingAttachment = null; // { id, original_name, size, mimetype }

function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById('chat-panel');
  const fab = document.getElementById('chat-fab');
  if (chatOpen) {
    panel.classList.add('open');
    fab.classList.add('active');
    chatUnread = 0;
    updateChatBadge();
    if (!chatInitialized) {
      initChat();
    } else {
      scrollChatToBottom();
    }
    setTimeout(() => document.getElementById('chat-message-input')?.focus(), 100);
  } else {
    panel.classList.remove('open');
    fab.classList.remove('active');
  }
}

async function initChat() {
  chatInitialized = true;
  const list = document.getElementById('chat-messages');
  list.innerHTML = '<div class="chat-loading">메시지 불러오는 중...</div>';
  try {
    const messages = await api.chat.history();
    renderChatMessages(messages);
  } catch(e) {
    list.innerHTML = '<div class="chat-error">채팅을 불러올 수 없습니다</div>';
  }
}

function renderChatMessages(messages) {
  const list = document.getElementById('chat-messages');
  if (!messages.length) {
    list.innerHTML = '<div class="chat-empty">아직 메시지가 없습니다.<br>첫 메시지를 보내보세요! 👋</div>';
    return;
  }
  list.innerHTML = messages.map(m => buildChatMessage(m)).join('');
  scrollChatToBottom();
}

function isImageMime(mt) { return (mt || '').startsWith('image/'); }
function chatFmtSize(b) {
  if (!b) return '';
  if (b < 1024) return b + 'B';
  if (b < 1048576) return (b/1024).toFixed(1) + 'KB';
  return (b/1048576).toFixed(1) + 'MB';
}

// 메시지 본문 + 첨부 렌더링
function renderChatBody(m) {
  let body = '';
  if (m.content) body += `<div class="chat-text">${escapeHtmlChat(m.content)}</div>`;
  if (m.attachment) {
    const a = m.attachment;
    if (isImageMime(a.mimetype)) {
      body += `<a class="chat-image-wrap" href="/api/attachments/${a.id}/download" target="_blank" title="${escapeHtmlChat(a.original_name)} - 새창에서 열기">
        <img class="chat-image" src="/api/attachments/${a.id}/download" alt="${escapeHtmlChat(a.original_name)}" loading="lazy">
      </a>`;
    } else {
      body += `<a class="chat-file" href="/api/attachments/${a.id}/download" download>
        <span class="chat-file-icon">📎</span>
        <span class="chat-file-info">
          <span class="chat-file-name">${escapeHtmlChat(a.original_name)}</span>
          <span class="chat-file-size">${chatFmtSize(a.size)}</span>
        </span>
      </a>`;
    }
  }
  return body;
}

function buildChatMessage(m) {
  const isMine = m.user_id === window._currentUser?.id;
  const isAdmin = window._currentUser?.is_admin;
  const canDelete = (m.id && (isMine || isAdmin)); // 낙관적 추가 직후엔 id 없을 수 있음
  const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }) : '';
  const avatarColors = ['avatar-coral','avatar-purple','avatar-blue','avatar-green','avatar-yellow'];
  const colorClass = avatarColors[(m.user_name||'').charCodeAt(0) % avatarColors.length] || 'avatar-coral';
  const body = renderChatBody(m);
  const delBtn = canDelete
    ? `<button class="chat-del-btn" onclick="deleteChatMessage(${m.id})" title="메시지 삭제" aria-label="메시지 삭제">×</button>`
    : '';

  if (isMine) {
    return `
      <div class="chat-msg chat-msg-mine" data-msg-id="${m.id||''}">
        <div class="chat-bubble-wrap">
          <span class="chat-time">${timeStr}</span>
          <div class="chat-bubble chat-bubble-mine">${body}${delBtn}</div>
        </div>
      </div>`;
  } else {
    return `
      <div class="chat-msg chat-msg-other" data-msg-id="${m.id||''}">
        <div class="chat-avatar ${colorClass}" aria-hidden="true">${(m.user_name||'?').slice(0,1)}</div>
        <div class="chat-bubble-wrap">
          <span class="chat-sender">${escapeHtmlChat(m.user_name||'')}</span>
          <div class="chat-bubble">${body}${delBtn}</div>
          <span class="chat-time">${timeStr}</span>
        </div>
      </div>`;
  }
}

// 메시지 삭제 — 본인 또는 관리자
async function deleteChatMessage(id) {
  if (!id) return;
  if (!confirm('메시지를 삭제하시겠습니까? (첨부파일도 함께 삭제됩니다)')) return;
  try {
    await api.chat.delete(id);
    removeChatMessageFromDom(id);
  } catch (e) {
    toast(e.message || '삭제 실패', 'error');
  }
}

function removeChatMessageFromDom(id) {
  const el = document.querySelector(`.chat-msg[data-msg-id="${id}"]`);
  if (el) el.remove();
  // 비어 있으면 empty state 다시 표시
  const list = document.getElementById('chat-messages');
  if (list && !list.querySelector('.chat-msg')) {
    list.innerHTML = '<div class="chat-empty">아직 메시지가 없습니다.<br>첫 메시지를 보내보세요! 👋</div>';
  }
}

function escapeHtmlChat(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function scrollChatToBottom() {
  const list = document.getElementById('chat-messages');
  if (list) list.scrollTop = list.scrollHeight;
}

// ===== 첨부 처리 =====
async function onChatFilePicked(input) {
  const file = input.files?.[0];
  if (!file) return;
  // 25MB 제한 (서버와 동일)
  if (file.size > 25 * 1024 * 1024) {
    toast('25MB 이하 파일만 업로드할 수 있습니다', 'error');
    input.value = '';
    return;
  }
  // 업로드 중 UI
  showChatAttachmentPreview({ uploading: true, name: file.name });
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/attachments/chat/0', { method: 'POST', body: form });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '업로드 실패');
    chatPendingAttachment = {
      id: json.id,
      original_name: json.original_name || file.name,
      size: json.size || file.size,
      mimetype: file.type || '',
    };
    showChatAttachmentPreview(chatPendingAttachment);
  } catch (e) {
    toast(e.message || '업로드 실패', 'error');
    chatPendingAttachment = null;
    showChatAttachmentPreview(null);
  } finally {
    input.value = '';
  }
}

function showChatAttachmentPreview(att) {
  const wrap = document.getElementById('chat-attach-preview');
  if (!wrap) return;
  if (!att) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  if (att.uploading) {
    wrap.style.display = 'flex';
    wrap.innerHTML = `<span class="chat-attach-chip">업로드 중... ${escapeHtmlChat(att.name)}</span>`;
    return;
  }
  wrap.style.display = 'flex';
  const icon = isImageMime(att.mimetype) ? '🖼️' : '📎';
  wrap.innerHTML = `
    <span class="chat-attach-chip">
      ${icon} ${escapeHtmlChat(att.original_name)} <span class="chat-attach-size">(${chatFmtSize(att.size)})</span>
      <button class="chat-attach-x" onclick="cancelChatAttachment()" aria-label="첨부 취소" title="첨부 취소">×</button>
    </span>`;
}

function cancelChatAttachment() {
  chatPendingAttachment = null;
  showChatAttachmentPreview(null);
}

async function sendChatMessage() {
  const input = document.getElementById('chat-message-input');
  const content = input?.value?.trim() || '';
  const attachment = chatPendingAttachment;
  if (!content && !attachment) return;
  input.value = '';
  // 첨부 미리 비우기 (낙관적)
  const sentAttachmentId = attachment?.id || null;
  const sentAttachment = attachment ? { ...attachment } : null;
  cancelChatAttachment();

  // 임시 id로 낙관적 업데이트
  const tempId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const optimistic = {
    id: null, // 삭제 버튼은 서버 응답 후에 활성화
    user_id: window._currentUser?.id,
    user_name: window._currentUser?.name || '',
    content,
    attachment_id: sentAttachmentId,
    attachment: sentAttachment,
    created_at: new Date().toISOString(),
  };
  const list = document.getElementById('chat-messages');
  const emptyEl = list.querySelector('.chat-empty');
  if (emptyEl) list.innerHTML = '';
  // 임시 wrapper로 감싸 추후 식별
  const tempHtml = buildChatMessage(optimistic).replace(
    'data-msg-id=""',
    `data-msg-id="${tempId}"`
  );
  list.insertAdjacentHTML('beforeend', tempHtml);
  scrollChatToBottom();

  try {
    const sent = await api.chat.send({ content, attachment_id: sentAttachmentId });
    // 임시 메시지를 진짜 id로 교체 (삭제 버튼 활성화)
    const tempEl = list.querySelector(`.chat-msg[data-msg-id="${tempId}"]`);
    if (tempEl && sent?.id) {
      const final = { ...optimistic, id: sent.id };
      tempEl.outerHTML = buildChatMessage(final);
    }
  } catch(e) {
    toast(e.message || '전송 실패', 'error');
    input.value = content;
    if (sentAttachment) { chatPendingAttachment = sentAttachment; showChatAttachmentPreview(sentAttachment); }
    // 실패한 임시 메시지 제거
    const tempEl = list.querySelector(`.chat-msg[data-msg-id="${tempId}"]`);
    if (tempEl) tempEl.remove();
  }
}

function onChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

// Socket.io로 수신된 채팅 메시지 처리
function onChatSocketMessage(msg) {
  if (msg.user_id === window._currentUser?.id) return; // 본인 메시지는 낙관적 업데이트로 이미 표시됨

  if (chatOpen) {
    const list = document.getElementById('chat-messages');
    if (list) {
      const emptyEl = list.querySelector('.chat-empty');
      if (emptyEl) list.innerHTML = '';
      list.insertAdjacentHTML('beforeend', buildChatMessage(msg));
      scrollChatToBottom();
    }
  } else {
    chatUnread++;
    updateChatBadge();
  }
}

function updateChatBadge() {
  const badge = document.getElementById('chat-badge');
  if (!badge) return;
  if (chatUnread > 0) {
    badge.textContent = chatUnread > 99 ? '99+' : chatUnread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}
