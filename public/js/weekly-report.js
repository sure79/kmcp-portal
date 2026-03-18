// 주간 종합 업무보고서
function getWeekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + (offset * 7);
  const mon = new Date(now.getFullYear(), now.getMonth(), diff);
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  return {
    start: mon.toISOString().split('T')[0],
    end: fri.toISOString().split('T')[0],
    label: `${mon.getMonth()+1}/${mon.getDate()} ~ ${fri.getMonth()+1}/${fri.getDate()}`,
  };
}

let wrWeekOffset = 0;

async function renderWeeklyReport() {
  const page = document.getElementById('page-weekly-report');
  const range = getWeekRange(wrWeekOffset);

  page.innerHTML = `
    <div class="page-header">
      <div>
        <h2 class="page-title">주간 종합 보고서</h2>
        <p class="page-subtitle">부서별·개인별 주간 업무 현황을 한눈에 파악하세요</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost" onclick="wrWeekOffset--;renderWeeklyReport()">◀ 이전주</button>
        <span class="wr-week-label" id="wr-week-label">${range.label}</span>
        <button class="btn btn-ghost" onclick="wrWeekOffset++;renderWeeklyReport()">다음주 ▶</button>
        <button class="btn btn-secondary" onclick="wrWeekOffset=0;renderWeeklyReport()">이번 주</button>
        <button class="btn btn-ghost" onclick="printWeeklyReport()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          인쇄
        </button>
      </div>
    </div>
    <div id="wr-content" class="wr-content">
      <div class="loading-state">데이터를 불러오는 중...</div>
    </div>
  `;

  loadWeeklyReport();
}

