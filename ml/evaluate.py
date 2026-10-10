import json, sys, numpy as np, datetime as dt
sys.path.insert(0,'.')
from timeparse import restoration_from_spans
from sklearn.metrics import f1_score, accuracy_score
L={r['sn']:r for r in json.load(open('data/msgs_gold.json'))}
te=[r for r in L.values() if r['dt']>='2026']
KIND=['발생','복구','예정','대비','무관']
def gk(r): return '발생' if r['lab']['kind']=='지연' else r['lab']['kind']
def eta_of(text,spans,sent):
    o=restoration_from_spans(text,spans,sent); return o.get('eta')
def span_f1(gold,pred,lab=None):
    G={(s,e,l) for s,e,l in gold if lab in (None,l)}; P={(s,e,l) for s,e,l in pred if lab in (None,l)}
    tp=len(G&P); p=tp/len(P) if P else (1.0 if not G else 0); r=tp/len(G) if G else (1.0 if not P else 0)
    return tp,len(G),len(P)
def report(name,kinds,causes=None,spans=None,etas=None):
    yk=[gk(r) for r in te]
    res={'name':name,'kind_acc':accuracy_score(yk,kinds),'kind_macroF1':f1_score(yk,kinds,labels=KIND,average='macro',zero_division=0)}
    rel=[i for i,r in enumerate(te) if r['lab']['kind']!='무관']
    if causes is not None:
        yc=[te[i]['lab']['cause'] or '미상' for i in rel]; pc=[causes[i] or '미상' for i in rel]
        res['cause_acc']=accuracy_score(yc,pc)
        known=[j for j,i in enumerate(rel) if te[i]['lab']['cause']]
        res['cause_acc_known']=accuracy_score([yc[j] for j in known],[pc[j] for j in known]) if known else None
    if spans is not None:
        tp=g=p=0
        for r,sp in zip(te,spans): a,b,c=span_f1(r['lab']['spans'],[tuple(x) for x in sp]); tp+=a; g+=b; p+=c
        pr=tp/p if p else 0; rc=tp/g if g else 0; res['span_P']=pr; res['span_R']=rc; res['span_F1']=2*pr*rc/(pr+rc) if pr+rc else 0
    if etas is not None:
        ok=n=fp=0
        for r,e in zip(te,etas):
            sent=dt.datetime.strptime(r['dt'],'%Y/%m/%d %H:%M:%S')
            g=eta_of(r['text'],r['lab']['spans'],sent)
            if g is None:
                if e is not None: fp+=1
                continue
            n+=1
            if e is not None and abs((e-g).total_seconds())<=15*60: ok+=1
        res['eta_n']=n; res['eta_hit']=ok; res['eta_false']=fp
    return res
out=[]
# engine rules
E={x['sn']:x for x in json.load(open('runs/engine_rules.json'))}
km={'발생':'발생','지연':'발생','복구':'복구','예보·안내':'대비','기타':None}
cm={'화재':'화재','침수':'침수','외물':'차량·외물','기상':'기상','차단기':'설비고장','기자재':'설비고장'}
ek=[]; ec=[]; ee=[]
for r in te:
    x=E[r['sn']]; k=km.get(x['kind']); 
    if not x['mentions']: k='무관'
    ek.append(k or '무관'); ec.append(cm.get(x['cause'])); 
    sent=dt.datetime.strptime(r['dt'],'%Y/%m/%d %H:%M:%S')
    ee.append(sent+dt.timedelta(hours=x['eta_h']) if x['eta_h'] is not None else None)
out.append(report('기존 규칙 파서(엔진 v7, 부산 19건으로 작성)',ek,ec,None,ee))
HYB='--hybrid' in sys.argv
for f in [a for a in sys.argv[1:] if not a.startswith('--')]:
    P=json.load(open(f))['pred']
    ks=[p['kind'] for p in P]; cs=[p['cause'] for p in P]; sps=[p.get('spans') for p in P]
    etas=[]
    for r,p in zip(te,P):
        sent=dt.datetime.strptime(r['dt'],'%Y/%m/%d %H:%M:%S')
        etas.append(eta_of(r['text'],p['spans'],sent) if p.get('spans') is not None else None)
    out.append(report(f,ks,cs,sps if sps[0] is not None else None,etas if sps[0] is not None else None))
    if HYB and sps[0] is not None:
        hk=ks; hc=[c or ec[i] for i,c in enumerate(cs)]; he=[e if e is not None else ee[i] for i,e in enumerate(etas)]
        out.append(report(f+' +규칙보완',hk,hc,sps,he))
for o in out: print({k:(round(v,3) if isinstance(v,float) else v) for k,v in o.items()})
json.dump(out,open('runs/eval_summary.json','w'),ensure_ascii=False,indent=1)
