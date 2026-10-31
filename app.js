/* 라이프라인 119 — 화면 (v7: 한 화면 한 판단) */
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const G = { '위급': 0, '경계': 1, '관찰': 2 };
const GNAME = ['지금 가야 함', '곧 위험', '괜찮음'];
const TCOL = { '위급': '#c81e33', '경계': '#f59e0b', '관찰': '#15803d' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const D = {}; let AI = { live: false, provider: null };
const fmt = h => LL.fmtH(h);

async function j(u) { const r = await fetch(u); return r.json(); }
async function ai(task, payload) {
  if (!AI.live) return null;
  try { const r = await fetch('/api/llm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, ...payload }) }); if (!r.ok) return null; return await r.json(); } catch (e) { return null; }
}
function setAIBadge() {
  const m = $('#aiMode'); const txt = NAI.ready ? '문자 해석 AI 작동 중' : NAI.failed ? '규칙 모드' : 'AI 불러오는 중…';
  m.textContent = txt + (AI.live ? ` · ${AI.provider}` : ''); m.classList.toggle('live', NAI.ready);
  m.title = NAI.ready ? '전국 재난문자 정전 442건으로 학습한 KoELECTRA-small 모델이 브라우저 안에서 문자를 읽습니다 (서버로 보내지 않음)' : 'AI 모델을 불러오는 동안은 규칙으로 읽습니다';
}
async function checkAI() {
  if (/github\.io$/.test(location.hostname)) { setAIBadge(); return; } // 정적 시연 페이지에는 /api/llm 서버가 없다
  try { const r = await fetch('/api/llm'); if (r.ok) { const x = await r.json(); AI = { live: !!x.live, provider: x.provider }; } } catch (e) { }
  setAIBadge();
}

/* ---------- 탭 ---------- */
function showView(v) {
  $$('.tab').forEach(x => { const on = x.dataset.view === v; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
  $$('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v));
  setTimeout(() => { mapOps && mapOps.invalidateSize(); mapPlan && mapPlan.invalidateSize(); }, 60);
  if (v === 'plan') initPlan(); if (v === 'home') initHome();
  window.scrollTo(0, 0);
}
$$('.tab').forEach(b => b.onclick = () => showView(b.dataset.view));
function modal(html) { $('#mBody').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
$('#mClose').onclick = closeModal; $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ================= 119 상황실 ================= */
let mapOps, layerOps, routeLayer;
const S = { sc: null, key: 'S2', step: 0, ev: null, A: null, extra: [], P: null, Pr: null, approved: {}, over: {}, lastParse: null };
function tiles(m) { L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19, className: 'tiles' }).addTo(m); }
function stepsOf(key) {
  if (key === 'S1') return [{ label: '20:01 정전', t: 0, notices: 1 }, { label: '20:05', t: 4 / 60, notices: 1 }, { label: '20:20 (실제) 인공호흡기 멈춤 확인', t: 19 / 60, notices: 1 }, { label: '23:40 복구', t: 3.65, notices: 1, restored: true, msg: '전기가 돌아왔습니다 — 실제 3시간 39분' }];
  if (key === 'S5') return [{ label: '05:15 변전소 화재', t: 0, notices: 0 }, { label: '05:35 정전 안내', t: 20 / 60, notices: 1 }, { label: '07:45 98% 복구', t: 2.5, notices: 1, restored: true, msg: '약 2시간 30분 만에 98% 복구 (1천여 가구는 더 늦게)' }];
  if (key === 'S4') return [{ label: '23:34 정전', t: 0, notices: 0 }, { label: '23:50 관리사무소 안내', t: 16 / 60, notices: 1 }, { label: '02:00', t: 2.43, notices: 1 }, { label: '05:40 (대구 실제 복구 시각)', t: 6.1, notices: 1 }];
  if (key === 'S3') return [{ label: '04:22 충돌·정전', t: 0, notices: 0 }, { label: '04:30 119 신고', t: 8 / 60, notices: 1 }, { label: '06:13 복구', t: 111 / 60, notices: 1, restored: true, msg: '06:13쯤 복구 — 약 1시간 50분 (보도)' }];
  return [{ label: '19:30 정전', t: 0, notices: 0 }, { label: '19:40 문자① 「3시간」', t: 10 / 60, notices: 1 }, { label: '21:10 문자② 「내일 9시」', t: 100 / 60, notices: 2 }];
}
function clockStr(t0, h) { const d = new Date(new Date(t0).getTime() + h * 3.6e6); return d.toTimeString().slice(0, 5); }
function initOps() {
  mapOps = L.map('map', { zoomControl: true }); tiles(mapOps); layerOps = L.layerGroup().addTo(mapOps); routeLayer = L.layerGroup().addTo(mapOps);
  $('#scSel').onchange = () => loadScenario($('#scSel').value);
  $('#pasteForm').onsubmit = async e => { e.preventDefault(); const t = $('#noticeIn').value.trim(); if (!t) return; const now = new Date(new Date(S.sc.t0).getTime() + stepsOf(S.key)[S.step].t * 3.6e6); S.extra.push({ at: now.toISOString(), text: t, user: true }); $('#noticeIn').value = ''; await runStep(); };
  loadScenario('S2');
}
function loadScenario(key) {
  S.key = key; S.sc = D.sc[key]; LL.setRoad(D.road && D.road.sc && D.road.sc[key]); S.step = 0; S.extra = []; S.approved = {}; S.over = {}; $('#scSel').value = key;
  mapOps.setView(S.sc.center, S.sc.zoom);
  $('#steps').innerHTML = stepsOf(key).map((s, i) => `<button data-i="${i}">${esc(s.label)}</button>`).join('');
  $$('#steps button').forEach(b => b.onclick = () => { S.step = +b.dataset.i; runStep(); });
  renderReplay(); runStep();
}
/* ----- 재난문자 해석 AI (KoELECTRA-small 미세조정 · 브라우저 안 ONNX) ----- */
const NAI = { ready: false, failed: false, loading: null, cache: new Map() };
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
function loadNoticeAI() {
  if (NAI.loading) return NAI.loading;
  NAI.loading = (async () => {
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js');
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/'; ort.env.wasm.numThreads = 1;
      const [voc, lab] = await Promise.all([fetch('models/notice-ko/vocab.txt').then(r => r.text()), fetch('models/notice-ko/labels.json').then(r => r.json())]);
      NAI.tok = NoticeAI.makeTokenizer(voc); NAI.labels = lab;
      NAI.sess = await ort.InferenceSession.create('models/notice-ko/model_int8.onnx', { executionProviders: ['wasm'] });
      NAI.ready = true;
    } catch (e) { console.warn('문자 해석 AI를 불러오지 못해 규칙으로 동작합니다', e); NAI.failed = true; }
    setAIBadge(); if (S.sc && !NAI.failed) runStep();
  })();
  return NAI.loading;
}
async function aiParse(text) {
  if (!NAI.ready) return null; if (NAI.cache.has(text)) return NAI.cache.get(text);
  const e = NAI.tok.encode(text, 128), n = e.ids.length;
  const r = await NAI.sess.run({ input_ids: new ort.Tensor('int64', BigInt64Array.from(e.ids.map(BigInt)), [1, n]), attention_mask: new ort.Tensor('int64', BigInt64Array.from(e.ids.map(() => 1n)), [1, n]) });
  const d = NoticeAI.decode(text, e, [...r.kind.data], [...r.cause.data], [...r.tags.data], NAI.labels); NAI.cache.set(text, d); return d;
}
const SPAN_KO = { ONSET: '정전 시각', ETA: '복구 예정', DUR: '소요', DONE: '복구 시각', HH: '세대 수' };
function highlight(text, spans) {
  if (!spans || !spans.length) return esc(text); let out = '', i = 0;
  for (const sp of [...spans].sort((a, b) => a.s - b.s)) { out += esc(text.slice(i, sp.s)) + `<mark class="sp sp-${sp.label}" title="${SPAN_KO[sp.label]}">${esc(text.slice(sp.s, sp.e))}</mark>`; i = sp.e; }
  return out + esc(text.slice(i));
}
async function evFromNotices(st) {
  const notices = S.sc.notices.slice(0, st.notices).concat(S.extra);
  const ev = { elapsed_h: st.t, cold: S.sc.cold, heat: S.sc.heat, cause: S.key === 'S1' ? '기자재' : null, eta_h: null, blocked: false, scope: S.sc.scope || null };
  let last = null;
  for (const n of notices) {
    const d = await aiParse(n.text);
    const rule = LL.parseNotice(n.text, n.at);
    const p = d ? LL.fromAI(n.text, n.at, d) : rule; const hAt = (new Date(n.at) - new Date(S.sc.t0)) / 3.6e6;
    if (d) { p.ai = d; // AI가 놓친 값은 규칙으로 채우고, 둘이 다르면 사람 확인 표시
      if (p.eta_h == null && rule.eta_h != null) { p.eta_h = rule.eta_h; p.fill = '복구 예정은 규칙으로 보완'; }
      if (!p.cause && rule.cause) p.cause = rule.cause;
      if (p.eta_h != null && rule.eta_h != null && Math.abs(p.eta_h - rule.eta_h) > 0.5) p.disagree = true; }
    if (p.cause) ev.cause = p.cause; if (p.where) ev.where = p.where; if (!S.sc.scope && p.scope) ev.scope = p.scope;
    if (p.eta_h != null) ev.eta_h = Math.max(0, p.eta_h - (st.t - hAt));
    if (p.kind === '지연') ev.blocked = p.blocked;
    last = { n, p };
  }
  return { ev, last, count: notices.length };
}
async function runStep() {
  const st = stepsOf(S.key)[S.step]; $$('#steps button').forEach((b, i) => b.classList.toggle('on', i === S.step));
  $('#simTime').textContent = clockStr(S.sc.t0, st.t); $('#simElapsed').textContent = st.t ? '정전 ' + fmt(st.t) + '째' : '정전 직후';
  const { ev, last, count } = await evFromNotices(st); S.ev = ev; S.lastParse = last;
  if (st.restored) {
    S.A = null; S.P = null; $('#status').classList.add('restored');
    $('#stLine').innerHTML = '✅ ' + esc(st.msg); $('#stSub').textContent = '실제 기록과 모델을 비교하려면 지도 아래 「실제 기록과 비교하기」를 여세요.';
    $('#queue').innerHTML = '<div class="grp"><p class="empty">복구되어 남은 출동이 없습니다.</p></div>';
    layerOps.clearLayers(); routeLayer.clearLayers(); drawResources(); return;
  }
  $('#status').classList.remove('restored');
  S.A = LL.assess(S.sc.households, ev, { n: 800 });
  computePlan();
  renderStatus(ev, last, count); renderQueue(); drawMap();
  if (AI.live && last) { const r = await ai('parse_notice', { text: last.n.text, sent_at: last.n.at }); if (r && r.result) { const same = r.result.kind === last.p.kind && (r.result.cause || null) === (last.p.cause || null); $('#stSub').insertAdjacentHTML('beforeend', ` · AI 교차확인(${esc(AI.provider)}): ${same ? '같은 해석' : '해석 다름 — 사람 확인'}`); } }
}
function computePlan() {
  const tasks = S.A.list.filter(a => a.tier !== '관찰').map(a => ({ id: a.hh.id, lat: a.hh.lat, lon: a.hh.lon, deadline_h: Math.max(0, a.bat_p10), reg_order: a.hh.reg_order, dev: a.device }));
  S.P = LL.planDispatch(tasks, S.sc.resources, 'edf'); S.Pr = LL.planDispatch(tasks, S.sc.resources, 'registry'); S.nTask = tasks.length;
  S.byHH = Object.fromEntries(S.P.plan.map(p => [p.task.id, p]));
}
function assignOf(a) { if (S.over[a.hh.id]) return S.over[a.hh.id]; return S.byHH[a.hh.id] || null; }
function renderStatus(ev, last, count) {
  const c = [0, 0, 0]; S.A.list.forEach(a => c[G[a.tier]]++);
  const wx = S.sc.cold ? '❄️ 한파특보 · ' : S.sc.heat ? '🌡️ 폭염특보 · ' : '';
  $('#stLine').innerHTML = `전기는 <em>최대 ${fmt(S.A.rest.p90)}</em> 뒤에 돌아올 수 있습니다. 지금 가야 할 집 <em>${c[0]}곳</em>, 곧 위험한 집 <em>${c[1]}곳</em>`;
  let sub = wx;
  const pr = LL.priorFor(ev);
  if (last) { const p = last.p; const who = p.ai ? '<b class="aitag">AI가 읽음</b>' : '규칙으로 읽음';
    sub += `${who} 「${p.ai ? highlight(last.n.text, p.ai.spans) : esc(last.n.text.length > 60 ? last.n.text.slice(0, 60) + '…' : last.n.text)}」 → ${p.cause ? '원인 ' + p.cause : '원인 미상'}${p.eta_h != null ? ' · 복구 예정 ' + fmt(p.eta_h) + ' 뒤' : ''}${p.fill ? ' (' + p.fill + ')' : ''}${p.disagree ? ' <b>· AI와 규칙이 달라 확인 필요</b>' : ''}`; }
  else sub += '아직 안내문이 없어 기록으로 복구시간을 잡았습니다';
  sub += ` · 복구시간 기준: ${pr === LL.REST_PRIOR ? '아파트 정전 382건(단지 내부·모를 때)' : '전국 재난문자 정전 실측 36건(지역 정전)'} 분포 — 한전 실시간 예측값 아님`;
  if (S.nTask) {
    // 복구 전 배터리가 끝날 것으로 보이는 집(기대치) = Σ P(배터리 < 복구), 배터리 최소 안에 도착한 집은 뺀다
    const pf = Object.fromEntries(S.A.list.map(a => [a.hh.id, a.p_fail]));
    const lost = pl => pl.plan.filter(q => !q.ok).reduce((s, q) => s + pf[q.task.id], 0);
    const all = S.A.list.reduce((s, a) => s + a.p_fail, 0), eA = lost(S.P), eR = lost(S.Pr), f1 = x => x.toFixed(1);
    sub += ` · 복구 전 배터리가 끝날 집(예측 기대치) <b>${f1(all)}곳 → 추천대로 보내면 ${f1(eA)}곳</b>`;
    if (Math.abs(eR - eA) >= 0.05) sub += ` (명부 순서대로 보내면 ${f1(eR)}곳)`;
  }
  $('#stSub').innerHTML = sub;
}
const SHORT = f => f.startsWith('배터리 사양') ? ['사양 미확인 → 0으로 계산', 1] : f.startsWith('배터리 상태') ? ['배터리 점검 기록 없음 → 0으로 계산', 1] : f.startsWith('장기') ? ['장기 정전(단지 설비)', 1] : f.startsWith('독거') ? ['혼자 계심', 1] : f === '24시간 상시 사용' ? ['24시간 사용', 0] : f === '기관절개' ? ['기관절개', 0] : /층 —/.test(f) ? [f.split(' —')[0] + ' (승강기)', 0] : null;
function chips(a) { return a.flags.map(SHORT).filter(Boolean).slice(0, 3).map(([t, w]) => `<span class="chip${w ? ' w' : ''}">${esc(t)}</span>`).join(''); }
const RCOL = r => r.kind === '119' ? '#1d4ed8' : r.kind === 'ess' ? '#0f766e' : '#7c3aed';
const ICON = id => { const r = (S.sc.resources || []).find(x => x.id === id); return !r || r.kind === '119' ? '🚒' : r.kind === 'ess' ? '🔌' : '🔋'; };
function leftTxt(a) { return a.bat_p10 <= 0.02 ? '배터리 이미 끝났을 수 있음' : `배터리 최소 ${fmt(a.bat_p10)}`; }
function recTxt(a) {
  const g = G[a.tier]; if (g === 2) return '📱 문자로 상황만 안내';
  const p = assignOf(a);
  if (p && p.res_name && (p.lane === 'power' || p.lane === 'manual')) return `${ICON(p.res)} <b>${esc(p.res_name)}</b>${p.how ? ' <small>(' + esc(p.how) + ')</small>' : ''} · <b>${fmt(p.arr)}</b> 뒤 도착`;
  if (p && p.lane === 'site') return `📞 전화 안내 → 🏛️ <b>${esc(p.site)}</b> — 이동해 예비 배터리 충전·대기 <small>(${esc(p.why)})</small>`;
  if (p && p.res_name && p.lane === 'late') return `📞 먼저 전화로 수동 환기·예비 산소 안내 → ${ICON(p.res)} <b>${esc(p.res_name)}</b> ${fmt(p.arr)} 뒤 (배터리보다 늦음)`;
  return '📞 전화로 수동 환기·예비 산소 안내 → 🚑 구급 이송 판단 (기한 안에 닿는 호환 자원 없음)';
}
function rowHTML(a, i) {
  const id = a.hh.id, g = G[a.tier], p = assignOf(a), done = S.approved[id];
  const canSend = g < 2 && p && p.res_name;
  const act = done ? `<div class="done">✓ 보냄</div><button class="lnk" data-msg="${i}">문안 보기</button>`
    : g === 2 ? `<button class="btn ghost sm" data-msg="${i}">안내 문자</button>`
      : `${canSend ? `<button class="btn sm" data-send="${i}">보내기</button>` : `<button class="btn sm" data-call="${i}">전화 안내</button>`}<button class="lnk" data-alt="${i}">다른 방법</button>`;
  return `<div class="row" data-i="${i}" id="row-${esc(id)}"><div><div class="who"><b>${esc(a.hh.label)}</b> · ${esc(LL.KIND_KO[a.device.kind])} ${esc(a.device.model)}</div><div class="left">${leftTxt(a)}</div><div class="rec">${done ? '🚒 ' + esc(done) : recTxt(a)}</div><div class="chips">${chips(a)}</div></div><div class="acts">${act}</div></div>`;
}
function rowsOf(arr, k) { if (arr.length <= k) return arr.map(([a, i]) => rowHTML(a, i)).join(''); return arr.slice(0, k).map(([a, i]) => rowHTML(a, i)).join('') + `<details class="morerows"><summary>${arr.length - k}곳 더 보기</summary>${arr.slice(k).map(([a, i]) => rowHTML(a, i)).join('')}</details>`; }
function renderQueue() {
  const L3 = [[], [], []]; S.A.list.forEach((a, i) => L3[G[a.tier]].push([a, i]));
  L3[0].sort((x, y) => x[0].bat_p10 - y[0].bat_p10); L3[1].sort((x, y) => x[0].bat_p10 - y[0].bat_p10); // 화면은 남은 배터리 짧은 순 (배정 순서 EDF와 같음)
  const pend0 = L3[0].filter(([a]) => !S.approved[a.hh.id] && assignOf(a) && assignOf(a).res_name);
  let h = `<div class="grp g0"><div class="grp-h">🔴 ${GNAME[0]} <span class="n">${L3[0].length}곳</span>${pend0.length > 1 ? `<button class="btn sm" id="sendAll">추천대로 모두 보내기 (${pend0.length})</button>` : ''}</div>${L3[0].length ? rowsOf(L3[0], 8) : '<p class="empty">없음</p>'}</div>`;
  h += `<div class="grp g1"><div class="grp-h">🟠 ${GNAME[1]} <span class="n">${L3[1].length}곳</span></div>${L3[1].length ? rowsOf(L3[1], 5) : '<p class="empty">없음</p>'}</div>`;
  h += `<details class="grp g2"><summary class="grp-h">🟢 ${GNAME[2]} <span class="n">${L3[2].length}곳</span> <small style="font-weight:400">— 복구 전 배터리가 남음, 문자 안내만 (펼치기)</small></summary>${L3[2].map(([a, i]) => rowHTML(a, i)).join('')}</details>`;
  $('#queue').innerHTML = h;
  $$('#queue [data-send]').forEach(b => b.onclick = e => { e.stopPropagation(); send(S.A.list[+b.dataset.send]); });
  $$('#queue [data-call]').forEach(b => b.onclick = e => { e.stopPropagation(); callGuide(S.A.list[+b.dataset.call]); });
  $$('#queue [data-alt]').forEach(b => b.onclick = e => { e.stopPropagation(); alternatives(S.A.list[+b.dataset.alt]); });
  $$('#queue [data-msg]').forEach(b => b.onclick = e => { e.stopPropagation(); showTexts(S.A.list[+b.dataset.msg]); });
  $$('#queue .row').forEach(r => r.onclick = () => detail(S.A.list[+r.dataset.i]));
  const sa = $('#sendAll'); if (sa) sa.onclick = () => sendAll(pend0.map(([a]) => a));
}
function approveTxt(p) { return `${p.res_name} 출동 · ${clockStr(S.sc.t0, stepsOf(S.key)[S.step].t + p.arr)} 도착 예정 (상황요원 승인)`; }
function send(a) { S.approved[a.hh.id] = approveTxt(assignOf(a)); renderQueue(); drawMap(); }
function sendAll(list) {
  modal(`<h3>추천 ${list.length}건을 한꺼번에 보낼까요?</h3><ul>${list.map(a => { const p = assignOf(a); return `<li>${esc(a.hh.label)} ← ${esc(p.res_name)} (${fmt(p.arr)} 뒤)</li>`; }).join('')}</ul><p class="muted">상황요원이 확인하고 누르는 순간 출동 지령이 나갑니다(시연). 자동으로 나가지 않습니다.</p><button class="btn" id="okAll">모두 보내기</button> <button class="btn ghost" onclick="document.getElementById('modal').hidden=true">취소</button>`);
  $('#okAll').onclick = () => { list.forEach(a => { S.approved[a.hh.id] = approveTxt(assignOf(a)); }); closeModal(); renderQueue(); drawMap(); };
}
function callGuide(a) { S.approved[a.hh.id] = '전화 안내 완료 · 이송 판단 대기'; renderQueue(); showTexts(a); }
// 정전 중에도 전기가 살아 있는 가까운 곳: 비상발전기 보유 공공시설(한국전기안전공사, 2020 기준) + 정전 범위 밖 무더위쉼터(서구) — 이용은 지자체 협약 필요
function poweredPlaces(hh) {
  const out = [], aff = new Set(S.sc.dongs || []);
  const g = (D.gen.items || []).map(x => ({ x, km: LL.haversineKm(hh, x) })).sort((a, b) => a.km - b.km)[0];
  if (g && g.km < 6) out.push({ name: g.x.name, km: g.km, why: `비상발전기 ${g.x.kw}kW · 2020 기준 · 이용 협약 필요` });
  if (aff.size) { const h = (D.heat.items || []).filter(x => !aff.has(x.dong)).map(x => ({ x, km: LL.haversineKm(hh, x) })).sort((a, b) => a.km - b.km)[0];
    if (h && h.km < 6) out.push({ name: h.x.name, km: h.km, why: `정전 범위 밖 무더위쉼터 · ${h.x.dong} · ${h.x.cap}명` }); }
  return out;
}
// 이송 후보: 시나리오 병원 + 심평원 의료장비 상세현황(인공호흡기 신고 대수)
const nk = s => String(s || '').replace(/학교법인|건양교육재단|을지학원|\s/g, '');
function hospitalsNear(hh) {
  const V = Object.fromEntries(((D.part && D.part.hira_vent) || []).map(v => [nk(v.name), v.vent]));
  const L2 = (S.sc.destinations || []).map(d => ({ name: d.name.replace(/^학교법인\s*(건양교육재단|을지학원)\s*/, ''), km: LL.haversineKm(hh, d), vent: V[nk(d.name)] || Object.entries(V).find(([k]) => nk(d.name).includes(k) || k.includes(nk(d.name)))?.[1] || 0 })).sort((a, b) => a.km - b.km);
  const ER = ((D.live && D.live.er && D.live.er.items) || []).map(x => ({ ...x, k: nk(x.name) }));
  L2.forEach(x => { const m = ER.find(y => y.k.includes(nk(x.name)) || nk(x.name).includes(y.k)); if (m) x.er = m; });
  const out = L2.slice(0, 1), v = L2.find(x => x.vent > 0 || (x.er && x.er.vent === 'Y')); if (v && v !== out[0]) out.push(v); return out;
}
// 식약처 허가·회수 (API 실제 호출 결과)
function regTxt(id) {
  const r = (D.reg && D.reg.dev || {})[id]; if (!r) return '';
  const ok = r.reg.filter(x => x.status === '유효'), rc = r.recall.filter(x => /승인/.test(x.state));
  const d8 = s => s ? s.slice(0, 4) + '-' + s.slice(4, 6) : '';
  return `식약처 허가 ${ok.length ? ok.map(x => x.no.replace(/\s*호$/, '')).join(', ') + ' (유효)' : r.reg.length ? '조회됨 · 유효 허가 없음' : '조회 결과 없음 — 모델 직접 확인'}` + (rc.length ? ` · 회수 보고 ${rc.length}건(최근 ${d8(rc[0].date)} ${rc[0].state}) → 제조사 조치 확인 필요` : ' · 회수 보고 없음');
}
function alternatives(a) {
  const used = new Set(Object.values(S.over).map(o => o.res).concat(S.P.plan.filter(p => p.res && p.task.id !== a.hh.id).map(p => p.res)));
  const all = S.sc.resources.map(r => ({ r, c: LL.compat(r, a.device), arr: LL.DISPATCH.dispatch_delay_h + LL.travelH(r, a.hh) })).sort((x, y) => x.arr - y.arr);
  const opts = all.filter(o => o.c.ok).slice(0, 5), bad = all.filter(o => !o.c.ok), places = poweredPlaces(a.hh), hosp = hospitalsNear(a.hh);
  modal(`<h3>${esc(a.hh.label)} — 다른 방법 고르기</h3><p class="muted">배터리 최소 ${fmt(a.bat_p10)}. ${esc(LL.KIND_KO[a.device.kind])} ${LL.DEVICE_POWER[a.device.kind] ? LL.DEVICE_POWER[a.device.kind].w + 'W(가정)' : ''}에 맞는 자원만 가까운 순으로 보입니다.</p><div class="alt">${opts.map((o, k) => `<button class="btn ghost" data-k="${k}">${ICON(o.r.id)} ${esc(o.r.name)} <small>(${esc(o.c.how)})</small> · ${fmt(o.arr)} 뒤 도착 ${o.arr <= a.bat_p10 ? '— 배터리 전' : '— 배터리보다 늦음'}${used.has(o.r.id) ? ' <small>(다른 집 배정됨)</small>' : ''}</button>`).join('')}<button class="btn ghost" data-k="call">📞 전화 안내 + 🚑 구급 이송으로</button>${hosp.map(h => `<p class="muted" style="margin:4px 0">🚑 이송 후보: <b>${esc(h.name)}</b> ${h.km.toFixed(1)}km · ${h.vent ? `인공호흡기 ${h.vent}대 신고` : '인공호흡기 신고 내역 없음'} <small>(심평원 2025-12)</small>${h.er ? ` · <b>응급실 가용 ${h.er.ec}병상${h.er.vent === 'Y' ? ' · 인공호흡기 가용' : ''}</b> <small>(국립중앙의료원 실시간 ${h.er.t.slice(8, 10)}:${h.er.t.slice(10, 12)} 수신)</small>` : ''}</p>`).join('')}${places.map((q, k) => `<button class="btn ghost" data-k="p${k}">🏛️ ${esc(q.name)} · ${q.km.toFixed(1)}km <small>(${esc(q.why)})</small></button>`).join('')}</div>${bad.length ? `<p class="muted">후보에서 뺀 자원 ${bad.length}곳: ${bad.slice(0, 6).map(o => esc(o.r.name.replace(/ 이동식발전기| 배터리 차량/, '')) + ' — ' + esc(o.c.why)).join(' · ')}</p>` : ''}`);
  $$('#mBody [data-k]').forEach(b => b.onclick = () => { const k = b.dataset.k; if (k === 'call') { S.over[a.hh.id] = { lane: 'call' }; } else if (k[0] === 'p') { const q = places[+k.slice(1)]; S.over[a.hh.id] = { lane: 'site', site: q.name, why: q.why }; } else { const o = opts[+k]; S.over[a.hh.id] = { res: o.r.id, res_name: o.r.name, how: o.c.how, arr: o.arr, lane: 'manual', ok: o.arr <= a.bat_p10 }; } closeModal(); renderQueue(); drawMap(); });
}
async function showTexts(a) {
  const p = assignOf(a); let order = LL.templateOrder(a, p), msg = LL.templateHousehold(a), src = '규칙 문안';
  modal(`<h3>지령문 · 가구 문자</h3><p class="muted">만드는 중…</p>`);
  if (AI.live) { const r = await ai('order', { case: { label: a.hh.label, device: a.device.model, kind: LL.KIND_KO[a.device.kind], bat_p10_h: +a.bat_p10.toFixed(2), rest_p90_h: +a.rest_p90.toFixed(2), p_fail: +a.p_fail.toFixed(2), tier: a.tier, flags: a.flags, floor: a.hh.floor, resource: p && p.res_name, arrival_h: p && p.arr != null ? +p.arr.toFixed(2) : null } }); if (r && r.order) { order = r.order; msg = r.household || msg; src = AI.provider + ' 작성 — 사람 확인 후 사용'; } }
  modal(`<h3>지령문 · 가구 문자 <small class="muted">${esc(src)}</small></h3><h4>가구에 보낼 문자 (119안심콜 경로)</h4><pre>${esc(msg)}</pre><h4>출동대 지령문</h4><pre>${esc(order)}</pre>`);
}
function detail(a) {
  const h = a.hh; mapOps.setView([h.lat, h.lon], 16);
  modal(`<h3>${esc(h.label)} <small class="muted">합성 가구</small></h3>
  <p>${esc(LL.KIND_KO[a.device.kind])} <b>${esc(a.device.model)}</b> · 여분 배터리 ${h.ext_count}개 · 배터리 ${h.battery_age_y}년 · 예비 산소통 ${h.o2_cyl_h || 0}시간분 · 기기 없이 ${({ A: '30분 미만', B: '30분~4시간', C: '4시간 초과' })[h.tier]} · ${h.floor}층</p>
  <table class="tbl"><tr><td>배터리 최소 (10번 중 9번은 이보다 오래)</td><td><b>${fmt(a.bat_p10)}</b></td></tr><tr><td>배터리 보통</td><td>${fmt(a.bat_p50)}</td></tr><tr><td>전기 복구 최대 (10번 중 9번은 이 안에)</td><td>${fmt(a.rest_p90)}</td></tr><tr><td>복구 전에 배터리가 끝날 확률</td><td>${(a.p_fail * 100).toFixed(0)}%</td></tr>${(() => { const p = assignOf(a); const t = Math.min(a.rest_p90, p && p.arr != null ? p.arr : Infinity); return `<tr><td>잔여대응여유 = 배터리 최소 − min(복구 최대, 자원 도착)<br><small class="muted">원안(전력안심망 AI) 판단식</small></td><td><b>${a.bat_p10 - t < 0 ? '−' + fmt(t - a.bat_p10) : fmt(a.bat_p10 - t)}</b>${p && p.res_name ? `<br><small>${esc(p.res_name)}${p.how ? ' · ' + esc(p.how) : ''}</small>` : ''}</td></tr>`; })()}</table>
  <p class="muted">${esc(a.flags.join(' · '))}</p>
  <p class="muted">사양 근거: ${esc(a.device.src ? LL.SOURCES[a.device.src] : '사양 원문 미확인 → 0시간으로 보수 계산')}</p>${regTxt(a.device.id) ? `<p class="muted">💊 ${esc(regTxt(a.device.id))}</p>` : ''}`);
}
function drawResources() {
  for (const r of S.sc.resources) L.marker([r.lat, r.lon], { icon: L.divIcon({ className: '', html: `<div style="width:12px;height:12px;background:${RCOL(r)};opacity:${r.avail === false ? .35 : 1};transform:rotate(45deg);border:2px solid #fff;box-shadow:0 0 2px #0008"></div>` }) }).bindTooltip(esc(r.name) + (r.avail === false ? ' — ' + esc(r.busy || '사용 중') : '') + '<br><small>' + esc(LL.resSpec(r).label) + ' · 출력 ' + LL.resSpec(r).w + 'W(가정)' + (LL.resSpec(r).wh ? ' · ' + LL.resSpec(r).wh + 'Wh' : '') + '<br>' + esc(r.note || '') + '</small>').addTo(layerOps);
  for (const x of (D.gen && D.gen.items) || []) if ((() => { try { return mapOps.getBounds().pad(0.3).contains([x.lat, x.lon]); } catch (e) { return true; } })()) L.marker([x.lat, x.lon], { icon: L.divIcon({ className: '', html: '<div style="font-size:13px;line-height:13px;opacity:.85">🏛️</div>' }) }).bindTooltip(`${esc(x.name)}<br><small>비상발전기 ${x.kw}kW (한국전기안전공사, 2020 기준) — 정전 중 전기가 살아 있을 수 있는 곳 · 이용 협약 필요</small>`).addTo(layerOps);
  if (S.sc.accident && S.sc.accident.lat) L.marker([S.sc.accident.lat, S.sc.accident.lon], { icon: L.divIcon({ className: '', html: '<div style="font-size:22px;line-height:22px">⚡</div>' }) }).bindTooltip(esc(S.sc.accident.label)).addTo(layerOps);
  if (S.sc.site) L.circle([S.sc.site.lat, S.sc.site.lon], { radius: 450, color: '#0f1b2d', weight: 1, fillOpacity: .05 }).bindTooltip(`${esc(S.sc.site.name)} ${S.sc.site.units}세대 (K-apt)`).addTo(layerOps);
}
function drawMap() {
  layerOps.clearLayers(); routeLayer.clearLayers(); drawResources();
  for (const a of S.A.list) L.circleMarker([a.hh.lat, a.hh.lon], { radius: a.tier === '위급' ? 8 : 6, color: '#fff', weight: 1.5, fillColor: TCOL[a.tier], fillOpacity: .95 }).bindTooltip(`${esc(a.hh.label)} · ${leftTxt(a)}`).on('click', () => { const el = $('#row-' + CSS.escape(a.hh.id)); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2600); } }).addTo(layerOps);
  const rb = Object.fromEntries(S.sc.resources.map(r => [r.id, r]));
  for (const a of S.A.list) { const p = assignOf(a); if (!p || !p.res) continue; const r = rb[p.res]; if (!r) continue; const ok = !!S.approved[a.hh.id]; L.polyline([[r.lat, r.lon], [a.hh.lat, a.hh.lon]], { color: RCOL(r), weight: ok ? 4 : 2, opacity: ok ? .95 : .55, dashArray: ok ? null : '6 6' }).addTo(routeLayer); }
}

/* ----- 실제 기록과 비교 ----- */
function pctC(h, cause) { const s = LL.restorationSamples({ elapsed_h: 0, cause }, 4000, 3); let c = 0; for (const x of s) if (x <= h) c++; return (c / s.length * 100).toFixed(0) + '%'; }
function renderReplay() {
  const sc = S.sc, rows = sc.timeline_real ? sc.timeline_real.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('') : '';
  if (S.key === 'S1') {
    const A = LL.assess(sc.households, { elapsed_h: 0, cold: true, cause: '기자재' }, { n: 800 });
    const P = LL.planDispatch(A.list.filter(a => a.tier !== '관찰').map(a => ({ id: a.hh.id, lat: a.hh.lat, lon: a.hh.lon, deadline_h: Math.max(0, a.bat_p10), dev: a.device })), sc.resources, 'edf');
    const first = Math.min(...P.plan.filter(p => p.arr != null).map(p => p.arr));
    $('#replay').innerHTML = `<table><tr><th style="width:20%">시각</th><th>실제 (보도)</th><th>라이프라인 119가 있었다면 (모의)</th></tr>
    <tr><td>20:01</td><td>변압기 파손, 약 5,500세대 정전</td><td>정전 범위 안 등록 가구 ${A.list.length}곳 바로 확인 · 한파 반영 · 전기 복구 최대 ${fmt(A.rest.p90)}</td></tr>
    <tr><td>20:02~05</td><td>—</td><td>지금 가야 함 ${A.list.filter(a => a.tier === '위급').length}곳 → 추천 발전기 도착 ${fmt(first)} 뒤(${clockStr(sc.t0, first)}) → 상황요원 「보내기」</td></tr>
    <tr><td>20:20</td><td>한 주민의 인공호흡기가 멈춘 사실 확인 (정전 19분 뒤)</td><td>점검 기록 없는 배터리는 0으로 계산 → 20:01부터 맨 위</td></tr>
    <tr><td>(시각 미상)</td><td>비상발전기·구급인력 투입, 인공호흡기 응급환자 2명 등 18명 구조</td><td>같은 조치를 멈추기 전에 시작</td></tr>
    <tr><td>23:40</td><td>복구 (3시간 39분)</td><td>모델 복구 분포의 ${pctC(3.65, '기자재')} 지점 — 최대 ${fmt(A.rest.p90)} 안</td></tr></table>
    <p class="muted">출처: ${esc(sc.timeline_src)}. 가구 3곳 중 2곳은 보도(인공호흡기 2명)를 바탕으로 재구성, 기기·층·배터리는 합성.</p>`; return;
  }
  if (S.key === 'S5') {
    const p = LL.parseNotice(sc.notices[0].text, sc.notices[0].at); const A = LL.assess(sc.households, { elapsed_h: 20 / 60, cause: p.cause, where: p.where }, { n: 800 });
    $('#replay').innerHTML = `<table><tr><th style="width:20%">실제 (보도)</th><th></th></tr>${rows}</table>
    <table><tr><th style="width:20%">모의</th><th></th></tr>
    <tr><td>05:15</td><td>예고 없는 새벽 정전. 6만4,891가구 안 생명유지장치 가구 기대치 <b>${sc.expected_lifesupport}가구</b>(동구·중구 한전 할인 비율)</td></tr>
    <tr><td>05:35 안내</td><td>「변전소 화재」 → 한전 설비(계통) 화재로 읽음 → 단지 전기실 화재와 달리 장기 정전으로 보지 않음 · 복구 최대 ${fmt(A.rest.p90)}</td></tr>
    <tr><td>07:45</td><td>실제 2시간 30분을 참값으로 300회 모의: 복구 전 배터리가 끝나는 집 — 조치 없음 ${D.res.s5.at_risk_no_action} → 추천대로 ${D.res.s5.remain_edf} (명부 순 ${D.res.s5.remain_registry} · 거리 순 ${D.res.s5.remain_nearest}) · 최적 배정 상한의 ${(D.res.opt.S5.ratio * 100).toFixed(0)}%</td></tr></table>
    <p class="muted">출처: ${esc(sc.timeline_src)}. ${esc(sc.basis || '')}</p>`; return;
  }
  if (S.key === 'S4') {
    const a = LL.assess(sc.households, { elapsed_h: 16 / 60, heat: true, cause: '기자재' }, { n: 2000 }).list[0];
    const a6 = LL.assess(sc.households, { elapsed_h: 6.1, heat: true, cause: '기자재' }, { n: 2000 }).list[0];
    $('#replay').innerHTML = `<table><tr><th style="width:20%">실제 (보도·다른 지역)</th><th></th></tr>${rows}</table>
    <table><tr><th style="width:20%">모의</th><th></th></tr>
    <tr><td>평시</td><td>「우리 동네」 화면에서 오래되고 세대당 수전용량이 작은 단지를 여름 전 점검 대상으로 → 등록 가구에 여분 배터리 충전 안내</td></tr>
    <tr><td>23:50</td><td>${esc(a.hh.label)}(가상, 휴대용 산소발생기·여분 배터리 1개): 배터리 최소 ${fmt(a.bat_p10)} → <b>${GNAME[G[a.tier]]}</b></td></tr>
    <tr><td>05:40</td><td>대구 실제 6시간은 모델 분포의 ${pctC(6.1, '기자재')} 지점. 이 시각이면 배터리 최소 ${fmt(a6.bat_p10)} → <b>${GNAME[G[a6.tier]]}</b></td></tr></table>
    <p class="muted">출처: ${esc(sc.timeline_src)}. 단지는 K-apt 실데이터(이름 가림), 가구는 가상.</p>`; return;
  }
  if (S.key === 'S3') {
    const p = LL.parseNotice(sc.notices[0].text, sc.notices[0].at); const a = LL.assess(sc.households, { elapsed_h: 8 / 60, cause: p.cause }, { n: 2000 }).list[0];
    const q = LL.planDispatch([{ id: a.hh.id, lat: a.hh.lat, lon: a.hh.lon, deadline_h: Math.max(0, a.bat_p10), dev: a.device }], sc.resources, 'edf').plan[0];
    $('#replay').innerHTML = `<table><tr><th style="width:20%">실제 (보도)</th><th></th></tr>${rows}</table>
    <table><tr><th style="width:20%">모의</th><th></th></tr>
    <tr><td>04:30 신고</td><td>신고 문장 「개폐기 들이받음·신호등 꺼짐」을 정전으로 읽음(원인 ${esc(p.cause)}) → 주변 등록 가구 조회. 이런 소규모 돌발 정전에는 재난문자가 나가지 않는다</td></tr>
    <tr><td>04:31</td><td>${esc(a.hh.label)}(가상, 거치형 산소발생기·혼자·점검 기록 없음): 배터리 최소 ${fmt(a.bat_p10)} → <b>${GNAME[G[a.tier]]}</b> · 전화 안내</td></tr>
    <tr><td>04:31~</td><td>${esc(q.res_name || '-')} ${fmt(q.arr)} 뒤 도착 — 현장에 나간 출동대에도 함께 통보</td></tr>
    <tr><td>06:13</td><td>실제 1시간 50분은 모델 분포(원인 외물)의 ${pctC(1.85, '외물')} 지점</td></tr></table>
    <p class="muted">출처: ${esc(sc.timeline_src)}. 정전 규모 「일대 27호」(문화일보 2026-10-02, 호 = 한전 계약 단위). 서구 생명유지장치 할인 131가구 비율로 보면 27호 정전의 등록 가구 기대치는 ${sc.expected_lifesupport}가구 — 시연은 가상 1가구.</p>`; return;
  }
  $('#replay').innerHTML = `<p class="muted">가상 사례입니다. 부산 남구 2023-05-19 실제 재난문자 패턴(「3시간 가량」 → 「내일 오전 9시 복구 예정」)을 따랐습니다. 300회 모의: 복구 전 배터리가 끝나는 집 — 조치 없음 ${D.res.dispatch.S2_notice1.at_risk_no_action.toFixed(1)} → 추천대로 ${D.res.dispatch.S2_notice1.remain_edf.toFixed(1)} (명부 순 ${D.res.dispatch.S2_notice1.remain_registry.toFixed(1)}) · 최적 배정 상한의 ${(D.res.opt.S2.ratio * 100).toFixed(0)}%.</p>`;
}

/* ================= 우리 집 (한 화면 한 질문) ================= */
let homeInit = false, histChart; const H = { step: 0, device: null, ext_count: 0, o2_cyl_h: 0, battery_checked: null, battery_age_y: 3, tier: null, ocr: null };
const SAMPLES = ['label_trilogy_evo.png', 'label_astral150.png', 'label_inogen_g5.png', 'label_o2_home.png'];
function devOf(id) { return LL.DEVICE_DB.find(d => d.id === id); }
function qList() {
  const d = devOf(H.device); const q = ['photo'];
  if (d && d.ext_max > 0) q.push('ext');
  if (d && (d.kind === 'o2p' || d.kind === 'o2s')) q.push('o2');
  q.push('check', 'age', 'tier', 'result'); return q;
}
function initHome() { if (homeInit) return; homeInit = true; renderWizard(); }
function dots() { const q = qList(); return `<div class="dots" aria-hidden="true">${q.map((_, i) => `<i class="${i === H.step ? 'on' : ''}"></i>`).join('')}</div>`; }
function nav(back = true) { return `<div class="navrow">${back && H.step > 0 ? '<button class="lnk" id="wBack">← 이전</button>' : '<span></span>'}<span class="muted">${H.step + 1} / ${qList().length}</span></div>`; }
function choiceBtns(cls, items) { return `<div class="choices ${cls}">${items.map(([v, t, s]) => `<button class="choice" data-v="${esc(v)}">${t}${s ? `<small>${s}</small>` : ''}</button>`).join('')}</div>`; }
function go(n) { H.step = Math.max(0, Math.min(qList().length - 1, n)); renderWizard(); }
function renderWizard() {
  const w = $('#wizard'), k = qList()[H.step]; let h = dots();
  if (k === 'photo') {
    if (H.ocr && H.ocr.done) {
      const d = devOf(H.device);
      h += `<p class="q">이 기기가 맞나요?</p><div class="found">${d ? `<span class="muted">${esc(LL.KIND_KO[d.kind])}</span><br><b>${esc(d.maker)} ${esc(d.model)}</b>` : '<b>모델을 읽지 못했어요</b>'}${H.ocr.note ? `<p class="muted">${esc(H.ocr.note)}</p>` : ''}</div>`;
      h += d && !H.ocr.category ? `<div class="bigbtns"><button class="btn" id="yes">네, 맞아요</button><button class="btn ghost" id="pick">아니요, 직접 고를게요</button></div>` : `<button class="btn" id="pick" style="width:100%">기기 직접 고르기</button>`;
    } else if (H.ocr && H.ocr.busy) h += `<p class="q">사진을 읽고 있어요…</p><p class="qh">${esc(H.ocr.how || '')}</p>`;
    else if (H.picking) {
      h += `<p class="q">어떤 기기를 쓰시나요?</p>` + choiceBtns('', LL.DEVICE_DB.map(d => [d.id, `${esc(LL.KIND_KO[d.kind])}`, `${esc(d.maker.startsWith('(') ? d.model : d.maker + ' ' + d.model)}`]));
    } else {
      h += `<p class="q">의료기기 옆면이나 뒷면 이름표를 찍어 주세요</p><p class="qh">모델을 읽어 배터리 사양을 채웁니다. 사진은 읽은 뒤 저장하지 않습니다.</p>
      <label class="camera"><span class="ic">📷</span>사진 찍기 · 올리기<input type="file" id="labelFile" accept="image/*" capture="environment"></label>
      <div class="samples">${SAMPLES.map(s => `<img src="samples/${s}" alt="예시 이름표" data-s="${s}">`).join('')}</div><p class="muted" style="text-align:center">예시 이름표(합성)를 눌러 바로 해 볼 수 있어요 · <button class="lnk" id="pick">사진 없이 고르기</button></p>`;
    }
  } else if (k === 'ext') {
    const d = devOf(H.device); h += `<p class="q">여분(외장) 배터리가 몇 개 있나요?</p><p class="qh">${esc(d.model)}에 끼워 쓰는 분리형 배터리입니다.</p>` + choiceBtns(d.ext_max > 1 ? 'c3' : 'c2', [[0, '없어요'], [1, '1개']].concat(d.ext_max > 1 ? [[2, '2개 이상']] : []));
  } else if (k === 'o2') {
    h += `<p class="q">예비 산소통이 있나요?</p><p class="qh">처방 유량으로 몇 시간 쓸 수 있는지 골라 주세요.</p>` + choiceBtns('c4', [[0, '없어요'], [2, '2시간쯤'], [4, '4시간쯤'], [8, '8시간 이상']]);
  } else if (k === 'check') {
    h += `<p class="q">최근 3개월 안에 전원을 뽑고 배터리로 얼마나 가는지 확인해 보셨나요?</p><p class="qh">확인한 적이 없으면 안전하게 배터리를 0으로 계산합니다. 2022년 송파 정전 때 인공호흡기가 19분 만에 멈췄습니다.</p>` + choiceBtns('c2', [[1, '네, 확인했어요'], [0, '아니요 / 모르겠어요']]);
  } else if (k === 'age') {
    h += `<p class="q">지금 배터리를 쓴 지 얼마나 됐나요?</p>` + choiceBtns('c4', [[1, '1년 이하'], [2.5, '2~3년'], [5, '4년 이상'], [3, '모르겠어요', '3년으로 계산']]);
  } else if (k === 'tier') {
    h += `<p class="q">기기가 멈추면 얼마나 버틸 수 있나요?</p><p class="qh">주치의에게 한 번 확인해 두세요. 모르면 가장 짧게 계산합니다.</p>` + choiceBtns('c4', [['A', '30분도 어려워요'], ['B', '30분~4시간'], ['C', '4시간 넘게'], ['A', '모르겠어요', '가장 짧게 계산']]);
  } else if (k === 'result') { w.innerHTML = h + resultHTML() + nav(); bindResult(); bindNav(); return; }
  w.innerHTML = h + nav(); bindNav();
  $$('#wizard .choice').forEach(b => b.onclick = () => {
    const v = b.dataset.v;
    if (k === 'photo') { H.device = v; H.picking = false; H.ocr = null; go(1); return; }
    if (k === 'ext') H.ext_count = +v; if (k === 'o2') H.o2_cyl_h = +v; if (k === 'check') H.battery_checked = v === '1'; if (k === 'age') H.battery_age_y = +v; if (k === 'tier') H.tier = v;
    go(H.step + 1);
  });
  const lf = $('#labelFile'); if (lf) lf.onchange = e => { const f = e.target.files[0]; if (f) { const fr = new FileReader(); fr.onload = () => readLabel(fr.result); fr.readAsDataURL(f); } };
  $$('#wizard .samples img').forEach(im => im.onclick = () => readLabel(im.src));
  const pk = $('#pick'); if (pk) pk.onclick = () => { H.picking = true; H.ocr = null; renderWizard(); };
  const ys = $('#yes'); if (ys) ys.onclick = () => { H.ocr = null; go(1); };
}
function bindNav() { const b = $('#wBack'); if (b) b.onclick = () => { if (H.step === 0) { H.ocr = null; H.picking = false; renderWizard(); } else go(H.step - 1); }; }
async function toDataURL(src) { if (src.startsWith('data:')) return src; const b = await (await fetch(src)).blob(); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); }
let tessP = null;
function loadTess() { if (!tessP) tessP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); return tessP; }
async function readLabel(src) {
  H.ocr = { busy: true, how: AI.live ? AI.provider + ' 이미지 판독' : '글자 인식(OCR) 중 — 처음엔 10초쯤 걸려요' }; renderWizard();
  let text = null; const durl = await toDataURL(src);
  if (AI.live) { const r = await ai('read_label', { image: durl }); if (r && r.text) text = r.text; }
  if (!text) { try { await loadTess(); const r = await Tesseract.recognize(durl, 'eng'); text = r.data.text; } catch (e) { text = ''; } }
  const m = LL.matchDevice(text);
  if (m && m.device) { H.device = m.device.id; H.ocr = { done: true }; }
  else if (m && m.category_only) { H.device = m.candidate.id; H.ocr = { done: true, category: true, note: `${LL.KIND_KO[m.candidate.kind]}로 보여요. 배터리는 모델마다 달라서 모델을 직접 골라 주세요.` }; }
  else { H.device = null; H.ocr = { done: true, note: '글자가 흐리거나 사양표에 없는 모델이에요.' }; }
  renderWizard();
}
function hhObj(o) { return Object.assign({ device: H.device, ext_count: H.ext_count, o2_cyl_h: H.o2_cyl_h, battery_checked: !!H.battery_checked, battery_age_y: H.battery_age_y, tier: H.tier || 'A' }, o || {}); }
function p10Of(hh) { const bs = LL.batterySamples(hh, 3000, 42, {}); return { p10: LL.quantile(bs.total, .1), p50: LL.quantile(bs.total, .5), bs }; }
function resultHTML() {
  const d = devOf(H.device), hh = hhObj(), R = p10Of(hh), pr = LL.restorationSamples({ elapsed_h: 0 }, 3000, 5);
  let fail = 0; for (let i = 0; i < 3000; i++) if (R.bs.total[i] < pr[i]) fail++; const pf = Math.round(fail / 30);
  H.res = { p10: R.p10, p50: R.p50, pf, bs: R.bs };
  const P90 = LL.REST_PRIOR.p90_h, mx = 24, w = x => Math.min(100, Math.max(1.5, x / mx * 100));
  const zero = R.bs.unchecked || R.bs.unknownSpec;
  // 가장 효과 큰 한 가지
  const cand = [];
  if (!hh.battery_checked) cand.push(['배터리 점검(전원을 뽑고 몇 시간 가는지 재기)을 하면', { battery_checked: true }]);
  if (d.ext_max > hh.ext_count) cand.push(['여분 배터리를 1개 더 두면', { ext_count: hh.ext_count + 1 }]);
  if (d.kind === 'o2p' || d.kind === 'o2s') cand.push(['예비 산소통(4시간분)을 더 두면', { o2_cyl_h: hh.o2_cyl_h + 4 }]);
  if (hh.battery_age_y >= 4) cand.push(['배터리를 새것으로 바꾸면', { battery_age_y: 0.5 }]);
  let best = null; for (const [t, o] of cand) { const v = p10Of(hhObj(o)).p10; if (!best || v > best.v) best = { t, v }; }
  return `<div class="result"><p class="muted">${esc(LL.KIND_KO[d.kind])} · ${esc(d.model)}${regTxt(d.id) ? '<br>💊 ' + esc(regTxt(d.id)) : ''}</p>
  ${zero ? `<p class="big">배터리를 확인하기 전이라<b>0분</b>으로 계산합니다</p>` : `<p class="big">정전이 나면 우리 집은 최소<b class="${pf < 10 ? 'okc' : ''}">${fmt(R.p10)}</b>버팁니다</p>`}
  <div class="cmp"><div class="lab"><span>우리 집 (최소)</span><span>${zero ? '0분' : fmt(R.p10)}</span></div><div class="bar"><i style="width:${w(zero ? 0 : R.p10)}%;background:#c81e33"></i></div>
  <div class="lab"><span>아파트 정전 10건 중 9건이 복구되는 시간</span><span>${fmt(P90)}</span></div><div class="bar"><i style="width:${w(P90)}%;background:#6b7280"></i></div></div>
  <div class="verdict ${pf >= 10 ? 'bad' : 'good'}">${pf >= 10 ? `정전이 길어지면 <b>전기보다 배터리가 먼저 끝날 수 있어요</b> (100번 중 ${pf}번). 등록해 두면 정전 때 119가 이 집을 먼저 챙깁니다.` : `대부분의 정전은 배터리로 버틸 수 있어요 (먼저 끝날 확률 100번 중 ${pf}번). 그래도 등록해 두면 긴 정전 때 119가 먼저 연락합니다.`}</div>
  ${best && best.v > R.p10 + 0.1 ? `<div class="tip">💡 <b>가장 효과 큰 한 가지</b><br>${esc(best.t)} → 최소 <b>${fmt(best.v)}</b>으로 늘어납니다.</div>` : ''}
  <div class="bigbtns"><button class="btn" id="reg119">🚒 119에 등록하기</button><button class="btn ghost" id="printBtn">🖨 냉장고에 붙일 카드</button></div>
  <details class="more"><summary>계산 자세히 보기</summary><canvas id="myHist" height="150"></canvas><p class="muted">빨간 막대가 하위 10%(최소)입니다. 보통은 ${fmt(R.p50)}. 공칭 배터리 × 충전 상태 × 노화 × 개체차를 3,000번 뽑아 계산하고, 복구시간은 기후에너지환경부 아파트 정전 382건 기록에 맞춘 분포를 씁니다.</p><pre class="actioncard" id="myCard"></pre></details>
  <p style="text-align:center;margin-top:10px"><button class="lnk" id="restart">처음부터 다시</button></p></div>`;
}
function bindResult() {
  const R = H.res, bs = R.bs, mx = Math.max(4, LL.quantile(bs.total, .99)), bins = 24, cnt = new Array(bins).fill(0);
  for (const x of bs.total) cnt[Math.min(bins - 1, Math.floor(x / mx * bins))]++;
  const labels = cnt.map((_, i) => (i * mx / bins).toFixed(1));
  $('.more').addEventListener('toggle', () => { if (histChart) histChart.destroy(); histChart = new Chart($('#myHist'), { type: 'bar', data: { labels, datasets: [{ data: cnt, backgroundColor: labels.map(l => +l < R.p10 ? '#c81e33' : '#0ea5e9') }] }, options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: '버틸 수 있는 시간 (시간)' }, ticks: { maxTicksLimit: 8 } }, y: { display: false } }, animation: false } }); }, { once: true });
  const fake = { device: bs.deviceInfo, bat_p10: R.p10, tier: R.pf >= 10 ? '경계' : '관찰' }; $('#myCard').textContent = LL.templateHousehold(fake);
  $('#restart').onclick = () => { Object.assign(H, { step: 0, device: null, ext_count: 0, o2_cyl_h: 0, battery_checked: null, battery_age_y: 3, tier: null, ocr: null, picking: false }); renderWizard(); };
  $('#printBtn').onclick = printCard;
  $('#reg119').onclick = () => modal(`<h3>119에 등록하기</h3><p>지금 쓰는 <b>119안심콜</b>(소방청)에 아래 정보를 더해 등록합니다.</p><ul><li>의료기기 종류·모델, 여분 배터리·산소통</li><li>배터리 점검 여부, 기기 없이 버틸 수 있는 시간</li><li>안심콜 기존 항목: 이름·연락처·주소·병력·보호자 연락처</li></ul><p class="muted">정전이 나면 119 상황실만 봅니다. 건강정보라서 따로 동의를 받고(개인정보 보호법 제23조①1), 언제든 철회할 수 있습니다. 시제품은 아무것도 저장하지 않습니다.</p><button class="btn" id="agree">동의하고 등록 (시연)</button>`) || ($('#agree').onclick = () => modal('<h3>✓ 등록됐습니다 (시연)</h3><p>정전이 나면 119가 이 집의 배터리 시간을 먼저 계산하고, 위험하면 먼저 전화합니다.</p><p class="muted">실제 운영에서는 119안심콜 화재대피 안내(2026-05 전국 시행)처럼 주소로 등록 세대를 찾아 전화·문자를 보냅니다.</p>'));
}
function printCard() {
  const d = devOf(H.device), R = H.res, vent = d.kind === 'vent', o2 = d.kind.startsWith('o2');
  $('#printCard').innerHTML = `<div class="pcard"><h1>⚡ 정전되면 이 카드를 보세요</h1><p>${esc(LL.KIND_KO[d.kind])} · ${esc(d.model)}</p><p class="hr">배터리로 최소 ${R.bs.unchecked || R.bs.unknownSpec ? '0분 (점검 필요)' : fmt(R.p10)}</p>
  <ol><li>기기 배터리 표시를 확인하고 여분 배터리를 옆에 둡니다.</li>${vent ? '<li>배터리 경보가 울리면 앰부백(수동 환기)을 준비합니다.</li>' : ''}${o2 ? '<li>예비 산소통으로 바꾸고 처방 유량을 맞춥니다.</li>' : ''}<li>119에 전화: 「${esc(LL.KIND_KO[d.kind])} 씁니다. 배터리 ○시간 남았습니다.」</li><li>발전기는 실내·현관·베란다에서 돌리지 않습니다(일산화탄소).</li></ol>
  <table><tr><td>보호자</td><td style="width:60%"></td></tr><tr><td>기기 대여업체</td><td></td></tr><tr><td>주치의·병원</td><td></td></tr><tr><td>한전 고장신고</td><td>123</td></tr><tr><td>화재·구급</td><td><b>119</b></td></tr></table><p style="font-size:12px;color:#555">라이프라인 119 · 계산값은 참고용입니다. 3개월마다 배터리를 점검하세요.</p></div>`;
  window.print();
}

