let calYear, calMonth;

async function renderCalendar() {
  const now = new Date();
  if (!calYear) calYear = now.getFullYear();
  if (!calMonth) calMonth = now.getMonth();

  const page = document.getElementById('page-calendar');
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">달력</h2>
        <p class="page-subtitle">작업 · 보고서 · 회의 일정을 한눈에 확인하세요</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="cal-legend">
          <span class="cal-legend-item"><span class="cal-dot" style="background:#4573D2"></span>작업</span>
          <span class="cal-legend-item"><span class="cal-dot" style="background:#5DA283"></span>보고서</span>
          <span class="cal-legend-item"><span class="cal-dot" style="background:#AA62E3"></span>회의</span>
        </div>
      </div>
    </div>
    <div class="cal-nav">
      <button class="btn btn-ghost" onclick="changeMonth(-1)">◀</button>
      <h3 class="cal-title" id="cal-title"></h3>
      <button class="btn btn-ghost" onclick="changeMonth(1)">▶</button>
      <button class="btn btn-secondary btn-sm" style="margin-left:12px" onclick="goToday()">오늘</button>
      <div class="cal-filter" style="margin-left:auto">
        <select id="cal-filter-user" onchange="loadCalendarData()">
          <option value="">전체</option>
        </select>
      </div>
    </div>
    <div class="cal-grid" id="cal-grid"></div>
  `;

  // 사용자 드롭다운
  const users = await api.users.list().catch(() => []);
  const select = document.getElementById('cal-filter-user');
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    if (window._currentUser && u.id === window._currentUser.id) opt.selected = true;
    select.appendChild(opt);
  });

  loadCalendarData();
}

async function loadCalendarData() {
  const userId = document.getElementById('cal-filter-user')?.value || '';

  // 달의 시작/끝 + 여유 범위
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const rangeStart = new Date(firstDay);
  rangeStart.setDate(rangeStart.getDate() - 7);
  const rangeEnd = new Date(lastDay);
  rangeEnd.setDate(rangeEnd.getDate() + 7);
  const startStr = rangeStart.toISOString().split('T')[0];
  const endStr = rangeEnd.toISOString().split('T')[0];

  const taskParams = userId ? { assignee_id: userId } : {};

  const [tasks, reports, meetings] = await Promise.all([
    api.tasks.list(taskParams).catch(() => []),
    api.reports.list({ user_id: userId || undefined, start: startStr, end: endStr }).catch(() => []),
    api.meetings.list({}).catch(() => []),
  ]);

  buildCalendar(tasks, reports, meetings);
}

function buildCalendar(tasks, reports, meetings) {
  const titleEl = document.getElementById('cal-title');
  titleEl.textContent = `${calYear}년 ${calMonth + 1}월`;

  const grid = document.getElementById('cal-grid');
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // 달의 첫째 날과 마지막 날
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // 월=0

  // 작업을 날짜별로 매핑 (target_week의 월요일 기준)
  const tasksByDate = {};
  tasks.forEach(t => {
    if (t.status === 'done') return;
    if (t.target_week) {
      const match = t.target_week.match(/^(\d{4})-W(\d{2})$/);
      if (match) {
        const weekDates = getWeekDates(parseInt(match[1]), parseInt(match[2]));
        weekDates.forEach(d => {
          if (!tasksByDate[d]) tasksByDate[d] = [];
          if (tasksByDate[d].length < 3) tasksByDate[d].push(t);
        });
      }
    }
    if (t.due_date) {
      if (!tasksByDate[t.due_date]) tasksByDate[t.due_date] = [];
      tasksByDate[t.due_date].push({ ...t, isDue: true });
    }
  });

  // 보고서를 날짜별 매핑
  const reportsByDate = {};
  reports.forEach(r => {
    if (!reportsByDate[r.report_date]) reportsByDate[r.report_date] = [];
    reportsByDate[r.report_date].push(r);
  });

  // 회의를 날짜별 매핑
  const meetingsByDate = {};
  meetings.forEach(m => {
    if (!meetingsByDate[m.meeting_date]) meetingsByDate[m.meeting_date] = [];
    meetingsByDate[m.meeting_date].push(m);
  });

  // 요일 헤더
  let html = ['월', '화', '수', '목', '금', '토', '일'].map(d =>
    `<div class="cal-header">${d}</div>`
  ).join('');

  // 이전 달 빈칸
  const prevMonthLast = new Date(calYear, calMonth, 0);
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevMonthLast.getDate() - i;
    html += `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`;
  }

  // 현재 달
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateObj = new Date(calYear, calMonth, d);
    const dateStr = dateObj.toISOString().split('T')[0];
    const isToday = dateStr === todayStr;
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    const dayTasks = tasksByDate[dateStr] || [];
    const dayReports = reportsByDate[dateStr] || [];
    const dayMeetings = meetingsByDate[dateStr] || [];
    const hasEvents = dayTasks.length + dayReports.length + dayMeetings.length > 0;

    html += `
      <div class="cal-day ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}" onclick="openDayDetail('${dateStr}')">
        <div class="cal-day-num ${isToday ? 'today-num' : ''}">${d}</div>
        <div class="cal-day-events">
          ${dayMeetings.slice(0, 2).map(m => `
            <div class="cal-event meeting" title="${m.title || (m.type === 'weekly' ? '주간회의' : '기술회의')}">
              ${m.start_time ? m.start_time.slice(0,5) + ' ' : ''}${m.title || (m.type === 'weekly' ? '주간회의' : '기술회의')}
            </div>
          `).join('')}
          ${dayTasks.slice(0, 2).map(t => `
            <div class="cal-event task ${t.isDue ? 'due' : ''}" title="${t.title}">
              ${t.isDue ? '⏰ ' : ''}${t.title}
            </div>
          `).join('')}
          ${dayReports.length > 0 ? `
            <div class="cal-event report" title="보고서 ${dayReports.length}건">
              보고서 ${dayReports.length}건
            </div>
          ` : ''}
          ${(dayTasks.length + dayMeetings.length + dayReports.length) > 4 ? `
            <div class="cal-event-more">+${dayTasks.length + dayMeetings.length + dayReports.length - 4}건</div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // 다음 달 빈칸
  const totalCells = startDow + lastDay.getDate();
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= remaining; d++) {
    html += `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`;
  }

  grid.innerHTML = html;
}

function getWeekDates(year, week) {
  const jan1 = new Date(year, 0, 1);
  const days = (week - 1) * 7;
  const weekStart = new Date(jan1);
  weekStart.setDate(jan1.getDate() + days - ((jan1.getDay() + 6) % 7));
  const dates = [];
  for (let i = 0; i < 5; i++) { // 월~금만
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function changeMonth(offset) {
  calMonth += offset;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  loadCalendarData();
}

function goToday() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  loadCalendarData();
}

async function openDayDetail(dateStr) {
  const userId = document.getElementById('cal-filter-user')?.value || '';
  const d = new Date(dateStr);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dateLabel = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;

  const taskParams = userId ? { assignee_id: userId } : {};

  const [tasks, reports, meetings] = await Promise.all([
    api.tasks.list(taskParams).catch(() => []),
    api.reports.list({ user_id: userId || undefined, start: dateStr, end: dateStr }).catch(() => []),
    api.meetings.list({}).catch(() => []),
  ]);

  // 해당 날짜의 작업 필터
  const dayTasks = tasks.filter(t => {
    if (t.status === 'done') return false;
    if (t.due_date === dateStr) return true;
    if (t.target_week) {
      const match = t.target_week.match(/^(\d{4})-W(\d{2})$/);
      if (match) {
        const dates = getWeekDates(parseInt(match[1]), parseInt(match[2]));
        return dates.includes(dateStr);
      }
    }
    return false;
  });

  const dayMeetings = meetings.filter(m => m.meeting_date === dateStr);
  const dayReports = reports.filter(r => r.report_date === dateStr);

  document.getElementById('modal').classList.add('modal-xl');

  let content = `<h3 style="margin-bottom:20px;font-size:16px;color:var(--text)">${dateLabel}</h3>`;

  // 회의
  if (dayMeetings.length) {
    content += `<div class="day-section">
      <h4 class="day-section-title"><span class="cal-dot" style="background:#AA62E3"></span> 회의 (${dayMeetings.length})</h4>
      ${dayMeetings.map(m => `
        <div class="day-item meeting-item" onclick="modal.hide();navigateTo('meetings');setTimeout(()=>viewMeeting(${m.id}),500)">
          <span class="badge badge-${m.type}" style="font-size:10px">${m.type === 'weekly' ? '주간' : '기술'}</span>
          <strong>${m.title || (m.type === 'weekly' ? '주간회의' : '기술회의')}</strong>
          <span class="text-muted">${m.start_time||''} ${m.end_time ? '~ '+m.end_time : ''}</span>
        </div>
      `).join('')}
    </div>`;
  }

  // 작업
  if (dayTasks.length) {
    content += `<div class="day-section">
      <h4 class="day-section-title"><span class="cal-dot" style="background:#4573D2"></span> 작업 (${dayTasks.length})</h4>
      ${dayTasks.map(t => {
        const colors = { high: 'var(--coral)', medium: 'var(--blue)', low: 'var(--green)' };
        return `
          <div class="day-item task-item" onclick="modal.hide();navigateTo('kanban');setTimeout(()=>openTaskDetail(${t.id}),500)">
            <span style="color:${colors[t.priority]||'var(--blue)'};font-weight:700">●</span>
            <strong>${t.title}</strong>
            <span class="badge badge-${t.status}" style="font-size:10px">${{pending:'대기',in_progress:'진행중',review:'검토'}[t.status]||t.status}</span>
            ${t.assignee_name ? `<span class="text-muted">${t.assignee_name}</span>` : ''}
            ${t.project_name ? `<span class="text-muted">· ${t.project_name}</span>` : ''}
          </div>
        `;
      }).join('')}
    </div>`;
  }

  // 보고서
  if (dayReports.length) {
    content += `<div class="day-section">
      <h4 class="day-section-title"><span class="cal-dot" style="background:#5DA283"></span> 업무보고 (${dayReports.length})</h4>
      ${dayReports.map(r => `
        <div class="day-item report-item" onclick="modal.hide();navigateTo('reports');setTimeout(()=>viewReport(${r.id}),500)">
          <span class="avatar avatar-sm ${getAvatarColor(r.name)}">${(r.name||'?').slice(0,1)}</span>
          <strong>${r.name}</strong>
          <span class="text-muted" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(r.work_done||'').split('\n')[0]}</span>
        </div>
      `).join('')}
    </div>`;
  }

  if (!dayMeetings.length && !dayTasks.length && !dayReports.length) {
    content += `<div class="empty-state" style="padding:32px"><div class="empty-icon">📅</div><p>이 날짜에 등록된 일정이 없습니다</p></div>`;
  }

  modal.show('', content,
    `<button class="btn btn-secondary" onclick="modal.hide()">닫기</button>`
  );

  const origHide = modal._origHide || modal.hide;
  if (!modal._origHide) modal._origHide = modal.hide;
  modal.hide = () => {
    document.getElementById('modal').classList.remove('modal-xl');
    origHide.call(modal);
    modal.hide = origHide;
  };
}
