// 모달 + 폼 이탈 가드
const modal = {
  _dirty: false,
  show(title, bodyHTML, footerHTML, opts = {}) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-footer').innerHTML = footerHTML || '';
    const m = document.getElementById('modal');
    m.className = 'modal' + (opts.large ? ' modal-lg' : '');
    document.getElementById('modal-overlay').style.display = 'flex';
    modal._dirty = false;
    modal._attachDirtyListeners();
    // 첫 번째 입력 필드에 포커스 (접근성)
    setTimeout(() => {
      const first = m.querySelector('input:not([type=hidden]), textarea, select');
      if (first) first.focus();
    }, 50);
  },
  // 강제 닫기 (저장 등 의도적 종료) — _dirty 무시
  hide() {
    modal._dirty = false;
    document.getElementById('modal-overlay').style.display = 'none';
  },
  markDirty() { modal._dirty = true; },
  clearDirty() { modal._dirty = false; },
  // 사용자가 X / 오버레이로 닫으려 할 때만 호출 — dirty면 확인
  _tryClose() {
    if (modal._dirty) {
      if (!confirm('작성 중인 내용이 있습니다. 저장하지 않고 닫으시겠습니까?')) return;
    }
    modal.hide();
  },
  _attachDirtyListeners() {
    const body = document.getElementById('modal-body');
    if (!body) return;
    const fields = body.querySelectorAll('input, textarea, select');
    fields.forEach(f => {
      // hidden / readonly / 초기값이 있는 select(filter) 등은 변경 시에만 dirty
      const handler = () => { modal._dirty = true; };
      f.addEventListener('input', handler, { once: true });
      f.addEventListener('change', handler, { once: true });
    });
  },
};

document.getElementById('modal-close').addEventListener('click', () => modal._tryClose());
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) modal._tryClose();
});
// ESC 키로 닫기
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('modal-overlay').style.display === 'flex') {
    modal._tryClose();
  }
});

// ===== 브라우저 탭 / 페이지 이탈 가드 =====
window.addEventListener('beforeunload', (e) => {
  // 모달이 열려있고 dirty이면 경고
  const overlay = document.getElementById('modal-overlay');
  if (overlay && overlay.style.display === 'flex' && modal._dirty) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});
