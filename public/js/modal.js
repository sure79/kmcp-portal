const modal = {
  show(title, bodyHTML, footerHTML, opts = {}) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-footer').innerHTML = footerHTML || '';
    const m = document.getElementById('modal');
    m.className = 'modal' + (opts.large ? ' modal-lg' : '');
    document.getElementById('modal-overlay').style.display = 'flex';
  },
  hide() { document.getElementById('modal-overlay').style.display = 'none'; },
};

document.getElementById('modal-close').addEventListener('click', () => modal.hide());
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) modal.hide();
});
