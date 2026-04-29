// 첨부파일 위젯 — 보고서/회의/공지 등 공통
// renderAttachments(containerId, type, id) 호출 시 목록 + 업로드 UI를 그려줌

function formatFileSize(bytes) {
  if (!bytes) return '0B';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    pdf: '📄', doc: '📄', docx: '📄', txt: '📄', md: '📄',
    xls: '📊', xlsx: '📊', csv: '📊',
    ppt: '📊', pptx: '📊',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
    zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️', gz: '🗜️',
    mp3: '🎵', wav: '🎵', m4a: '🎵', ogg: '🎵',
    mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬', webm: '🎬',
  };
  return map[ext] || '📎';
}

async function renderAttachments(containerId, type, id) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = '<div class="attach-loading">첨부파일 불러오는 중...</div>';
  let list = [];
  try {
    list = await api.attachments.list(type, id);
  } catch (e) {
    wrap.innerHTML = '<div class="attach-empty">첨부파일을 불러올 수 없습니다</div>';
    return;
  }

  const userId = window._currentUser?.id;
  const isAdmin = window._currentUser?.is_admin;

  const items = list.length ? list.map(a => {
    const canDelete = isAdmin || a.uploader_id === userId;
    return `
      <div class="attach-item">
        <span class="attach-icon" aria-hidden="true">${fileIcon(a.original_name)}</span>
        <a class="attach-name" href="/api/attachments/${a.id}/download" download="${escAttr(a.original_name)}">${escapeHtml(a.original_name)}</a>
        <span class="attach-meta">${formatFileSize(a.size)} · ${escapeHtml(a.uploader_name||'')}</span>
        ${canDelete ? `<button class="attach-del" onclick="deleteAttachment(${a.id},'${containerId}','${type}',${id})" title="삭제" aria-label="첨부파일 삭제">×</button>` : ''}
      </div>`;
  }).join('') : '<div class="attach-empty">첨부된 파일이 없습니다</div>';

  wrap.innerHTML = `
    <div class="attach-section">
      <div class="attach-header">
        <span class="attach-title">📎 첨부파일 <span class="attach-count">${list.length}</span></span>
      </div>
      <div class="attach-list">${items}</div>
      <label class="attach-upload-btn">
        <input type="file" id="${containerId}-file" multiple onchange="uploadAttachments(this,'${containerId}','${type}',${id})" style="display:none" aria-label="첨부파일 추가">
        <span>＋ 파일 추가</span>
        <small>최대 25MB · exe/bat 등 실행파일 제외</small>
      </label>
    </div>`;
}

function escAttr(s) { return (s||'').replace(/"/g,'&quot;'); }
// escapeHtml 은 comments.js 에 정의됨

async function uploadAttachments(inputEl, containerId, type, id) {
  const files = Array.from(inputEl.files || []);
  if (!files.length) return;
  let okCount = 0;
  for (const f of files) {
    try {
      const form = new FormData();
      form.append('file', f);
      const res = await fetch(`/api/attachments/${type}/${id}`, { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '업로드 실패');
      okCount++;
    } catch (e) {
      toast(`${f.name}: ${e.message}`, 'error');
    }
  }
  if (okCount) toast(`${okCount}개 파일 업로드 완료`);
  inputEl.value = '';
  await renderAttachments(containerId, type, id);
}

async function deleteAttachment(attId, containerId, type, id) {
  if (!confirm('첨부파일을 삭제하시겠습니까?')) return;
  try {
    await api.attachments.delete(attId);
    await renderAttachments(containerId, type, id);
  } catch (e) { toast(e.message || '삭제 실패', 'error'); }
}

// ===== 즐겨찾기 토글 (프로젝트/회의 등 공통) =====
async function toggleFavorite(type, id, btnEl) {
  try {
    const r = await api.favorites.toggle(type, id);
    if (btnEl) {
      btnEl.classList.toggle('fav-on', r.favorited);
      btnEl.textContent = r.favorited ? '★' : '☆';
      btnEl.setAttribute('aria-pressed', String(r.favorited));
      btnEl.title = r.favorited ? '즐겨찾기 해제' : '즐겨찾기';
    }
    toast(r.favorited ? '즐겨찾기에 추가됨' : '즐겨찾기 해제');
    // 대시보드 위젯이 떠 있으면 갱신
    if (typeof loadFavoritesWidget === 'function') loadFavoritesWidget();
  } catch (e) { toast(e.message || '실패', 'error'); }
}

// 대시보드 즐겨찾기 위젯 렌더러
async function loadFavoritesWidget() {
  const wrap = document.getElementById('favorites-widget');
  if (!wrap) return;
  let favs = [];
  try { favs = await api.favorites.list(); } catch { wrap.innerHTML = ''; return; }
  if (!favs.length) {
    wrap.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">⭐ 즐겨찾기</div></div>
        <div class="empty-state" style="padding:18px">
          <p style="font-size:12px;color:var(--text-tertiary)">프로젝트나 회의에 ★를 눌러 즐겨찾기에 추가하세요</p>
        </div>
      </div>`;
    return;
  }
  const rows = favs.slice(0, 6).map(f => {
    if (f.target_type === 'project') {
      return `<div class="fav-row" onclick="navigateTo('projects');setTimeout(()=>viewProject(${f.target_id}),300)">
        <span class="fav-row-icon">📁</span>
        <span class="fav-row-name">${(f.name||'(삭제됨)').replace(/</g,'&lt;')}</span>
        <span class="fav-row-meta">${f.progress||0}%</span>
      </div>`;
    }
    if (f.target_type === 'meeting') {
      return `<div class="fav-row" onclick="navigateTo('meetings')">
        <span class="fav-row-icon">${f.type==='weekly'?'📋':'🔧'}</span>
        <span class="fav-row-name">${(f.title||'(제목없음)').replace(/</g,'&lt;')}</span>
        <span class="fav-row-meta">${f.meeting_date||''}</span>
      </div>`;
    }
    return '';
  }).join('');
  wrap.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-title">⭐ 즐겨찾기</div></div>
      <div class="fav-list">${rows}</div>
    </div>`;
}
