// 실제 정전 7건의 복구시간이 모델 분포(원인·위치 조건, 안내문 없음) 어디에 떨어지는지
const LL=require('../engine.js'); const C=require('./real_outages.json');
const out=[]; let inside=0,n=0;
for(const c of C){ const s=LL.restorationSamples({elapsed_h:0,cause:c.cause,where:c.where},6000,17); let le=0; for(const x of s) if(x<=c.hours) le++;
  const pct=le/s.length; const p05=LL.quantile(s,.05), p95=LL.quantile(s,.95);
  const ok = c.censored ? (1-pct)>=0.05 : (pct>=0.05 && pct<=0.95); n++; if(ok) inside++;
  out.push({id:c.id,cause:c.cause,where:c.where,actual_h:c.hours,censored:c.censored,model_pct:+(pct*100).toFixed(1),p05:+p05.toFixed(1),p50:+LL.quantile(s,.5).toFixed(1),p95:+p95.toFixed(1),within_90:ok}); }
console.table(out); const res={n,inside_90:inside,cases:out}; console.log(JSON.stringify({n,inside}));
require('fs').writeFileSync(__dirname+'/result_restore_cases.json',JSON.stringify(res,null,1));
