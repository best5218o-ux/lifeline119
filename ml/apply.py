import json
L=json.load(open('data/msgs_prelabel.json')); C=json.load(open('data/corrections.json'))
for r in L:
    c=C.get(str(r['sn']))
    if not c: continue
    for k in ('kind','cause','where'):
        if k in c: r['lab'][k]=c[k]
    if r['lab']['kind']=='무관': r['lab'].update(cause=None,where=None,spans=[])
    if 'spans' in c:
        sp=[]
        for sub,lab in c['spans']:
            i=r['text'].find(sub); assert i>=0,(r['sn'],sub)
            sp.append([i,i+len(sub),lab])
        r['lab']['spans']=sorted(sp)
    r['lab']['checked']=True
json.dump(L,open('data/msgs_gold.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
