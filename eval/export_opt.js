// 배정 최적성 점검용 행렬 내보내기: 자원 슬롯 × 가구 쌍마다 「기대 구조 확률」 = P(도착 < 실제 소진 < 실제 복구)
const LL=require('../engine.js'); const ROADON=process.env.ROAD==='1'; const RT=require('../data/road_times.json'); const S=require('../data/scenarios.json'); const fs=require('fs');
function build(key, ev, restFixed, draws){
  const sc=S[key]; if(ROADON) LL.setRoad(RT.sc[key]); else LL.setRoad(null); const A=LL.assess(sc.households,ev,{n:1000});
  const tasks=A.list.filter(a=>a.tier!=='관찰').map(a=>({id:a.hh.id,lat:a.hh.lat,lon:a.hh.lon,deadline_h:Math.max(0,a.bat_p10),reg_order:a.hh.reg_order,dev:a.device}));
  const idx=Object.fromEntries(sc.households.map((h,i)=>[h.id,i]));
  // 참값 표본
  const T={}; const R=[];
  for(let d=0;d<draws;d++){ R.push(restFixed!=null?restFixed:LL.restorationSamples(ev,1,5000+d)[0]); }
  for(const t of tasks){ const h=sc.households[idx[t.id]]; T[t.id]=[]; for(let d=0;d<draws;d++) T[t.id].push(LL.batterySamples(h,1,7000+d*131+idx[t.id],{cold:ev.cold,heat:ev.heat}).total[0]-(ev.elapsed_h||0)); }
  // 슬롯: cap 개수만큼 (대여 차량 슬롯은 모두 출발지에서 바로 간다고 완화 → 상한)
  const slots=[]; for(const r of sc.resources) for(let k=0;k<(r.cap||1);k++) slots.push({res:r.id,name:r.name,lat:r.lat,lon:r.lon,r});
  const W=slots.map(s=>tasks.map(t=>{ if(!LL.compat(s.r,t.dev).ok) return 0; const arr=LL.DISPATCH.dispatch_delay_h+LL.travelH({...s,id:s.res},t); let c=0; for(let d=0;d<draws;d++){ const tb=T[t.id][d]; if(tb<R[d] && arr<=tb) c++; } return c/draws; }));
  // 휴리스틱(edf) 계획의 기대 구조 수
  const P=LL.planDispatch(tasks,sc.resources,'edf'); let heur=0;
  for(const p of P.plan){ if(!p.res) continue; let c=0; for(let d=0;d<draws;d++){ const tb=T[p.task.id][d]; if(tb<R[d] && p.arr<=tb) c++; } heur+=c/draws; }
  const atRisk=tasks.reduce((s,t)=>{let c=0;for(let d=0;d<draws;d++) if(T[t.id][d]<R[d]) c++; return s+c/draws;},0);
  return {key,slots:slots.length,tasks:tasks.length,W,heur,atRisk};
}
const out={S5:build('S5',{elapsed_h:20/60,cause:'화재',where:'계통'},2.5-20/60,300), S2:build('S2',{elapsed_h:10/60,cold:true,cause:'기자재',eta_h:3},null,300)};
fs.writeFileSync(__dirname+'/opt_mats.json',JSON.stringify(out));
console.log(Object.values(out).map(o=>[o.key,o.slots,o.tasks,o.heur.toFixed(2),o.atRisk.toFixed(2)]));
