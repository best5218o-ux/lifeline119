// 배정 정책 비교: 「참값」을 모델에서 뽑아(몬테카를로) 기한 안 도착으로 실제 정전 전 소진을 막은 가구 수를 센다
const LL=require('../engine.js'); const RT=require('../data/road_times.json'); const S=require('../data/scenarios.json');
function evalScenario(sc, ev, draws, key){ LL.setRoad(RT.sc[key]);
  const A=LL.assess(sc.households, ev, {n:1000});
  const tasks=A.list.filter(a=>a.tier!=='관찰').map(a=>({id:a.hh.id,lat:a.hh.lat,lon:a.hh.lon,deadline_h:Math.max(0,a.bat_p10),reg_order:a.hh.reg_order,dev:a.device}));
  const plans={}; for(const pol of ['edf','registry','nearest']) plans[pol]=LL.planDispatch(tasks,sc.resources,pol);
  const r=LL.rng(99); const stats={edf:[],registry:[],nearest:[],none:[]};
  const idx=Object.fromEntries(sc.households.map((h,i)=>[h.id,i]));
  for(let d=0; d<draws; d++){
    const rest=LL.restorationSamples(ev,1,5000+d)[0];
    const truth={}; for(const h of sc.households){ truth[h.id]=LL.batterySamples(h,1,7000+d*131+idx[h.id],{cold:ev.cold})['total'][0]-(ev.elapsed_h||0); }
    const atRisk=Object.keys(truth).filter(id=>truth[id]<rest);
    stats.none.push(atRisk.length);
    for(const pol of ['edf','registry','nearest']){
      let saved=0; for(const p of plans[pol].plan){ if(p.res && truth[p.task.id]<rest && p.arr<=truth[p.task.id]) saved++; }
      stats[pol].push(atRisk.length-saved);
    }
  }
  const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
  return {tasks:tasks.length, resources:sc.resources.length, at_risk_no_action:mean(stats.none), remain_edf:mean(stats.edf), remain_registry:mean(stats.registry), remain_nearest:mean(stats.nearest), call_lane: plans.edf.plan.filter(p=>p.lane==='call').length, plan_ok:{edf:plans.edf.ok,registry:plans.registry.ok,nearest:plans.nearest.ok}};
}
const s2=S.S2;
const out={
 S2_notice1: evalScenario(s2,{elapsed_h:10/60,cold:true,cause:'기자재',eta_h:3},300,'S2'),
 S2_notice2: evalScenario(s2,{elapsed_h:100/60,cold:true,cause:'기자재',eta_h:11.83},300,'S2'),
 S1_t0: evalScenario(S.S1,{elapsed_h:0,cold:true,cause:'기자재'},300,'S1')
};
console.log(JSON.stringify(out,null,1));
require('fs').writeFileSync('result_dispatch.json',JSON.stringify(out,null,1));
