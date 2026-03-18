// SortableJS CDN 로드
function loadSortable() {
  return new Promise((resolve) => {
    if (window.Sortable) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

let allUsers = [], allProjects = [], allTasks = [];
let weekRange = { start: 0, count: 5 };

// ISO 주차 계산
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

function weekKey(year, week) {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function weekLabel(year, week) {
  const jan1 = new Date(year, 0, 1);
  const days = (week - 1) * 7;
  const weekStart = new Date(jan1);
  weekStart.setDate(jan1.getDate() + days - ((jan1.getDay() + 6) % 7));
  const month = weekStart.getMonth() + 1;
  const day = weekStart.getDate();
  return { label: `W${String(week).padStart(2, '0')}`, month: `${month}월`, dateRange: `${month}/${day}~` };
}

function generateWeeks() {
  const today = new Date();
  const current = getISOWeek(today);
  const weeks = [];
  for (let i = weekRange.start; i < weekRange.start + weekRange.count; i++) {
    let w = current.week + i;
    let y = current.year;
    if (w > 52) { w -= 52; y++; }
    if (w < 1) { w += 52; y--; }
    const key = weekKey(y, w);
    const info = weekLabel(y, w);
    weeks.push({ key, ...info, year: y, week: w, isCurrent: i === 0 });
  }
  return weeks;
}

function generateWeeksForForm() {
  const today = new Date();
  const current = getISOWeek(today);
  const weeks = [];
  for (let i = -10; i <= 20; i++) {
    let w = current.week + i;
    let y = current.year;
    if (w > 52) { w -= 52; y++; }
    if (w < 1) { w += 52; y--; }
    const key = weekKey(y, w);
    const info = weekLabel(y, w);
    weeks.push({ key, ...info, year: y, week: w, isCurrent: i === 0 });
  }
  return weeks;
}

const STICKY_COLORS = {
  high: { bg: '#FFE082', border: '#FFB300', text: '#5D4037' },
  medium: { bg: '#B3E5FC', border: '#29B6F6', text: '#0D47A1' },
  low: { bg: '#C8E6C9', border: '#66BB6A', text: '#1B5E20' },
};

const PRIORITY_LABELS = { high: '높음', medium: '보통', low: '낮음' };
const STATUS_LABELS = { pending: '대기', in_progress: '진행중', review: '검토중', done: '완료' };

async function renderKanban() {
  const page = document.getElementById('page-kanban');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">칸반 보드</h2>
        <p class="page-subtitle">주간 스케줄 보드 · 드래그 앤 드롭으로 일정을 관리하세요</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost" onclick="shiftWeeks(-2)" title="이전">◀ 이전</button>
        <button class="btn btn-secondary" onclick="resetWeeks()">이번 주</button>
        <button class="btn btn-ghost" onclick="shiftWeeks(2)" title="다음">다음 ▶</button>
        <button class="btn btn-coral" onclick="openTaskForm()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          작업 추가
        </button>
      </div>
    </div>
    <div class="weekly-board-wrapper" id="weekly-board-wrapper">
      <div class="weekly-board" id="weekly-board"></div>
    </div>
  `;

  await loadSortable();
  [allUsers, allProjects, allTasks] = await Promise.all([
    api.users.list().catch(() => []),
    api.projects.list().catch(() => []),
    api.tasks.list().catch(() => []),
  ]);

  renderWeeklyBoard();
}

async function loadKanban() {
  allTasks = await api.tasks.list().catch(() => []);
  renderWeeklyBoard();
}

function renderWeeklyBoard() {
  const board = document.getElementById('weekly-board');
  const weeks = generateWeeks();
  const projectRows = [...allProjects.filter(p => p.status === 'active'), { id: null, name: '미분류' }];

  let headerHTML = `<div class="wb-corner">프로젝트</div>`;
  weeks.forEach(w => {
    headerHTML += `
      <div class="wb-week-header ${w.isCurrent ? 'current-week' : ''}">
        <div class="wb-week-label">${w.label}</div>
        <div class="wb-week-month">${w.month}</div>
        <div class="wb-week-date">${w.dateRange}</div>
      </div>
    `;
  });
  headerHTML += `<div class="wb-week-header wb-special-header parking-header"><div class="wb-week-label">Parking</div><div class="wb-week-month">보류</div></div>`;
  headerHTML += `<div class="wb-week-header wb-special-header done-header"><div class="wb-week-label">Done</div><div class="wb-week-month">완료</div></div>`;

  let bodyHTML = '';
  projectRows.forEach(proj => {
    bodyHTML += `<div class="wb-project-label" style="border-left: 4px solid ${getProjectColor(proj.id)}">
      <span class="wb-project-name">${proj.name}</span>
    </div>`;

    weeks.forEach(w => {
      const cellTasks = allTasks.filter(t =>
        (proj.id === null ? !t.project_id : t.project_id == proj.id) &&
        t.target_week === w.key && t.status !== 'done'
      );
      bodyHTML += `
        <div class="wb-cell ${w.isCurrent ? 'current-week-col' : ''}"
             id="cell-${proj.id}-${w.key}" data-project="${proj.id}" data-week="${w.key}" data-status="pending">
          ${cellTasks.map(t => renderStickyNote(t)).join('')}
        </div>
      `;
    });

    const parkingTasks = allTasks.filter(t =>
      (proj.id === null ? !t.project_id : t.project_id == proj.id) &&
      (!t.target_week || t.target_week === '') && t.status !== 'done'
    );
    bodyHTML += `
      <div class="wb-cell wb-special-cell parking-cell"
           id="cell-${proj.id}-parking" data-project="${proj.id}" data-week="" data-status="pending">
        ${parkingTasks.map(t => renderStickyNote(t)).join('')}
      </div>
    `;

    const doneTasks = allTasks.filter(t =>
      (proj.id === null ? !t.project_id : t.project_id == proj.id) && t.status === 'done'
    );
    bodyHTML += `
      <div class="wb-cell wb-special-cell done-cell"
           id="cell-${proj.id}-done" data-project="${proj.id}" data-week="" data-status="done">
        ${doneTasks.map(t => renderStickyNote(t, true)).join('')}
      </div>
    `;
  });

  board.style.gridTemplateColumns = `160px repeat(${weeks.length}, 1fr) 180px 180px`;
  board.innerHTML = headerHTML + bodyHTML;

  // SortableJS
  board.querySelectorAll('.wb-cell').forEach(cell => {
    Sortable.create(cell, {
      group: 'weekly-kanban',
      animation: 200,
      ghostClass: 'sticky-ghost',
      dragClass: 'sticky-drag',
      onEnd: async (evt) => {
        const taskId = parseInt(evt.item.dataset.taskId);
        const targetCell = evt.to;
        const newWeek = targetCell.dataset.week;
        const newProject = targetCell.dataset.project === 'null' ? null : targetCell.dataset.project;
        const newStatus = targetCell.dataset.status;

        try {
          await api.tasks.move(taskId, {
            target_week: newWeek || '',
            project_id: newProject,
            status: newStatus === 'done' ? 'done' : 'in_progress',
            sort_order: Array.from(targetCell.children).indexOf(evt.item),
          });
          if (window._socket) {
            window._socket.emit('task:move', { taskId, movedBy: window._currentUser?.name });
          }
          const task = allTasks.find(t => t.id === taskId);
          if (task) {
            task.target_week = newWeek || '';
            task.project_id = newProject ? parseInt(newProject) : null;
            task.status = newStatus === 'done' ? 'done' : (task.status === 'done' ? 'in_progress' : task.status);
          }
        } catch(e) {
          toast('저장 중 오류 발생', 'error');
          loadKanban();
        }
      }
    });
  });
}

function renderStickyNote(t, isDone) {
  const colors = STICKY_COLORS[t.priority] || STICKY_COLORS.medium;
  const opacity = isDone ? 'opacity: 0.55;' : '';
  const statusDot = t.status === 'in_progress' ? '<span class="sticky-status-dot in-progress"></span>' :
                    t.status === 'review' ? '<span class="sticky-status-dot review"></span>' : '';
  return `
    <div class="sticky-note" data-task-id="${t.id}"
         onclick="openTaskDetail(${t.id})"
         style="background:${colors.bg}; border-color:${colors.border}; color:${colors.text}; ${opacity}">
      <div class="sticky-actions">
        <button class="sticky-btn" onclick="event.stopPropagation();openTaskForm(${t.id})" title="수정">✎</button>
        <button class="sticky-btn" onclick="event.stopPropagation();deleteTask(${t.id})" title="삭제">×</button>
      </div>
      ${statusDot}
      <div class="sticky-title">${t.title}</div>
      ${t.description ? `<div class="sticky-desc">${t.description.substring(0, 80)}${t.description.length > 80 ? '...' : ''}</div>` : ''}
      ${t.assignee_name ? `<div class="sticky-assignee">${t.assignee_name}</div>` : ''}
    </div>
  `;
}

// === 카드 상세보기 모달 ===
function openTaskDetail(taskId) {
  const t = allTasks.find(x => x.id === taskId);
  if (!t) return;

  const colors = STICKY_COLORS[t.priority] || STICKY_COLORS.medium;
  const projName = t.project_name || '미분류';
  const assignee = t.assignee_name || '미배정';
  const statusLabel = STATUS_LABELS[t.status] || t.status;
  const priorityLabel = PRIORITY_LABELS[t.priority] || t.priority;

  // 주차 라벨
  let weekDisplay = 'Parking (미배치)';
  if (t.target_week) {
    const match = t.target_week.match(/^(\d{4})-W(\d{2})$/);
    if (match) {
      const info = weekLabel(parseInt(match[1]), parseInt(match[2]));
      weekDisplay = `${info.label} (${info.month} ${info.dateRange})`;
    }
  }

  const overlay = document.getElementById('modal-overlay');
  const modalEl = document.getElementById('modal');
  modalEl.classList.add('modal-xl');

  modal.show(
    '',
    `<div class="task-detail">
      <div class="task-detail-header" style="border-left: 5px solid ${colors.border}; background: ${colors.bg}20; padding: 20px 24px; margin: -24px -24px 24px; border-radius: 0;">
        <h2 class="task-detail-title">${t.title}</h2>
        <div class="task-detail-meta">
          <span class="badge badge-${t.status}">${statusLabel}</span>
          <span class="badge" style="background:${colors.bg};color:${colors.text};border:1px solid ${colors.border}">${priorityLabel}</span>
          <span style="color:var(--text-secondary);font-size:13px">· ${projName}</span>
        </div>
      </div>

      <div class="task-detail-grid">
        <div class="task-detail-main">
          <div class="task-detail-section">
            <h4>설명</h4>
            <div class="task-detail-desc">${t.description || '<span style="color:var(--text-tertiary)">설명이 없습니다</span>'}</div>
          </div>

          ${t.due_date ? `
          <div class="task-detail-section">
            <h4>마감일</h4>
            <p>${t.due_date}</p>
          </div>` : ''}
        </div>

        <div class="task-detail-sidebar">
          <div class="task-detail-field">
            <label>담당자</label>
            <div class="task-detail-value">
              ${t.assignee_name ? `<span class="avatar avatar-sm ${getAvatarColor(t.assignee_name)}">${t.assignee_name.slice(0,1)}</span> ${t.assignee_name}` : '<span style="color:var(--text-tertiary)">미배정</span>'}
            </div>
          </div>
          <div class="task-detail-field">
            <label>프로젝트</label>
            <div class="task-detail-value" style="color:${getProjectColor(t.project_id)};font-weight:600">${projName}</div>
          </div>
          <div class="task-detail-field">
            <label>배치 주차</label>
            <div class="task-detail-value">${weekDisplay}</div>
          </div>
          <div class="task-detail-field">
            <label>상태</label>
            <div class="task-detail-value"><span class="badge badge-${t.status}">${statusLabel}</span></div>
          </div>
          <div class="task-detail-field">
            <label>우선순위</label>
            <div class="task-detail-value"><span class="badge" style="background:${colors.bg};color:${colors.text}">${priorityLabel}</span></div>
          </div>
        </div>
      </div>
    </div>`,
    `<button class="btn btn-danger" onclick="modal.hide();deleteTask(${t.id})">삭제</button>
     <div style="flex:1"></div>
     <button class="btn btn-secondary" onclick="modal.hide()">닫기</button>
     <button class="btn btn-coral" onclick="modal.hide();openTaskForm(${t.id})">수정</button>`
  );

  // 모달 닫힐 때 xl 클래스 제거
  const origHide = modal._origHide || modal.hide;
  if (!modal._origHide) modal._origHide = modal.hide;
  modal.hide = () => {
    modalEl.classList.remove('modal-xl');
    origHide.call(modal);
    modal.hide = origHide;
  };
}

function getProjectColor(id) {
  const colors = ['#F06A6A', '#AA62E3', '#4573D2', '#5DA283', '#F1BD6C', '#E8384F', '#7B68EE', '#20B2AA'];
  if (id === null || id === undefined) return '#9CA6AF';
  return colors[(id - 1) % colors.length];
}

function shiftWeeks(offset) {
  weekRange.start += offset;
  renderWeeklyBoard();
}

function resetWeeks() {
  weekRange.start = 0;
  renderWeeklyBoard();
}

async function openTaskForm(taskId) {
  let task = null;
  if (taskId) task = allTasks.find(t => t.id == taskId);

  const formWeeks = generateWeeksForForm();

  if (task && task.target_week && !formWeeks.find(w => w.key === task.target_week)) {
    const match = task.target_week.match(/^(\d{4})-W(\d{2})$/);
    if (match) {
      const y = parseInt(match[1]), w = parseInt(match[2]);
      const info = weekLabel(y, w);
      formWeeks.unshift({ key: task.target_week, ...info, year: y, week: w, isCurrent: false });
    }
  }

  // modal-xl 제거 (폼은 기본 크기)
  document.getElementById('modal').classList.remove('modal-xl');

  modal.show(
    taskId ? '작업 수정' : '새 작업',
    `<div class="form-group"><label>작업 제목 *</label><input type="text" id="t-title" value="${task?.title || ''}" placeholder="작업 제목을 입력하세요"></div>
     <div class="form-group"><label>설명</label><textarea id="t-desc" rows="4" placeholder="작업에 대한 설명을 입력하세요">${task?.description || ''}</textarea></div>
     <div class="form-row">
       <div class="form-group"><label>담당자</label>
         <select id="t-assignee">
           <option value="">미배정</option>
           ${allUsers.map(u => `<option value="${u.id}" ${task?.assignee_id == u.id ? 'selected' : ''}>${u.name}</option>`).join('')}
         </select>
       </div>
       <div class="form-group"><label>프로젝트</label>
         <select id="t-project">
           <option value="">미분류</option>
           ${allProjects.map(p => `<option value="${p.id}" ${task?.project_id == p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
         </select>
       </div>
     </div>
     <div class="form-row">
       <div class="form-group"><label>배치 주차</label>
         <select id="t-week">
           <option value="" ${!task?.target_week ? 'selected' : ''}>Parking (미배치)</option>
           ${formWeeks.map(w => `<option value="${w.key}" ${task?.target_week === w.key ? 'selected' : ''}>${w.label} (${w.month}) ${w.isCurrent ? '← 이번주' : ''}</option>`).join('')}
         </select>
       </div>
       <div class="form-group"><label>우선순위 (색상)</label>
         <select id="t-priority">
           <option value="high" ${task?.priority == 'high' ? 'selected' : ''}>높음 (노란색)</option>
           <option value="medium" ${(!task || task?.priority == 'medium') ? 'selected' : ''}>보통 (파란색)</option>
           <option value="low" ${task?.priority == 'low' ? 'selected' : ''}>낮음 (초록색)</option>
         </select>
       </div>
     </div>
     <div class="form-row">
       <div class="form-group"><label>상태</label>
         <select id="t-status">
           <option value="pending" ${(!task || task?.status == 'pending') ? 'selected' : ''}>대기</option>
           <option value="in_progress" ${task?.status == 'in_progress' ? 'selected' : ''}>진행중</option>
           <option value="review" ${task?.status == 'review' ? 'selected' : ''}>검토중</option>
           <option value="done" ${task?.status == 'done' ? 'selected' : ''}>완료</option>
         </select>
       </div>
       <div class="form-group"><label>마감일</label><input type="date" id="t-due" value="${task?.due_date || ''}"></div>
     </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveTask(${taskId || 'null'})">저장</button>`
  );
}

async function saveTask(taskId) {
  const data = {
    title: document.getElementById('t-title').value.trim(),
    description: document.getElementById('t-desc').value.trim(),
    assignee_id: document.getElementById('t-assignee').value || null,
    project_id: document.getElementById('t-project').value || null,
    status: document.getElementById('t-status').value,
    priority: document.getElementById('t-priority').value,
    due_date: document.getElementById('t-due').value || null,
    target_week: document.getElementById('t-week').value || '',
  };
  if (!data.title) { toast('제목을 입력하세요', 'error'); return; }
  try {
    if (taskId) await api.tasks.update(taskId, data);
    else await api.tasks.create(data);
    modal.hide();
    toast(taskId ? '수정되었습니다' : '작업이 추가되었습니다');
    await loadKanban();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteTask(id) {
  if (!confirm('작업을 삭제하시겠습니까?')) return;
  await api.tasks.delete(id);
  toast('삭제되었습니다');
  loadKanban();
}
