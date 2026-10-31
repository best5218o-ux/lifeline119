/* 라이프라인 119 — 판단 엔진 (브라우저·Node 공용)
 * M1 기기 판독 매칭 · M2 배터리 하한 · M3 복구시간 분포+문자 해석 · M4 위험순위 · M5 배정
 * 모든 수치의 출처는 SOURCES 와 각 항목 src 에 있다. 「가정」 표시가 붙은 값은 실측 보정 전 설정값이다.
 */
(function (root) {
'use strict';

/* ---------- 0. 난수 ---------- */
function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function normal(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function unif(r, a, b) { return a + (b - a) * r(); }
function quantile(arr, q) { const s = Float64Array.from(arr).sort(); const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
// 표준정규 역함수 (Acklam)
function probit(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239],
    b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
    c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
    d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425; let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/* ---------- 출처 ---------- */
const SOURCES = {
  blakeman2011: 'Blakeman TC 외 (2011) Respir Care 56(11):1791 — 재택 인공호흡기 7종 벤치, VT 500·RR 20·PEEP 5, 배터리 108분(LTV 1200)~561분(HT50). doi:10.4187/respcare.01176',
  falaize2014: 'Falaize L 외 (2014) Respir Care 59(7):1048 — 5종, 호흡수 10→20 시 배터리 수명 −18±11%, PSV 누출 −13±15%. doi:10.4187/respcare.02711',
  mehrabi2018: 'Mehrabi A 외 (2018) J Emerg Manag — 비축 인공호흡기 런타임, Impact 754의 58% 사양 미달. doi:10.5055/jem.2018.0381',
  philipsEvo: 'Philips Trilogy Evo 제품 페이지 — 내장 7.5h + 분리형 7.5h',
  resmedAstral: 'ResMed Astral 150 제품 페이지 — 내장 95Wh 8h, 외장 최대 8h/개, 최대 2개',
  philipsT100: 'Philips Trilogy 100/200 액세서리 안내(2020) — 분리형 배터리 「최소 3시간」',
  inogenG5: 'Inogen One G5 규격서 — 단일 배터리 최대 6.5h, 이중 13h (유량 설정 1)',
  apt382: '기후에너지환경부 보도자료 2026-05-20 「공동주택(아파트) 정전, 24시간 내로 임시 전력복구 체계 마련한다」 붙임 — 2023~2025 아파트 정전 382건(168·118·96). 정전시간 ~1h 42·~2h 77·~3h 47·~6h 90·~12h 71·~24h 40·24h~ 15건(12h 이내 약 86%). 원인 기자재 233(61.0%)·차단기동작 60·침수 34·외물접촉 33·화재 10·기타 12. 7~8월 164건(43%). 20년 이상·세대별 3kW 이하 단지에서 약 50%. 대책: 단지 내부 고장도 한전 등이 24시간(화재·침수 48시간) 안 임시전력 — 의료기기 사용 가구 조치는 없음',
  repse: '스페인 취약전력소비자 등록제(REPSE) 초안 — 기기 없이 버틸 수 있는 시간 3단계: 30분 미만 / 30분~4시간 / 4시간 초과',
  nhis2025: '국민건강보험공단 현금급여 지급현황(2025) — 가정산소 386,441건, 인공호흡기 68,520건, 기침유발기 15,215건(지급건수)',
  msgPairs: '재난안전데이터공유플랫폼 「재난 문자」 공개 목록(2023-09~2026-10) — 정전·한전·단전·복구 관련 442건 수집·수작업 라벨, 같은 발송기관의 발생→복구 짝 36건으로 복구시간·발표 예정시각 오차 추정',
  kesco2020: '한국전기안전공사 「공공기관 비상용발전기 현황」(data.go.kr 15030557, 2020-12-31 기준) — 대전 공공시설 115곳 지오코딩(지하차도·공동구·정수장 등 제외). 정전 중에도 전기가 살아 있을 수 있는 대기·충전 장소 후보, 이용은 지자체 협약 필요',
  heat2026: '대전 서구 무더위쉼터(data.go.kr 15104075, 2026-08-27) 224곳 — 원자료 위도·경도 열 뒤바뀜 교정, 정전 범위 밖 대기 장소 후보',
  elev2026: '행정안전부 「승강기 중대한 고장 발생 내역」(data.go.kr 15048080, 2000-08~2026-07) 대전 서구 3,683건 — K-apt 서구 181단지 중 150곳에 도로명주소·단지명으로 결합',
  rescue2025: '소방청 「구조활동현황」(data.go.kr 15062386) 2025년 대전 서구 2,445건 중 승강기 사고 301건(갇힘 297건, 7월 42·8월 37건)',
  busan2023: '부산광역시 재난문자 발송현황 2023-05-19 남구 — 「3시간 가량」 → 「내일 오전 9시 복구 예정」으로 변경'
};

/* ---------- M1 기기 사양 DB ---------- */
// internal_h/ext_h: 공칭(또는 벤치 실측) 시간. null = 원문 미확인 → 엔진은 0으로 두고 「확인 필요」를 띄운다(하한은 보수적으로).
const DEVICE_DB = [
  { id: 'trilogy_evo', kind: 'vent', maker: 'Philips', model: 'Trilogy Evo', aliases: ['TRILOGY EVO', 'TRILOGYEVO', 'DS2110X11B'], internal_h: 7.5, ext_h: 7.5, ext_max: 1, basis: 'spec', src: 'philipsEvo' },
  { id: 'astral150', kind: 'vent', maker: 'ResMed', model: 'Astral 150', aliases: ['ASTRAL 150', 'ASTRAL150'], internal_h: 8, ext_h: 8, ext_max: 2, basis: 'spec', src: 'resmedAstral' },
  { id: 'trilogy100', kind: 'vent', maker: 'Philips', model: 'Trilogy 100', aliases: ['TRILOGY 100', 'TRILOGY100', 'TRILOGY 200'], internal_h: null, ext_h: 3, ext_max: 1, basis: 'spec-min', src: 'philipsT100' },
  { id: 'ltv1200', kind: 'vent', maker: 'CareFusion', model: 'LTV 1200', aliases: ['LTV 1200', 'LTV1200', 'LTV 1150'], internal_h: 1.8, ext_h: null, ext_max: 0, basis: 'bench', src: 'blakeman2011' },
  { id: 'ht50', kind: 'vent', maker: 'Newport', model: 'HT50', aliases: ['HT50', 'HT 50', 'NEWPORT HT50'], internal_h: 9.35, ext_h: null, ext_max: 0, basis: 'bench', src: 'blakeman2011' },
  { id: 'inogen_g5', kind: 'o2p', maker: 'Inogen', model: 'Inogen One G5', aliases: ['INOGEN ONE G5', 'INOGEN G5', 'IO-500'], internal_h: 6.5, ext_h: 6.5, ext_max: 1, basis: 'spec', src: 'inogenG5' },
  { id: 'o2_home', kind: 'o2s', maker: '(가정용 거치형)', model: '5L급 (배터리 유무 미확인)', aliases: ['OXYGEN CONCENTRATOR', '산소발생기', 'O2 CONCENTRATOR'], generic: true, internal_h: 0, ext_h: null, ext_max: 0, basis: 'assume0', src: null },
  { id: 'cough', kind: 'cough', maker: '(기침유발기)', model: '기침유발기', aliases: ['COUGH ASSIST', 'COUGHASSIST', 'E70'], generic: true, internal_h: null, ext_h: null, ext_max: 0, basis: 'unknown', src: null },
  { id: 'suction', kind: 'suction', maker: '(흡인기)', model: '가정용 흡인기', aliases: ['SUCTION', 'ASPIRATOR', '석션'], generic: true, internal_h: null, ext_h: null, ext_max: 0, basis: 'unknown', src: null }
];
const KIND_KO = { vent: '인공호흡기', o2p: '휴대용 산소발생기', o2s: '거치형 산소발생기', cough: '기침유발기', suction: '흡인기' };

function normText(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, ''); }
function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; const d = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= n; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return d[n]; }
// OCR 결과 텍스트 → 사양 DB 퍼지 매칭 (부분 문자열 편집거리)
function matchDevice(ocrText) {
  const T = normText(ocrText); let best = null;
  for (const dv of DEVICE_DB) for (const al of dv.aliases) {
    const A = normText(al); if (!A) continue;
    let bestD = Infinity;
    if (T.includes(A)) bestD = 0; else {
      for (let i = 0; i + A.length - 2 <= T.length; i++) for (const L of [A.length - 1, A.length, A.length + 1]) { if (i + L > T.length || L <= 0) continue; bestD = Math.min(bestD, lev(T.substr(i, L), A)); }
    }
    const score = 1 - bestD / A.length;
    if (!best || score > best.score) best = { device: dv, alias: al, score };
  }
  if (best && best.score < 0.75) return { device: null, candidate: best.device, score: best.score };
  // 종류 이름(산소발생기 등)으로만 맞으면 사양을 자동으로 채우지 않는다 — 모델은 사람이 고른다
  if (best && best.device.generic) return { device: null, candidate: best.device, score: best.score, category_only: true };
  return best;
}

/* ---------- M2 배터리 하한 (반물리 + 몬테카를로 분위) ---------- */
const BATTERY_PRIOR = {
  // 개체·사양 편차 ε ~ LogN(ln 0.95, 0.35): P(ε<1)=0.56 ≈ Mehrabi 2018 「58% 사양 미달」에 맞춘 값 (가정·보정 대상)
  eps_spec: { mu: Math.log(0.95), sd: 0.35 },
  eps_bench: { mu: 0, sd: 0.20 },            // 벤치 실측값 기반 기기는 편차를 좁게 (가정)
  heavy_setting: { mean: 0.82, sd: 0.11 },   // Falaize 2014: 호흡수 10→20 −18±11%
  leak_psv: { mean: 0.87, sd: 0.15 },        // Falaize 2014: PSV 누출 −13±15%
  fade_per_year: [0.03, 0.10],               // 연간 용량 감소 (가정 — 실측 보정 필요)
  soc_internal: [0.9, 1.0],                   // 상시 AC 연결 → 내장 배터리는 거의 만충 (가정)
  soc_external: [0.6, 1.0],                   // 외장 배터리 충전 관리 편차 (가정)
  tolerance: { A: [0, 0.5], B: [0.5, 4], C: [4, 12] } // REPSE 3단계 (h)
};
function batterySamples(hh, n, seed, opt) {
  opt = opt || {}; const r = rng(seed || 7); const dv = DEVICE_DB.find(d => d.id === hh.device) || DEVICE_DB[0];
  const P = BATTERY_PRIOR, out = new Float64Array(n), devOnly = new Float64Array(n);
  const internal = dv.internal_h == null ? (hh.internal_h_user || 0) : dv.internal_h;
  const extN = Math.min(hh.ext_count || 0, dv.ext_max || 0), extH = dv.ext_h || 0;
  const age = hh.battery_age_y == null ? 3 : hh.battery_age_y; // 모르면 3년 (가정)
  const tol = P.tolerance[hh.tier || 'A'];
  const coldScale = opt.cold || opt.heat ? 0.75 : 1; // 한파·폭염 특보 시 기기 없이 버티는 시간을 25% 줄인다 (가정)
  for (let i = 0; i < n; i++) {
    const eps = Math.exp((dv.basis === 'bench' ? P.eps_bench.mu : P.eps_spec.mu) + (dv.basis === 'bench' ? P.eps_bench.sd : P.eps_spec.sd) * normal(r));
    const fade = unif(r, P.fade_per_year[0], P.fade_per_year[1]);
    const H = clamp(1 - fade * age, 0.4, 1);
    let S = 1 + 0.05 * normal(r);
    if (hh.heavy_setting) S *= clamp(P.heavy_setting.mean + P.heavy_setting.sd * normal(r), 0.5, 1.1);
    if (hh.psv_leak) S *= clamp(P.leak_psv.mean + P.leak_psv.sd * normal(r), 0.5, 1.2);
    let dev = internal * unif(r, P.soc_internal[0], P.soc_internal[1]);
    for (let k = 0; k < extN; k++) dev += extH * unif(r, P.soc_external[0], P.soc_external[1]);
    dev *= eps * H * clamp(S, 0.4, 1.3);
    if (hh.battery_checked === false) dev = 0; // 배터리 상태를 확인한 적 없으면 하한 계산에서 없는 것으로 본다 (송파 2022: 정전 19분 뒤 인공호흡기 정지 보도)
    const backup = (hh.o2_cyl_h || 0) * unif(r, 0.8, 1.0); // 예비 산소통 (사용자 입력 시간)
    const t = dev + backup + unif(r, tol[0], tol[1]) * coldScale;
    devOnly[i] = dev; out[i] = t;
  }
  return { total: out, device: devOnly, deviceInfo: dv, unknownSpec: dv.internal_h == null && !hh.internal_h_user, unchecked: hh.battery_checked === false };
}

/* ---------- M3 복구시간 ---------- */
// 382건 구간 분포에 로그정규를 맞춘다: P(T≤12)=0.856, P(T≤24)=0.956
// 원문 7구간 전체와 대조(10-08): 기대도수 40.7·63.9·52.4·96.0·74.0·38.2·16.8 vs 실제 42·77·47·90·71·40·15, χ²=4.1(자유도 4, p≈0.39). 7구간 최우도 적합(중앙 3.6h·P90 14.7h)과도 거의 같다
function fitRestorationPrior() {
  const z1 = probit(0.856), z2 = probit(0.856 + 0.10);
  const sd = (Math.log(24) - Math.log(12)) / (z2 - z1); const mu = Math.log(12) - z1 * sd;
  return { mu, sd, median_h: Math.exp(mu), p90_h: Math.exp(mu + 1.2816 * sd), src: 'apt382' };
}
const REST_PRIOR = fitRestorationPrior();
// 지역(계통) 정전: 전국 재난문자 정전 442건(2023-09~2026-10, 재난안전데이터공유플랫폼) 중 「발생」→「복구」 짝 36건,
// 구간 중도절단 최우도 로그정규 적합(복구 문자 시각만 있으면 [직전 진행 문자, 복구 문자] 구간) — 중앙 1.46h, P90 4.2h
const REST_PRIOR_GRID = { mu: 0.378, sd: 0.83, median_h: 1.46, p90_h: 4.21, n: 36, src: 'msgPairs' };
// 발표 복구예정 대비 실제 남은 시간의 로그비: 같은 짝 자료에서 예정이 나온 10건 최우도 — 평균 −0.61(실제가 발표의 0.54배), sd 0.52, 90% 붓스트랩 −0.89~−0.26
const ETA_NOISE = { bias: -0.61, sd: 0.52, n: 10, src: 'msgPairs' };
// 단지 내부 고장이거나 어디 고장인지 모르면 382건(길다)을, 지역 계통 정전이면 문자 짝 분포를 쓴다 — 모르면 긴 쪽(보수)
function priorFor(ev) { return (ev.where === '계통' || ev.scope === '지역') && ev.where !== '단지내부' ? REST_PRIOR_GRID : REST_PRIOR; }
/* evidence: { elapsed_h, cause, eta_h (지금부터 남은 시간), blocked, restored } */
function restorationSamples(ev, n, seed) {
  const r = rng(seed || 11); const out = []; const w = [];
  const el = ev.elapsed_h || 0;
  const heavy = (ev.cause === '화재' || ev.cause === '침수') && ev.where !== '계통'; // 단지 전기실 화재·침수는 설비 교체 → 장기(조치원 2026: 5일 5시간). 한전 계통 설비는 우회 공급으로 짧을 수 있다(남대전변전소 2021: 2시간 30분에 98%)
  let tries = 0;
  while (out.length < n && tries < n * 200) {
    tries++;
    const PR = heavy ? REST_PRIOR : priorFor(ev);
    let T = Math.exp(PR.mu + PR.sd * normal(r));
    if (heavy && T < 12) continue;               // 설비 소손: 382건 분포의 12h 초과 꼬리로 조건화 (규칙)
    if (T <= el) continue;                        // 이미 지난 시간은 제외(아직 정전 중)
    if (ev.blocked && T < el + 3) continue;       // 「복구 작업 불가」: 최소 3h 추가 (가정)
    let wt = 1;
    if (ev.eta_h != null) { const z = (Math.log(Math.max(1e-3, T - el)) - Math.log(Math.max(0.05, ev.eta_h)) - ETA_NOISE.bias) / ETA_NOISE.sd; wt = Math.exp(-0.5 * z * z); }
    out.push(T - el); w.push(wt);
  }
  // 가중 재표집
  const W = w.reduce((a, b) => a + b, 0); const res = new Float64Array(n);
  const cdf = []; let c = 0; for (const x of w) { c += x / W; cdf.push(c); }
  for (let i = 0; i < n; i++) { const u = r(); let lo = 0, hi = cdf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; } res[i] = out[lo]; }
  return res;
}

/* 재난문자·한전 안내 해석 (규칙 기반; LLM 결과와 같은 스키마) */
function parseNotice(text, sentAt) {
  const t = String(text || '');
  const o = { where: null, mentions_outage: /정전|전기\s*공급|단전|신호등\s*(이\s*)?꺼|불이\s*(다\s*)?꺼|(개폐기|변압기|전신주|전주)[^.]{0,12}(들이받|충돌|파손|화재)/.test(t), kind: '기타', cause: null, eta_h: null, eta_abs: null, blocked: false, restored: false, evidence: [] };
  if (!o.mentions_outage) return o;
  if (/복구\s*(완료|되었|됨)|정상\s*(공급|송전)|전기가?\s*다시/.test(t)) { o.kind = '복구'; o.restored = true; }
  else if (/불가|불가능|지연|늦어|어렵/.test(t)) { o.kind = '지연'; o.blocked = /불가|불가능/.test(t); }
  else if (/발생|정전으로|정전\s*되|곳곳에서|정전\s*시간|복구\s*(작업|예정)|정전이\s*발생|들이받|충돌|신호등\s*(이\s*)?꺼/.test(t) && !/대비|우려|예상됩니다|사전확보|준비하시/.test(t)) o.kind = '발생';
  else if (/대비|우려|예상|준비|점검|신고/.test(t)) o.kind = '예보·안내';
  o.scope = scopeOf(t);
  if (/변전소|선로|전신주|전주|개폐기|배전|한전\s*설비/.test(t)) o.where = '계통';
  else if (/전기실|수전|구내|단지\s*(내|내부)|아파트\s*(내부|자체)|지하\s*전기/.test(t)) o.where = '단지내부';
  const causes = [['화재', /화재|불이|소손/], ['침수', /침수|물이\s*차/], ['외물', /추돌|들이받|충돌|전신주|수목|까치|외물|크레인/], ['기상', /강풍|태풍|낙뢰|호우/], ['차단기', /차단기/], ['기자재', /변압기|설비\s*(고장|장애)|기자재|개폐기|케이블/]];
  for (const [c, re] of causes) if (re.test(t)) { o.cause = c; o.evidence.push(c); break; }
  let m;
  const base = sentAt ? new Date(sentAt) : null;
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*시간\s*(가량|정도|내외|이내|소요)?/)) && !/\d+\s*시간\s*전/.test(t)) { o.eta_h = parseFloat(m[1]); o.evidence.push(m[0]); }
  const mm = [...t.matchAll(/(내일|익일|금일|오늘|명일)?\s*(오전|오후|새벽)?\s*(\d{1,2})\s*시\s*(\d{1,2}\s*분)?\s*(까지|경|에)?\s*(복구|재개|정상|송전|완료)/g)];
  if (mm.length) {
    const x = mm[mm.length - 1]; let h = parseInt(x[3]); const mi = x[4] ? parseInt(x[4]) : 0;
    if (x[2] === '오후' && h < 12) h += 12;
    const dayAdd = /내일|익일|명일/.test(x[1] || '') ? 1 : 0;
    o.eta_abs = { day_add: dayAdd, h, m: mi }; o.evidence.push(x[0].trim());
    if (base) { const d = new Date(base); d.setDate(d.getDate() + dayAdd); d.setHours(h, mi, 0, 0); if (d <= base && !dayAdd) d.setDate(d.getDate() + 1); o.eta_h = (d - base) / 3.6e6; }
  }
  return o;
}

