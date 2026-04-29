// 신규 사용자 onboarding — 완전히 빈 대시보드일 때 안내 카드 노출
// 한 번 닫으면 localStorage에 기억해 다시 안 보여줌

const ONBOARD_DISMISS_KEY = 'kmcp:onboarding:dismissed';

function maybeShowOnboarding({ tasks = [], meetings = [], myReports = [], notices = [] } = {}) {
  // 이미 닫은 사용자: 표시 안 함
  try {
    if (localStorage.getItem(ONBOARD_DISMISS_KEY) === '1') return;
  } catch {}

  // 데이터가 모두 비어있는 신규 사용자만 노출
  const isNew = tasks.length === 0 && meetings.length === 0 && myReports.length === 0 && notices.length === 0;
  if (!isNew) return;

  const page = document.getElementById('page-dashboard');
  if (!page) return;

  // 환영 섹션 다음에 onboarding 카드 삽입
  const welcome = page.querySelector('.welcome-section');
  if (!welcome) return;
  if (page.querySelector('.onboarding-card')) return; // 중복 방지

  const card = document.createElement('div');
  card.className = 'onboarding-card';
  card.innerHTML = `
    <div class="onboard-head">
      <span class="onboard-eyebrow">시작하기</span>
      <h3 class="onboard-title">KMCP 포털에 오신 것을 환영합니다</h3>
      <p class="onboard-sub">처음이시군요. 이 4가지로 하루를 시작해보세요.</p>
      <button class="onboard-dismiss" onclick="dismissOnboarding(this)" aria-label="안내 닫기" title="안내 닫기">×</button>
    </div>
    <div class="onboard-grid">
      <a class="onboard-step" onclick="navigateTo('reports');setTimeout(()=>openReportForm(),300)">
        <div class="onboard-step-num">1</div>
        <div class="onboard-step-body">
          <div class="onboard-step-title">오늘 업무보고 작성</div>
          <div class="onboard-step-desc">매일 한 번, 오늘 한 일과 내일 계획</div>
        </div>
      </a>
      <a class="onboard-step" onclick="navigateTo('kanban')">
        <div class="onboard-step-num">2</div>
        <div class="onboard-step-body">
          <div class="onboard-step-title">칸반에 작업 추가</div>
          <div class="onboard-step-desc">진행중·대기·완료를 한 눈에</div>
        </div>
      </a>
      <a class="onboard-step" onclick="navigateTo('meetings')">
        <div class="onboard-step-num">3</div>
        <div class="onboard-step-body">
          <div class="onboard-step-title">회의록 확인</div>
          <div class="onboard-step-desc">주간회의 (월 08:30) · 기술회의 (목 10:00)</div>
        </div>
      </a>
      <a class="onboard-step" onclick="navigateTo('suggestions')">
        <div class="onboard-step-num">4</div>
        <div class="onboard-step-body">
          <div class="onboard-step-title">건의사항 남기기</div>
          <div class="onboard-step-desc">개선 아이디어를 익명으로도 남길 수 있어요</div>
        </div>
      </a>
    </div>
    <div class="onboard-foot">
      <span>💡 팁: 사이드바 우측 ☆ 버튼으로 자주 보는 프로젝트를 즐겨찾기에 추가할 수 있어요.</span>
    </div>
  `;
  welcome.insertAdjacentElement('afterend', card);
}

function dismissOnboarding(btn) {
  try { localStorage.setItem(ONBOARD_DISMISS_KEY, '1'); } catch {}
  const card = btn.closest('.onboarding-card');
  if (card) card.remove();
}