/* ================= 우리 동네 ================= */
let planInit = false, mapPlan, dongLayer, kepChart, needChart;
const DURS = [3, 6, 12, 24, 48, 72];
function initPlan() {
  if (planInit) { mapPlan.invalidateSize(); return; } planInit = true;
  mapPlan = L.map('pmap'); tiles(mapPlan); mapPlan.setView([36.33, 127.37], 12);
  const all = D.sc.ALL_DJ.households; const byDong = {}; all.forEach(h => { if (h.dong) byDong[h.dong] = (byDong[h.dong] || 0) + 1; });
  const feats = D.dongs.features.filter(f => f.properties.adm_cd.startsWith('25030'));
  feats.forEach(f => { const p = f.properties; p.exp = byDong[p.adm_nm] || 0; p.p80 = p.pop80; p.hh1r = p.hh ? p.hh1 / p.hh : 0; const w = (D.wel.dong || {})[p.adm_nm] || {}; p.alone = w.alone || 0; p.basic = w.basic || 0; });
  function draw() {
    const key = $('#pLayer').value; if (dongLayer) dongLayer.remove();
    const val = p => key === 'exp' ? p.exp : key === 'p80' ? p.p80 : key === 'alone' ? p.alone : key === 'basic' ? p.basic : p.hh1r; const mx = Math.max(...feats.map(f => val(f.properties))) || 1;
    dongLayer = L.geoJSON({ type: 'FeatureCollection', features: feats }, { style: f => ({ color: '#334155', weight: 1, fillColor: `rgba(200,30,51,${0.08 + 0.75 * val(f.properties) / mx})`, fillOpacity: 1 }), onEachFeature: (f, l) => { const p = f.properties; l.bindTooltip(`<b>${esc(p.adm_nm)}</b><br>생명유지기기 가구(합성 집계) ${p.exp}<br>80세 이상 ${p.pop80.toLocaleString()}명 · 1인가구 ${(p.hh1r * 100).toFixed(0)}% (SGIS 2024)<br>독거노인 ${p.alone.toLocaleString()}세대 · 기초생활수급 ${p.basic.toLocaleString()}가구 (서구 공개자료 2026)`); } }).addTo(mapPlan);
    $('#pLegend').innerHTML = { exp: '진할수록 생명유지기기 가구가 많음 — 한전 서구 131가구를 합성 배치한 집계(실제 분포 아님)', p80: '진할수록 80세 이상 인구 많음 (SGIS 2024)', hh1: '진할수록 1인 가구 비율 높음 (SGIS 2024)', alone: '진할수록 독거노인 세대 많음 — 정전 때 수동 환기·이동을 도울 사람이 없을 가능성 (대전 서구 독거노인현황 2026-02, data.go.kr 15113285)', basic: '진할수록 기초생활수급 가구 많음 — 여분 배터리·발전기를 스스로 마련하기 어려울 가능성 (대전 서구 수급자 현황 2026-07-20, data.go.kr 15085345)' }[key];
  }
  $('#pLayer').onchange = draw; draw(); setTimeout(() => { mapPlan.invalidateSize(); mapPlan.fitBounds(dongLayer.getBounds(), { padding: [10, 10] }); }, 120);
  const S2 = all.map((h, i) => LL.batterySamples(h, 600, 300 + i, { cold: true }).total);
  const need = DURS.map(d => S2.filter(s => { let c = 0; for (const x of s) if (x < d) c++; return c / s.length >= .5; }).length);
  const need10 = DURS.map(d => S2.filter(s => { let c = 0; for (const x of s) if (x < d) c++; return c / s.length >= .1; }).length);
  const n119 = D.sc.S2.resources.filter(r => r.kind === '119').length;
  const upd = () => { const i = +$('#durR').value, n = need[i]; $('#durTxt').textContent = DURS[i] + '시간'; $('#needN').textContent = n;
    $('#needSub').innerHTML = `넉넉히 잡으면 ${need10[i]}가구 · 서구 119안전센터 발전기는 ${n119}대 ${n > n119 ? `→ 동시에 ${n119}집까지. <b>나머지 ${n - n119}집</b>은 대여업체 배터리 교대·이웃 구 지원·병원 이송 계획이 필요합니다.` : '— 센터 발전기로 감당할 수 있습니다.'}<br><small class="muted">정부 목표: 단지 고장도 24시간(화재·침수 48시간) 안 임시전력 (기후에너지환경부 2026-05-20)</small>`; };
  $('#durR').oninput = upd; upd();
  const kwOf = s => (+s['전기-수전용량'] || 0) / (+s['세대수'] || 1);
  const tot = D.sites.filter(s => s['세대전기계약방식'] === '종합계약' && kwOf(s) > 0);
  const risk = tot.filter(s => s['사용승인일'] && +String(s['사용승인일']).slice(0, 4) <= 2001 && kwOf(s) < 10).sort((a, b) => kwOf(a) - kwOf(b));
  $('#oldApt').innerHTML = `<p class="muted">단지가 변압기를 직접 운영(세대 종합계약)하고 25년 넘은 단지를, 세대당 수전용량이 작은 순으로. 아파트 정전의 43%가 7~8월, 약 절반이 20년 넘고 세대당 3kW 이하인 단지에서 났습니다(기후에너지환경부 2026-05-20).</p><table><tr><th>단지</th><th>세대</th><th>준공</th><th>세대당 수전</th><th>승강기 중대고장<br><small>2021~</small></th></tr>` + risk.slice(0, 6).map(s => `<tr><td>${esc(s['단지명'].replace('관리사무소', ''))}</td><td>${s['세대수']}</td><td>${String(s['사용승인일']).slice(0, 4)}</td><td>${kwOf(s).toFixed(1)}</td><td>${s['승강기고장_결합'] === '없음' ? '-' : (s['승강기중대고장_2021이후'] || 0) + '건'}</td></tr>`).join('') + `</table><p class="muted">서구 종합계약 ${tot.length}곳 중 25년 넘고 세대당 10 미만 ${risk.length}곳. 수전용량 단위는 K-apt 표기 그대로. 승강기 중대고장은 행안부 공개 내역을 도로명주소·단지명으로 붙인 값(서구 181단지 중 150곳 결합).</p>` + (() => { const el = D.sites.filter(s => (s['최고층수'] || 0) >= 15 && (s['승강기중대고장_2021이후'] || 0) > 0).sort((a, b) => b['승강기중대고장_2021이후'] - a['승강기중대고장_2021이후']); const seen = new Set(), top = el.filter(s => !seen.has(s['단지명']) && seen.add(s['단지명'])).slice(0, 5); return `<h4 style="margin:12px 0 4px">승강기가 자주 멈추는 고층 단지 — 정전 때 이송 계획을 먼저</h4><table><tr><th>단지</th><th>최고층</th><th>승강기</th><th>중대고장 2021~</th></tr>` + top.map(s => `<tr><td>${esc(s['단지명'].replace('관리사무소', ''))}</td><td>${s['최고층수']}층</td><td>${(s['승강기(승객용)'] || 0) + (s['승강기(승객+화물)'] || 0)}대</td><td>${s['승강기중대고장_2021이후']}건</td></tr>`).join('') + `</table><p class="muted">서구 119 구조출동 2025년 「승강기 갇힘」 297건, 7~8월에 가장 많음(소방청 구조활동현황 data.go.kr 15062386). 정전으로 승강기가 서면 고층 의료기기 가구는 장비를 들고 계단으로 내려와야 합니다.</p>`; })();
  const gu = ['동구', '중구', '서구', '유성구', '대덕구'], months = Object.keys(D.kep['서구']).sort(), cols = ['#64748b', '#0ea5e9', '#c81e33', '#15803d', '#7c3aed'];
  kepChart = new Chart($('#kepChart'), { type: 'line', data: { labels: months, datasets: gu.map((g, i) => ({ label: g, data: months.map(m => D.kep[g][m]), borderColor: cols[i], pointRadius: 0, borderWidth: g === '서구' ? 3 : 1.5 })) }, options: { plugins: { legend: { labels: { boxWidth: 10 } } }, scales: { x: { ticks: { maxTicksLimit: 6 } } }, animation: false } });
  needChart = new Chart($('#needChart'), { type: 'bar', data: { labels: DURS.map(d => d + '시간'), datasets: [{ label: '절반 넘는 확률로 필요', data: need, backgroundColor: '#c81e33' }, { label: '10% 이상 확률로 필요', data: need10, backgroundColor: '#fca5a5' }] }, options: { plugins: { legend: { labels: { boxWidth: 10 } } }, animation: false } });
  const PK = { '재택의료센터': '🩺', '보건소·지소': '🏥', '장애인 활동지원기관': '🤝' };
  ((D.part && D.part.partners) || []).forEach(x => L.marker([x.lat, x.lon], { icon: L.divIcon({ className: '', html: `<div style="font-size:14px;line-height:14px">${PK[x.kind] || '•'}</div>` }) }).bindTooltip(`${esc(x.kind)} · <b>${esc(x.name)}</b>${x.tel ? '<br>' + esc(x.tel) : ''}<br><small>${esc(x.addr || '')}</small>`).addTo(mapPlan));
  (D.gen.items || []).filter(x => x.gu === '서구' || !x.gu).forEach(x => L.marker([x.lat, x.lon], { icon: L.divIcon({ className: '', html: '<div style="font-size:12px;line-height:12px;opacity:.85">🏛️</div>' }) }).bindTooltip(`${esc(x.name)} — 비상발전기 ${x.kw}kW (2020 기준)`).addTo(mapPlan));
  const cnt = k => ((D.part && D.part.partners) || []).filter(x => x.kind === k).length;
  const LV = D.live; const liveHTML = LV ? `<h4 style="margin:12px 0 4px">실시간 공공 API 연결 — ${esc(LV.fetched_at.replace('T', ' ').slice(0, 16))} 수신 스냅숏</h4><table><tr><th>API</th><th>받은 값</th><th>시제품에서 쓰는 곳</th></tr><tr><td>기상청 초단기실황</td><td>서구 ${LV.weather.dong_n}개 동 기온 ${LV.weather.t_min}~${LV.weather.t_max}℃</td><td>한파·폭염 가중을 실측 기온으로</td></tr><tr><td>국립중앙의료원 응급의료기관</td><td>대전 응급실 ${LV.er.items.length}곳 · 가용 ${LV.er.items.reduce((s, x) => s + x.ec, 0)}병상 · 인공호흡기 가용 ${LV.er.items.filter(x => x.vent === 'Y').length}곳</td><td>「다른 방법」 이송 후보</td></tr><tr><td>환경공단 전기차 충전기</td><td>서구 충전기 ${LV.ev.n.toLocaleString()}기 상태 수신 (충전소 ${LV.ev.stations.toLocaleString()}곳)</td><td>한 동네 충전기 상태가 동시에 바뀌면 정전 범위 보조 신호</td></tr><tr><td>식약처 품목·회수</td><td>인공호흡기 386·산소발생기 141 품목, 모델별 회수 보고</td><td>기기 등록 시 허가번호·회수 이력</td></tr></table><p class="muted">수집기: prep/fetch_live.py (공공데이터포털 인증키 1개, 자동승인 API). 정적 시연 페이지라 수집 시점 값을 보여 줍니다.</p>` : '';
  const pp = document.getElementById('partnerBox'); if (pp) pp.innerHTML = liveHTML + `<h4 style="margin:12px 0 4px">평시 점검·정전 때 연락할 서구 기관 (지도 표시)</h4><table><tr><th>기관</th><th>곳</th><th>정전 때 할 일</th></tr><tr><td>🩺 재택의료센터</td><td>${cnt('재택의료센터')}</td><td>등록 가구 배터리 점검 방문, 이송 판단 상담</td></tr><tr><td>🏥 보건소·지소</td><td>${cnt('보건소·지소')}</td><td>명부 대조, 충전 거점 후보</td></tr><tr><td>🤝 장애인 활동지원기관</td><td>${cnt('장애인 활동지원기관')}</td><td>현장 연락·계단 이동 지원</td></tr><tr><td>🏛️ 비상발전 공공시설</td><td>${(D.gen.items || []).filter(x => x.gu === '서구').length}</td><td>정전 중 대기·예비 배터리 충전 (협약 필요)</td></tr></table><p class="muted">재택의료센터 주소정보(건보공단 2026-09) · 지역보건의료기관(복지부 2025-12) · 서구 장애인 활동지원 기관(2026-03) · 공공기관 비상용발전기(한국전기안전공사 2020)</p>`;
}

