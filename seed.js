// 데이터 초기화 + 예시 데이터 삽입
// 실행: node seed.js

const db = require('./database/db');
const bcrypt = require('bcryptjs');

const hash = (pw) => bcrypt.hashSync(pw, 10);

function getWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toStr(d) {
  return d.toISOString().split('T')[0];
}

// 직전 평일 구하기
function prevWeekday(date, offset = 0) {
  const d = new Date(date);
  d.setDate(d.getDate() - offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

async function seed() {
  console.log('=== KMCP 연구소 DB 초기화 및 예시 데이터 삽입 ===\n');
  await db.init();

  // ─── 기존 데이터 전부 삭제 ───────────────────────────
  console.log('기존 데이터 삭제 중...');
  const tables = [
    'poll_votes','poll_options','polls',
    'suggestion_likes','suggestions',
    'lunch_votes','lunch_options','lunch_polls',
    'user_status',
    'meeting_attendees','meetings',
    'daily_reports',
    'tasks',
    'project_members','projects',
    'notices',
    'activity_log',
  ];
  for (const t of tables) {
    try { await db.run(`DELETE FROM ${t}`); } catch(e) {}
  }
  // 사용자 삭제 (admin 제외)
  await db.run("DELETE FROM users WHERE username != 'admin'").catch(() => {});
  // admin 계정 확인/재생성
  const adminExists = await db.get("SELECT id FROM users WHERE username='admin'");
  if (!adminExists) {
    await db.run('INSERT INTO users (name,department,position,username,password,is_admin,is_approved) VALUES (?,?,?,?,?,?,?)',
      '관리자','관리','관리자','admin', hash('admin1234'), 1, 1);
  } else {
    await db.run("UPDATE users SET is_approved=1, is_admin=1 WHERE username='admin'");
  }
  console.log('  ✓ 기존 데이터 삭제 완료\n');

  // ─── 사용자 ────────────────────────────────────────
  console.log('사용자 생성 중...');
  const userData = [
    { name: '김태호', dept: '전기팀',   pos: '팀장',  user: 'thkim',  pw: '1234', admin: 1 },
    { name: '이준혁', dept: '전기팀',   pos: '선임연구원', user: 'jhlee',  pw: '1234', admin: 0 },
    { name: '박서연', dept: '전기팀',   pos: '연구원', user: 'sypark', pw: '1234', admin: 0 },
    { name: '정민수', dept: '기관팀',   pos: '팀장',  user: 'msjung', pw: '1234', admin: 0 },
    { name: '최영진', dept: '기관팀',   pos: '선임연구원', user: 'yjchoi', pw: '1234', admin: 0 },
    { name: '한소희', dept: '설계팀',   pos: '연구원', user: 'shhan',  pw: '1234', admin: 0 },
    { name: '강도현', dept: '설계팀',   pos: '팀장',  user: 'dhkang', pw: '1234', admin: 0 },
  ];

  const uids = [];
  for (const u of userData) {
    const r = await db.run(
      'INSERT INTO users (name,department,position,username,password,is_admin,is_approved) VALUES (?,?,?,?,?,?,?)',
      u.name, u.dept, u.pos, u.user, hash(u.pw), u.admin, 1
    );
    uids.push(r.lastInsertRowid);
    console.log(`  ✓ ${u.name} (${u.dept} / ${u.pos})`);
  }
  const admin = await db.get("SELECT id FROM users WHERE username='admin'");
  const adminId = admin.id;

  // 인덱스 상수
  const [KIM, LEE, PARK, JUNG, CHOI, HAN, KANG] = uids; // 0~6

  // ─── 날짜 계산 ────────────────────────────────────
  const today = new Date();
  const todayStr = toStr(today);
  const thisWeek = getWeekKey(today);
  const nextWeek = getWeekKey(addDays(today, 7));
  const prev1Week = getWeekKey(addDays(today, -7));
  const prev2Week = getWeekKey(addDays(today, -14));

  const d1 = toStr(prevWeekday(today, 0));  // 오늘(또는 최근 평일)
  const d2 = toStr(prevWeekday(today, 1));  // 어제
  const d3 = toStr(prevWeekday(today, 2));  // 그제
  const d4 = toStr(prevWeekday(today, 5));  // 지난주 금
  const d5 = toStr(prevWeekday(today, 6));  // 지난주 목

  // 이번주 월요일
  const thisMon = new Date(today);
  thisMon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const thisMonStr = toStr(thisMon);
  // 지난주 월
  const lastMon = addDays(thisMon, -7);
  const lastMonStr = toStr(lastMon);
  // 지난주 목
  const lastThu = addDays(lastMon, 3);
  const lastThuStr = toStr(lastThu);
  // 이번주 목
  const thisThu = addDays(thisMon, 3);
  const thisThuStr = toStr(thisThu);

  // ─── 프로젝트 ──────────────────────────────────────
  console.log('\n프로젝트 생성 중...');
  const projData = [
    {
      name: 'SM-300 전기추진선 전장 설계',
      desc: '4.5m급 소형 저속 전기추진선(LSV) 전장 시스템 설계 및 제작 지원.\n배전반, BMS, 모터 컨트롤러, 충전시스템 포함.',
      start: toStr(addDays(today, -70)), end: toStr(addDays(today, 71)),
      status: 'active', progress: 45,
    },
    {
      name: '7.7m 수소연료전지 하이브리드 선박',
      desc: '7.7m 수소연료전지+리튬배터리 하이브리드 전기추진 시스템 개발.\nIMO Tier III 배출 기준 대응.',
      start: toStr(addDays(today, -40)), end: toStr(addDays(today, 102)),
      status: 'active', progress: 28,
    },
    {
      name: '청안선 IoT 원격 모니터링',
      desc: '기존 운항 선박(청안선)에 IoT 센서 게이트웨이 설치 및 웹 기반 실시간 모니터링 시스템 구축.',
      start: toStr(addDays(today, -50)), end: toStr(addDays(today, 26)),
      status: 'active', progress: 65,
    },
    {
      name: '12m 연안 순찰선 기본설계',
      desc: '해경 납품용 12m 연안 순찰선 기본 설계. 추진 시스템, 전장 계통, 구획 배치 포함.',
      start: toStr(addDays(today, -10)), end: toStr(addDays(today, 150)),
      status: 'active', progress: 8,
    },
  ];

  const pids = [];
  for (const p of projData) {
    const r = await db.run(
      'INSERT INTO projects (name,description,start_date,end_date,status,progress,created_by) VALUES (?,?,?,?,?,?,?)',
      p.name, p.desc, p.start, p.end, p.status, p.progress, adminId
    );
    pids.push(r.lastInsertRowid);
    console.log(`  ✓ ${p.name}`);
  }

  // 프로젝트 멤버
  const memberMap = [
    [0, [KIM, LEE, PARK]],
    [1, [KIM, LEE, JUNG, CHOI]],
    [2, [PARK, HAN, KANG]],
    [3, [KANG, HAN, KIM]],
  ];
  for (const [pi, members] of memberMap) {
    for (const uid of members) {
      await db.run('INSERT OR IGNORE INTO project_members (project_id,user_id,role) VALUES (?,?,?)',
        pids[pi], uid, uid === KIM || uid === KANG ? 'PM' : '참여');
    }
  }

  // ─── 작업 (칸반) ───────────────────────────────────
  console.log('\n작업 생성 중...');
  const taskData = [
    // SM-300 프로젝트
    { title: '배전반 3D 모델링 최종 검토', desc: 'SM-300 메인 배전반 3D CAD 모델 최종 검토 및 간섭 확인. 제작 발주 전 승인 필요.', assignee: LEE, proj: 0, status: 'review',      priority: 'high',   week: thisWeek,  due: toStr(addDays(today, 2)) },
    { title: '모터 컨트롤러 배선도 작성',  desc: '48V BLDC 모터 컨트롤러 배선도 작성. 제조사 매뉴얼 기반 핀맵 확인 필요.',          assignee: PARK, proj: 0, status: 'in_progress', priority: 'high',   week: thisWeek,  due: toStr(addDays(today, 4)) },
    { title: '배터리 BMS CAN 통신 테스트', desc: 'BMS-VCU 간 CAN 2.0B 통신 검증. 250kbps 설정, DBC 파일 기반 디코딩 확인.',         assignee: LEE, proj: 0, status: 'pending',    priority: 'medium', week: nextWeek,  due: toStr(addDays(today, 9)) },
    { title: '항해등·비상등 회로 설계',     desc: '항해등(SOLAS 규정), 선실 조명, 비상등 회로 설계 및 부하 계산.',                    assignee: PARK, proj: 0, status: 'pending',    priority: 'low',    week: nextWeek,  due: null },
    { title: '배전반 제작 발주서 작성',     desc: '제작업체 견적 비교 완료. 발주서 작성 및 납기 일정 협의.',                          assignee: KIM,  proj: 0, status: 'pending',    priority: 'high',   week: thisWeek,  due: toStr(addDays(today, 3)) },
    { title: '충전시스템 최종 사양 확정',   desc: '3.3kW 온보드 차저 및 AC 220V 쇼어파워 커넥터 사양 확정 완료.',                     assignee: KIM,  proj: 0, status: 'done',       priority: 'medium', week: prev1Week, due: null },
    { title: '전력계통 단선도 Rev.2',       desc: '주전원 계통 단선도 Rev.2 작성 및 내부 검토 완료.',                                  assignee: LEE,  proj: 0, status: 'done',       priority: 'high',   week: prev1Week, due: null },

    // H2 하이브리드 프로젝트
    { title: '연료전지 스택 인터페이스 설계', desc: '수소연료전지 스택 ↔ DC 버스 인버터 전기 인터페이스 설계. 절연 요건 포함.', assignee: KIM,  proj: 1, status: 'in_progress', priority: 'high',   week: thisWeek,  due: toStr(addDays(today, 7)) },
    { title: 'DC-DC 컨버터 최종 선정',      desc: '48V→24V/12V 컨버터 3개 업체 견적 비교. 효율/납기/가격 종합 평가.',              assignee: JUNG, proj: 1, status: 'review',      priority: 'medium', week: thisWeek,  due: toStr(addDays(today, 2)) },
    { title: '하이브리드 전력관리 알고리즘', desc: '연료전지+리튬배터리 하이브리드 전력분배 로직 설계. 부하 추종 전략 포함.',        assignee: LEE,  proj: 1, status: 'pending',    priority: 'high',   week: nextWeek,  due: null },
    { title: '수소탱크 센서 계장도',         desc: '수소 압력·온도·농도(누출) 센서 배선 및 계장도(P&ID) 작성.',                     assignee: CHOI, proj: 1, status: 'in_progress', priority: 'high',   week: thisWeek,  due: toStr(addDays(today, 5)) },
    { title: '비상정지(E-Stop) 회로 설계',  desc: '수소 누출 감지 시 자동 차단 E-Stop 회로 설계. 안전 로직 IEC 60812 기준.',       assignee: CHOI, proj: 1, status: 'in_progress', priority: 'high',   week: thisWeek,  due: toStr(addDays(today, 3)) },
    { title: '추진모터 사양서 검토',         desc: '제조사 제출 추진모터 사양서(영문) 검토 및 요구사항 적합성 확인 완료.',          assignee: JUNG, proj: 1, status: 'done',       priority: 'low',    week: prev1Week, due: null },

    // 청안선 IoT 프로젝트
    { title: 'IoT 게이트웨이 설치 완료',    desc: '기관실 내 Raspberry Pi 기반 IoT 게이트웨이 설치 및 전원 연결 완료.',            assignee: HAN,  proj: 2, status: 'done',       priority: 'medium', week: prev1Week, due: null },
    { title: 'RS485 센서 데이터 파싱',       desc: 'RPM·냉각수온·유압 센서 RS485 Modbus RTU 데이터 수집 및 파싱 코드 작성.',       assignee: PARK, proj: 2, status: 'in_progress', priority: 'medium', week: thisWeek,  due: toStr(addDays(today, 5)) },
    { title: '실시간 모니터링 웹 대시보드',  desc: 'Chart.js 기반 실시간 데이터 시각화 웹 페이지 개발.',                            assignee: HAN,  proj: 2, status: 'pending',    priority: 'low',    week: nextWeek,  due: null },
    { title: 'LTE 원격 데이터 전송 테스트', desc: 'LTE 모뎀 설치 및 클라우드 서버 MQTT 전송 테스트 완료.',                         assignee: PARK, proj: 2, status: 'done',       priority: 'medium', week: prev2Week, due: null },

    // 12m 순찰선 프로젝트
    { title: '추진 시스템 배치 초안',        desc: '메인 엔진 + 보조 발전기 + 배터리 배치 초안 작성.',                              assignee: KANG, proj: 3, status: 'in_progress', priority: 'medium', week: thisWeek,  due: null },
    { title: '전장 계통 기본 구성안',        desc: '전원 계통 구성 및 부하 목록(Load List) 초안 작성.',                             assignee: LEE,  proj: 3, status: 'pending',    priority: 'medium', week: nextWeek,  due: null },

    // 공통 업무
    { title: '4월 정기 안전교육 자료 준비', desc: '전 직원 대상 선박 전기 안전 교육 자료 PPT 작성. 고압 취급 주의사항 포함.',       assignee: KIM,  proj: null, status: 'pending', priority: 'medium', week: nextWeek,  due: toStr(addDays(today, 10)) },
    { title: '기밀시험 장비 교정 의뢰',      desc: '연 1회 장비 교정 의뢰. 외부 기관 접수 완료.',                                   assignee: CHOI, proj: null, status: 'done',   priority: 'low',    week: prev2Week, due: null },
  ];

  for (const t of taskData) {
    await db.run(
      'INSERT INTO tasks (title,description,assignee_id,project_id,status,priority,due_date,target_week,sort_order) VALUES (?,?,?,?,?,?,?,?,?)',
      t.title, t.desc, t.assignee, t.proj !== null ? pids[t.proj] : null,
      t.status, t.priority, t.due || null, t.week, 0
    );
  }
  console.log(`  ✓ 작업 ${taskData.length}개 생성`);

  // ─── 회의 ─────────────────────────────────────────
  console.log('\n회의 생성 중...');
  const meetingData = [
    {
      type: 'weekly', date: lastMonStr, start: '08:30', end: '09:20',
      title: `주간회의 (${lastMon.getMonth()+1}월 ${Math.ceil(lastMon.getDate()/7)}주차)`,
      agenda: '1. 지난주 업무 결과 공유\n2. SM-300 배전반 설계 진행 현황\n3. H2 Boat 연료전지 인터페이스 착수 보고\n4. 청안선 IoT 게이트웨이 설치 일정',
      minutes: '■ SM-300\n- 전력계통 단선도 Rev.2 최종 승인\n- 배전반 3D 모델링 착수 (이준혁, 완료 목표 이번주)\n\n■ H2 Boat\n- 연료전지 스택 사양서 접수 완료\n- DC-DC 컨버터 업체 견적 요청 중 (3개 업체)\n\n■ 청안선 IoT\n- 게이트웨이 하드웨어 발주 완료, 배송 예정 수요일\n- 설치 일정: 목~금요일 현장 작업',
      decisions: '① SM-300 배전반 모델링 완료 후 목요일 기술검토 진행\n② H2 Boat DC-DC 컨버터 선정: 이번주 금요일까지\n③ 청안선 현장 작업 시 안전장비 착용 필수',
      attendees: [KIM, LEE, PARK, JUNG, CHOI, HAN, KANG],
    },
    {
      type: 'technical', date: lastThuStr, start: '10:00', end: '12:00',
      title: 'SM-300 전력계통 기술검토회의',
      agenda: '1. 전력계통 단선도 Rev.2 검토\n2. 배전반 설계 방향 논의\n3. BMS 통신 프로토콜 결정',
      minutes: '■ 전력계통 단선도\n- Rev.2 내용 검토 완료, 최종 승인\n- 수정사항: 비상정지 회로 분리 표기 추가\n\n■ 배전반 설계\n- IP54 방수 등급 확정\n- 주회로 차단기: 100A MCCB 선정\n- 제작사 3곳 비교 후 금주 발주 예정\n\n■ BMS 통신\n- CAN 2.0B, 250kbps 확정\n- DBC 파일 제조사에 요청 완료',
      decisions: '① 단선도 Rev.2 승인 — 이준혁 배포 담당\n② 배전반 제작 발주: 다음주 월요일\n③ BMS CAN 통신 테스트: 다음주부터 착수',
      attendees: [KIM, LEE, PARK, JUNG],
    },
    {
      type: 'weekly', date: thisMonStr, start: '08:30', end: '09:15',
      title: `주간회의 (${thisMon.getMonth()+1}월 ${Math.ceil(thisMon.getDate()/7)}주차)`,
      agenda: '1. 지난주 업무 결과 공유\n2. SM-300 배전반 제작 발주 진행\n3. H2 Boat 비상정지 회로 설계 현황\n4. 청안선 IoT 센서 파싱 결과\n5. 12m 순찰선 기본설계 착수 보고',
      minutes: '■ SM-300\n- 배전반 3D 모델링 완료, 목요일 기술회의에서 최종 검토 후 발주\n- 모터 컨트롤러 배선도 진행 중 (박서연, 70%)\n\n■ H2 Boat\n- 비상정지 회로 초안 완료 (최영진)\n- DC-DC 컨버터: A업체 선정 (납기 6주 확인 중)\n\n■ 청안선 IoT\n- 게이트웨이 설치 완료\n- RS485 파싱 코드 작성 중\n\n■ 12m 순찰선\n- 강도현 팀장 주도로 기본설계 착수\n- 추진 시스템 배치 초안 이번주 중 작성',
      decisions: '① SM-300 배전반 기술검토: 이번주 목요일 10시\n② H2 Boat DC-DC 컨버터 납기 리스크 → 김태호 업체 직접 미팅\n③ 청안선 IoT 대시보드 개발: 다음주부터',
      attendees: [KIM, LEE, PARK, JUNG, CHOI, HAN, KANG],
    },
    {
      type: 'technical', date: thisThuStr, start: '10:00', end: '12:00',
      title: 'SM-300 배전반 최종 검토회의',
      agenda: '1. 배전반 3D 모델링 최종 검토\n2. 제작 발주서 확인\n3. 납기 일정 및 설치 계획',
      minutes: '',
      decisions: '',
      attendees: [KIM, LEE, PARK, KANG],
    },
  ];

  for (const m of meetingData) {
    const r = await db.run(
      'INSERT INTO meetings (type,meeting_date,start_time,end_time,title,agenda,minutes,decisions,created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      m.type, m.date, m.start, m.end, m.title, m.agenda, m.minutes, m.decisions, adminId
    );
    for (const uid of m.attendees) {
      await db.run('INSERT OR IGNORE INTO meeting_attendees (meeting_id,user_id,confirmed) VALUES (?,?,?)',
        r.lastInsertRowid, uid, m.minutes ? 1 : 0);
    }
  }
  console.log(`  ✓ 회의 ${meetingData.length}개 생성`);

  // ─── 업무보고 ──────────────────────────────────────
  console.log('\n업무보고 생성 중...');
  const reportData = [
    // 오늘
    { user: KIM, date: d1,
      done: 'SM-300 배전반 3D 모델링 최종 검토 완료\nH2 Boat 연료전지 스택 인터페이스 설계 착수 (60% 진행)\nDC-DC 컨버터 A업체 미팅 일정 잡음',
      planned: 'SM-300 배전반 제작 발주서 작성\n연료전지 인터페이스 설계 계속\n이번주 목요일 기술검토회의 준비',
      special: 'H2 Boat DC-DC 컨버터 A업체 납기 6주 → 일정 촉박, 직접 미팅으로 4주 단축 협의 예정', safety: '' },
    { user: LEE, date: d1,
      done: 'SM-300 모터 컨트롤러 배선도 70% 작성\nBMS CAN 통신 테스트 환경 구성 (Vector CANalyzer 셋업)',
      planned: '배선도 완료 및 김태호 팀장 검토 요청\nCAN 통신 실제 데이터 수신 테스트',
      special: 'BMS 보드 1개 불량 발생 → 제조사 교체 요청 완료 (3일 내 수령 예정)', safety: '' },
    { user: PARK, date: d1,
      done: '청안선 RS485 Modbus RTU 센서 파싱 코드 작성 (Python)\n엔진 RPM·냉각수온 데이터 정상 수신 확인',
      planned: '유압 센서 데이터 파싱 마무리\nSM-300 항해등 회로 설계 착수',
      special: '', safety: '청안선 기관실 작업 중 환기 미흡 확인 → 환기팬 가동 후 작업 재개' },
    { user: JUNG, date: d1,
      done: 'DC-DC 컨버터 3개 업체 견적서 수령 및 비교 분석\nA업체 최종 선정 권고안 작성',
      planned: '컨버터 선정 결과 보고 (김태호 팀장)\n수소탱크 센서 계장도 지원',
      special: 'A업체 가격 최저, 납기 6주 → 납기 단축 가능 여부 업체 직접 문의 중', safety: '' },
    { user: CHOI, date: d1,
      done: 'H2 Boat 비상정지(E-Stop) 회로 설계 완료\n수소 누출 감지 센서 배선도 초안 작성',
      planned: 'E-Stop 회로 회로 시뮬레이션 검증\n계장도 계속 작성',
      special: '', safety: '수소 관련 설계 시 IEC 60079 방폭 기준 재확인 완료' },
    { user: HAN, date: d1,
      done: '청안선 IoT 게이트웨이 설치 완료 및 전원 확인\n게이트웨이 원격 접속 환경 구성',
      planned: '실시간 모니터링 웹 대시보드 설계(UI 와이어프레임)\n게이트웨이 자동 재시작 스크립트 작성',
      special: '', safety: '' },
    { user: KANG, date: d1,
      done: '12m 순찰선 추진 시스템 배치 초안 작성\n해경 요구사양서 분석 완료',
      planned: '추진 시스템 배치 2차 검토\n전장 계통 기본 구성안 착수',
      special: '해경 요구사항 중 예비 발전기 출력 기준 불명확 → 담당자 확인 중', safety: '' },

    // 어제
    { user: KIM, date: d2,
      done: 'SM-300 배전반 모델링 검토 중간 확인\nH2 Boat 연료전지 스택 사양서(영문) 검토',
      planned: '배전반 모델링 최종 검토\n연료전지 인터페이스 설계 착수',
      special: '', safety: '' },
    { user: LEE, date: d2,
      done: '배전반 3D 모델링 작업 (이준혁, 95% 완료)\nSM-300 배선 경로 검토',
      planned: '모델링 완료 및 팀장 검토 요청\nBMS CAN 테스트 환경 준비',
      special: '', safety: '' },
    { user: PARK, date: d2,
      done: '청안선 현장 방문 — IoT 센서 설치 위치 확인\nRS485 통신 라인 사전 점검',
      planned: 'RS485 파싱 코드 작성',
      special: '', safety: '현장 작업 전 안전교육 이수 확인' },
    { user: JUNG, date: d2,
      done: 'DC-DC 컨버터 업체 2곳 추가 견적 접수\n사양 비교표 작성',
      planned: '최종 업체 1곳 추가 견적 후 비교 완료',
      special: '', safety: '' },
    { user: CHOI, date: d2,
      done: 'H2 Boat 수소탱크 센서 종류 조사 및 사양서 수집\n비상정지 회로 설계 참고자료 조사',
      planned: 'E-Stop 회로 설계 착수',
      special: '', safety: '' },
    { user: HAN, date: d2,
      done: '청안선 기관실 IoT 게이트웨이 현장 설치\n전원 배선 연결 및 부팅 확인',
      planned: '원격 접속 및 통신 확인',
      special: '설치 중 전원 단자 규격 불일치 → 현장에서 어댑터 제작하여 해결', safety: '' },

    // 그제
    { user: KIM, date: d3,
      done: '주간회의 주재 및 회의록 작성\n12m 순찰선 요구사양서 1차 검토',
      planned: 'SM-300 배전반 중간 검토', special: '', safety: '' },
    { user: LEE, date: d3,
      done: '배전반 3D 모델링 착수 (40%)\nSM-300 전력계통 단선도 최종본 배포',
      planned: '모델링 계속 진행', special: '', safety: '' },
    { user: JUNG, date: d3,
      done: 'H2 Boat DC-DC 컨버터 국내 공급사 조사 (5개사)',
      planned: '주요 3개 업체에 견적 요청',
      special: '기존 거래처 E업체 해당 제품 단종 확인 → 신규 업체 발굴 필요', safety: '' },

    // 지난주
    { user: KIM,  date: d4, done: 'SM-300 충전시스템 최종 사양 확정\nH2 Boat 착수 킥오프 준비', planned: '배전반 모델링 착수 지시', special: '', safety: '' },
    { user: LEE,  date: d4, done: 'SM-300 전력계통 단선도 Rev.2 완성\n사내 검토 후 팀장 승인 득', planned: '배전반 3D 모델링', special: '', safety: '' },
    { user: PARK, date: d4, done: 'LTE 모뎀 클라우드 전송 테스트 완료\nMQTT 연결 안정성 24시간 확인', planned: '현장 게이트웨이 설치 준비', special: '', safety: '' },
    { user: JUNG, date: d5, done: 'H2 Boat 추진모터 사양서 검토 완료\n적합성 검토 의견서 작성', planned: 'DC-DC 컨버터 조사', special: '', safety: '' },
    { user: CHOI, date: d5, done: '기밀시험 장비 교정 의뢰 완료\n수소 센서 관련 국제 규격 조사', planned: 'H2 Boat 설계 지원', special: '', safety: '' },
  ];

  for (const r of reportData) {
    await db.run(
      'INSERT OR IGNORE INTO daily_reports (user_id,report_date,work_done,work_planned,special_notes,safety_notes) VALUES (?,?,?,?,?,?)',
      r.user, r.date, r.done, r.planned, r.special, r.safety
    );
  }
  console.log(`  ✓ 업무보고 ${reportData.length}개 생성`);

  // ─── 공지사항 ──────────────────────────────────────
  console.log('\n공지사항 생성 중...');
  const noticeData = [
    {
      title: '[필독] 4월 정기 안전교육 일정 안내',
      content: '전 직원 대상 정기 안전교육을 아래와 같이 실시합니다.\n\n■ 일시: 4월 넷째 주 금요일 14:00~16:00\n■ 장소: 2층 대회의실\n■ 내용: 선박 전기설비 안전 취급, 수소 가스 누출 대응, 소화기 사용법\n\n전 직원 필수 참석. 불가피한 사정 시 김태호 팀장에게 사전 보고 바랍니다.',
      pinned: 1, author: KIM,
    },
    {
      title: 'SM-300 배전반 제작 발주 일정 공지',
      content: '■ 배전반 3D 모델링 검토: 이번주 목요일 10:00\n■ 검토 완료 후 발주서 확정: 목요일 오후\n■ 제작업체 발주: 금요일 오전\n■ 납기 예정: 약 4주 후\n\n관련 부서(전기팀)는 목요일 기술검토회의 참석 바랍니다.',
      pinned: 1, author: KIM,
    },
    {
      title: '사무실 주차 관련 안내',
      content: '방문객 주차 공간 확보를 위해 직원 차량은 B동 주차장을 이용해 주세요.\n지정 구역 외 주차 시 이동 조치될 수 있습니다.',
      pinned: 0, author: adminId,
    },
    {
      title: '소모품·비품 신청 방법 안내',
      content: '소모품 및 비품 신청은 매주 금요일 오전까지 한소희 담당자에게 요청하세요.\n\n■ 신청 방법: 포털 내 건의/요청 게시판 또는 직접 전달\n■ 지급일: 다음 주 월요일\n\n긴급 요청 시 김태호 팀장 승인 후 당일 처리 가능합니다.',
      pinned: 0, author: HAN,
    },
    {
      title: '연구소 네트워크 점검 안내 (3/21 금 오후)',
      content: '네트워크 장비 정기 점검으로 인해 인터넷 및 사내 시스템 일시 중단됩니다.\n\n■ 일시: 금요일 오후 17:00~18:00\n■ 영향: 인터넷, 업무 포털, 공용 프린터\n\n중요 업무는 점검 전 완료해 주시기 바랍니다.',
      pinned: 0, author: adminId,
    },
  ];

  for (const n of noticeData) {
    await db.run('INSERT INTO notices (title,content,author_id,is_pinned) VALUES (?,?,?,?)',
      n.title, n.content, n.author, n.pinned);
  }
  console.log(`  ✓ 공지사항 ${noticeData.length}개 생성`);

  // ─── 근무 상태 ─────────────────────────────────────
  console.log('\n근무 상태 생성 중...');
  const statusData = [
    { user: KIM,  status: 'office',  note: '' },
    { user: LEE,  status: 'office',  note: '' },
    { user: PARK, status: 'outside', note: '청안선 현장 데이터 확인' },
    { user: JUNG, status: 'meeting', note: 'DC-DC 컨버터 업체 미팅 (오전)' },
    { user: CHOI, status: 'office',  note: '' },
    { user: HAN,  status: 'remote',  note: '재택근무 (IoT 대시보드 개발)' },
    { user: KANG, status: 'office',  note: '' },
  ];
  for (const s of statusData) {
    await db.run('INSERT INTO user_status (user_id,status_date,status,note) VALUES (?,?,?,?)',
      s.user, todayStr, s.status, s.note);
  }
  console.log(`  ✓ 근무 상태 ${statusData.length}명 설정`);

  // ─── 건의사항 ──────────────────────────────────────
  console.log('\n건의사항 생성 중...');
  const suggestionData = [
    {
      title: '설계 도면 버전 관리 시스템 도입 건의',
      content: '현재 도면 파일을 개인 PC에 보관하다 보니 최신 버전 공유가 늦어지는 문제가 있습니다.\nGit 또는 PDM 시스템 도입을 건의합니다.\n\n- 예상 효과: 버전 충돌 방지, 이력 추적 가능\n- 제안 도구: Git LFS, Autodesk Vault 등',
      category: 'improvement', author: LEE, anon: 0,
      reply: '좋은 제안입니다. 4월 중 PDM 솔루션 비교 검토 후 도입 여부 결정하겠습니다. — 김태호 팀장',
      likes: [KIM, PARK, JUNG, KANG, HAN],
    },
    {
      title: '연구소 탁구대 또는 간단한 운동 기구 설치 요청',
      content: '장시간 앉아서 작업하는 경우가 많아 스트레칭 공간이나 소형 운동 기구가 있으면 좋겠습니다.\n휴게실 한쪽에 탁구대나 요가 매트 정도라도 있으면 집중력 향상에 도움이 될 것 같습니다.',
      category: 'general', author: PARK, anon: 0,
      reply: '',
      likes: [LEE, CHOI, HAN, KANG],
    },
    {
      title: '야근 시 야식/간식비 지원 요청',
      content: '프로젝트 납기 전 야근이 잦은데, 간단한 식비 지원이 있으면 사기 진작에 도움이 될 것 같습니다.\n월 1~2만원 수준의 간식비 지원 또는 야식 주문 지원을 건의드립니다.',
      category: 'welfare', author: CHOI, anon: 1,
      reply: '복리후생 개선 방향으로 검토하겠습니다. 인사팀에 의견 전달하였습니다.',
      likes: [LEE, PARK, HAN, JUNG, KANG],
    },
    {
      title: '기술 세미나/사내 강의 정기 개최 건의',
      content: '각 팀별로 전문 분야 지식을 공유하는 월 1회 사내 기술 세미나를 개최하면 어떨까요?\n예) 전기팀: 선박 전기 규격(IEC 60092), 기관팀: 추진 시스템 트렌드, 설계팀: 3D CAD 팁\n\n지식 공유와 팀 간 소통에도 도움이 될 것 같습니다.',
      category: 'improvement', author: HAN, anon: 0,
      reply: '',
      likes: [KIM, LEE, PARK, JUNG, KANG],
    },
  ];

  for (const s of suggestionData) {
    const r = await db.run(
      'INSERT INTO suggestions (title,content,category,author_id,status,admin_reply,is_anonymous) VALUES (?,?,?,?,?,?,?)',
      s.title, s.content, s.category, s.author,
      s.reply ? 'reviewed' : 'open', s.reply, s.anon
    );
    for (const uid of s.likes) {
      await db.run('INSERT OR IGNORE INTO suggestion_likes (suggestion_id,user_id) VALUES (?,?)',
        r.lastInsertRowid, uid);
    }
  }
  console.log(`  ✓ 건의사항 ${suggestionData.length}개 생성`);

  // ─── 투표 ──────────────────────────────────────────
  console.log('\n투표 생성 중...');
  // 1. 점심 투표
  const lunchPoll = await db.run('INSERT INTO lunch_polls (poll_date,title,created_by) VALUES (?,?,?)',
    todayStr, '오늘 점심 메뉴 투표', KIM);
  const lunchOptNames = ['중국집 (짜장·짬뽕)', '한식 (백반)', '일식 (라멘)', '분식 (국밥)', '양식 (파스타)'];
  const lunchOptIds = [];
  for (const name of lunchOptNames) {
    const r = await db.run('INSERT INTO lunch_options (poll_id,name) VALUES (?,?)', lunchPoll.lastInsertRowid, name);
    lunchOptIds.push(r.lastInsertRowid);
  }
  const lunchVotes = [[0, KIM],[0, PARK],[1, LEE],[1, CHOI],[2, JUNG],[3, HAN],[0, KANG]];
  for (const [oi, uid] of lunchVotes) {
    await db.run('INSERT OR IGNORE INTO lunch_votes (option_id,user_id) VALUES (?,?)', lunchOptIds[oi], uid);
  }

  // 2. 일반 투표 - 회식 장소
  const pollR1 = await db.run(
    'INSERT INTO polls (title,description,category,allow_multiple,is_anonymous,deadline,created_by,status) VALUES (?,?,?,?,?,?,?,?)',
    '이번 달 회식 장소 선정', '3월 회식 장소를 투표로 결정합니다. 편하게 선택해 주세요!',
    'general', 0, 0, toStr(addDays(today, 3)), KIM, 'active'
  );
  const p1opts = ['이자카야 (일식 술집)', '고기집 (삼겹살)', '해산물 횟집', '중식당 (코스)'];
  const p1optIds = [];
  for (const t of p1opts) {
    const r = await db.run('INSERT INTO poll_options (poll_id,text) VALUES (?,?)', pollR1.lastInsertRowid, t);
    p1optIds.push(r.lastInsertRowid);
  }
  const p1votes = [[0,KIM],[1,LEE],[1,PARK],[0,JUNG],[2,CHOI],[1,HAN],[0,KANG]];
  for (const [oi, uid] of p1votes) {
    await db.run('INSERT OR IGNORE INTO poll_votes (option_id,user_id) VALUES (?,?)', p1optIds[oi], uid);
  }

  // 3. 일반 투표 - 복지 제도
  const pollR2 = await db.run(
    'INSERT INTO polls (title,description,category,allow_multiple,is_anonymous,deadline,created_by,status) VALUES (?,?,?,?,?,?,?,?)',
    '다음 복지 개선 우선순위', '직원 복지 향상을 위해 가장 원하는 항목을 선택해 주세요. (중복 선택 가능)',
    'welfare', 1, 1, toStr(addDays(today, 7)), adminId, 'active'
  );
  const p2opts = ['유연근무제 도입', '간식·커피 지원', '도서 구입비 지원', '외부 교육·세미나 지원', '건강검진 항목 확대'];
  const p2optIds = [];
  for (const t of p2opts) {
    const r = await db.run('INSERT INTO poll_options (poll_id,text) VALUES (?,?)', pollR2.lastInsertRowid, t);
    p2optIds.push(r.lastInsertRowid);
  }
  const p2votes = [[0,KIM],[1,KIM],[3,KIM],[0,LEE],[2,LEE],[3,LEE],[0,PARK],[1,PARK],[1,JUNG],[3,JUNG],[4,JUNG],[0,CHOI],[4,CHOI],[1,HAN],[2,HAN],[0,KANG],[3,KANG]];
  for (const [oi, uid] of p2votes) {
    await db.run('INSERT OR IGNORE INTO poll_votes (option_id,user_id) VALUES (?,?)', p2optIds[oi], uid);
  }
  console.log('  ✓ 점심투표 1개, 일반투표 2개 생성');

  // ─── 완료 ──────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log('✅ 예시 데이터 삽입 완료!\n');
  console.log('── 로그인 계정 ──────────────────────────');
  console.log('  admin   / admin1234  (시스템 관리자)');
  userData.forEach(u => console.log(`  ${u.user.padEnd(8)}/ ${u.pw.padEnd(10)} (${u.name} · ${u.dept} ${u.pos})`));
  console.log('─'.repeat(42));
}

seed().catch(err => {
  console.error('\n❌ 시드 실패:', err);
  process.exit(1);
});
