const express = require('express');
const router = express.Router();

// 부산 격자 좌표 (기상청 단기예보)
const NX = 98, NY = 76;
// 부산 중기예보 지역코드 (API 가이드 공식값)
const MID_LAND_REGION = '11H20000';  // 부산·울산·경남 중기육상예보
const MID_TA_REGION   = '11H20201';  // 부산 중기기온

// KST 현재 날짜 YYYYMMDD (offset=일수)
function kstYmd(offset = 0) {
  const d = new Date(Date.now() + (9 * 3600 + offset * 86400) * 1000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// 단기예보 base_date / base_time 계산 (KST 기준)
function calcShortBase() {
  const kstMs = Date.now() + 9 * 3600 * 1000;
  const kst   = new Date(kstMs);
  const h     = kst.getUTCHours();
  const m     = kst.getUTCMinutes();

  // 기상청 발표 시각 목록 (각 발표 후 10분부터 사용 가능)
  const issued = [2, 5, 8, 11, 14, 17, 20, 23];
  let baseH = -1;
  for (let i = issued.length - 1; i >= 0; i--) {
    if (h > issued[i] || (h === issued[i] && m >= 10)) {
      baseH = issued[i]; break;
    }
  }

  let baseDate;
  if (baseH === -1) {
    // 02:10 이전 → 전날 23시
    const prev = new Date(kstMs - 86400 * 1000);
    baseDate = prev.toISOString().slice(0, 10).replace(/-/g, '');
    baseH = 23;
  } else {
    baseDate = kst.toISOString().slice(0, 10).replace(/-/g, '');
  }
  return { baseDate, baseTime: String(baseH).padStart(2, '0') + '00' };
}

// 중기예보 tmFc + 발표 회차(06 or 18) 계산
// API 가이드: 06시 발표 → 4일 후~10일 후, 18시 발표 → 5일 후~10일 후
function calcMidTmFc() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const h   = kst.getUTCHours();
  const ymd = kst.toISOString().slice(0, 10).replace(/-/g, '');

  if (h >= 18) return { tmFc: `${ymd}1800`, midStart: 5 };
  if (h >= 6)  return { tmFc: `${ymd}0600`, midStart: 4 };
  // 06시 이전 → 전날 18시
  const prev = new Date(Date.now() + 9 * 3600 * 1000 - 86400 * 1000);
  const ymd2 = prev.toISOString().slice(0, 10).replace(/-/g, '');
  return { tmFc: `${ymd2}1800`, midStart: 5 };
}

function parsePcp(val) {
  if (!val || val === '강수없음') return 0;
  const m = val.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function skyPtyToWmo(sky, pty, pop) {
  if (pty === 4) return 80;  // 소나기
  if (pty === 3) return 73;  // 눈
  if (pty === 2) return 53;  // 비/눈
  if (pty === 1) return pop >= 60 ? 63 : 61; // 비
  if (sky === 4) return 3;   // 흐림
  if (sky === 3) return 2;   // 구름많음
  return 1;                  // 맑음
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

// API 응답을 JSON으로 안전하게 파싱 (에러 시 XML이 올 수 있음)
async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    // XML 에러 응답에서 에러코드 추출
    const codeMatch  = text.match(/<resultCode>([^<]+)<\/resultCode>/);
    const msgMatch   = text.match(/<resultMsg>([^<]+)<\/resultMsg>/);
    const code = codeMatch ? codeMatch[1] : '?';
    const msg  = msgMatch  ? msgMatch[1]  : text.slice(0, 200);
    console.error('[날씨] XML 에러 응답:', code, msg);
    throw new Error(`기상청 API 오류 (${code}): ${msg}`);
  }
}

router.get('/', async (req, res) => {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'NO_API_KEY' });

  try {
    const { baseDate, baseTime }  = calcShortBase();
    const { tmFc, midStart }      = calcMidTmFc();
    const k = encodeURIComponent(apiKey); // 반드시 URL 인코딩

    console.log(`[날씨] 단기 base=${baseDate}/${baseTime}  중기 tmFc=${tmFc} midStart=+${midStart}일`);

    const shortUrl   = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${k}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${NX}&ny=${NY}`;
    const midLandUrl = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?serviceKey=${k}&pageNo=1&numOfRows=10&dataType=JSON&regId=${MID_LAND_REGION}&tmFc=${tmFc}`;
    const midTaUrl   = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?serviceKey=${k}&pageNo=1&numOfRows=10&dataType=JSON&regId=${MID_TA_REGION}&tmFc=${tmFc}`;

    const [shortRes, midLandRes, midTaRes] = await Promise.all([
      fetch(shortUrl), fetch(midLandUrl), fetch(midTaUrl),
    ]);

    const shortJson   = await safeJson(shortRes);
    const midLandJson = await safeJson(midLandRes);
    const midTaJson   = await safeJson(midTaRes);

    // 단기예보 resultCode 검증
    const rc = shortJson.response?.header?.resultCode;
    if (rc !== '00') {
      const msg = shortJson.response?.header?.resultMsg || rc;
      console.error('[날씨] 단기예보 resultCode:', rc, msg);
      throw new Error(`단기예보 오류 (${rc}): ${msg}`);
    }

    // ── 단기예보 파싱 ─────────────────────────────────
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

    // 단기예보 날짜 최대 (midStart-1)일까지만 사용 (중기와 겹치지 않게)
    const shortDates = Object.keys(daily).sort().slice(0, midStart - 1);
    const shortForecast = shortDates.map(dt => {
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
        windSpeed:   Math.round(maxWsd * 3.6), // m/s → km/h
        weatherCode: skyPtyToWmo(avgSky, maxPty, maxPop),
        source:      'short',
      };
    });

    // ── 중기예보 파싱 (midStart일 후 ~ +7일 후) ───────
    const midLand = midLandJson.response?.body?.items?.item?.[0] || {};
    const midTa   = midTaJson.response?.body?.items?.item?.[0]   || {};

    const midForecast = [];
    for (let offset = midStart; offset <= midStart + 3; offset++) {
      const dt     = kstYmd(offset);
      // 06시 발표: rnSt4Am/Pm ~ rnSt10 / 18시 발표: rnSt5Am/Pm ~ rnSt10
      const rainAm = Number(midLand[`rnSt${offset}Am`] ?? midLand[`rnSt${offset}`] ?? 0);
      const rainPm = Number(midLand[`rnSt${offset}Pm`] ?? midLand[`rnSt${offset}`] ?? 0);
      const wfAm   = midLand[`wf${offset}Am`] ?? midLand[`wf${offset}`] ?? '';
      const wfPm   = midLand[`wf${offset}Pm`] ?? midLand[`wf${offset}`] ?? '';
      const taMax  = midTa[`taMax${offset}`] != null ? Number(midTa[`taMax${offset}`]) : null;
      const taMin  = midTa[`taMin${offset}`] != null ? Number(midTa[`taMin${offset}`]) : null;
      const maxRain = Math.max(rainAm, rainPm);
      const wf = wfPm || wfAm;

      midForecast.push({
        date:        dt,
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

    const forecast = [...shortForecast, ...midForecast].slice(0, 7);
    console.log(`[날씨] 성공: 단기 ${shortForecast.length}일 + 중기 ${midForecast.length}일 = ${forecast.length}일`);
    res.json({ forecast, updated: new Date().toISOString(), source: 'kma' });

  } catch(e) {
    console.error('[날씨] 최종 오류:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
