const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');

// 10분 서버 캐시
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000;

const NX = 98, NY = 76;
const MID_LAND_REGION = '11H20000';
const MID_TA_REGION   = '11H20201';

function kstYmd(offset = 0) {
  const d = new Date(Date.now() + (9 * 3600 + offset * 86400) * 1000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function calcShortBase() {
  const kstMs = Date.now() + 9 * 3600 * 1000;
  const kst   = new Date(kstMs);
  const h     = kst.getUTCHours();
  const m     = kst.getUTCMinutes();
  const issued = [2, 5, 8, 11, 14, 17, 20, 23];
  let baseH = -1;
  for (let i = issued.length - 1; i >= 0; i--) {
    if (h > issued[i] || (h === issued[i] && m >= 10)) { baseH = issued[i]; break; }
  }
  let baseDate;
  if (baseH === -1) {
    const prev = new Date(kstMs - 86400 * 1000);
    baseDate = prev.toISOString().slice(0, 10).replace(/-/g, '');
    baseH = 23;
  } else {
    baseDate = kst.toISOString().slice(0, 10).replace(/-/g, '');
  }
  return { baseDate, baseTime: String(baseH).padStart(2, '0') + '00' };
}

function calcMidTmFc() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const h   = kst.getUTCHours();
  const ymd = kst.toISOString().slice(0, 10).replace(/-/g, '');
  if (h >= 18) return { tmFc: `${ymd}1800`, midStart: 5 };
  if (h >= 6)  return { tmFc: `${ymd}0600`, midStart: 4 };
  const prev = new Date(Date.now() + 9 * 3600 * 1000 - 86400 * 1000);
  return { tmFc: prev.toISOString().slice(0, 10).replace(/-/g, '') + '1800', midStart: 5 };
}

function parsePcp(val) {
  if (!val || val === '강수없음') return 0;
  const m = val.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function skyPtyToWmo(sky, pty, pop) {
  if (pty === 4) return 80;
  if (pty === 3) return 73;
  if (pty === 2) return 53;
  if (pty === 1) return pop >= 60 ? 63 : 61;
  if (sky === 4) return 3;
  if (sky === 3) return 2;
  return 1;
}

function wfToWmo(wf, pop) {
  if (!wf) return pop >= 60 ? 61 : 1;
  if (wf.includes('뇌우'))                        return 95;
  if (wf.includes('눈') && wf.includes('비'))     return 53;
  if (wf.includes('눈'))                          return 73;
  if (wf.includes('비') || wf.includes('소나기')) return pop >= 60 ? 63 : 61;
  if (wf.includes('흐림'))                        return 3;
  if (wf.includes('구름많음'))                     return 2;
  return 1;
}

// 기상청 API 응답을 JSON으로 안전하게 파싱
// - 정상 JSON → 그대로 반환
// - 에러 XML (두 가지 포맷 모두 처리) → Error throw
async function safeJson(response, label) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    // 포맷 1: <resultCode>xx</resultCode>
    const rc1 = text.match(/<resultCode>([^<]+)<\/resultCode>/)?.[1];
    const rm1 = text.match(/<resultMsg>([^<]+)<\/resultMsg>/)?.[1];
    // 포맷 2: <returnReasonCode>xx</returnReasonCode> (OpenAPI_ServiceResponse)
    const rc2 = text.match(/<returnReasonCode>([^<]+)<\/returnReasonCode>/)?.[1];
    const rm2 = text.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/)?.[1];

    const code = rc1 || rc2 || 'XML';
    const msg  = rm1 || rm2 || text.slice(0, 300);
    console.error(`[날씨] ${label} XML 응답 (${code}):`, msg);
    throw new Error(`${label} API 오류 (${code}): ${msg}`);
  }
}

