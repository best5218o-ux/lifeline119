import json, re, datetime as dt, sys
sys.path.insert(0,'.')
from timeparse import *
L=json.load(open('data/msgs_gold.json'))
def issuer(t):
    m=re.findall(r'\[([^\]]+)\]',t)
    tag=(m[-1] if m else '').replace('청','').replace('특례','').replace(' ','')
    tag=re.sub(r'(시|군|구)$','',tag) if len(tag)>2 else tag
    return tag
for r in L:
    r['sent']=dt.datetime.strptime(r['dt'],'%Y/%m/%d %H:%M:%S')
    r['iss']=issuer(r['text'])
    r['p']=restoration_from_spans(r['text'],r['lab']['spans'],r['sent'])
ev=[r for r in L if r['lab']['kind'] in ('발생','지연','복구')]
pairs=[]
used=set()
for r in ev:
    if r['lab']['kind']!='복구': continue
    prev=[q for q in ev if q['lab']['kind'] in ('발생','지연') and q['iss']==r['iss'] and dt.timedelta(0)<r['sent']-q['sent']<=dt.timedelta(hours=72)]
    onset=r['p'].get('onset')
    src='self' if onset else None
    if not onset and prev:
        ons=[q['p'].get('onset') for q in prev if q['p'].get('onset')]
        onset=min(ons) if ons else min(q['sent'] for q in prev)
        src='pair-onset' if ons else 'pair-sent'
    if not onset: continue
    done=r['p'].get('done') or r['sent']
    dsrc='DONE' if r['p'].get('done') else 'sent'
    dur=(done-onset).total_seconds()/3600
    if dur<=0 or dur>200: continue
    etas=[(q['sent'],q['p']['eta']) for q in prev if q['p'].get('eta')]
    key=(r['iss'],onset.strftime('%Y%m%d%H'))
    if key in used: continue
    used.add(key)
    last_on=max([q['sent'] for q in prev]+[onset])
    lo=(done-onset).total_seconds()/3600 if dsrc=='DONE' else max(0.0,(last_on-onset).total_seconds()/3600)
    pairs.append({'sn':r['sn'],'lo_h':round(lo,2),'iss':r['iss'],'onset':onset.isoformat(),'done':done.isoformat(),'dur_h':round(dur,2),'onset_src':src,'done_src':dsrc,
                  'cause':next((q['lab']['cause'] for q in prev+[r] if q['lab']['cause']),None),
                  'etas':[(a.isoformat(),b.isoformat()) for a,b in etas],'text':r['text'][:80]})
json.dump(pairs,open('data/restoration_pairs.json','w'),ensure_ascii=False,indent=1)
for p in pairs: print(p['onset'][:16],p['dur_h'],p['onset_src'],p['done_src'],p['cause'],len(p['etas']),'|',p['text'][:60])
print(len(pairs))
