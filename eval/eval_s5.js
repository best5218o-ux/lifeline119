// S5 남대전변전소 2021: 실제 복구 2.5시간을 참값으로 두고, 배터리 참값만 몬테카를로로 뽑아 정책 비교
const LL=require('../engine.js'); const ROADON=process.env.ROAD==='1'; const RT=require('../data/road_times.json'); const S=require('../data/scenarios.json'); const sc=S.S5; if(ROADON) LL.setRoad(RT.sc.S5);
const ev={elapsed_h:20/60,cause:'화재',where:'계통'}; const A=LL.assess(sc.households,ev,{n:1000});
const tasks=A.list.filter(a=>a.tier!=='관찰').map(a=>({id:a.hh.id,lat:a.hh.lat,lon:a.hh.lon,deadline_h:Math.max(0,a.bat_p10),reg_order:a.hh.reg_order,dev:a.device}));
const plans={}; for(const pol of ['edf','registry','nearest']) plans[pol]=LL.planDispatch(tasks,sc.resources,pol);
const idx=Object.fromEntries(sc.households.map((h,i)=>[h.id,i])); const rest=2.5-ev.elapsed_h; const st={none:[],edf:[],registry:[],nearest:[]};
for(let d=0;d<300;d++){ const tr={}; for(const h of sc.households) tr[h.id]=LL.batterySamples(h,1,9000+d*131+idx[h.id],{})['total'][0]-ev.elapsed_h;
  const risk=Object.keys(tr).filter(k=>tr[k]<rest); st.none.push(risk.length);
  for(const pol of ['edf','registry','nearest']){ let sv=0; for(const p of plans[pol].plan) if(p.res&&tr[p.task.id]<rest&&p.arr<=tr[p.task.id]) sv++; st[pol].push(risk.length-sv);} }
const m=a=>+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1);
const out={households:sc.households.length,resources:sc.resources.length,tasks:tasks.length,at_risk_no_action:m(st.none),remain_edf:m(st.edf),remain_registry:m(st.registry),remain_nearest:m(st.nearest)};
console.log(out); require('fs').writeFileSync(__dirname+'/result_s5_'+(ROADON?'road':'line')+'.json',JSON.stringify(out,null,1));
