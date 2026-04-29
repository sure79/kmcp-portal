// 페이지별 필터 상태를 sessionStorage에 보관
// 페이지 이동 후 돌아오면 이전 필터 복원
const filterStore = {
  _key(page) { return 'kmcp:filter:' + page; },
  get(page) {
    try { return JSON.parse(sessionStorage.getItem(this._key(page)) || '{}'); }
    catch { return {}; }
  },
  set(page, key, value) {
    const f = this.get(page);
    if (value === '' || value == null) delete f[key];
    else f[key] = value;
    try { sessionStorage.setItem(this._key(page), JSON.stringify(f)); } catch {}
  },
  setAll(page, obj) {
    try { sessionStorage.setItem(this._key(page), JSON.stringify(obj || {})); } catch {}
  },
  clear(page) {
    try { sessionStorage.removeItem(this._key(page)); } catch {}
  },
  // form 요소들에 자동 바인딩 — 변경 시 저장, 초기화 시 복원
  bindInputs(page, inputIds, onChange) {
    const stored = this.get(page);
    inputIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (stored[id] !== undefined) el.value = stored[id];
      el.addEventListener('change', () => {
        filterStore.set(page, id, el.value);
        if (onChange) onChange();
      });
    });
  },
};
