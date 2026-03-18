// 더미 데이터 시드 스크립트
// 실행: node seed.js

const db = require('./database/db');
const bcrypt = require('bcryptjs');

const hash = (pw) => bcrypt.hashSync(pw, 10);

async function seed() {
  console.log('DB 초기화...');
  await db.init();
  console.log('더미 데이터 삽입 시작...');

  // ===== 사용자 =====
  const users = [
    { name: '김태호', dept: '전기팀', pos: '팀장', user: 'thkim', pw: '1234', admin: 1 },
    { name: '이준혁', dept: '전기팀', pos: '선임', user: 'jhlee', pw: '1234', admin: 0 },
    { name: '박서연', dept: '전기팀', pos: '담당', user: 'sypark', pw: '1234', admin: 0 },
    { name: '정민수', dept: '기관팀', pos: '팀장', user: 'msjung', pw: '1234', admin: 0 },
    { name: '최영진', dept: '기관팀', pos: '선임', user: 'yjchoi', pw: '1234', admin: 0 },
    { name: '한소희', dept: '설계팀', pos: '담당', user: 'shhan', pw: '1234', admin: 0 },
  ];

  const userIds = [];
  for (const u of users) {
    const exists = await db.get('SELECT id FROM users WHERE username=?', u.user);
    if (!exists) {
      const r = await db.run('INSERT INTO users (name,department,position,username,password,is_admin) VALUES (?,?,?,?,?,?)',
        u.name, u.dept, u.pos, u.user, hash(u.pw), u.admin);
      userIds.push(r.lastInsertRowid);
      console.log(`  사용자: ${u.name} (${u.user})`);
    } else {
      userIds.push(exists.id);
    }
  }

  const adminUser = await db.get('SELECT id FROM users WHERE username=?', 'admin');
  const adminId = adminUser ? adminUser.id : userIds[0];

  // ===== 프로젝트 =====
  const projects = [
    { name: 'SM-300 (4.5m LSV)', desc: 'SM-300 4.5m 소형 저속 전기추진선 전장 설계 및 제작', start: '2026-01-06', end: '2026-05-30', status: 'active' },
    { name: '7.7m H₂ Boat', desc: '7.7m 수소연료전지 하이브리드 선박 전기시스템 통합', start: '2026-02-10', end: '2026-06-30', status: 'active' },
    { name: '청안선 IoT 모니터링', desc: '청안선 원격 모니터링 IoT 시스템 개발 및 설치', start: '2026-01-20', end: '2026-04-15', status: 'active' },
  ];

  const projIds = [];
  for (const p of projects) {
    const exists = await db.get('SELECT id FROM projects WHERE name=?', p.name);
    if (!exists) {
      const r = await db.run('INSERT INTO projects (name,description,start_date,end_date,status,progress,created_by) VALUES (?,?,?,?,?,?,?)',
        p.name, p.desc, p.start, p.end, p.status, 0, adminId);
      projIds.push(r.lastInsertRowid);
      console.log(`  프로젝트: ${p.name}`);
    } else {
      projIds.push(exists.id);
    }
  }

  // 프로젝트 멤버
  const memberMap = [[0,[0,1,2]], [1,[0,1,3,4]], [2,[0,2,5]]];
  for (const [pi, uis] of memberMap) {
    for (const ui of uis) {
      try {
        await db.run('INSERT OR IGNORE INTO project_members (project_id,user_id,role) VALUES (?,?,?)', projIds[pi], userIds[ui], '참여');
      } catch(e) {}
    }
  }

  // ===== ISO 주차 =====
  function getWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const thisWeek = getWeekKey(today);
  const nextDate = new Date(today); nextDate.setDate(today.getDate() + 7);
  const nextWeek = getWeekKey(nextDate);
  const prevDate = new Date(today); prevDate.setDate(today.getDate() - 7);
  const prevWeek = getWeekKey(prevDate);
  const next2Date = new Date(today); next2Date.setDate(today.getDate() + 14);
  const next2Week = getWeekKey(next2Date);

  // ===== 작업 (칸반 카드) =====
  const tasks = [
    { title: '배전반 3D 모델링', desc: 'SM-300 메인 배전반 3D 설계 완료 및 검토', assignee: 1, proj: 0, status: 'in_progress', priority: 'high', week: thisWeek },
    { title: '모터 컨트롤러 배선도', desc: '48V BLDC 모터 컨트롤러 배선도 작성', assignee: 2, proj: 0, status: 'in_progress', priority: 'high', week: thisWeek },
    { title: '배터리 BMS 통신 테스트', desc: 'CAN 통신 프로토콜 검증 및 데이터 로깅', assignee: 1, proj: 0, status: 'pending', priority: 'medium', week: nextWeek },
    { title: '조명 회로 설계', desc: '항해등, 선실등, 비상등 회로 설계', assignee: 2, proj: 0, status: 'pending', priority: 'low', week: nextWeek },
    { title: '충전시스템 사양 검토', desc: 'AC 220V 온보드 차저 사양 비교 및 선정', assignee: 0, proj: 0, status: 'done', priority: 'medium', week: prevWeek },
    { title: '전력계통 단선도 작성', desc: '메인 전력 계통 단선도 Rev.2 작성 완료', assignee: 1, proj: 0, status: 'done', priority: 'high', week: prevWeek },
    { title: '연료전지 스택 인터페이스', desc: '수소연료전지 스택-인버터 간 전기 인터페이스 설계', assignee: 0, proj: 1, status: 'in_progress', priority: 'high', week: thisWeek },
    { title: 'DC-DC 컨버터 선정', desc: '48V→24V, 48V→12V DC-DC 컨버터 사양 비교', assignee: 3, proj: 1, status: 'pending', priority: 'medium', week: thisWeek },
    { title: '하이브리드 전력관리 로직', desc: '연료전지+배터리 하이브리드 전력분배 알고리즘 설계', assignee: 1, proj: 1, status: 'pending', priority: 'high', week: next2Week },
    { title: '수소탱크 센서 배선', desc: '수소 압력/온도/누출 센서 배선 및 계장도 작성', assignee: 4, proj: 1, status: 'pending', priority: 'medium', week: nextWeek },
    { title: '비상정지 회로 설계', desc: 'E-Stop 회로 설계 (수소누출 감지 연동)', assignee: 4, proj: 1, status: 'in_progress', priority: 'high', week: thisWeek },
    { title: '추진모터 사양서 접수', desc: '제조사 모터 사양서 접수 및 검토 완료', assignee: 3, proj: 1, status: 'done', priority: 'low', week: prevWeek },
    { title: 'IoT 게이트웨이 설치', desc: '청안선 기관실 IoT 게이트웨이 하드웨어 설치 및 전원 연결', assignee: 5, proj: 2, status: 'in_progress', priority: 'medium', week: thisWeek },
    { title: '엔진 센서 데이터 수집', desc: 'RPM, 냉각수온, 유압 센서 RS485 데이터 파싱', assignee: 2, proj: 2, status: 'pending', priority: 'medium', week: nextWeek },
    { title: '대시보드 UI 개발', desc: '웹 기반 실시간 모니터링 대시보드 프론트엔드', assignee: 5, proj: 2, status: 'pending', priority: 'low', week: next2Week },
    { title: 'LTE 모뎀 통신 테스트', desc: 'LTE 모뎀 설치 및 원격 데이터 전송 테스트 완료', assignee: 2, proj: 2, status: 'done', priority: 'medium', week: prevWeek },
    { title: 'Leak Test 장비 점검', desc: '기밀시험 장비 교정 및 점검 일정 확인', assignee: 4, proj: null, status: 'pending', priority: 'low', week: '' },
    { title: '안전교육 자료 준비', desc: '3월 정기 안전교육 발표 자료 준비', assignee: 0, proj: null, status: 'pending', priority: 'medium', week: '' },
  ];

  for (const t of tasks) {
    const aId = t.assignee !== null ? userIds[t.assignee] : null;
    const pId = t.proj !== null ? projIds[t.proj] : null;
    await db.run('INSERT INTO tasks (title,description,assignee_id,project_id,status,priority,due_date,target_week,sort_order) VALUES (?,?,?,?,?,?,?,?,?)',
      t.title, t.desc, aId, pId, t.status, t.priority, null, t.week, 0);
  }
  console.log(`  작업 ${tasks.length}개 추가`);

  // ===== 회의 =====
  const lastMon = new Date(today);
  lastMon.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
  const lastMonStr = lastMon.toISOString().split('T')[0];
  const lastThu = new Date(lastMon); lastThu.setDate(lastMon.getDate() + 3);
  const lastThuStr = lastThu.toISOString().split('T')[0];
  const thisMon = new Date(today); thisMon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const thisMonStr = thisMon.toISOString().split('T')[0];

  const meetings = [
    { type: 'weekly', date: lastMonStr, start: '08:30', end: '09:30', title: `${lastMon.getMonth()+1}월 ${Math.ceil(lastMon.getDate()/7)}주차 주간회의`,
      agenda: '1. 지난주 업무 공유\n2. SM-300 배전반 설계 진행 현황\n3. H2 Boat 연료전지 인터페이스 논의',
      minutes: '- SM-300 배전반 3D 모델링 80% 완료\n- H2 Boat DC-DC 컨버터 3개 업체 비교 중\n- 청안선 IoT 게이트웨이 설치 일정 확정',
      decisions: '- SM-300 배전반 검토회의: 수요일 14시\n- H2 Boat DC-DC 컨버터: 다음주까지 최종 선정' },
    { type: 'technical', date: lastThuStr, start: '10:00', end: '12:00', title: 'SM-300 전력계통 기술검토',
      agenda: '1. 전력계통 단선도 검토\n2. BMS 통신 프로토콜 논의',
      minutes: '- 전력계통 단선도 Rev.2 최종 승인\n- BMS CAN 통신: 250kbps 확정\n- 충전기: 3.3kW 온보드 차저 선정',
      decisions: '- 단선도 Rev.2 승인, 배전반 제작 진행\n- BMS 통신 테스트: 다음주부터' },
    { type: 'weekly', date: thisMonStr, start: '08:30', end: '09:30', title: `${thisMon.getMonth()+1}월 ${Math.ceil(thisMon.getDate()/7)}주차 주간회의`,
      agenda: '1. 지난주 업무 공유\n2. SM-300 배전반 모델링 검토\n3. H2 Boat 비상정지 회로 설계',
      minutes: '- SM-300 배전반 3D 모델링 완료, 제작 발주 준비\n- H2 Boat 비상정지 회로 초안 완료\n- 청안선 IoT 게이트웨이 설치 완료',
      decisions: '- SM-300 배전반 제작 발주: 이번주 수요일\n- H2 Boat 비상정지 회로: 목요일 기술회의에서 상세 검토' },
  ];

  for (const m of meetings) {
    const r = await db.run('INSERT INTO meetings (type,meeting_date,start_time,end_time,title,agenda,minutes,decisions,created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      m.type, m.date, m.start, m.end, m.title, m.agenda, m.minutes, m.decisions, adminId);
    const mId = r.lastInsertRowid;
    for (const uid of userIds) {
      try {
        await db.run('INSERT OR IGNORE INTO meeting_attendees (meeting_id,user_id,confirmed) VALUES (?,?,?)',
          mId, uid, Math.random() > 0.3 ? 1 : 0);
      } catch(e) {}
    }
  }
  console.log(`  회의 ${meetings.length}개 추가`);

  // ===== 업무보고 =====
  const prevDay = new Date(today); prevDay.setDate(today.getDate() - 1);
  while (prevDay.getDay() === 0 || prevDay.getDay() === 6) prevDay.setDate(prevDay.getDate() - 1);
  const prevDayStr = prevDay.toISOString().split('T')[0];

  const reports = [
    { user: 0, date: todayStr, done: 'SM-300 배전반 3D 모델링 최종 검토 완료\nH2 Boat 연료전지 스택 인터페이스 설계 60% 진행', planned: '배전반 제작 발주서 작성\n연료전지 인터페이스 설계 마무리', special: '', safety: '' },
    { user: 1, date: todayStr, done: 'SM-300 모터 컨트롤러 배선도 작성 중 (70%)\nBMS CAN 통신 테스트 환경 셋업', planned: '배선도 완료 및 검토 요청\nCAN 통신 실제 테스트 시작', special: 'BMS 보드 1개 불량 → 제조사 교체 요청', safety: '' },
    { user: 2, date: todayStr, done: '청안선 IoT 센서 데이터 파싱 코드 작성\nSM-300 조명회로 설계 자료 조사', planned: 'RS485 데이터 수집 테스트\n조명회로 초안 작성', special: '', safety: '청안선 기관실 작업 시 안전모/안전화 착용 확인' },
    { user: 3, date: todayStr, done: 'H2 Boat DC-DC 컨버터 업체 3곳 견적 비교', planned: 'DC-DC 컨버터 최종 선정 보고', special: '컨버터 A업체 납기 6주 → 일정 촉박', safety: '' },
    { user: 0, date: prevDayStr, done: 'SM-300 배전반 모델링 수정\n주간회의 참석 및 회의록 작성', planned: '배전반 최종 검토', special: '', safety: '' },
    { user: 1, date: prevDayStr, done: 'SM-300 전력계통 단선도 Rev.2 수정 완료', planned: '모터 컨트롤러 배선도 착수', special: '', safety: '' },
  ];

  for (const r of reports) {
    try {
      const existing = await db.get('SELECT id FROM daily_reports WHERE user_id=? AND report_date=?', userIds[r.user], r.date);
      if (existing) {
        await db.run('UPDATE daily_reports SET work_done=?, work_planned=?, special_notes=?, safety_notes=? WHERE id=?',
          r.done, r.planned, r.special, r.safety, existing.id);
      } else {
        await db.run('INSERT INTO daily_reports (user_id,report_date,work_done,work_planned,special_notes,safety_notes) VALUES (?,?,?,?,?,?)',
          userIds[r.user], r.date, r.done, r.planned, r.special, r.safety);
      }
    } catch(e) {}
  }
  console.log(`  업무보고 ${reports.length}개 추가`);

  // ===== 공지사항 =====
  const notices = [
    { title: '3월 정기 안전교육 안내', content: '일시: 3월 넷째주 금요일 14:00~16:00\n장소: 2층 회의실\n\n전 직원 필수 참석', pinned: 1 },
    { title: 'SM-300 배전반 제작 발주 일정', content: '배전반 3D 모델링 검토 완료 후 제작 발주 예정\n- 검토 완료: 이번주 수요일\n- 발주 예정: 이번주 금요일', pinned: 1 },
    { title: '사무실 에어컨 점검 안내', content: '3월 20일(금) 오후 에어컨 정기 점검', pinned: 0 },
    { title: '비품 신청 안내', content: '매주 금요일까지 한소희 담당자에게 요청', pinned: 0 },
  ];

  for (const n of notices) {
    await db.run('INSERT INTO notices (title,content,author_id,is_pinned) VALUES (?,?,?,?)',
      n.title, n.content, adminId, n.pinned ? 1 : 0);
  }
  console.log(`  공지사항 ${notices.length}개 추가`);

  // ===== 근무 상태 =====
  const statusData = [
    { user: 0, status: 'office', note: '' },
    { user: 1, status: 'office', note: '' },
    { user: 2, status: 'outside', note: '청안선 현장 작업' },
    { user: 3, status: 'meeting', note: 'DC-DC 컨버터 업체 미팅' },
    { user: 4, status: 'office', note: '' },
    { user: 5, status: 'remote', note: '재택근무 (도면 작업)' },
  ];

  for (const s of statusData) {
    try {
      const existing = await db.get('SELECT id FROM user_status WHERE user_id=? AND status_date=?', userIds[s.user], todayStr);
      if (!existing) {
        await db.run('INSERT INTO user_status (user_id, status_date, status, note) VALUES (?,?,?,?)',
          userIds[s.user], todayStr, s.status, s.note);
      }
    } catch(e) {}
  }
  console.log(`  근무상태 ${statusData.length}개 추가`);

  // ===== 점심 투표 =====
  const existingPoll = await db.get('SELECT id FROM lunch_polls WHERE poll_date = ?', todayStr);
  if (!existingPoll) {
    const pollResult = await db.run('INSERT INTO lunch_polls (poll_date, title, created_by) VALUES (?,?,?)',
      todayStr, '점심 메뉴 투표', adminId);
    const pollId = pollResult.lastInsertRowid;

    const lunchOptions = ['중국집 (짜장면)', '일식 (초밥)', '한식 (감자탕)', '양식 (파스타)', '분식 (떡볶이)'];
    const optIds = [];
    for (const opt of lunchOptions) {
      const r = await db.run('INSERT INTO lunch_options (poll_id, name) VALUES (?,?)', pollId, opt);
      optIds.push(r.lastInsertRowid);
    }

    try {
      await db.run('INSERT INTO lunch_votes (option_id, user_id) VALUES (?,?)', optIds[0], userIds[0]);
      await db.run('INSERT INTO lunch_votes (option_id, user_id) VALUES (?,?)', optIds[2], userIds[1]);
      await db.run('INSERT INTO lunch_votes (option_id, user_id) VALUES (?,?)', optIds[0], userIds[2]);
      await db.run('INSERT INTO lunch_votes (option_id, user_id) VALUES (?,?)', optIds[3], userIds[3]);
      await db.run('INSERT INTO lunch_votes (option_id, user_id) VALUES (?,?)', optIds[2], userIds[4]);
    } catch(e) {}
    console.log('  점심 투표 추가');
  }

  console.log('\n✅ 더미 데이터 삽입 완료!');
  console.log('\n로그인 계정:');
  console.log('  admin / admin1234 (관리자)');
  users.forEach(u => console.log(`  ${u.user} / ${u.pw} (${u.name})`));
}

seed().catch(err => { console.error('시드 실패:', err); process.exit(1); });
