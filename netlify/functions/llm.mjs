// 라이프라인 119 — 생성형 AI 중계 함수
// 키는 Netlify 환경변수에만 둔다: ANTHROPIC_API_KEY 또는 OPENAI_API_KEY (선택: LLM_MODEL)
// 정해진 세 가지 일만 한다: 재난문자 해석 교차확인 · 지령문/안내문 작성 · 기기 라벨 판독
const A_KEY = process.env.ANTHROPIC_API_KEY, O_KEY = process.env.OPENAI_API_KEY;
const PROVIDER = A_KEY ? 'anthropic' : O_KEY ? 'openai' : null;
const MODEL = process.env.LLM_MODEL || (A_KEY ? 'claude-haiku-4-5-20251001' : 'gpt-4.1-mini');
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const SYS = {
  parse_notice: `너는 한국 재난문자·한전 정전 안내문을 구조화하는 도구다. 문자에 쓰인 것만 쓴다. 추측하지 않는다.
JSON 하나만 출력: {"kind":"예보·안내|발생|지연|복구","cause":"화재|침수|외물|기상|차단기|기자재|null","eta_h":숫자 또는 null,"blocked":true/false}
- kind: 정전이 일어날 수 있으니 대비하라는 안내·신고번호 안내는 "예보·안내", 실제 정전 발생 통보는 "발생", 복구가 늦어지거나 예정시각이 뒤로 바뀌면 "지연", 복구 완료면 "복구".
- eta_h: 발송시각(sent_at)부터 복구 예정시각까지 남은 시간(시간 단위). "3시간 가량"이면 3, "내일 오전 9시 복구"면 발송시각 기준 계산. 없으면 null.
- cause: 전신주 추돌·수목·까치집 등은 "외물", 강풍·태풍·낙뢰·호우는 "기상", 변압기·설비 고장은 "기자재".`,
  order: `너는 119 종합상황실의 지령문 초안 작성 도구다. 주어진 숫자만 쓰고 새 사실을 만들지 않는다. 진단명은 쓰지 않는다.
JSON 하나만 출력: {"order":"출동 지령문(6줄 이내, 대상·기기·남은 배터리 하한·복구 상한·배정 자원·도착 예상·현장 유의사항)","household":"가구에 보낼 문자(4문장 이내, 쉬운 말, 발전기 실내 사용 금지 포함)"}
마지막 줄에 "상황요원 승인 후 출동"을 넣는다.`,
  read_label: `너는 의료기기 명판(라벨) 판독 도구다. 사진 속 글자를 보이는 그대로 옮긴다. 특히 제조사, 모델명, REF/모델번호를 빠뜨리지 않는다. 판독한 글자만 출력한다.`
};

async function callAnthropic(system, content, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': A_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }) });
  if (!r.ok) throw new Error('anthropic ' + r.status);
  const j = await r.json(); return j.content.map(c => c.text || '').join('');
}
async function callOpenAI(system, content, maxTokens) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + O_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content }] }) });
  if (!r.ok) throw new Error('openai ' + r.status);
  const j = await r.json(); return j.choices[0].message.content;
}
function textContent(t) { return PROVIDER === 'anthropic' ? [{ type: 'text', text: t }] : t; }
function imageContent(dataUrl, t) {
  const m = /^data:(image\/(png|jpeg|webp|gif));base64,(.+)$/.exec(dataUrl || ''); if (!m) throw new Error('image');
  return PROVIDER === 'anthropic' ? [{ type: 'image', source: { type: 'base64', media_type: m[1], data: m[3] } }, { type: 'text', text: t }]
    : [{ type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: t }];
}
const firstJSON = s => { const m = s.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; };

export default async (req) => {
  if (req.method === 'GET') return json({ live: !!PROVIDER, provider: PROVIDER ? `${PROVIDER} · ${MODEL}` : null });
  if (!PROVIDER) return json({ error: 'no_key' }, 503);
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const raw = await req.text(); if (raw.length > 3_000_000) return json({ error: 'too_large' }, 413);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
  const call = PROVIDER === 'anthropic' ? callAnthropic : callOpenAI;
  try {
    if (b.task === 'parse_notice') {
      const t = String(b.text || '').slice(0, 600), at = String(b.sent_at || '').slice(0, 30);
      const out = await call(SYS.parse_notice, textContent(`sent_at: ${at}\n문자: ${t}`), 300);
      return json({ result: firstJSON(out) });
    }
    if (b.task === 'order') {
      const out = await call(SYS.order, textContent(JSON.stringify(b.case || {}).slice(0, 2000)), 700);
      return json(firstJSON(out) || {});
    }
    if (b.task === 'read_label') {
      const out = await call(SYS.read_label, imageContent(String(b.image || ''), '이 명판의 글자를 옮겨 줘.'), 400);
      return json({ text: out });
    }
    return json({ error: 'unknown_task' }, 400);
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
};
