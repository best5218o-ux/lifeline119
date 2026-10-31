// M2 점검: (1) 공칭 대비 분포 위치 (2) 가정값 민감도
const LL=require('../engine.js');
const q=(a,p)=>LL.quantile(a,p);
const rows=[];
for(const dev of ['trilogy_evo','astral150','inogen_g5','ltv1200','ht50']){
  for(const age of [0,3,6]){
    const s=LL.batterySamples({device:dev,ext_count:0,battery_age_y:age,tier:'A'},5000,1).device;
    const dv=LL.DEVICE_DB.find(d=>d.id===dev);
    let below=0; for(const x of s) if(x<dv.internal_h) below++;
    rows.push({dev:dv.model,basis:dv.basis,nominal_h:dv.internal_h,age_y:age,p10:+q(s,.1).toFixed(2),p50:+q(s,.5).toFixed(2),p90:+q(s,.9).toFixed(2),p_below_nominal:+(below/s.length).toFixed(2)});
  }
}
console.table(rows);
// 민감도: Trilogy Evo, 3년
const base=JSON.parse(JSON.stringify(LL.BATTERY_PRIOR)); const sens=[];
function run(label,mut){ const P=LL.BATTERY_PRIOR; mut(P); const s=LL.batterySamples({device:'trilogy_evo',ext_count:0,battery_age_y:3,tier:'A'},5000,2).device; sens.push({case:label,p10:+q(s,.1).toFixed(2),p50:+q(s,.5).toFixed(2)}); Object.assign(P,JSON.parse(JSON.stringify(base))); }
run('기준',()=>{});
run('개체편차 sd 0.25',P=>P.eps_spec.sd=0.25); run('개체편차 sd 0.45',P=>P.eps_spec.sd=0.45);
run('노화 연 1~5%',P=>P.fade_per_year=[0.01,0.05]); run('노화 연 5~15%',P=>P.fade_per_year=[0.05,0.15]);
run('편차 중앙 0.85',P=>P.eps_spec.mu=Math.log(0.85));
console.table(sens);
require('fs').writeFileSync('result_m2.json',JSON.stringify({by_device:rows,sensitivity_trilogy_evo_3y:sens},null,1));
