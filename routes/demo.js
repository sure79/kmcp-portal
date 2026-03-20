const express = require('express');
const router = express.Router();
const db = require('../database/db');
const bcrypt = require('bcryptjs');

const hash = (pw) => bcrypt.hashSync(pw, 10);

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function toStr(d) { return d.toISOString().split('T')[0]; }
function prevWeekday(date, offset = 0) {
  const d = new Date(date); d.setDate(d.getDate() - offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}
function getWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - y) / 86400000) + 1) / 7)).padStart(2, '0')}`;
}

// 관리자만 접근 가능
router.post('/reset', async (req, res) => {
  const isAdmin = req.session?.user?.is_admin || req.session?.isAdmin;
  if (!isAdmin) return res.status(403).json({ error: '관리자만 사용 가능합니다.' });

  try {
    // ── 기존 데이터 삭제 ──────────────────────────
    const tables = [
      'poll_votes','poll_options','polls',
      'suggestion_likes','suggestions',
      'lunch_votes','lunch_options','lunch_polls',
      'user_status','meeting_attendees','meetings',
      'daily_reports','tasks','project_members','projects',
      'notices','activity_log',
    ];
    for (const t of tables) await db.run(`DELETE FROM ${t}`).catch(() => {});
    await db.run("DELETE FROM users WHERE username != 'admin'").catch(() => {});

    const adminRow = await db.get("SELECT id FROM users WHERE username='admin'");
    const adminId = adminRow.id;

    // ── 날짜 기준 ──────────────────────────────────
    const today = new Date();
    const todayStr = toStr(today);
    const thisWeek = getWeekKey(today);
    const nextWeek = getWeekKey(addDays(today, 7));
    const prev1Week = getWeekKey(addDays(today, -7));
    const thisMon = new Date(today);
    thisMon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const lastMon = addDays(thisMon, -7);
    const lastThu = addDays(lastMon, 3);
    const d1 = toStr(prevWeekday(today, 0));
    const d2 = toStr(prevWeekday(today, 1));
    const d3 = toStr(prevWeekday(today, 2));

    // ── 사용자 7명 ─────────────────────────────────
    const uData = [
      { name:'김태호', dept:'전기팀',   pos:'팀장',      user:'thkim',  pw:'1234', admin:1 },
      { name:'이준혁', dept:'전기팀',   pos:'선임연구원', user:'jhlee',  pw:'1234', admin:0 },
      { name:'박서연', dept:'전기팀',   pos:'연구원',    user:'sypark', pw:'1234', admin:0 },
      { name:'정민수', dept:'기관팀',   pos:'팀장',      user:'msjung', pw:'1234', admin:0 },
      { name:'최영진', dept:'기관팀',   pos:'선임연구원', user:'yjchoi', pw:'1234', admin:0 },
      { name:'한소희', dept:'설계팀',   pos:'연구원',    user:'shhan',  pw:'1234', admin:0 },
      { name:'강도현', dept:'설계팀',   pos:'팀장',      user:'dhkang', pw:'1234', admin:0 },
    ];
    const uids = [];
    for (const u of uData) {
      const r = await db.run(
        'INSERT INTO users (name,department,position,username,password,is_admin,is_approved) VALUES (?,?,?,?,?,?,?)',
        u.name, u.dept, u.pos, u.user, hash(u.pw), u.admin, 1
      );
      uids.push(r.lastInsertRowid);
    }
    const [KIM,LEE,PARK,JUNG,CHOI,HAN,KANG] = uids;

    // ── 프로젝트 3개 ───────────────────────────────
    const pData = [
      { name:'SM-300 전기추진선 전장 설계', desc:'4.5m 소형 전기추진선(LSV) 배전반·BMS·모터 컨트롤러 설계 및 제작 지원', start:toStr(addDays(today,-70)), end:toStr(addDays(today,71)),  progress:45 },
      { name:'7.7m 수소연료전지 하이브리드 선박', desc:'수소연료전지+리튬배터리 하이브리드 전기추진 시스템 개발', start:toStr(addDays(today,-40)), end:toStr(addDays(today,102)), progress:28 },
      { name:'청안선 IoT 원격 모니터링',   desc:'기관실 IoT 센서 게이트웨이 설치 및 실시간 모니터링 웹 시스템 구축',   start:toStr(addDays(today,-50)), end:toStr(addDays(today,26)),  progress:65 },
    ];
    const pids = [];
    for (const p of pData) {
      const r = await db.run(
        'INSERT INTO projects (name,description,start_date,end_date,status,progress,created_by) VALUES (?,?,?,?,?,?,?)',
        p.name, p.desc, p.start, p.end, 'active', p.progress, adminId
      );
      pids.push(r.lastInsertRowid);
    }
    for (const [pi,members] of [[0,[KIM,LEE,PARK]],[1,[KIM,LEE,JUNG,CHOI]],[2,[PARK,HAN,KANG]]]) {
      for (const uid of members)
        await db.run('INSERT OR IGNORE INTO project_members (project_id,user_id,role) VALUES (?,?,?)', pids[pi], uid, uid===KIM||uid===KANG?'PM':'참여');
    }

    // ── 작업 18개 ──────────────────────────────────
    const tData = [
      // SM-300
      { title:'배전반 3D 모델링 최종 검토',   desc:'메인 배전반 3D CAD 최종 검토 및 간섭 확인. 제작 발주 전 승인 필요.',       a:LEE,  p:0, st:'review',      pr:'high',   wk:thisWeek,  due:toStr(addDays(today,2))  },
      { title:'모터 컨트롤러 배선도 작성',    desc:'48V BLDC 모터 컨트롤러 배선도 작성. 제조사 매뉴얼 기반 핀맵 확인.',        a:PARK, p:0, st:'in_progress', pr:'high',   wk:thisWeek,  due:toStr(addDays(today,4))  },
      { title:'배터리 BMS CAN 통신 테스트',   desc:'BMS-VCU 간 CAN 2.0B 통신 검증. 250kbps 설정 및 DBC 파일 기반 디코딩.',    a:LEE,  p:0, st:'pending',     pr:'medium', wk:nextWeek,  due:toStr(addDays(today,9))  },
      { title:'배전반 제작 발주서 작성',       desc:'제작업체 견적 비교 완료. 발주서 작성 및 납기 일정 협의.',                   a:KIM,  p:0, st:'pending',     pr:'high',   wk:thisWeek,  due:toStr(addDays(today,3))  },
      { title:'충전시스템 최종 사양 확정',     desc:'3.3kW 온보드 차저 및 AC 220V 쇼어파워 커넥터 사양 확정 완료.',             a:KIM,  p:0, st:'done',        pr:'medium', wk:prev1Week, due:null                     },
      { title:'전력계통 단선도 Rev.2 완성',   desc:'주전원 계통 단선도 Rev.2 작성 및 내부 검토 완료.',                          a:LEE,  p:0, st:'done',        pr:'high',   wk:prev1Week, due:null                     },
      // H2 하이브리드
      { title:'연료전지 스택 인터페이스 설계', desc:'수소연료전지 스택 ↔ DC 버스 인버터 전기 인터페이스 설계. 절연 요건 포함.',  a:KIM,  p:1, st:'in_progress', pr:'high',   wk:thisWeek,  due:toStr(addDays(today,7))  },
      { title:'DC-DC 컨버터 최종 선정',        desc:'48V→24V/12V 컨버터 3개 업체 견적 비교. 효율/납기/가격 종합 평가.',         a:JUNG, p:1, st:'review',      pr:'medium', wk:thisWeek,  due:toStr(addDays(today,2))  },
      { title:'수소탱크 센서 계장도 작성',     desc:'수소 압력·온도·농도(누출) 센서 배선 및 P&ID 작성.',                        a:CHOI, p:1, st:'in_progress', pr:'high',   wk:thisWeek,  due:toStr(addDays(today,5))  },
      { title:'비상정지(E-Stop) 회로 설계',   desc:'수소 누출 감지 시 자동 차단 E-Stop 회로 설계. IEC 60812 기준.',             a:CHOI, p:1, st:'in_progress', pr:'high',   wk:thisWeek,  due:toStr(addDays(today,3))  },
      { title:'추진모터 사양서 검토 완료',     desc:'제조사 제출 추진모터 사양서(영문) 검토 및 요구사항 적합성 확인.',           a:JUNG, p:1, st:'done',        pr:'low',    wk:prev1Week, due:null                     },
      // 청안선 IoT
      { title:'IoT 게이트웨이 현장 설치',      desc:'기관실 내 Raspberry Pi 기반 IoT 게이트웨이 설치 및 전원 연결.',             a:HAN,  p:2, st:'done',        pr:'medium', wk:prev1Week, due:null                     },
      { title:'RS485 센서 데이터 파싱',        desc:'RPM·냉각수온·유압 센서 Modbus RTU 데이터 수집 및 파싱 코드 작성.',         a:PARK, p:2, st:'in_progress', pr:'medium', wk:thisWeek,  due:toStr(addDays(today,5))  },
      { title:'실시간 모니터링 웹 대시보드',   desc:'Chart.js 기반 실시간 데이터 시각화 웹 페이지 개발.',                        a:HAN,  p:2, st:'pending',     pr:'low',    wk:nextWeek,  due:null                     },
      { title:'LTE 원격 데이터 전송 테스트',  desc:'LTE 모뎀 설치 및 클라우드 서버 MQTT 전송 테스트 완료.',                     a:PARK, p:2, st:'done',        pr:'medium', wk:prev1Week, due:null                     },
      // 공통
      { title:'4월 안전교육 자료 준비',        desc:'전 직원 선박 전기 안전 교육 PPT 작성. 고압 취급 주의사항 포함.',            a:KIM,  p:null, st:'pending',  pr:'medium', wk:nextWeek,  due:toStr(addDays(today,10)) },
      { title:'기밀시험 장비 교정 의뢰',       desc:'연 1회 장비 교정 의뢰. 외부 기관 접수 완료.',                               a:CHOI, p:null, st:'done',     pr:'low',    wk:prev1Week, due:null                     },
      { title:'하이브리드 전력관리 알고리즘',  desc:'연료전지+리튬배터리 하이브리드 전력분배 로직 설계.',                         a:LEE,  p:1, st:'pending',     pr:'high',   wk:nextWeek,  due:null                     },
    ];
    for (const t of tData) {
      await db.run(
        'INSERT INTO tasks (title,description,assignee_id,project_id,status,priority,due_date,target_week,sort_order) VALUES (?,?,?,?,?,?,?,?,?)',
        t.title, t.desc, t.a, t.p!==null?pids[t.p]:null, t.st, t.pr, t.due||null, t.wk, 0
      );
    }

    // ── 회의 3개 ───────────────────────────────────
    const mData = [
      {
        type:'weekly', date:toStr(lastMon), start:'08:30', end:'09:20',
        title:`주간회의 (${lastMon.getMonth()+1}월 ${Math.ceil(lastMon.getDate()/7)}주차)`,
        agenda:'1. 지난주 업무 결과 공유\n2. SM-300 배전반 설계 현황\n3. H2 Boat 연료전지 인터페이스 착수\n4. 청안선 IoT 게이트웨이 설치 일정',
        minutes:'■ SM-300\n- 전력계통 단선도 Rev.2 최종 승인\n- 배전반 3D 모델링 착수 (이준혁)\n\n■ H2 Boat\n- 연료전지 스택 사양서 접수 완료\n- DC-DC 컨버터 업체 견적 요청 중 (3곳)\n\n■ 청안선 IoT\n- 게이트웨이 발주 완료, 수요일 배송 예정',
        decisions:'① SM-300 배전반 모델링 완료 후 목요일 기술검토\n② H2 Boat DC-DC 컨버터 선정: 금요일까지\n③ 청안선 현장 작업 시 안전장비 필수',
        att:[KIM,LEE,PARK,JUNG,CHOI,HAN,KANG],
      },
      {
        type:'technical', date:toStr(lastThu), start:'10:00', end:'12:00',
        title:'SM-300 전력계통 기술검토회의',
        agenda:'1. 전력계통 단선도 Rev.2 검토\n2. 배전반 설계 방향\n3. BMS 통신 프로토콜 결정',
        minutes:'■ 단선도 Rev.2 최종 승인\n- 비상정지 회로 분리 표기 추가\n\n■ 배전반\n- IP54 방수 등급 확정\n- 주회로 차단기 100A MCCB 선정\n\n■ BMS 통신\n- CAN 2.0B, 250kbps 확정',
        decisions:'① 단선도 Rev.2 승인 — 이준혁 배포\n② 배전반 제작 발주: 다음주 월요일\n③ BMS CAN 테스트: 다음주 착수',
        att:[KIM,LEE,PARK,JUNG],
      },
      {
        type:'weekly', date:toStr(thisMon), start:'08:30', end:'09:15',
        title:`주간회의 (${thisMon.getMonth()+1}월 ${Math.ceil(thisMon.getDate()/7)}주차)`,
        agenda:'1. 지난주 업무 결과 공유\n2. SM-300 배전반 제작 발주 진행\n3. H2 Boat 비상정지 회로 현황\n4. 청안선 IoT 센서 파싱 결과',
        minutes:'■ SM-300\n- 배전반 3D 모델링 완료, 목요일 기술회의 후 발주\n- 모터 컨트롤러 배선도 진행 중 (70%)\n\n■ H2 Boat\n- E-Stop 회로 초안 완료 (최영진)\n- DC-DC 컨버터: A업체 선정 (납기 협의 중)\n\n■ 청안선 IoT\n- 게이트웨이 설치 완료\n- RS485 파싱 코드 작성 중',
        decisions:'① SM-300 배전반 기술검토: 이번주 목요일 10시\n② H2 Boat DC-DC 납기 리스크 → 김태호 업체 직접 미팅\n③ 청안선 대시보드: 다음주부터',
        att:[KIM,LEE,PARK,JUNG,CHOI,HAN,KANG],
      },
    ];
    for (const m of mData) {
      const r = await db.run(
        'INSERT INTO meetings (type,meeting_date,start_time,end_time,title,agenda,minutes,decisions,created_by) VALUES (?,?,?,?,?,?,?,?,?)',
        m.type, m.date, m.start, m.end, m.title, m.agenda, m.minutes, m.decisions, adminId
      );
      for (const uid of m.att)
        await db.run('INSERT OR IGNORE INTO meeting_attendees (meeting_id,user_id,confirmed) VALUES (?,?,?)', r.lastInsertRowid, uid, 1);
    }

    // ── 업무보고 (오늘 + 어제 + 그제) ─────────────
    const rData = [
      { u:KIM,  d:d1, done:'SM-300 배전반 3D 모델링 최종 검토 완료\nH2 Boat 연료전지 스택 인터페이스 설계 착수 (60%)',      plan:'배전반 제작 발주서 작성\n연료전지 인터페이스 설계 계속',   sp:'H2 DC-DC 컨버터 납기 6주 → 업체 직접 미팅으로 단축 협의 예정', sf:'' },
      { u:LEE,  d:d1, done:'SM-300 모터 컨트롤러 배선도 70% 작성\nBMS CAN 통신 테스트 환경 구성 (CANalyzer 셋업)',         plan:'배선도 완료 및 팀장 검토 요청\nCAN 실제 데이터 수신 테스트',    sp:'BMS 보드 1개 불량 → 제조사 교체 요청 완료 (3일 내 수령)',       sf:'' },
      { u:PARK, d:d1, done:'청안선 RS485 Modbus RTU 센서 파싱 코드 작성\n엔진 RPM·냉각수온 데이터 정상 수신 확인',          plan:'유압 센서 파싱 마무리\nSM-300 항해등 회로 설계 착수',           sp:'',                                                                sf:'기관실 작업 중 환기 미흡 → 환기팬 가동 후 재개' },
      { u:JUNG, d:d1, done:'DC-DC 컨버터 3개 업체 견적서 수령 및 비교 분석\nA업체 최종 선정 권고안 작성',                    plan:'컨버터 선정 결과 보고\n수소탱크 센서 계장도 지원',                sp:'A업체 가격 최저, 납기 6주 → 단축 가능 여부 문의 중',              sf:'' },
      { u:CHOI, d:d1, done:'H2 Boat 비상정지(E-Stop) 회로 설계 완료\n수소 누출 감지 센서 배선도 초안 작성',                  plan:'E-Stop 회로 시뮬레이션 검증\n계장도 계속 작성',                  sp:'',                                                                sf:'IEC 60079 방폭 기준 재확인 완료' },
      { u:HAN,  d:d1, done:'청안선 IoT 게이트웨이 설치 완료 및 전원 확인\n게이트웨이 원격 접속 환경 구성',                    plan:'모니터링 대시보드 UI 와이어프레임\n자동 재시작 스크립트 작성',   sp:'',                                                                sf:'' },
      { u:KANG, d:d1, done:'12m 순찰선 추진 시스템 배치 초안 작성\n해경 요구사양서 분석 완료',                                plan:'추진 시스템 배치 2차 검토\n전장 계통 기본 구성안 착수',          sp:'해경 예비 발전기 출력 기준 불명확 → 담당자 확인 중',              sf:'' },
      // 어제
      { u:KIM,  d:d2, done:'SM-300 배전반 모델링 중간 확인\nH2 Boat 연료전지 스택 사양서(영문) 검토',                        plan:'배전반 최종 검토\n연료전지 인터페이스 착수',                      sp:'',                                                                sf:'' },
      { u:LEE,  d:d2, done:'배전반 3D 모델링 95% 완성\nSM-300 배선 경로 검토',                                               plan:'모델링 완료 및 검토 요청',                                        sp:'',                                                                sf:'' },
      { u:PARK, d:d2, done:'청안선 현장 방문 — IoT 센서 설치 위치 확인\nRS485 통신 라인 사전 점검',                           plan:'RS485 파싱 코드 작성',                                           sp:'',                                                                sf:'현장 작업 전 안전교육 이수 확인' },
      { u:JUNG, d:d2, done:'DC-DC 컨버터 추가 견적 접수 (2곳)\n사양 비교표 작성',                                            plan:'최종 1곳 추가 견적 후 비교 완료',                                 sp:'',                                                                sf:'' },
      { u:HAN,  d:d2, done:'청안선 기관실 IoT 게이트웨이 현장 설치\n전원 배선 연결 및 부팅 확인',                             plan:'원격 접속 및 통신 확인',                                          sp:'설치 중 전원 단자 규격 불일치 → 어댑터 제작으로 해결',            sf:'' },
      // 그제
      { u:KIM,  d:d3, done:'주간회의 주재 및 회의록 작성\n12m 순찰선 요구사양서 1차 검토',                                    plan:'배전반 중간 검토',                                                sp:'',                                                                sf:'' },
      { u:LEE,  d:d3, done:'배전반 3D 모델링 착수 (40%)\nSM-300 전력계통 단선도 최종본 배포',                                plan:'모델링 계속',                                                     sp:'',                                                                sf:'' },
    ];
    for (const r of rData) {
      await db.run(
        'INSERT OR IGNORE INTO daily_reports (user_id,report_date,work_done,work_planned,special_notes,safety_notes) VALUES (?,?,?,?,?,?)',
        r.u, r.d, r.done, r.plan, r.sp, r.sf
      );
    }

    // ── 공지사항 4개 ───────────────────────────────
    const nData = [
      { title:'[필독] 4월 정기 안전교육 일정 안내', content:'■ 일시: 4월 넷째 주 금요일 14:00~16:00\n■ 장소: 2층 대회의실\n■ 내용: 선박 전기설비 안전 취급, 수소 가스 누출 대응, 소화기 사용법\n\n전 직원 필수 참석 바랍니다.', pin:1, auth:KIM },
      { title:'SM-300 배전반 제작 발주 일정', content:'■ 배전반 기술검토: 이번주 목요일 10:00\n■ 발주서 확정: 목요일 오후\n■ 제작업체 발주: 금요일\n■ 납기 예정: 약 4주 후\n\n전기팀 목요일 기술검토회의 참석 바랍니다.', pin:1, auth:KIM },
      { title:'소모품·비품 신청 방법 안내', content:'소모품 및 비품 신청은 매주 금요일 오전까지 한소희 담당자에게 요청해 주세요.\n■ 지급일: 다음 주 월요일\n\n긴급 요청 시 김태호 팀장 승인 후 당일 처리 가능합니다.', pin:0, auth:HAN },
      { title:'사무실 네트워크 점검 안내', content:'■ 일시: 금요일 오후 17:00~18:00\n■ 영향: 인터넷, 업무 포털, 공용 프린터\n\n중요 업무는 점검 전 완료해 주세요.', pin:0, auth:adminId },
    ];
    for (const n of nData)
      await db.run('INSERT INTO notices (title,content,author_id,is_pinned) VALUES (?,?,?,?)', n.title, n.content, n.auth, n.pin);

    // ── 근무 상태 ──────────────────────────────────
    const sData = [
      { u:KIM,  s:'office',  n:'' },
      { u:LEE,  s:'office',  n:'' },
      { u:PARK, s:'outside', n:'청안선 현장 데이터 확인' },
      { u:JUNG, s:'meeting', n:'DC-DC 컨버터 업체 미팅' },
      { u:CHOI, s:'office',  n:'' },
      { u:HAN,  s:'remote',  n:'재택근무 (IoT 대시보드 개발)' },
      { u:KANG, s:'office',  n:'' },
    ];
    for (const s of sData)
      await db.run('INSERT INTO user_status (user_id,status_date,status,note) VALUES (?,?,?,?)', s.u, todayStr, s.s, s.n);

    // ── 건의사항 2개 ───────────────────────────────
    const sgData = [
      {
        title:'설계 도면 버전 관리 시스템(PDM) 도입 건의',
        content:'현재 도면 파일을 개인 PC에 보관하다 보니 최신 버전 공유가 늦어지고 충돌이 발생합니다.\nGit LFS 또는 PDM 시스템 도입을 건의합니다.\n\n기대 효과: 버전 충돌 방지, 변경 이력 추적, 원격 접근 가능',
        cat:'improvement', auth:LEE, anon:0,
        reply:'좋은 제안입니다. 4월 중 PDM 솔루션 비교 검토 후 도입 여부 결정하겠습니다. — 김태호 팀장',
        likes:[KIM,PARK,JUNG,KANG,HAN],
      },
      {
        title:'야근 시 야식·간식비 지원 요청',
        content:'프로젝트 납기 전 야근이 잦은데, 간단한 식비 지원이 있으면 사기 진작에 도움이 될 것 같습니다.\n월 1~2만원 수준의 간식비 지원을 건의드립니다.',
        cat:'welfare', auth:CHOI, anon:1,
        reply:'복리후생 개선 방향으로 검토하겠습니다.',
        likes:[LEE,PARK,HAN,JUNG,KANG],
      },
    ];
    for (const s of sgData) {
      const r = await db.run(
        'INSERT INTO suggestions (title,content,category,author_id,status,admin_reply,is_anonymous) VALUES (?,?,?,?,?,?,?)',
        s.title, s.content, s.cat, s.auth, s.reply?'reviewed':'open', s.reply, s.anon
      );
      for (const uid of s.likes)
        await db.run('INSERT OR IGNORE INTO suggestion_likes (suggestion_id,user_id) VALUES (?,?)', r.lastInsertRowid, uid);
    }

    // ── 점심 투표 ──────────────────────────────────
    const lp = await db.run('INSERT INTO lunch_polls (poll_date,title,created_by) VALUES (?,?,?)', todayStr, '오늘 점심 메뉴 투표', KIM);
    const lopts = ['중국집 (짜장·짬뽕)','한식 (백반·찌개)','일식 (라멘)','분식 (국밥)','양식 (파스타)'];
    const loptIds = [];
    for (const nm of lopts) { const r = await db.run('INSERT INTO lunch_options (poll_id,name) VALUES (?,?)', lp.lastInsertRowid, nm); loptIds.push(r.lastInsertRowid); }
    for (const [oi,uid] of [[0,KIM],[0,PARK],[1,LEE],[1,CHOI],[2,JUNG],[3,HAN],[0,KANG]])
      await db.run('INSERT OR IGNORE INTO lunch_votes (option_id,user_id) VALUES (?,?)', loptIds[oi], uid);

    // ── 일반 투표 (회식 장소) ──────────────────────
    const vp = await db.run(
      'INSERT INTO polls (title,description,category,allow_multiple,is_anonymous,deadline,created_by,status) VALUES (?,?,?,?,?,?,?,?)',
      '이번 달 회식 장소 선정', '3월 회식 장소를 투표로 정합니다!', 'general', 0, 0, toStr(addDays(today,3)), KIM, 'active'
    );
    const vopts = ['이자카야 (일식 술집)','고기집 (삼겹살)','해산물 횟집','중식 코스'];
    const voptIds = [];
    for (const t of vopts) { const r = await db.run('INSERT INTO poll_options (poll_id,text) VALUES (?,?)', vp.lastInsertRowid, t); voptIds.push(r.lastInsertRowid); }
    for (const [oi,uid] of [[0,KIM],[1,LEE],[1,PARK],[0,JUNG],[2,CHOI],[1,HAN],[0,KANG]])
      await db.run('INSERT OR IGNORE INTO poll_votes (option_id,user_id) VALUES (?,?)', voptIds[oi], uid);

    res.json({
      success: true,
      message: '시연 데이터 초기화 완료!',
      summary: {
        users: uData.length,
        projects: pData.length,
        tasks: tData.length,
        meetings: mData.length,
        reports: rData.length,
        notices: nData.length,
        suggestions: sgData.length,
        polls: 2,
      }
    });
  } catch(e) {
    console.error('시연 데이터 오류:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
