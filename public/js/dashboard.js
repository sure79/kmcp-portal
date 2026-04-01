async function renderDashboard() {
  const page = document.getElementById('page-dashboard');
  const today = new Date().toISOString().split('T')[0];
  const dayOfWeek = new Date().getDay();
  const user = window._currentUser;
  const userName = user?.name || '';
  const userId = user?.id;

  const [allReports, tasks, meetings, notices, myReports, lunchPoll, projects] = await Promise.all([
    api.reports.team(today).catch(() => []),
    api.tasks.list().catch(() => []),
    api.meetings.list({}).catch(() => []),
    api.notices.list().catch(() => []),
    userId ? api.reports.list({ user_id: userId, start: getWeekStartDate(), end: today }).catch(() => []) : [],
    api.lunch.get(today).catch(() => null),
    api.projects.list().catch(() => []),
  ]);

  const isFriday = dayOfWeek === 5;
  const isThursday = dayOfWeek === 4;

  const myTasks = tasks.filter(t => t.assignee_id == userId);
  const myInProgress = myTasks.filter(t => t.status === 'in_progress');
  const myPending = myTasks.filter(t => t.status === 'pending');
  const myDone = myTasks.filter(t => t.status === 'done');
  const myReview = myTasks.filter(t => t.status === 'review');
  const todayReports = allReports.length;
  const recentMeetings = meetings.slice(0, 3);
  const pinnedNotices = notices.filter(n => n.is_pinned).slice(0, 3);

  // 오늘 내 보고서 여부
  const todayMyReport = allReports.find(r => r.user_id == userId);

  // 회의 알림
  const upcomingAlerts = [];
  if (dayOfWeek === 1) upcomingAlerts.push({ title: '주간회의', time: '오늘 08:30', type: 'weekly' });
  if (dayOfWeek === 4) upcomingAlerts.push({ title: '기술회의', time: '오늘 10:00 ~ 12:00', type: 'technical' });
  if (dayOfWeek === 0) upcomingAlerts.push({ title: '주간회의', time: '내일 (월) 08:30', type: 'weekly' });
  if (dayOfWeek === 3) upcomingAlerts.push({ title: '기술회의', time: '내일 (목) 10:00 ~ 12:00', type: 'technical' });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '수고하셨어요';

  page.innerHTML = `
    <div class="welcome-section">
      <h1 class="welcome-title">${greeting}, ${userName}님</h1>
      <p class="welcome-sub">${formatDateKo(today)} · ${['일','월','화','수','목','금','토'][dayOfWeek]}요일</p>
    </div>

    <!-- 부산 날씨 -->
    <div id="weather-widget" class="weather-widget-wrap">
      <div class="weather-loading">🌤️ 날씨 불러오는 중...</div>
    </div>

    <!-- 다가오는 연구소 일정 -->
    <div id="upcoming-events-widget"></div>

    ${upcomingAlerts.length > 0 ? `
      <div style="margin-bottom:24px">
        ${upcomingAlerts.map(a => `
          <div class="meeting-alert alert-${a.type}">
            <div class="meeting-alert-icon">${a.type === 'weekly' ? '📋' : '🔧'}</div>
            <div class="meeting-alert-info">
              <h4>${a.title} 예정</h4>
              <p>${a.time}</p>
            </div>
            <button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="navigateTo('meetings')">회의 관리</button>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- 오늘 보고서 상태 -->
    <div class="dash-report-banner ${todayMyReport ? 'done' : 'pending'}" onclick="${todayMyReport ? '' : "navigateTo('reports');setTimeout(()=>openReportForm(),300)"}">
      <div class="dash-report-icon">${todayMyReport ? '✅' : '📝'}</div>
      <div class="dash-report-info">
        <h4>${todayMyReport ? '오늘 업무보고 완료' : '오늘 업무보고를 작성하세요'}</h4>
        <p>${todayMyReport ? '보고서가 정상적으로 제출되었습니다' : '아직 오늘의 업무보고서가 없습니다'}</p>
      </div>
      ${!todayMyReport ? '<button class="btn btn-coral" style="margin-left:auto">보고서 작성</button>' : '<button class="btn btn-ghost" style="margin-left:auto" onclick="event.stopPropagation();navigateTo(\'reports\')">보기</button>'}
    </div>

    <!-- 내 작업 요약 -->
    <div class="grid grid-4 mb-16">
      <div class="card stat-card clickable" onclick="navigateTo('kanban')">
        <div class="stat-icon-wrap coral">🔥</div>
        <div>
          <div class="stat-value">${myInProgress.length}</div>
          <div class="stat-label">진행중</div>
        </div>
      </div>
      <div class="card stat-card clickable" onclick="navigateTo('kanban')">
        <div class="stat-icon-wrap blue">📋</div>
        <div>
          <div class="stat-value">${myPending.length}</div>
          <div class="stat-label">대기중</div>
        </div>
      </div>
      <div class="card stat-card clickable" onclick="navigateTo('kanban')">
        <div class="stat-icon-wrap purple">🔍</div>
        <div>
          <div class="stat-value">${myReview.length}</div>
          <div class="stat-label">검토중</div>
        </div>
      </div>
      <div class="card stat-card clickable" onclick="navigateTo('kanban')">
        <div class="stat-icon-wrap green">✅</div>
        <div>
          <div class="stat-value">${myDone.length}</div>
          <div class="stat-label">완료</div>
        </div>
      </div>
    </div>

    <div class="grid grid-2">
      <!-- 내 할일 To-do -->
      <div id="todo-widget" class="card" style="min-height:200px"></div>

      <div>
        <!-- 이번주 내 보고서 (To-Do 체크리스트) -->
        <div class="card mb-16">
          <div class="card-header">
            <div class="card-title">이번주 업무보고</div>
            <button class="btn btn-ghost btn-sm" onclick="navigateTo('reports')">전체 보기 →</button>
          </div>
          ${renderWeekReportChecklist(myReports, today)}
        </div>

        <!-- 최근 회의 -->
        <div class="card mb-16">
          <div class="card-header">
            <div class="card-title">최근 회의</div>
            <button class="btn btn-ghost btn-sm" onclick="navigateTo('meetings')">전체 보기 →</button>
          </div>
          ${recentMeetings.length === 0 ? `
            <div class="empty-state" style="padding:24px">
              <div class="empty-icon">📅</div>
              <p>회의 기록이 없습니다</p>
            </div>
          ` : recentMeetings.map(m => `
            <div class="meeting-list-item" style="padding:10px 0" onclick="navigateTo('meetings')">
              <div class="meeting-date-badge">
                <div class="month">${m.meeting_date.slice(5,7)}월</div>
                <div class="day">${m.meeting_date.slice(8,10)}</div>
              </div>
              <div class="meeting-info">
                <div class="meeting-title">${m.title || (m.type === 'weekly' ? '주간회의' : '기술회의')}</div>
                <div class="meeting-time">${m.start_time}${m.end_time ? ' ~ '+m.end_time : ''}</div>
              </div>
              <span class="badge badge-${m.type}">${m.type === 'weekly' ? '주간' : '기술'}</span>
            </div>
          `).join('')}
        </div>

        ${pinnedNotices.length > 0 ? `
          <div class="card">
            <div class="card-header">
              <div class="card-title">고정 공지</div>
            </div>
            ${pinnedNotices.map(n => `
              <div class="notice-item" style="padding:10px 0;border-bottom:1px solid var(--border-light)" onclick="navigateTo('notices')">
                <span class="notice-pin" style="color:var(--coral)">📌</span>
                <div class="notice-title">${n.title}</div>
                <div class="notice-meta">${formatDateKo(n.created_at.split('T')[0])}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>

    <!-- 프로젝트 현황 -->
    ${projects.filter(p => p.status === 'active').length > 0 ? `
    <div class="card mt-16">
      <div class="card-header">
        <div class="card-title">프로젝트 현황</div>
        <button class="btn btn-ghost btn-sm" onclick="navigateTo('projects')">전체 보기 →</button>
      </div>
      <div class="project-dashboard-grid">
        ${projects.filter(p => p.status === 'active').map(p => {
          const progress = p.auto_progress || p.progress || 0;
          const daysLeft = p.end_date ? Math.ceil((new Date(p.end_date) - new Date()) / 86400000) : null;
          const urgency = daysLeft !== null && daysLeft <= 14 ? (daysLeft <= 0 ? 'overdue' : 'urgent') : 'normal';
          const projTasks = tasks.filter(t => t.project_id == p.id);
          const doneTasks = projTasks.filter(t => t.status === 'done').length;
          const inProgress = projTasks.filter(t => t.status === 'in_progress').length;
          return `
            <div class="proj-dash-card ${urgency}" onclick="navigateTo('projects');setTimeout(()=>viewProject(${p.id}),300)">
              <div class="proj-dash-header">
                <div class="proj-dash-name">${p.name}</div>
                ${daysLeft !== null ? `
                  <span class="proj-dash-dday ${urgency}">
                    ${daysLeft <= 0 ? 'D+'+Math.abs(daysLeft) : 'D-'+daysLeft}
                  </span>
                ` : ''}
              </div>
              <div class="proj-dash-desc">${(p.description || '').substring(0, 60)}</div>
              <div class="proj-dash-progress">
                <div class="progress-bar" style="height:6px"><div class="progress-fill" style="width:${progress}%"></div></div>
                <span class="proj-dash-pct">${progress}%</span>
              </div>
              <div class="proj-dash-stats">
                <span>작업 ${doneTasks}/${projTasks.length}</span>
                <span>진행중 ${inProgress}</span>
                ${p.end_date ? `<span>마감 ${p.end_date.slice(5)}</span>` : ''}
              </div>
              <div class="proj-dash-members">
                ${(p.members||[]).slice(0, 5).map(m => `<span class="avatar avatar-xs ${getAvatarColor(m.name)}" title="${m.name}">${m.name.slice(0,1)}</span>`).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ` : ''}

    <!-- 점심 투표 (목/금 또는 투표 있을때) -->
    ${(isFriday || isThursday || lunchPoll) ? `
    <div class="card mt-16 lunch-card">
      <div class="card-header">
        <div class="card-title">🍽️ ${isFriday ? '금요일 외식!' : ''} 점심 메뉴 투표</div>
        ${!lunchPoll ? `<button class="btn btn-coral btn-sm" onclick="openLunchPollForm()">투표 만들기</button>` : ''}
      </div>
      ${lunchPoll ? renderLunchPoll(lunchPoll, userId) : `
        <div class="empty-state" style="padding:20px">
          <p>아직 오늘 투표가 없습니다. 투표를 만들어 보세요!</p>
        </div>
      `}
    </div>
    ` : ''}

    <!-- 팀 보고 현황 -->
    <div class="card mt-16" id="team-report-section">
      <div class="card-header">
        <div class="card-title">오늘 팀 보고 현황 (${todayReports}명 제출)</div>
        <button class="btn btn-ghost btn-sm" onclick="navigateTo('team')">전체 보기 →</button>
      </div>
      ${allReports.length === 0 ? `
        <div class="empty-state" style="padding:24px">
          <div class="empty-icon">📭</div>
          <p>아직 오늘 보고서가 없습니다</p>
        </div>
      ` : `<div class="team-report-grid">
        ${allReports.slice(0, 6).map(r => `
          <div class="team-report-mini" onclick="navigateTo('reports')">
            <div class="avatar avatar-sm ${getAvatarColor(r.name)}">${(r.name||'?').slice(0,1)}</div>
            <div>
              <div style="font-weight:600;font-size:13px">${r.name}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${(r.work_done || '').split('\n')[0]}</div>
            </div>
          </div>
        `).join('')}
      </div>`}
    </div>
  `;

  // 날씨 위젯 비동기 로드
  loadBusanWeather();
  loadUpcomingEvents();
  loadTodoWidget();
}

function renderMyTaskItem(t) {
  const colors = { high: '#F06A6A', medium: '#4573D2', low: '#5DA283' };
  const statusIcons = {
    in_progress: '<span style="color:#4573D2;font-weight:700">▶</span>',
    pending: '<span style="color:#9CA6AF">○</span>',
    review: '<span style="color:#F1BD6C">◉</span>',
    done: '<span style="color:#5DA283">✓</span>'
  };
  const statusLabels = { in_progress: '진행중', pending: '대기', review: '검토', done: '완료' };
  return `
    <div class="my-task-item" onclick="navigateTo('kanban');setTimeout(()=>openTaskDetail(${t.id}),500)">
      <div class="my-task-check">${statusIcons[t.status] || '○'}</div>
      <div class="my-task-body">
        <div class="my-task-title">${t.title}</div>
        <div class="my-task-meta">
          <span style="color:${colors[t.priority] || '#999'}">${t.project_name || '미분류'}</span>
          ${t.target_week ? `<span>· ${t.target_week}</span>` : ''}
        </div>
      </div>
      <span class="badge badge-${t.status}" style="font-size:10px">${statusLabels[t.status]}</span>
    </div>
  `;
}

function renderWeekReportChecklist(myReports, todayStr) {
  const today = new Date(todayStr);
  const weekStart = new Date(today);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - day + (day === 0 ? -6 : 1));

  const days = ['월', '화', '수', '목', '금'];
  let html = '<div class="week-report-checklist">';

  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const report = myReports.find(r => r.report_date === dateStr);
    const isToday = dateStr === todayStr;
    const isFuture = d > today;
    const checked = !!report;

    html += `
      <div class="week-report-day ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''} ${checked ? 'checked' : ''}"
           onclick="${!isFuture ? (checked ? `viewReport(${report?.id})` : "navigateTo('reports');setTimeout(()=>openReportForm(),300)") : ''}">
        <div class="week-day-check">${checked ? '✅' : (isFuture ? '·' : '⬜')}</div>
        <div class="week-day-label">${days[i]}  ${d.getMonth()+1}/${d.getDate()}</div>
        <div class="week-day-status">${checked ? '제출완료' : (isToday ? '작성필요' : (isFuture ? '-' : '미제출'))}</div>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

function getWeekStartDate() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d.toISOString().split('T')[0];
}

function formatDateKo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
}

// ===== 점심 투표 =====
function renderLunchPoll(poll, userId) {
  if (!poll || !poll.options) return '';
  const totalVotes = poll.options.reduce((sum, o) => sum + o.vote_count, 0);
  const myVote = poll.options.find(o => o.votes?.some(v => v.user_id == userId));
  const winner = [...poll.options].sort((a,b) => b.vote_count - a.vote_count)[0];

  return `
    <div class="lunch-poll">
      <div class="lunch-poll-options">
        ${poll.options.map(opt => {
          const pct = totalVotes > 0 ? Math.round(opt.vote_count / totalVotes * 100) : 0;
          const isMyVote = myVote?.id === opt.id;
          const isTop = opt.id === winner?.id && opt.vote_count > 0;
          return `
            <div class="lunch-option ${isMyVote ? 'voted' : ''} ${isTop ? 'top' : ''}" onclick="voteLunch(${opt.id})">
              <div class="lunch-option-bar" style="width:${pct}%"></div>
              <div class="lunch-option-content">
                <span class="lunch-option-name">${isTop ? '👑 ' : ''}${opt.name}</span>
                <span class="lunch-option-info">
                  ${opt.vote_count}표 ${pct > 0 ? `(${pct}%)` : ''}
                  ${opt.votes?.length ? `<span class="lunch-voters">${opt.votes.map(v=>v.name).join(', ')}</span>` : ''}
                </span>
              </div>
              ${isMyVote ? '<span class="lunch-my-badge">내 선택</span>' : ''}
            </div>
          `;
        }).join('')}
      </div>
      <div class="lunch-poll-footer">
        <span style="font-size:12px;color:var(--text-tertiary)">총 ${totalVotes}표 · 클릭하여 투표 (변경 가능)</span>
      </div>
    </div>
  `;
}

async function voteLunch(optionId) {
  if (!window._currentUser) return;
  try {
    await api.lunch.vote({ option_id: optionId, user_id: window._currentUser.id });
    toast('투표 완료!');
    if (window._socket) window._socket.emit('lunch:voted', { name: window._currentUser.name });
    renderDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

function openLunchPollForm() {
  const today = new Date().toISOString().split('T')[0];
  const isFriday = new Date().getDay() === 5;

  modal.show(
    '점심 메뉴 투표 만들기',
    `<div class="form-group">
       <label>날짜</label>
       <input type="date" id="lunch-date" value="${today}">
     </div>
     <div class="form-group">
       <label>제목</label>
       <input type="text" id="lunch-title" value="${isFriday ? '금요일 외식 메뉴 투표' : '점심 메뉴 투표'}" placeholder="투표 제목">
     </div>
     <div class="form-group">
       <label>메뉴 옵션 (한 줄에 하나씩)</label>
       <textarea id="lunch-options" rows="6" placeholder="예:\n짜장면\n김치찌개\n돈까스\n쌀국수\n감자탕">${isFriday ? '중국집\n일식\n한식 (감자탕)\n고깃집\n분식' : '짜장면\n김치찌개\n돈까스\n쌀국수'}</textarea>
     </div>`,
    `<button class="btn btn-secondary" onclick="modal.hide()">취소</button>
     <button class="btn btn-coral" onclick="saveLunchPoll()">투표 시작</button>`
  );
}

async function saveLunchPoll() {
  const date = document.getElementById('lunch-date').value;
  const title = document.getElementById('lunch-title').value;
  const options = document.getElementById('lunch-options').value
    .split('\n').map(s => s.trim()).filter(Boolean);

  if (options.length < 2) { toast('최소 2개 옵션을 입력하세요', 'error'); return; }

  try {
    await api.lunch.create({
      date, title, options,
      created_by: window._currentUser?.id
    });
    modal.hide();
    toast('투표가 시작되었습니다!');
    if (window._socket) window._socket.emit('lunch:created', { name: window._currentUser?.name });
    renderDashboard();
  } catch(e) { toast(e.message, 'error'); }
}

// ===== 부산 날씨 (Open-Meteo API — 무료, API 키 불필요) =====
// 기상청 날씨 코드 → 아이콘/레이블 (기상청 표현 기준)
const WMO_CODE = {
  1:  { icon: '☀️',  label: '맑음' },
  2:  { icon: '⛅',  label: '구름많음' },
  3:  { icon: '☁️',  label: '흐림' },
  53: { icon: '🌨️', label: '비/눈' },
  61: { icon: '🌧️', label: '비' },
  63: { icon: '🌧️', label: '비' },
  73: { icon: '❄️',  label: '눈' },
  80: { icon: '🌦️', label: '소나기' },
  82: { icon: '🌦️', label: '소나기' },
  95: { icon: '⛈️',  label: '뇌우' },
};

const WEEK_DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 강수 확률 색상
function rainColor(pct) {
  if (pct >= 70) return '#64b5f6';
  if (pct >= 40) return '#90caf9';
  return 'rgba(255,255,255,0.6)';
}

async function loadBusanWeather() {
  const wrap = document.getElementById('weather-widget');
  if (!wrap) return;

  try {
    const res = await fetch('/api/weather');

    // API 키 미설정
    if (res.status === 503) {
      wrap.innerHTML = `
        <div class="weather-no-key">
          <span style="font-size:24px">🌤️</span>
          <div>
            <strong>부산 날씨 (기상청) 설정 필요</strong>
            <p>정확한 기상청 날씨를 보려면 Railway 환경변수에<br>
               <code>WEATHER_API_KEY</code> = <em>data.go.kr 발급 키</em> 를 추가하세요.</p>
            <p style="margin-top:6px;font-size:11px;opacity:0.7">
              발급: data.go.kr → 기상청_단기예보 + 기상청_중기예보 활용신청 (무료, 즉시승인)
            </p>
          </div>
        </div>`;
      return;
    }

    if (!res.ok) throw new Error('날씨 오류');
    const { forecast, updated } = await res.json();
    if (!forecast?.length) throw new Error('데이터 없음');

    const now     = new Date(updated || Date.now());
    const todayF  = forecast[0];
    const todayWmo = WMO_CODE[todayF.weatherCode] || WMO_CODE[1];
    const updateStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')} 기상청`;

    // 오늘 통계
    const stats = [
      { value: todayF.precipProb != null ? `${todayF.precipProb}%` : '-', label: '강수확률' },
      { value: todayF.precipSum  != null && todayF.precipSum > 0 ? `${todayF.precipSum}mm` : '-', label: '강수량' },
      { value: todayF.windSpeed  != null ? `${todayF.windSpeed}㎞/h` : '-', label: '풍속' },
      { value: todayF.humidity   != null ? `${todayF.humidity}%` : '-', label: '습도' },
    ].map(s => `
      <div class="weather-stat">
        <div class="weather-stat-value">${s.value}</div>
        <div class="weather-stat-label">${s.label}</div>
      </div>`).join('');

    // 7일 예보
    const cards = forecast.map((f, i) => {
      const wmo = WMO_CODE[f.weatherCode] || WMO_CODE[1];
      const dateObj = new Date(
        parseInt(f.date.slice(0,4)),
        parseInt(f.date.slice(4,6)) - 1,
        parseInt(f.date.slice(6,8))
      );
      const mo  = dateObj.getMonth() + 1;
      const dy  = dateObj.getDate();
      const dow = WEEK_DAYS_KO[dateObj.getDay()];
      const dayLabel = i === 0 ? '오늘' : (i === 1 ? '내일' : dow);
      const rainClass = f.precipProb >= 30 ? '' : 'no-rain';
      return `
        <div class="weather-day ${i === 0 ? 'weather-day-today' : ''}">
          <div class="weather-day-label">${dayLabel}</div>
          <div class="weather-day-date">${mo}/${dy}</div>
          <div class="weather-day-icon">${wmo.icon}</div>
          <div class="weather-day-temp">
            <span class="weather-temp-high">${f.tempMax != null ? Math.round(f.tempMax)+'°' : '-'}</span>
            <span class="weather-temp-sep">/</span>
            <span class="weather-temp-low">${f.tempMin != null ? Math.round(f.tempMin)+'°' : '-'}</span>
          </div>
          <div class="weather-rain-prob ${rainClass}">${f.precipProb}%</div>
        </div>`;
    }).join('');

    wrap.innerHTML = `
      <div class="weather-card">
        <div class="weather-top-bar">
          <span class="weather-location-tag">부산 날씨</span>
          <span class="weather-update-time">${updateStr}</span>
          <span class="weather-source-tag">기상청</span>
        </div>
        <div class="weather-today-row">
          <div class="weather-today-icon">${todayWmo.icon}</div>
          <div class="weather-today-main">
            <div class="weather-today-temp">
              ${todayF.tempMax != null ? Math.round(todayF.tempMax)+'°' : '-'}
              <span>/ ${todayF.tempMin != null ? Math.round(todayF.tempMin)+'°' : '-'}</span>
            </div>
            <div class="weather-today-desc">${todayWmo.label}</div>
          </div>
          <div class="weather-today-stats">${stats}</div>
        </div>
        <div class="weather-week">${cards}</div>
      </div>`;

  } catch(e) {
    const wrap2 = document.getElementById('weather-widget');
    if (wrap2) wrap2.innerHTML = '';
  }
}

async function loadUpcomingEvents() {
  const wrap = document.getElementById('upcoming-events-widget');
  if (!wrap) return;

  try {
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const endStr = futureDate.toISOString().split('T')[0];

    const events = await api.events.list({ start: today, end: endStr });
    if (!events.length) { wrap.innerHTML = ''; return; }

    // 날짜순 정렬 후 최대 5개
    const sorted = events.sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 5);

    const rows = sorted.map(ev => {
      const startD = new Date(ev.start_date);
      const mo = startD.getMonth() + 1;
      const dy = startD.getDate();
      const dow = ['일','월','화','수','목','금','토'][startD.getDay()];
      const isSameDay = ev.start_date === ev.end_date;
      const dateStr = isSameDay
        ? `${mo}/${dy} (${dow})`
        : `${mo}/${dy} ~ ${new Date(ev.end_date).getMonth()+1}/${new Date(ev.end_date).getDate()}`;
      const timeStr = ev.start_time ? ev.start_time.slice(0,5) : '';
      const catLabel = { general:'일반', research:'연구', training:'교육', external:'외부행사', holiday:'휴가', deadline:'마감' }[ev.category] || '';

      return `
        <div class="upcoming-event-item" onclick="navigateTo('calendar')">
          <div class="upcoming-event-bar" style="background:${ev.color}"></div>
          <div class="upcoming-event-body">
            <div class="upcoming-event-title">${ev.title}</div>
            <div class="upcoming-event-meta">
              <span>${dateStr}</span>
              ${timeStr ? `<span>${timeStr}</span>` : ''}
              ${catLabel ? `<span class="upcoming-event-cat">${catLabel}</span>` : ''}
              <span style="color:var(--text-tertiary)">${ev.created_name}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    wrap.innerHTML = `
      <div class="upcoming-events-card">
        <div class="upcoming-events-header">
          <span class="upcoming-events-title">📅 다가오는 일정</span>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('calendar')">달력 보기 →</button>
        </div>
        <div class="upcoming-events-list">${rows}</div>
      </div>`;
  } catch(e) {
    wrap.innerHTML = '';
  }
}

let _todoShowAll = false;

async function loadTodoWidget() {
  const wrap = document.getElementById('todo-widget');
  if (!wrap) return;
  window._renderTodo = () => _renderTodoWidget(wrap);
  await _renderTodoWidget(wrap);
}

async function _renderTodoWidget(wrap) {
  try {
    const todos = await api.todos.list();
    const pending = todos.filter(t => !t.done);
    const done    = todos.filter(t => t.done);
    const total   = todos.length;
    const doneCount = done.length;
    const pct = total ? Math.round(doneCount / total * 100) : 0;

    // 표시할 항목: 전체보기 아니면 미완료 최대5 + 완료 1
    const showList = _todoShowAll
      ? todos
      : [...pending.slice(0, 5), ...done.slice(0, 1)];

    const rows = showList.map(t => `
      <div class="td-item ${t.done ? 'td-done' : ''}">
        <button class="td-check ${t.done ? 'td-checked' : ''}" onclick="toggleTodo(${t.id})" title="${t.done ? '되돌리기' : '완료'}">
          ${t.done ? `<svg width="10" height="8" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
        </button>
        <span class="td-text">${t.content}</span>
        ${t.due_date ? `<span class="td-due ${new Date(t.due_date) < new Date() && !t.done ? 'td-due-over' : ''}">${t.due_date.slice(5).replace('-','/')}</span>` : ''}
        <button class="td-del" onclick="deleteTodo(${t.id})" title="삭제">
          <svg width="12" height="12" viewBox="0 0 12 12"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>`).join('');

    const moreCount = _todoShowAll ? 0 : (pending.length - Math.min(pending.length, 5));

    wrap.innerHTML = `
      <div class="card-header">
        <div class="card-title">내 할일</div>
        ${total > 0 ? `<span class="td-progress-text">${doneCount}/${total} 완료</span>` : ''}
      </div>
      ${total > 0 ? `
        <div class="td-progress-bar-wrap">
          <div class="td-progress-bar" style="width:${pct}%"></div>
        </div>` : ''}
      <div class="td-add-row">
        <input id="todo-input" class="td-input" placeholder="+ 할일을 입력하고 Enter" onkeydown="if(event.key==='Enter')addTodo()">
      </div>
      <div class="td-list">
        ${rows || `<div class="td-empty"><span>🎉</span><p>할일이 없습니다</p></div>`}
        ${!_todoShowAll && moreCount > 0 ? `
          <button class="td-more-btn" onclick="_todoShowAll=true;window._renderTodo()">
            + ${moreCount}개 더 보기
          </button>` : ''}
        ${_todoShowAll && total > 6 ? `
          <button class="td-more-btn" onclick="_todoShowAll=false;window._renderTodo()">
            접기
          </button>` : ''}
      </div>
      ${done.length > 0 && !_todoShowAll ? `
        <div class="td-footer">
          <button class="btn btn-ghost btn-sm" onclick="_todoShowAll=true;window._renderTodo()">
            완료된 항목 ${done.length}개 보기 →
          </button>
        </div>` : ''}`;
  } catch(e) { wrap.innerHTML = ''; }
}

async function addTodo() {
  const input = document.getElementById('todo-input');
  const content = input?.value.trim();
  if (!content) return;
  try {
    await api.todos.create({ content });
    input.value = '';
    if (window._renderTodo) window._renderTodo();
  } catch(e) { toast(e.message, 'error'); }
}

async function toggleTodo(id) {
  try {
    await api.todos.toggle(id);
    if (window._renderTodo) window._renderTodo();
  } catch(e) {}
}

async function deleteTodo(id) {
  try {
    await api.todos.delete(id);
    if (window._renderTodo) window._renderTodo();
  } catch(e) {}
}
