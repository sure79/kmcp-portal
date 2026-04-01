// 실시간 팀 채팅 패널

let chatOpen = false;
let chatUnread = 0;
let chatInitialized = false;

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

function buildChatMessage(m) {
  const isMine = m.user_id === window._currentUser?.id;
  const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }) : '';
  const avatarColors = ['avatar-coral','avatar-purple','avatar-blue','avatar-green','avatar-yellow'];
  const colorClass = avatarColors[(m.user_name||'').charCodeAt(0) % avatarColors.length] || 'avatar-coral';

  if (isMine) {
    return `
      <div class="chat-msg chat-msg-mine">
        <div class="chat-bubble-wrap">
          <span class="chat-time">${timeStr}</span>
          <div class="chat-bubble chat-bubble-mine">${escapeHtmlChat(m.content)}</div>
        </div>
      </div>`;
  } else {
    return `
      <div class="chat-msg chat-msg-other">
        <div class="chat-avatar ${colorClass}">${(m.user_name||'?').slice(0,1)}</div>
        <div class="chat-bubble-wrap">
          <span class="chat-sender">${m.user_name}</span>
          <div class="chat-bubble">${escapeHtmlChat(m.content)}</div>
          <span class="chat-time">${timeStr}</span>
        </div>
      </div>`;
  }
}

function escapeHtmlChat(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function scrollChatToBottom() {
  const list = document.getElementById('chat-messages');
  if (list) list.scrollTop = list.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-message-input');
  const content = input?.value?.trim();
  if (!content) return;
  input.value = '';
  try {
    // 로컬에 즉시 추가 (낙관적 업데이트)
    const list = document.getElementById('chat-messages');
    const emptyEl = list.querySelector('.chat-empty');
    if (emptyEl) list.innerHTML = '';
    list.insertAdjacentHTML('beforeend', buildChatMessage({
      user_id: window._currentUser?.id,
      user_name: window._currentUser?.name || '',
      content,
      created_at: new Date().toISOString(),
    }));
    scrollChatToBottom();
    await api.chat.send(content);
  } catch(e) {
    toast(e.message || '전송 실패', 'error');
    input.value = content;
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