/* ---------- 학습 모델(재난문자 해석 AI) 결과 → 같은 스키마 ---------- */
// 모델이 찾은 시각·소요 구간을 실제 시각으로 바꾼다 (파이썬 timeparse.py 와 같은 규칙)
function parsePoint(s, sent, mode) {
  const t = String(s).replace(/\s/g, ''); let day = /내일|익일|명일/.test(t) ? 1 : 0;
  const md = t.match(/(\d{1,2})\.(\d{1,2})\./); const m = t.replace(/\d{1,2}\.\d{1,2}\./, '').match(/(\d{1,2})[:시](\d{1,2})?/);
  if (!m) return null; let h = +m[1], mi = m[2] ? +m[2] : 0; if (h === 24) { h = 0; day += 1; }
  const pm = t.includes('오후'), am = t.includes('오전') || t.includes('새벽');
  const base = new Date(sent); base.setHours(0, 0, 0, 0); if (md) { base.setMonth(+md[1] - 1); base.setDate(+md[2]); day = 0; }
  let hours = [h]; if (pm && h < 12) hours = [h + 12]; else if (!am && !pm && h < 12) hours = [h, h + 12];
  const cands = []; for (const hh of hours) for (const dd of ((day || md) ? [day] : [-1, 0, 1])) cands.push(new Date(base.getTime() + dd * 864e5 + hh * 36e5 + mi * 6e4));
  const sT = new Date(sent).getTime(), tol = 10 * 6e4;
  if (mode === 'past') { const ok = cands.filter(c => c.getTime() <= sT + tol); return ok.length ? new Date(Math.max(...ok)) : new Date(Math.min(...cands)); }
  const ok = cands.filter(c => c.getTime() >= sT - tol); return ok.length ? new Date(Math.min(...ok)) : new Date(Math.max(...cands));
}
function parseDur(s) {
  const t = String(s).replace(/\s/g, ''); if (t.includes('반나절')) return 5;
  let m = t.match(/(\d+(?:\.\d+)?)(?:~(\d+(?:\.\d+)?))?일/); if (m) { const a = +m[1], b = +(m[2] || m[1]); return 24 * (a + b) / 2; }
  let hrs = 0, got = false; m = t.match(/(\d+(?:\.\d+)?)(?:[~-](\d+(?:\.\d+)?))?시간/);
  if (m) { const a = +m[1], b = +(m[2] || m[1]); hrs += (t.includes('최대') || t.includes('이내')) ? b : (a + b) / 2; got = true; }
  m = t.match(/(?:시간)?(\d+)(?:~(\d+))?분/); if (m) { const a = +m[1], b = +(m[2] || m[1]); hrs += (t.includes('이내') ? b : (a + b) / 2) / 60; got = true; }
  return got ? hrs : null;
}
function scopeOf(t) { return /단지|아파트|오피스텔|관리사무소|세대\s*정전/.test(t) ? '단지' : (/일대|일원|일부\s*지역|지역|[가-힣]+(동|면|읍|리)\s/.test(t) ? '지역' : null); }
function fromAI(text, sentAt, ai) {
  const sent = new Date(sentAt); const o = { source: 'ai', kind: ai.kind, cause: ai.cause, where: null, scope: scopeOf(text), eta_h: null, onset: null, done: null, spans: ai.spans || [], restored: ai.kind === '복구', blocked: false, mentions_outage: ai.kind !== '무관' };
  if (/변전|선로|고압선|전신주|전봇대|개폐기|지상변압기|전선|단선|단락|계통/.test(text)) o.where = '계통';
  if (/단지\s*내|관리사무소|고객설비|오피스텔|지하\s*\d?층|아파트\s*내|전기실|수전/.test(text)) o.where = '단지내부';
  let eta = null, dur = null;
  for (const sp of o.spans) {
    if (sp.label === 'ONSET' && !o.onset) o.onset = parsePoint(sp.text, sent, ai.kind === '예정' ? 'future' : 'past');
    else if (sp.label === 'ETA') eta = parsePoint(sp.text, sent, 'future');
    else if (sp.label === 'DONE') o.done = parsePoint(sp.text, sent, 'past');
    else if (sp.label === 'DUR') { const d = parseDur(sp.text); if (d != null) dur = d; }
  }
  if (eta) o.eta_h = Math.max(0, (eta - sent) / 36e5); else if (dur != null) o.eta_h = dur;
  return o;
}