// ── 진단 엔드포인트 (Railway 로그 없이 원인 확인용) ────────────────
router.get('/debug', requireAdmin, async (req, res) => {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) return res.json({ step: 'NO_KEY', detail: 'WEATHER_API_KEY 환경변수가 설정되지 않았습니다.' });

  const k = encodeURIComponent(apiKey);
  const { baseDate, baseTime } = calcShortBase();
  const { tmFc, midStart }     = calcMidTmFc();

  const result = {
    keyLength: apiKey.length,
    keyPreview: apiKey.slice(0, 6) + '...' + apiKey.slice(-4),
    baseDate, baseTime, tmFc, midStart,
    short: null, midLand: null, midTa: null,
  };

  // 단기예보 테스트 (numOfRows=10으로 최소 요청)
  try {
    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${k}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${NX}&ny=${NY}`;
    const r = await fetch(url);
    const text = await r.text();
    try {
      const j = JSON.parse(text);
      result.short = { rc: j.response?.header?.resultCode, msg: j.response?.header?.resultMsg, count: j.response?.body?.totalCount };
    } catch {
      result.short = { error: 'XML응답', preview: text.slice(0, 400) };
    }
  } catch(e) { result.short = { error: e.message }; }

  // 중기육상예보 테스트
  try {
    const url = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?serviceKey=${k}&pageNo=1&numOfRows=10&dataType=JSON&regId=${MID_LAND_REGION}&tmFc=${tmFc}`;
    const r = await fetch(url);
    const text = await r.text();
    try {
      const j = JSON.parse(text);
      result.midLand = { rc: j.response?.header?.resultCode, msg: j.response?.header?.resultMsg, hasData: !!j.response?.body?.items?.item?.[0] };
    } catch {
      result.midLand = { error: 'XML응답', preview: text.slice(0, 400) };
    }
  } catch(e) { result.midLand = { error: e.message }; }

  // 중기기온 테스트
  try {
    const url = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?serviceKey=${k}&pageNo=1&numOfRows=10&dataType=JSON&regId=${MID_TA_REGION}&tmFc=${tmFc}`;
    const r = await fetch(url);
    const text = await r.text();
    try {
      const j = JSON.parse(text);
      result.midTa = { rc: j.response?.header?.resultCode, msg: j.response?.header?.resultMsg, hasData: !!j.response?.body?.items?.item?.[0] };
    } catch {
      result.midTa = { error: 'XML응답', preview: text.slice(0, 400) };
    }
  } catch(e) { result.midTa = { error: e.message }; }

  res.json(result);
});

// ── 메인 날씨 엔드포인트 ─────────────────────────────────────────
router.get('/', async (req, res) => {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'NO_API_KEY' });

  // 캐시 확인
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) {
    return res.json(_cache);
  }

  try {
    const { baseDate, baseTime } = calcShortBase();
    const { tmFc, midStart }     = calcMidTmFc();
    const k = encodeURIComponent(apiKey);

    console.log(`[날씨] base=${baseDate}/${baseTime}  tmFc=${tmFc}  midStart=+${midStart}`);

    const shortUrl   = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${k}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${NX}&ny=${NY}`;
    const midLandUrl = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?serviceKey=${k}&pageNo=1&numOfRows=10&dataType=JSON&regId=${MID_LAND_REGION}&tmFc=${tmFc}`;
    const midTaUrl   = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?serviceKey=${k}&pageNo=1&numOfRows=10&dataType=JSON&regId=${MID_TA_REGION}&tmFc=${tmFc}`;

    const [shortRes, midLandRes, midTaRes] = await Promise.all([
      fetch(shortUrl), fetch(midLandUrl), fetch(midTaUrl),
    ]);

    // 단기예보: 실패해도 중기 데이터만으로 계속 진행
    let shortForecast = [];
    let shortError = null;
    try {
      const shortJson = await safeJson(shortRes, '단기예보');
      const rc = shortJson.response?.header?.resultCode;
      if (rc !== '00') throw new Error(`단기예보 (${rc}): ${shortJson.response?.header?.resultMsg}`);

      const items = shortJson.response.body.items.item || [];
      const daily = {};
      for (const it of items) {
        const dt = it.fcstDate;
        if (!daily[dt]) daily[dt] = { TMP:[], TMX:null, TMN:null, POP:[], PTY:[], PCP:[], REH:[], WSD:[], SKY:[] };
        const d = daily[dt];
        switch (it.category) {
          case 'TMP': d.TMP.push(Number(it.fcstValue)); break;
          case 'TMX': d.TMX = Number(it.fcstValue); break;
          case 'TMN': d.TMN = Number(it.fcstValue); break;
          case 'POP': d.POP.push(Number(it.fcstValue)); break;
          case 'PTY': d.PTY.push(Number(it.fcstValue)); break;
          case 'PCP': d.PCP.push(parsePcp(it.fcstValue)); break;
          case 'REH': d.REH.push(Number(it.fcstValue)); break;
          case 'WSD': d.WSD.push(Number(it.fcstValue)); break;
          case 'SKY': d.SKY.push(Number(it.fcstValue)); break;
        }
      }

      const shortDates = Object.keys(daily).sort().slice(0, midStart - 1);
      shortForecast = shortDates.map(dt => {
        const d      = daily[dt];
        const maxPop = d.POP.length ? Math.max(...d.POP) : 0;
        const avgSky = d.SKY.length ? Math.round(d.SKY.reduce((a,b)=>a+b,0)/d.SKY.length) : 1;
        const maxPty = d.PTY.length ? Math.max(...d.PTY) : 0;
        const rainSum= d.PCP.reduce((a,b)=>a+b, 0);
        const maxWsd = d.WSD.length ? Math.max(...d.WSD) : 0;
        const avgReh = d.REH.length ? Math.round(d.REH.reduce((a,b)=>a+b,0)/d.REH.length) : null;
        return {
          date:        dt,
          tempMax:     d.TMX ?? (d.TMP.length ? Math.max(...d.TMP) : null),
          tempMin:     d.TMN ?? (d.TMP.length ? Math.min(...d.TMP) : null),
          precipProb:  maxPop,
          precipSum:   rainSum > 0 ? Number(rainSum.toFixed(1)) : 0,
          humidity:    avgReh,
          windSpeed:   Math.round(maxWsd * 3.6),
          weatherCode: skyPtyToWmo(avgSky, maxPty, maxPop),
          source:      'short',
        };
      });
    } catch(e) {
      shortError = e.message;
      console.warn('[날씨] 단기예보 실패 (중기만 사용):', e.message);
    }

    const midLandJson = await safeJson(midLandRes, '중기육상');
    const midTaJson   = await safeJson(midTaRes,   '중기기온');

    // 중기예보 파싱
    // 단기예보 미신청 시 오늘부터 중기 데이터로 최대한 채움
    const effectiveMidStart = shortForecast.length > 0 ? midStart : 1;
    const midLand = midLandJson.response?.body?.items?.item?.[0] || {};
    const midTa   = midTaJson.response?.body?.items?.item?.[0]   || {};
    const midForecast = [];
    for (let offset = effectiveMidStart; offset <= 10; offset++) {
      const rainAm = Number(midLand[`rnSt${offset}Am`] ?? midLand[`rnSt${offset}`] ?? 0);
      const rainPm = Number(midLand[`rnSt${offset}Pm`] ?? midLand[`rnSt${offset}`] ?? 0);
      const wfAm   = midLand[`wf${offset}Am`] ?? midLand[`wf${offset}`] ?? '';
      const wfPm   = midLand[`wf${offset}Pm`] ?? midLand[`wf${offset}`] ?? '';
      const taMax  = midTa[`taMax${offset}`] != null ? Number(midTa[`taMax${offset}`]) : null;
      const taMin  = midTa[`taMin${offset}`] != null ? Number(midTa[`taMin${offset}`]) : null;
      const maxRain = Math.max(rainAm, rainPm);
      const wf = wfPm || wfAm;
      midForecast.push({
        date:        kstYmd(offset),
        tempMax:     taMax,
        tempMin:     taMin,
        precipProb:  maxRain,
        precipSum:   null,
        humidity:    null,
        windSpeed:   null,
        weatherCode: wfToWmo(wf, maxRain),
        source:      'mid',
        wfText:      wf || null,
      });
    }

    const forecast = [...shortForecast, ...midForecast].slice(0, 10);
    console.log(`[날씨] 성공: 단기 ${shortForecast.length}일 + 중기 ${midForecast.length}일`);
    const result = {
      forecast,
      updated: new Date().toISOString(),
      source: 'kma',
      ...(shortError ? { warning: '단기예보 미신청 — 공공데이터포털에서 VilageFcstInfoService_2.0 활용신청 필요' } : {}),
    };
    _cache = result;
    _cacheTime = Date.now();
    res.json(result);

  } catch(e) {
    console.error('[날씨] 오류:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
