const LL=require('../web/engine.js'); const fs=require('fs');
const L=JSON.parse(fs.readFileSync('data/msgs_gold.json','utf8'));
const out=L.map(r=>{const sent=r.dt.replace(/\//g,'-').replace(' ','T')+'+09:00'; const p=LL.parseNotice(r.text,sent); return {sn:r.sn,kind:p.kind,cause:p.cause,eta_h:p.eta_h,mentions:p.mentions_outage};});
fs.writeFileSync('runs/engine_rules.json',JSON.stringify(out));
console.log(out.length);