/* ================= 30초 시연 ================= */
let demoT = null, demoI = 0, DEMO = [];
function demoSteps() {
  return [
    { go: () => { showView('ops'); }, txt: () => `정전은 누구나 겪습니다. 2023년 9월 이후 정전이 났다고 알린 재난문자만 <b>227건</b>(재난안전데이터공유플랫폼 공개 문자 442건을 직접 분류). 그런데 그 동네에 <b>꺼지면 안 되는 집</b>이 어디인지는 아무도 계산하지 않습니다.` },
    { go: () => { loadScenario('S1'); }, txt: () => `<b>2022년 11월 30일 20:01</b>, 서울 송파 아파트 단지 변압기가 터져 약 5,500세대가 정전됐습니다. (실제 사건)` },
    { go: () => { const r = $('#queue .grp.g0 .row'); r && r.classList.add('flash'); }, txt: () => { const a = S.A.list[0]; return `라이프라인 119는 정전 범위의 등록 가구를 바로 찾습니다. 배터리 점검 기록이 없는 ${esc(LL.KIND_KO[a.device.kind])}는 <b>0분</b>으로 계산해 맨 위 「지금 가야 함」에 올립니다.`; } },
    { go: () => { const a = S.A.list[0], p = assignOf(a); if (p && p.res_name) { DEMO.arr = clockStr(S.sc.t0, stepsOf(S.key)[S.step].t + p.arr); send(a); } }, txt: () => { const p = assignOf(S.A.list[0]); return p && p.res_name ? `추천: <b>${esc(/발전기|대여|차$/.test(p.res_name) ? p.res_name : p.res_name + ' 발전기')}, ${fmt(p.arr)} 뒤 도착</b>. 상황요원은 「보내기」 한 번만 누릅니다. AI는 추천만 하고 결정은 사람이 합니다.` : '추천을 확인하고 상황요원이 보냅니다.'; } },
    { go: () => { S.step = 2; runStep(); }, txt: () => `실제로는 <b>20:20</b>, 정전 19분 뒤에야 인공호흡기가 멈춘 걸 알았습니다. 라이프라인 119가 있었다면 20:01에 바로 전화로 수동 환기를 안내하고, 발전기는 <b>${DEMO.arr || '-'}</b>에 도착합니다.` },
    { go: () => { showView('home'); }, txt: () => `가구 등록은 <b>이름표 사진 한 장과 질문 4개</b>. 결과는 「우리 집은 최소 몇 시간」 한 줄과, 그 시간을 늘리는 가장 효과 큰 한 가지입니다.` },
    { go: () => { showView('plan'); }, txt: () => `지자체는 <b>「정전이 24시간이면 몇 집에 전원이 필요한가」</b> 한 숫자로 미리 발전기를 준비합니다.` }
  ];
}
function demoShow() {
  const s = DEMO[demoI]; s.go(); setTimeout(() => { $('#demoTxt').innerHTML = s.txt(); }, 120);
  $('#demoN').textContent = `${demoI + 1}/${DEMO.length}`; $('#demoNext').textContent = demoI === DEMO.length - 1 ? '끝' : '다음 ▶';
  const bar = $('#demoBar'); bar.style.transition = 'none'; bar.style.width = '0'; requestAnimationFrame(() => { bar.style.transition = 'width 6.5s linear'; bar.style.width = '100%'; });
  clearTimeout(demoT); demoT = setTimeout(demoNext, 6600);
}
function demoNext() { if (demoI >= DEMO.length - 1) return demoStop(); demoI++; demoShow(); }
function demoStop() { clearTimeout(demoT); $('#demo').hidden = true; }
$('#demoBtn').onclick = () => { DEMO = demoSteps(); demoI = 0; $('#demo').hidden = false; demoShow(); };
$('#demoNext').onclick = demoNext; $('#demoStop').onclick = demoStop;