/* ---------- M4 위험순위 ---------- */
function haversineKm(a, b) { const R = 6371, toR = x => x * Math.PI / 180; const dLa = toR(b.lat - a.lat), dLo = toR(b.lon - a.lon); const h = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function assess(households, event, opt) {
  opt = opt || {}; const n = opt.n || 1000;
  const rest = restorationSamples(event, n, 101);
  const restP90 = quantile(rest, 0.9), restP50 = quantile(rest, 0.5);
  const res = households.map((hh, idx) => {
    const bs = batterySamples(hh, n, 1000 + idx * 7, { cold: event.cold, heat: event.heat });
    const el = event.elapsed_h || 0;
    const rem = bs.total.map(x => x - el);
    let fail = 0; for (let i = 0; i < n; i++) if (rem[i] < rest[i]) fail++;
    const p = fail / n, batP10 = quantile(rem, 0.1), batP50 = quantile(rem, 0.5);
    const margin = batP10 - restP90;
    const flags = [];
    if (bs.unknownSpec) flags.push('배터리 사양 미확인 → 0으로 계산');
    if (bs.unchecked) flags.push('배터리 상태 점검 기록 없음 → 0으로 계산');
    if ((event.cause === '화재' || event.cause === '침수') && event.where !== '계통') flags.push('장기 정전 모드: 단지 설비 화재·침수 — 교대 배터리·이송 계획');
    if (event.cold) flags.push('한파특보');
    if (event.heat) flags.push('폭염특보');
    if (hh.alone) flags.push('독거(수동 환기 도울 사람 없음)');
    if (hh.use24) flags.push('24시간 상시 사용');
    if (hh.trach) flags.push('기관절개');
    if ((hh.floor || 0) >= 6) flags.push(hh.floor + '층 — 승강기 정지 시 이송 어려움' + (hh.elev_faults ? ` · 이 단지 승강기 중대고장 ${hh.elev_faults}건(2021~, 행안부)` : ''));
    let tier = margin >= 0 ? '관찰' : (batP10 < 2 ? '위급' : '경계');
    if (tier === '관찰' && p >= 0.10) tier = '경계';
    return { hh, p_fail: p, bat_p10: batP10, bat_p50: batP50, rest_p90: restP90, rest_p50: restP50, margin, tier, flags, device: bs.deviceInfo };
  });
  const order = { '위급': 0, '경계': 1, '관찰': 2 };
  // 같은 등급·같은 여유면 24시간 상시 사용·기관절개 가구를 앞으로 (홋카이도 2018 피난입원 PR 9.07·3.57, 方波見 2022)
  const clin = a => (a.hh.use24 ? 1 : 0) + (a.hh.trach ? 1 : 0);
  res.sort((a, b) => order[a.tier] - order[b.tier] || Math.round((a.margin - b.margin) * 4) / 4 || clin(b) - clin(a) || b.p_fail - a.p_fail);
  return { list: res, rest: { p50: restP50, p90: restP90 }, prior: priorFor(event) };
}

/* ---------- M5 배정 (마감시각 있는 차량경로 휴리스틱) ---------- */
const DISPATCH = { road_factor: 1.4, speed_kmh: 30, service_h: 0.25, dispatch_delay_h: 0.1 }; // 가정
/* 자원 호환·가용 — 원안(전력안심망 AI) 사전질의 답변: 「전압·출력·커넥터 등 기기 호환성, 잔량, 가용 여부와 이동시간을 우선 확인한 뒤 적합한 자원만 후보로」
   기기 소비전력·자원 출력은 시제품 가정값(화면에 「가정」 표시) — 운영 시 검증 사양 DB·자원대장 값으로 바꾼다 */
const DEVICE_POWER = { vent: { w: 100, in: 'AC220' }, o2p: { w: 120, in: 'AC220' }, o2s: { w: 350, in: 'AC220' }, cough: { w: 250, in: 'AC220' }, suction: { w: 100, in: 'AC220' } };
const RES_SPEC = {
  '119': { label: '이동식발전기', out: ['AC220'], w: 2000 },
  rental: { label: '기종 전용 외장배터리 + 300W 파워뱅크', out: ['AC220'], w: 300, packs: ['trilogy_evo', 'astral150', 'trilogy100', 'inogen_g5'] },
  ess: { label: '이동형 ESS', out: ['AC220'], w: 1000, wh: 1500 }
};
function resSpec(r) { return Object.assign({}, RES_SPEC[r.kind] || RES_SPEC['119'], r.spec || {}); }
function compat(r, dev) {
  if (r.avail === false) return { ok: false, why: r.busy || '사용 중' };
  if (!dev) return { ok: true, how: '' };
  const sp = resSpec(r), need = DEVICE_POWER[dev.kind] || { w: 350, in: 'AC220' };
  if (sp.packs && sp.packs.includes(dev.id)) return { ok: true, how: '전용 외장배터리' };
  if (!sp.out.includes(need.in)) return { ok: false, why: '전압·커넥터 불일치' };
  if (need.w > sp.w) return { ok: false, why: `출력 부족 (${sp.w}W, 필요 ${need.w}W)` };
  if (sp.wh) { const soc = r.soc == null ? 1 : r.soc, h = sp.wh * soc * 0.85 / need.w; if (h < 1) return { ok: false, why: '잔량 부족' }; return { ok: true, how: `AC ${sp.w}W · 잔량으로 약 ${h.toFixed(0)}시간` }; }
  return { ok: true, how: `AC ${sp.w}W` };
}
function travelH(a, b) { return haversineKm(a, b) * DISPATCH.road_factor / DISPATCH.speed_kmh; }
/* tasks: [{id, lat, lon, deadline_h}] , resources: [{id, name, lat, lon, kind, cap}] */
function planDispatch(tasks, resources, policy) {
  policy = policy || 'edf';
  const R = resources.map(r => ({ ...r, t: DISPATCH.dispatch_delay_h, at: { lat: r.lat, lon: r.lon }, left: r.cap || 1, route: [] }));
  let T = tasks.slice();
  if (policy === 'edf') T.sort((a, b) => a.deadline_h - b.deadline_h);
  else if (policy === 'registry') T.sort((a, b) => (a.reg_order || 0) - (b.reg_order || 0));
  else if (policy === 'nearest') { const c = R.reduce((s, r) => ({ lat: s.lat + r.lat / R.length, lon: s.lon + r.lon / R.length }), { lat: 0, lon: 0 }); T.sort((a, b) => haversineKm(c, a) - haversineKm(c, b)); }
  const plan = [];
  for (const k of T) {
    let best = null, bestAny = null;
    for (const r of R) {
      if (r.left <= 0 || !compat(r, k.dev).ok) continue;
      const arr = r.t + travelH(r.at, k);
      if (!bestAny || arr < bestAny.arr) bestAny = { r, arr };
      if (arr <= k.deadline_h && (!best || arr < best.arr)) best = { r, arr };
    }
    // AI(edf) 1차: 어떤 자원도 기한 안에 못 가는 집은 잠시 미루고(기한 안에 갈 수 있는 집을 먼저 묶는다) 즉시 전화·수동환기 안내 대상으로 표시
    if (policy === 'edf' && !best) { plan.push({ task: k, res: null, arr: bestAny ? bestAny.arr : null, ok: false, lane: 'call' }); continue; }
    const pick = policy === 'edf' ? best : bestAny;
    if (!pick) { plan.push({ task: k, res: null, arr: null, ok: false, lane: 'none' }); continue; }
    const r = pick.r; r.left--; r.t = pick.arr + DISPATCH.service_h; r.at = { lat: k.lat, lon: k.lon }; r.route.push(k.id);
    plan.push({ task: k, res: r.id, res_name: r.name, how: compat(r, k.dev).how, arr: pick.arr, ok: pick.arr <= k.deadline_h, lane: 'power' });
  }
  if (policy === 'edf') {
    // 2차: 남은 자원을 기한 넘긴 집에 가장 빨리 닿는 순으로 보낸다 (늦더라도 간다 — 실제 소진시각은 하한보다 늦을 수 있다)
    for (const p of plan.filter(q => q.lane === 'call').sort((a, b) => a.task.deadline_h - b.task.deadline_h)) {
      let b = null; for (const r of R) { if (r.left <= 0 || !compat(r, p.task.dev).ok) continue; const arr = r.t + travelH(r.at, p.task); if (!b || arr < b.arr) b = { r, arr }; }
      if (!b) continue; const r = b.r; r.left--; r.t = b.arr + DISPATCH.service_h; r.at = { lat: p.task.lat, lon: p.task.lon }; r.route.push(p.task.id);
      Object.assign(p, { res: r.id, res_name: r.name, how: compat(r, p.task.dev).how, arr: b.arr, ok: false, lane: 'late' });
    }
    improveSwap(plan, resources);
  }
  const okN = plan.filter(p => p.ok).length;
  return { plan, ok: okN, late: plan.length - okN, routes: Object.fromEntries(R.map(r => [r.id, r.route])) };
}
function improveSwap(plan, resources) {
  const byId = Object.fromEntries(resources.map(r => [r.id, r]));
  for (let it = 0; it < 3; it++) for (const a of plan) if (!a.ok && a.res) for (const b of plan) {
    if (!b.ok || !b.res || a === b) continue;
    const ra = byId[a.res], rb = byId[b.res]; if ((ra.cap || 1) > 1 || (rb.cap || 1) > 1) continue; // 단일 출동 자원끼리만
    if (!compat(rb, a.task.dev).ok || !compat(ra, b.task.dev).ok) continue; // 바꿔도 호환돼야 한다
    const aNew = DISPATCH.dispatch_delay_h + travelH(rb, a.task), bNew = DISPATCH.dispatch_delay_h + travelH(ra, b.task);
    if (aNew <= a.task.deadline_h && bNew <= b.task.deadline_h) {
      [a.res, b.res] = [b.res, a.res]; [a.res_name, b.res_name] = [b.res_name, a.res_name]; a.how = compat(rb, a.task.dev).how; b.how = compat(ra, b.task.dev).how; a.arr = aNew; b.arr = bNew; a.ok = true; b.ok = true; break;
    }
  }
}

/* ---------- 문안 (LLM 없을 때 규칙 기반) ---------- */
function fmtH(h) { if (h == null || !isFinite(h)) return '-'; if (h < 0) return '소진'; const H = Math.floor(h), M = Math.round((h - H) * 60); return (H ? H + '시간 ' : '') + M + '분'; }
function templateOrder(a, asg) {
  return `[라이프라인 119 배정안 — 승인 대기]\n대상: ${a.hh.label} (${a.hh.addr || ''})\n기기: ${KIND_KO[a.device.kind]} ${a.device.model}\n배터리 하한(P10): ${fmtH(a.bat_p10)} / 복구 상한(P90): ${fmtH(a.rest_p90)} → 여유 ${fmtH(a.margin)}\n위험: ${a.tier} (배터리가 먼저 끝날 확률 ${(a.p_fail * 100).toFixed(0)}%)\n배정: ${asg && asg.res_name ? asg.res_name + ' — 도착 예상 ' + fmtH(asg.arr) : '배정 가능한 자원 없음'}\n특이: ${a.flags.join(', ') || '없음'}\n※ 사람(상황요원)이 승인해야 출동합니다.`;
}
function templateHousehold(a) {
  const lines = [`[라이프라인 119] 정전이 확인되었습니다.`, `기기(${KIND_KO[a.device.kind]}) 배터리로 최소 ${fmtH(a.bat_p10)} 버틸 것으로 계산됩니다.`];
  if (a.tier !== '관찰') lines.push('119가 비상전원을 준비하고 있습니다. 전화를 받을 수 있게 해 주세요.');
  if (a.device.kind === 'vent') lines.push('배터리 경보가 울리면 앰부백(수동 환기)을 준비하세요.');
  if (a.device.kind === 'o2s') lines.push('예비 산소통으로 바꾸고 유량을 처방대로 맞추세요.');
  lines.push('발전기는 실내·현관·베란다에서 돌리지 마세요(일산화탄소).');
  return lines.join('\n');
}

const API = { rng, normal, quantile, probit, SOURCES, DEVICE_DB, KIND_KO, matchDevice, BATTERY_PRIOR, batterySamples, REST_PRIOR, REST_PRIOR_GRID, priorFor, ETA_NOISE, restorationSamples, parseNotice, fromAI, parsePoint, parseDur, scopeOf, assess, haversineKm, DISPATCH, travelH, planDispatch, compat, resSpec, RES_SPEC, DEVICE_POWER, fmtH, templateOrder, templateHousehold, fitRestorationPrior };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.LL = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