async function loadWeeklyReport() {
  const range = getWeekRange(wrWeekOffset);
  const content = document.getElementById('wr-content');

  try {
    const data = await api.reports.weeklySummary(range.start, range.end);

    if (!data || !data.length) {
      content.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>해당 주차에 등록된 직원이 없습니다</p></div>`;
      return;
    }

    // 통계 요약
    const totalUsers = data.length;
    const totalReports = data.reduce((s, u) => s + u.reportCount, 0);
    const totalMissing = data.reduce((s, u) => s + u.missingCount, 0);
    const submissionRate = data[0].totalWeekdays > 0
      ? Math.round((totalReports / (totalUsers * data[0].totalWeekdays)) * 100) : 0;

    // 평일 날짜 목록
    const weekdays = [];
    const d = new Date(range.start);
    const endD = new Date(range.end);
    while (d <= endD) {
      if (d.getDay() >= 1 && d.getDay() <= 5) {
        weekdays.push({
          date: d.toISOString().split('T')[0],
          label: `${d.getMonth()+1}/${d.getDate()}`,
          dayName: ['일','월','화','수','목','금','토'][d.getDay()],
        });
      }
      d.setDate(d.getDate() + 1);
    }

    // 부서별 그룹화
    const depts = {};
    data.forEach(u => {
      const dept = u.department || '기타';
      if (!depts[dept]) depts[dept] = [];
      depts[dept].push(u);
    });

    let html = `
      <!-- 요약 카드 -->
      <div class="wr-summary">
        <div class="wr-stat">
          <div class="wr-stat-value">${totalUsers}</div>
          <div class="wr-stat-label">전체 인원</div>
        </div>
        <div class="wr-stat">
          <div class="wr-stat-value">${totalReports}</div>
          <div class="wr-stat-label">제출 보고서</div>
        </div>
        <div class="wr-stat ${submissionRate < 80 ? 'wr-stat-warn' : 'wr-stat-good'}">
          <div class="wr-stat-value">${submissionRate}%</div>
          <div class="wr-stat-label">제출률</div>
        </div>
        <div class="wr-stat ${totalMissing > 0 ? 'wr-stat-warn' : ''}">
          <div class="wr-stat-value">${totalMissing}</div>
          <div class="wr-stat-label">미제출</div>
        </div>
      </div>

      <!-- 제출 현황 매트릭스 -->
      <div class="card mb-16">
        <div class="card-header"><div class="card-title">제출 현황</div></div>
        <div class="wr-matrix">
          <table class="wr-table">
            <thead>
              <tr>
                <th class="wr-th-name">이름</th>
                <th class="wr-th-dept">부서</th>
                ${weekdays.map(wd => `<th class="wr-th-day">${wd.dayName}<br><span class="text-muted">${wd.label}</span></th>`).join('')}
                <th class="wr-th-rate">제출률</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(u => {
                const rate = u.totalWeekdays > 0 ? Math.round((u.reportCount / u.totalWeekdays) * 100) : 0;
                return `
                  <tr>
                    <td class="wr-td-name">
                      <span class="avatar avatar-sm ${getAvatarColor(u.name)}">${u.name.slice(0,1)}</span>
                      ${u.name}
                    </td>
                    <td class="wr-td-dept">${u.department || ''}</td>
                    ${weekdays.map(wd => {
                      const report = u.reports.find(r => r.report_date === wd.date);
                      const today = new Date().toISOString().split('T')[0];
                      const isPast = wd.date <= today;
                      if (report) {
                        return `<td class="wr-td-status submitted" onclick="showDayReport(${JSON.stringify(u.name).replace(/"/g, '&quot;')}, '${wd.date}', ${u.id})" title="클릭하여 보기">✓</td>`;
                      } else if (isPast) {
                        return `<td class="wr-td-status missing" title="미제출">✕</td>`;
                      } else {
                        return `<td class="wr-td-status future">-</td>`;
                      }
                    }).join('')}
                    <td class="wr-td-rate"><span class="wr-rate-badge ${rate >= 80 ? 'good' : rate >= 50 ? 'warn' : 'bad'}">${rate}%</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // 부서별 상세 보고
    html += Object.entries(depts).map(([dept, members]) => `
      <div class="card mb-16">
        <div class="card-header">
          <div class="card-title">${dept}</div>
          <span class="text-muted" style="font-size:13px">${members.length}명</span>
        </div>
        ${members.map(u => `
          <div class="wr-person-section">
            <div class="wr-person-header" onclick="this.parentElement.classList.toggle('collapsed')">
              <span class="avatar avatar-sm ${getAvatarColor(u.name)}">${u.name.slice(0,1)}</span>
              <div class="wr-person-info">
                <strong>${u.name}</strong>
                <span class="text-muted">${u.position || ''}</span>
              </div>
              <div class="wr-person-stats">
                <span class="badge ${u.reportCount === u.totalWeekdays ? 'badge-done' : 'badge-pending'}">${u.reportCount}/${u.totalWeekdays} 제출</span>
                ${u.tasks.length > 0 ? `<span class="badge badge-in_progress">작업 ${u.tasks.length}건</span>` : ''}
              </div>
              <svg class="wr-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="wr-person-body">
              <!-- 일별 보고서 -->
              ${u.reports.length > 0 ? `
                <div class="wr-daily-list">
                  ${weekdays.map(wd => {
                    const report = u.reports.find(r => r.report_date === wd.date);
                    if (!report) return '';
                    return `
                      <div class="wr-daily-item">
                        <div class="wr-daily-date">
                          <span class="wr-day-name">${wd.dayName}</span>
                          <span class="wr-day-date">${wd.label}</span>
                        </div>
                        <div class="wr-daily-content">
                          <div class="wr-work-row">
                            <span class="wr-work-label">완료</span>
                            <span class="wr-work-text">${(report.work_done || '-').replace(/\n/g, '<br>')}</span>
                          </div>
                          <div class="wr-work-row">
                            <span class="wr-work-label plan">예정</span>
                            <span class="wr-work-text">${(report.work_planned || '-').replace(/\n/g, '<br>')}</span>
                          </div>
                          ${report.special_notes ? `
                            <div class="wr-work-row">
                              <span class="wr-work-label special">특이</span>
                              <span class="wr-work-text" style="color:var(--coral)">${report.special_notes}</span>
                            </div>` : ''}
                          ${report.safety_notes ? `
                            <div class="wr-work-row">
                              <span class="wr-work-label safety">안전</span>
                              <span class="wr-work-text" style="color:var(--red)">${report.safety_notes}</span>
                            </div>` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              ` : `<div class="wr-no-report">이번 주 제출된 보고서가 없습니다</div>`}

              <!-- 진행중 작업 -->
              ${u.tasks.length > 0 ? `
                <div class="wr-tasks-section">
                  <h4 class="wr-tasks-title">진행중 작업</h4>
                  <div class="wr-tasks-list">
                    ${u.tasks.map(t => {
                      const pColors = { high: 'var(--coral)', medium: 'var(--blue)', low: 'var(--green)' };
                      return `
                        <div class="wr-task-item">
                          <span style="color:${pColors[t.priority]||'var(--blue)'};font-weight:700">●</span>
                          <span class="wr-task-title">${t.title}</span>
                          <span class="badge badge-${t.status}" style="font-size:10px">${{pending:'대기',in_progress:'진행중',review:'검토중'}[t.status]||t.status}</span>
                          ${t.project_name ? `<span class="text-muted" style="font-size:11px">· ${t.project_name}</span>` : ''}
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');

    content.innerHTML = html;

  } catch(e) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>데이터를 불러오지 못했습니다: ${e.message}</p></div>`;
  }
}

async function showDayReport(name, date, userId) {
  try {
    const reports = await api.reports.list({ user_id: userId, start: date, end: date });
    const r = reports[0];
    if (!r) { toast('해당 날짜 보고서가 없습니다', 'error'); return; }

    modal.show(
      `${name} · ${date}`,
      `<div class="meeting-section"><h4>금일 작업 내용</h4><p>${(r.work_done||'-').replace(/\n/g,'<br>')}</p></div>
       <div class="meeting-section"><h4>내일 예정 작업</h4><p>${(r.work_planned||'-').replace(/\n/g,'<br>')}</p></div>
       ${r.special_notes ? `<div class="meeting-section"><h4>특이사항</h4><p style="color:var(--coral)">${r.special_notes}</p></div>` : ''}
       ${r.safety_notes ? `<div class="meeting-section"><h4>안전사항</h4><p style="color:var(--red)">${r.safety_notes}</p></div>` : ''}`,
      `<button class="btn btn-secondary" onclick="modal.hide()">닫기</button>`
    );
  } catch(e) { toast(e.message, 'error'); }
}

function printWeeklyReport() {
  const content = document.getElementById('wr-content');
  if (!content) return;
  const range = getWeekRange(wrWeekOffset);
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8">
    <title>주간 종합 보고서 - ${range.label}</title>
    <style>
      body { font-family: 'Malgun Gothic', sans-serif; padding: 20px; font-size: 12px; color: #333; }
      h2 { text-align: center; margin-bottom: 4px; }
      .period { text-align: center; color: #666; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; font-size: 11px; }
      th { background: #F0F0F0; font-weight: 700; }
      .submitted { color: #1B5E20; font-weight: 700; }
      .missing { color: #E8384F; font-weight: 700; }
      .section-title { background: #2C2C2C; color: white; padding: 8px 12px; font-weight: 700; margin-top: 16px; }
      .person-name { font-weight: 700; background: #F6F8FA; padding: 6px 12px; border-bottom: 1px solid #DDD; }
      .day-row { display: flex; border-bottom: 1px solid #EEE; padding: 4px 0; }
      .day-label { width: 60px; font-weight: 600; flex-shrink: 0; }
      .work-label { display: inline-block; width: 35px; font-size: 10px; font-weight: 700; color: #666; }
      .work-text { font-size: 11px; }
      @media print { body { padding: 0; } }
    </style>
    </head><body>
      <h2>KMCP 연구소 주간 종합 업무보고서</h2>
      <div class="period">${range.start} ~ ${range.end}</div>
      ${content.innerHTML}
      <script>window.print();</script>
    </body></html>
  `);
  win.document.close();
}