/* ================= 근거 ================= */
function naiRow() {
  const N = D.res.notice_ai; if (!N) return '평가 준비 중';
  const pct = x => (x * 100).toFixed(0) + '%', mean = v => Array.isArray(v) ? v[0] : v;
  return `2026년 실제 문자 ${204}건(학습에 안 쓴 기간) 시험, 시드 ${N.n_seeds}개 평균 — 종류 정확도 <b>${pct(mean(N.ai.kind_acc))}</b>(기존 규칙 ${pct(N.rule.kind_acc)}) · 원인 ${pct(mean(N.ai.cause_acc_known))}(규칙 ${pct(N.rule.cause_acc_known)}) · <b>복구 예정 시각 ±15분 일치 ${mean(N.ai.eta_hit).toFixed(0)}/${N.eta_n}</b>(규칙 ${N.rule.eta_hit}/${N.eta_n}). 분류만 보면 같은 증강을 쓴 TF-IDF도 ${pct(N.tfidf_aug.kind_acc)}로 비슷 — 차이는 시각을 찾아 읽는 데서 난다`;
}
function initAbout() {
  const P = LL.BATTERY_PRIOR, R = LL.REST_PRIOR;
  $('#aboutBox').innerHTML = `<h1>라이프라인 119 — 근거와 한계</h1>
  <p class="lead">정전이 나면 집집마다 <b>배터리가 버틸 수 있는 가장 짧은 시간</b>과 <b>전기가 돌아오기까지 걸릴 수 있는 가장 긴 시간</b>을 비교해, 배터리가 먼저 끝날 집에 119 비상전원이 먼저 갑니다. 마지막 결정은 119 상황요원이 합니다.</p>
  <h2>왜 필요한가 — 원문으로 확인한 것</h2><ul>
  <li><b>정전은 예고 없이 오고, 길어진다.</b> 아파트 정전 382건(2023~25)의 원인은 모두 고장·사고(기자재 61%), 12시간 넘게 간 것이 14.4%, 24시간 넘게 간 것이 15건. 7~8월에 43% — 기후에너지환경부 2026-05-20 보도자료 붙임. 2026-07-13 영종도 25,169세대 정전은 6시간 15분, 구청 안내문자는 정전 89분 뒤.</li>
  <li><b>정부 대책의 목표는 24시간(화재·침수 48시간) 안 임시전력</b> — 재택 인공호흡기 공칭 내장 배터리 7.5~8시간보다 길다. 같은 대책과 5-21 브리핑에 의료기기 사용 가구 조치는 없다.</li>
  <li><b>한전 「생명유지장치」 등록은 요금 감액 명부다.</b> 기본공급약관 제67조, 세칙 제48조(호흡기장애 = 가정산소치료 인정기준, 희귀질환은 근육병 등 5종). 약관·세칙 어디에도 이 고객에게 개별 사전통지·우선복구 조항이 없다(제47조는 「신문, 방송 또는 기타 방법」 일반 통지). 아파트 단일계약 세대는 한전이 세대 단위로 보지 못한다(영종도: 25,169세대 = 3,084호).</li>
  <li><b>119안심콜 등록 항목에 의료기기·배터리가 없다.</b> 등록정보 = 이름·생년월일·연락처·주소, 응급의료정보 = 병력·기저질환·복용약물·알레르기·보호자 연락처(소방청 119안심콜 2026-09-01 공지, 동의 근거).</li></ul>
  <h2>왜 이렇게 단순하게 만들었나</h2><table><tr><th>화면</th><th>원칙</th><th>근거</th></tr>
  <tr><td>우리 집</td><td>한 화면에 한 질문, 결과는 「최소 몇 시간」 한 숫자 + 가장 효과 큰 한 가지 + 냉장고 카드</td><td>GOV.UK 「One thing per page」 · 일본 신주쿠구 개별지원계획 「내부+외부 배터리 합계」 칸 · 미나토구 냉장고 보관</td></tr>
  <tr><td>상황실</td><td>남은 배터리 짧은 순 한 줄 정렬, 행마다 추천 1건 + 「보내기」, 설명 문단 없음, 괜찮은 집은 접기</td><td>START 분류·NEWS2 색-행동 대응 · 설명이 과신을 키운다(Bansal 2021) · 반복 경보 1건마다 수용 30%↓(Ancker 2017)</td></tr>
  <tr><td>공통</td><td>색과 글자를 함께, 행동 이름 버튼, 시간제한 없음</td><td>KWCAG 2.2 · 위기 체크리스트로 핵심 누락 23%→6%(Arriaga, NEJM 2013)</td></tr></table>
  <h2>AI 모듈과 검증</h2><table><tr><th>모듈</th><th>방법</th><th>지금 검증된 것</th></tr>
  <tr><td>M1 기기 등록</td><td>이름표 사진 → OCR 또는 멀티모달 LLM → 사양표 퍼지 매칭</td><td>합성 이름표 210장 시험: 모델 자동 입력 165/180(91.7%), <b>다른 모델로 잘못 채움 0건</b>, 못 읽으면 사람이 고름</td></tr>
  <tr><td>M2 배터리 최소</td><td>공칭 용량 × 충전 × 노화 × 설정 × 개체차 + 예비 산소통 + 기기 없이 버티는 시간 → 몬테카를로 하위 10%</td><td>개체차 Mehrabi 2018(58% 사양 미달), 설정 Falaize 2014. 점검 기록 없으면 0. <b>현장 방전시험으로 보정 필요</b></td></tr>
  <tr><td>M3 문자 해석 AI</td><td>KoELECTRA-small(1,400만 파라미터)을 전국 재난문자 정전 442건(2023-09~2026-10, 재난안전데이터공유플랫폼, 연구진 수작업 라벨)과 증강 문장으로 미세조정 — 종류·원인·시각 구간(정전 시각·복구 예정·소요·복구 시각·세대 수)을 한 번에 읽는다. 브라우저 안 ONNX(14.7MB), 문자를 서버로 보내지 않음</td><td>${naiRow()}</td></tr>
  <tr><td>M3 복구시간</td><td>지역 정전: 전국 재난문자 「발생→복구」 짝 ${D.res.pairs.n}건 실측(중앙 ${D.res.pairs.median_h.toFixed(1)}h, 10번 중 9번 ${D.res.pairs.p90_h.toFixed(1)}h 안). 단지 내부·모를 때: 아파트 정전 382건(중앙 ${R.median_h.toFixed(1)}h, ${R.p90_h.toFixed(1)}h) — 모르면 긴 쪽. 발표된 복구 예정은 실측 오차로 보정</td><td>발표 예정 대비 실제 남은 시간 = 발표의 ${Math.exp(D.res.pairs.eta_bias).toFixed(2)}배(로그 ${D.res.pairs.eta_bias.toFixed(2)}±${D.res.pairs.eta_sd.toFixed(2)}, 10건) — 「10번 중 9번은 발표 시각 안」. 382건 원문 7구간 대조 χ²=4.1(p≈0.39). 이 분포로 바꾸자 남대전 재현에서 출동 대상 ${D.res.prior_change.S5_tasks[0]}→${D.res.prior_change.S5_tasks[1]}가구로 줄고 놓치는 집은 그대로</td></tr>
  <tr><td>M4·M5 순위·배정</td><td>배터리가 먼저 끝날 확률·여유로 3단계 → 기한 안 닿는 자원부터 배정, 못 닿으면 전화·이송</td><td>남대전변전소 2021 재현: 배터리 소진 ${D.res.s5.at_risk_no_action} → ${D.res.s5.remain_edf} (명부 순 ${D.res.s5.remain_registry}). 최적 배정 상한의 ${(D.res.opt.S5.ratio * 100).toFixed(0)}~${(D.res.opt.S2.ratio * 100).toFixed(0)}%</td></tr></table>
  <h2>지금 제도 안에서 돌아가게</h2><table><tr><th>단계</th><th>어떻게</th><th>근거</th></tr>
  <tr><td>평시 등록</td><td>119안심콜 「응급의료정보」에 의료기기·여분 배터리·버티는 시간 3항목 추가. 한전 할인 신청서에 「119 제공 동의」 칸</td><td>개인정보 보호법 제23조①1(별도 동의) · 안심콜은 동의 기반 서비스 · 한전 약관 제51조의2④: 고객 동의 시 제3자 제공 가능</td></tr>
  <tr><td>정전 인지</td><td>재난문자·한전 안내·119 신고 문장 해석</td><td>재난문자방송 운영규정(한전 이용기관). 소규모 돌발 정전(탄방동 27호)은 문자가 없어 신고 문장이 첫 신호</td></tr>
  <tr><td>연락</td><td>등록 세대에 전화·문자</td><td>119안심콜 화재대피 안내(2026-05-01 전국 시행: 주소로 가입 세대 조회 → 전화, 같은 동 문자)와 같은 경로에 「정전 모드」 추가</td></tr>
  <tr><td>판단·출동</td><td>가구 정보는 소방 내부망에서만 계산, 외부 AI에는 공개 문자·비식별 문안만. 상황요원 승인 후 출동</td><td>국가 사이버보안 기본지침(2026-05-01) · AI행정법 제3조⑤·제32조 · 소방기본법 제16조의3①4 「단전사고 시 비상전원 공급」</td></tr>
  <tr><td>계획</td><td>정전 길이별 필요 전원 수 → 안전취약계층 대피계획의 재택 유지·전원 부분, 아파트 정전 통합 SOP의 취약가구 부록</td><td>재난안전법 제31조의2⑤(2027-01-08 시행, 하위법령 입법예고 전) · 기후에너지환경부 통합 SOP(제정 예정)</td></tr></table>
  <h2>선행 특허·제도와 무엇이 다른가</h2><table><tr><th>선행</th><th>하는 일</th><th>차이</th></tr>
  <tr><td>연세대 산학협력단 공개특허 10-2026-0135087 (출원 2025-03-04)</td><td>병원 EMR로 환자별 정전 위험도·필수 의료기기 전원 감시·대응 우선순위·매뉴얼</td><td>병원 안 환자 대상. 우리는 EMR 없는 재택 가구, 배터리 최소와 복구 최대를 확률로 비교, 재난문자 해석, 119 자원 배정</td></tr>
  <tr><td>한전KDN 정전관리시스템 (2010 출원)</td><td>계통 정전 위치·심각도 분석, 작업자 배치</td><td>전력 설비 복구용. 사람(가구)의 남은 시간은 다루지 않음</td></tr>
  <tr><td>미국 HHS emPOWER</td><td>전력의존자 460만+ 명 우편번호 단위 집계</td><td>집계 지도 — 가구별 시간 비교·배정 없음</td></tr>
  <tr><td>칠레 Ley 21.304</td><td>등록 환자에 배전사 장비 대여·복구 우선</td><td>2024 대정전 때 등록 2,300여 명에 장비 500개 미만, 우선 상담 붕괴 보도</td></tr>
  <tr><td>대만 보전명부 · 스페인 등록부 초안(2026-07) · 일본 개별계획</td><td>명부·사전통지·생존시간 3단계·평시 계획</td><td>정전 순간 가구별 시간 비교와 자원 배정 계산은 확인되지 않음 (스페인 3단계는 우리 입력값으로 씀)</td></tr></table>
  <p class="muted">KIPRIS 초록 검색(정전·재택·의료기기 / 정전·인공호흡기 / 단전·취약·출동)과 조사한 11개 나라·지역 공개자료에서 같은 구성은 확인되지 않았다.</p>
  <h2>연구 근거</h2><ul>
  <li>미국 8시간+ 정전 17,484건 중 62.1%가 극한기상과 겹침 — Do 외 2023, Nature Communications</li>
  <li>2025 이베리아 대정전 뒤 초과사망 +167명 — Konstantinoudis 외 2026 · 재택 호흡치료 센터 44.8%가 환자에게 연락 못함 — Jiménez-Gómez 외 2026 → 오프라인 명단·카드</li>
  <li>홋카이도 2018: 24시간 상시 사용 피난입원 PR 9.07, 기관절개 3.57 — 方波見 2022 → 같은 여유면 앞 순위</li>
  <li>휴대용 산소농축기 33종 평균 최대 3.8시간 — Kawachi 외 2026, JMIR</li>
  <li>정전 4시간이면 소아 일산화탄소 중독 응급실 50%+ 증가 — Northrop 외 2025, Pediatrics → 발전기 실내 금지 안내</li></ul>
  <h2>가정값 (보정 전 — 그대로 공개)</h2><table><tr><th>항목</th><th>값</th><th>근거</th></tr>
  <tr><td>개체·사양 편차</td><td>LogN(ln0.95, 0.35)</td><td>사양 미달 56% ≈ Mehrabi 2018의 58%</td></tr>
  <tr><td>노화</td><td>연 ${P.fade_per_year[0] * 100}~${P.fade_per_year[1] * 100}% 감소</td><td>가정 — 대여업체 교체 주기 자료로 보정 예정</td></tr>
  <tr><td>기기 없이 버티는 시간</td><td>30분 미만 / 30분~4시간 / 4시간 초과</td><td>스페인 보건부 등록부 왕령 초안(2026-07) 3단계</td></tr>
  <tr><td>한파·폭염</td><td>버티는 시간 ×0.75</td><td>가정</td></tr>
  <tr><td>거치형 산소발생기 배터리</td><td>0시간</td><td>원문 미확인 → 모르면 0</td></tr>
  <tr><td>발표 예정시각 오차</td><td>로그편차 +0.10 ± 0.50</td><td>가정 (부산 2023-05-19: 3시간 → 익일 09시)</td></tr>
  <tr><td>이동</td><td>OSM 도로망 최단경로 소요시간(OSRM, 신호·혼잡 미반영) + 준비 6분, 현장 15분 · 표에 없는 쌍만 직선거리×1.4÷30km/h</td><td>도로망 실측 · 준비·현장 시간은 가정</td></tr>
  <tr><td>자원</td><td>119안전센터당 이동식발전기 1대</td><td>소방장비 분류 규정 별표3(기본장비). 가구 지원 용량은 미확인</td></tr></table>
  <h2>하지 않는 것</h2><ul><li>진단명이나 등록 순서로 순위를 매기지 않는다 — 남은 시간으로만.</li><li>자동 출동하지 않는다 — 상황요원 「보내기」가 있어야 나간다.</li><li>생성형 AI는 문자 해석 교차확인·문안·이름표 판독에만 쓴다. 순위·배정은 계산 모델이 한다.</li><li>지도와 목록의 가구는 모두 합성이다.</li></ul>
  <h2>출처</h2><ol>${Object.values(LL.SOURCES).map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
}

/* ---------- 시작 ---------- */
(async function () {
  const [sc, dongs, sites, kep, res] = await Promise.all([j('data/scenarios.json'), j('data/dongs.geojson'), j('data/sites_seogu.json'), j('data/kepco_lifesupport_monthly.json'), j('data/results.json')]);
  const [gen, heat, wel, part, reg, live, road] = await Promise.all([j('data/powered_sites_daejeon.json').catch(() => ({ items: [] })), j('data/heat_shelters_seogu.json').catch(() => ({ items: [] })), j('data/welfare_seogu.json').catch(() => ({ dong: {} })), j('data/partners_seogu.json').catch(() => ({ partners: [], hira_vent: [] })), j('data/device_registry.json').catch(() => ({ dev: {} })), j('data/live_summary.json').catch(() => null), j('data/road_times.json').catch(() => null)]);
  Object.assign(D, { gen, heat, wel, part, reg, live, road });
  Object.assign(D, { sc, dongs, sites, kep, res });
  // 실데이터 결합: 행안부 「승강기 중대한 고장 발생 내역」(data.go.kr 15048080, 2000-08~2026-07) → K-apt 단지(도로명주소·단지명 일치) → 합성 가구의 단지
  const ef = {}; sites.forEach(x => { const k = x['단지명']; if (k && x['승강기고장_결합'] !== '없음') ef[k] = Math.max(ef[k] || 0, x['승강기중대고장_2021이후'] || 0); });
  ['S2', 'ALL_DJ'].forEach(k => sc[k] && sc[k].households.forEach(h => { if (ef[h.place] != null) h.elev_faults = ef[h.place]; }));
  initAbout(); initOps(); checkAI(); loadNoticeAI();
  const v = (location.hash || '').slice(1); if (['home', 'plan', 'about'].includes(v)) showView(v);
})();
