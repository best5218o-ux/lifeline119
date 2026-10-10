/* 라이프라인 119 — 재난문자 해석 AI (KoELECTRA-small 미세조정, 브라우저 안에서 실행)
   토크나이저: BERT WordPiece (KoELECTRA v3 어휘) — 파이썬 토크나이저와 442건 전부 일치 확인 */
(function (root) {
  'use strict';
  const isWS = c => c === ' ' || c === '\t' || c === '\n' || c === '\r' || /\s/.test(c);
  const isCtrl = c => { if (c === '\t' || c === '\n' || c === '\r') return false; return /[\p{Cc}\p{Cf}]/u.test(c); };
  const isPunct = c => { const cp = c.codePointAt(0); if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126)) return true; return /\p{P}/u.test(c); };
  const isCJK = cp => (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x20000 && cp <= 0x2A6DF) || (cp >= 0x2A700 && cp <= 0x2B73F) || (cp >= 0x2B740 && cp <= 0x2B81F) || (cp >= 0x2B820 && cp <= 0x2CEAF) || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0x2F800 && cp <= 0x2FA1F);
  function makeTokenizer(vocabText) {
    const vocab = new Map(); vocabText.split('\n').forEach((w, i) => { if (w !== '') vocab.set(w, i); });
    const UNK = vocab.get('[UNK]'), CLS = vocab.get('[CLS]'), SEP = vocab.get('[SEP]');
    function words(text) {
      const out = []; let cur = null; let i = 0;
      for (const ch of text) {
        const cp = ch.codePointAt(0), len = ch.length;
        if (cp === 0 || cp === 0xFFFD || isCtrl(ch)) { if (cur) { out.push(cur); cur = null; } i += len; continue; }
        if (isWS(ch)) { if (cur) { out.push(cur); cur = null; } }
        else if (isPunct(ch) || isCJK(cp)) { if (cur) { out.push(cur); cur = null; } out.push({ w: ch, s: i, e: i + len }); }
        else { if (!cur) cur = { w: '', s: i, e: i }; cur.w += ch; cur.e = i + len; }
        i += len;
      }
      if (cur) out.push(cur); return out;
    }
    function encode(text, maxLen) {
      maxLen = maxLen || 128; const ids = [CLS], offs = [[0, 0]];
      for (const wd of words(text)) {
        const chars = [...wd.w];
        if (chars.length > 100) { ids.push(UNK); offs.push([wd.s, wd.e]); continue; }
        const pieces = []; let start = 0, bad = false;
        // 문자 단위 오프셋 계산용 누적 길이
        const cum = [0]; for (const c of chars) cum.push(cum[cum.length - 1] + c.length);
        while (start < chars.length) {
          let end = chars.length, found = null;
          while (start < end) { let sub = chars.slice(start, end).join(''); if (start > 0) sub = '##' + sub; if (vocab.has(sub)) { found = sub; break; } end--; }
          if (found === null) { bad = true; break; }
          pieces.push([vocab.get(found), wd.s + cum[start], wd.s + cum[end]]); start = end;
        }
        if (bad) { ids.push(UNK); offs.push([wd.s, wd.e]); } else for (const p of pieces) { ids.push(p[0]); offs.push([p[1], p[2]]); }
      }
      if (ids.length > maxLen - 1) { ids.length = maxLen - 1; offs.length = maxLen - 1; }
      ids.push(SEP); offs.push([0, 0]); return { ids, offs };
    }
    return { encode };
  }
  const softmax = a => { const m = Math.max(...a); const e = a.map(x => Math.exp(x - m)); const s = e.reduce((p, q) => p + q, 0); return e.map(x => x / s); };
  function decode(text, enc, kindL, causeL, tagL, labels) {
    const kp = softmax(kindL), cp = softmax(causeL); const ki = kp.indexOf(Math.max(...kp)), ci = cp.indexOf(Math.max(...cp));
    const spans = []; let cur = null; const nT = labels.tags.length;
    for (let t = 0; t < enc.ids.length; t++) {
      const [a, b] = enc.offs[t]; if (a === b) continue;
      const row = tagL.slice(t * nT, (t + 1) * nT); const ti = row.indexOf(Math.max(...row)); const lab = labels.tags[ti];
      if (lab === 'O') { if (cur) { spans.push(cur); cur = null; } continue; }
      const [bi, name] = lab.split('-');
      if (bi === 'B' || !cur || cur[2] !== name) { if (cur) spans.push(cur); cur = [a, b, name]; } else cur[1] = b;
    }
    if (cur) spans.push(cur);
    return { kind: labels.kind[ki], kind_p: kp[ki], cause: labels.cause[ci] === '미상' ? null : labels.cause[ci], cause_p: cp[ci], spans: spans.map(s => ({ s: s[0], e: s[1], label: s[2], text: text.slice(s[0], s[1]) })) };
  }
  root.NoticeAI = { makeTokenizer, decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NoticeAI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
