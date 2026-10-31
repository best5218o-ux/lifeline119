const LL=require('../engine.js'); const rows=require('./busan_outage_msgs_gold.json');
let k=0,c=0,cn=0,e=0,en=0; const out=[];
for(const r of rows){const p=LL.parseNotice(r.text,r.sent); const okK=p.kind===r.gold_kind; k+=okK;
 if(r.gold_kind==='발생'||r.gold_kind==='지연'){cn++; c+=(p.cause===r.gold_cause||(p.cause==null&&r.gold_cause==null));}
 if(r.gold_eta_h!=null){en++; e+=(p.eta_h!=null&&Math.abs(p.eta_h-r.gold_eta_h)<0.5);}
 out.push({sent:r.sent,gold:r.gold_kind,pred:p.kind,cause:p.cause,gold_cause:r.gold_cause,eta:p.eta_h&&+p.eta_h.toFixed(2),gold_eta:r.gold_eta_h, text:r.text.slice(0,50)});}
console.table(out);
console.log(JSON.stringify({n:rows.length,kind_acc:k/rows.length,cause_acc:c/cn,cause_n:cn,eta_acc:e/en,eta_n:en}));
console.log(LL.REST_PRIOR);
