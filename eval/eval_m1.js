// M1: 합성 라벨 이미지 OCR(Tesseract eng) → 사양 DB 매칭
// 판정: 모델 일치(자동 입력) / 종류만 일치(사람이 모델 선택) / 못 읽음(사람이 선택) / 오매칭(다른 모델로 자동 입력 = 위험)
const LL=require('../engine.js'); const R=require(process.argv[2]||'./m1_ocr_raw.json');
const out={n:R.length,auto_correct:0,category_only_correct:0,manual:0,wrong_autofill:0,per_device:{}};
for(const r of R){const m=LL.matchDevice(r.ocr); const pd=out.per_device[r.dev]=out.per_device[r.dev]||{n:0,auto:0,cat:0,manual:0,wrong:0}; pd.n++;
 if(m&&m.device){ if(m.device.id===r.dev){out.auto_correct++;pd.auto++;} else {out.wrong_autofill++;pd.wrong++;} }
 else if(m&&m.category_only&&m.candidate.id===r.dev){out.category_only_correct++;pd.cat++;}
 else {out.manual++;pd.manual++;}}
const spec=R.filter(r=>!LL.DEVICE_DB.find(d=>d.id===r.dev).generic).length;
out.model_specific_n=spec; out.model_specific_auto_rate=+(out.auto_correct/spec).toFixed(3); out.wrong_rate=+(out.wrong_autofill/R.length).toFixed(3);
console.log(JSON.stringify(out)); require('fs').writeFileSync(process.argv[3]||'result_m1.json',JSON.stringify(out,null,1));
