const LL=require('../engine.js'); const S=require('../data/scenarios.json');
function run(sc, ev, label){
  const A=LL.assess(sc.households, ev, {n:1000});
  const cnt={}; A.list.forEach(a=>cnt[a.tier]=(cnt[a.tier]||0)+1);
  console.log(label, 'rest P50/P90', A.rest.p50.toFixed(2), A.rest.p90.toFixed(2), cnt);
  return A;
}
const s2=S.S2;
const n1=LL.parseNotice(s2.notices[0].text, s2.notices[0].at), n2=LL.parseNotice(s2.notices[1].text, s2.notices[1].at);
console.log(n1, n2);
const A0=run(s2,{elapsed_h:0,cold:true},'S2 t0 (no notice)');
const A1=run(s2,{elapsed_h:10/60,cold:true,cause:n1.cause,eta_h:n1.eta_h},'S2 notice1');
const A2=run(s2,{elapsed_h:100/60,cold:true,cause:n1.cause,eta_h:n2.eta_h},'S2 notice2');
console.log(A2.list.slice(0,5).map(a=>[a.hh.id,a.device.model,a.tier,a.bat_p10.toFixed(2),a.margin.toFixed(2),a.p_fail]));
// 배정 비교 (위급·경계만)
for (const A of [A1,A2]) {
 const tasks=A.list.filter(a=>a.tier!=='관찰').map(a=>({id:a.hh.id,lat:a.hh.lat,lon:a.hh.lon,deadline_h:Math.max(0,a.bat_p10),reg_order:a.hh.reg_order}));
 for (const pol of ['edf','registry','nearest']) { const P=LL.planDispatch(tasks,s2.resources,pol); console.log(pol, 'tasks',tasks.length,'ok',P.ok,'late',P.late); }
}
const s1=S.S1; const B=run(s1,{elapsed_h:0,cold:true,cause:'기자재'},'S1 t0');
B.list.forEach(a=>console.log(a.hh.id,a.device.model,a.tier,LL.fmtH(a.bat_p10),LL.fmtH(a.rest_p90),a.p_fail));
