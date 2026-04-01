const express = require('express');
const router = express.Router();

// 부산 격자 좌표 (기상청 공식)
const NX = 98, NY = 76;
const MID_LAND_REGION = '11H20000';  // 부산·경남 중기육상예보
const MID_TA_REGION   = '11H20201';  // 부산 중기기온

// UTC+9 기준 현재 날짜 YYYYMMDD
function kstYmd(offset = 0) {
  const d = new Date(Date.now() + (9 * 3600 + offset * 86400) * 1000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// 단기예보 base_date / base_time 계산 (KST 기준)
function calcShortBase() {
  const kstMs = Date.now() + 9 * 3600 * 1000;
  const kst   = new Date(kstMs);
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();

  // 기상청 발표 시각 (시)
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

// 중기예보 tmFc 계산 (발표: 06시, 18시 기준)
function calcMidTmFc() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const h   = kst.getUTCHours();
  const ymd = kst.toISOString().slice(0, 10).replace(/-/g, '');
  if (h >= 18) return `${ymd}1800`;
  if (h >= 6)  return `${ymd}0600`;
  // 06시 이전 → 전날 18시
  const prev = new Date(Date.now() + 9 * 3600 * 1000 - 86400 * 1000);
  const ymd2 = prev.toISOString().slice(0, 10).replace(/-/g, '');
  return `${ymd2}1800`;
}

// PCP 문자열 → mm 숫자 변환
function parsePcp(val) {
  if (!val || val === '강수없음') return 0;
  const m = val.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

// 기상청 SKY + PTY + POP → WMO 기상코드 근사
function skyPtyToWmo(sky, pty, pop) {
  if (pty === 4) return pop >= 70 ? 82 : 80; // 소나기
  if (pty === 3) return 73;                  // 눈
  if (pty === 2) return 53;                  // 비/눈
  if (pty === 1) return pop >= 70 ? 63 : 61; // 비
  if (sky === 4) return 3;                   // 흐림
  if (sky === 3) return 2;                   // 구름많음
  return 1;                                  // 맑음/대체로맑음
}

// 중기예보 날씨문자(wf) → WMO 코드
function wfToWmo(wf, pop) {
  if (!wf) return pop >= 60 ? 61 : 1;
  if (wf.includes('뇌우'))                         return 95;
  if (wf.includes('눈') && wf.includes('비'))      return 53;
  if (wf.includes('눈'))                           return 73;
  if (wf.includes('비') || wf.includes('소나기'))  return pop >= 70 ? 63 : 61;
  if (wf.includes('흐림'))                         return 3;
  if (wf.includes('구름많음'))                      return 2;
  return 1;
}

router.get('/', async (req, res) => {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'NO_API_KEY' });
  }

  try {
    const { baseDate, baseTime } = calcShortBase();
    const tmFc = calcMidTmFc();
    const key  = apiKey; // data.go.kr 키는 이미 인코딩되어 있으므로 그대로 사용

    const shortUrl   = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${key}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${NX}&ny=${NY}`;
    const midLandUrl = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?serviceKey=${key}&pageNo=1&numOfRows=10&dataType=JSON&regId=${MID_LAND_REGION}&tmFc=${tmFc}`;
    const midTaUrl   = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?serviceKey=${key}&pageNo=1&numOfRows=10&dataType=JSON&regId=${MID_TA_REGION}&tmFc=${tmFc}`;

    const [shortRes, midLandRes, midTaRes] = await Promise.all([
      fetch(shortUrl), fetch(midLandUrl), fetch(midTaUrl),
    ]);

    const shortJson   = await shortRes.json();
    const midLandJson = await midLandRes.json();
    const midTaJson   = await midTaRes.json();

    const rc = shortJson.response?.header?.resultCode;
    if (rc !== '00') {
      throw new Error('단기예보 오류: ' + (shortJson.response?.header?.resultMsg || rc));
    }

    // ── 단기예보 파싱 ──────────────────────────────────
    const items = shortJson.response.body.items.item || [];
    const daily = {};

    for (const it of items) {
      const dt = it.fcstDate;
      if (!daily[dt]) {
        daily[dt] = { TMP: [], TMX: null, TMN: null, POP: [], PTY: [], PCP: [], REH: [], WSD: [], SKY: [] };
      }
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

    const shortDates = Object.keys(daily).sort().slice(0, 3);
    const shortForecast = shortDates.map(dt => {
      const d = daily[dt];
      const maxPop  = d.POP.length ? Math.max(...d.POP)  : 0;
      const avgSky  = d.SKY.length ? Math.round(d.SKY.reduce((a,b)=>a+b,0)/d.SKY.length) : 1;
      const maxPty  = d.PTY.length ? Math.max(...d.PTY)  : 0;
      const rainSum = d.PCP.reduce((a,b)=>a+b, 0);
      const maxWsd  = d.WSD.length ? Math.max(...d.WSD)  : 0;
      const avgReh  = d.REH.length ? Math.round(d.REH.reduce((a,b)=>a+b,0)/d.REH.length) : null;

      return {
        date:       dt,
        tempMax:    d.TMX ?? (d.TMP.length ? Math.max(...d.TMP) : null),
        tempMin:    d.TMN ?? (d.TMP.length ? Math.min(...d.TMP) : null),
        precipProb: maxPop,
        precipSum:  rainSum > 0 ? Number(rainSum.toFixed(1)) : 0,
        humidity:   avgReh,
        windSpeed:  Math.round(maxWsd * 3.6), // m/s → km/h
        weatherCode: skyPtyToWmo(avgSky, maxPty, maxPop),
        source:     'short',
      };
    });

    // ── 중기예보 파싱 (day+3 ~ day+6) ─────────────────
    const midLand = midLandJson.response?.body?.items?.item?.[0] || {};
    const midTa   = midTaJson.response?.body?.items?.item?.[0]   || {};

    const midForecast = [];
    for (let offset = 3; offset <= 6; offset++) {
      const dt = kstYmd(offset);

      // 기상청 중기예보 key: rnSt3Am/Pm, wf3Am/Pm, taMax3, taMin3
      const rainAm = Number(midLand[`rnSt${offset}Am`] ?? midLand[`rnSt${offset}`] ?? 0);
      const rainPm = Number(midLand[`rnSt${offset}Pm`] ?? midLand[`rnSt${offset}`] ?? 0);
      const wfAm   = midLand[`wf${offset}Am`] ?? midLand[`wf${offset}`] ?? '';
      const wfPm   = midLand[`wf${offset}Pm`] ?? midLand[`wf${offset}`] ?? '';
      const taMax  = midTa[`taMax${offset}`] != null ? Number(midTa[`taMax${offset}`]) : null;
      const taMin  = midTa[`taMin${offset}`] != null ? Number(midTa[`taMin${offset}`]) : null;

      const maxRain = Math.max(rainAm, rainPm);
      const wf = wfPm || wfAm;

      midForecast.push({
        date:       dt,
        tempMax:    taMax,
        tempMin:    taMin,
        precipProb: maxRain,
        precipSum:  null,
        humidity:   null,
        windSpeed:  null,
        weatherCode: wfToWmo(wf, maxRain),
        source:     'mid',
        wfText:     wf || null,
      });
    }

    const forecast = [...shortForecast, ...midForecast].slice(0, 7);
    res.json({ forecast, updated: new Date().toISOString(), source: 'kma' });

  } catch(e) {
    console.error('날씨 API 오류:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
