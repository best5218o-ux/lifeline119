import json,sys
L=json.load(open('data/msgs_power_raw.json'))
C=json.load(open('data/corrections.json'))
def add(idx, **kw):
    C[str(L[idx]['sn'])]=kw
# convert legacy idx keys
for k in list(C):
    if int(k)<1000: C[str(L[int(k)]['sn'])]=C.pop(k)
exec(open(sys.argv[1]).read())
json.dump(C,open('data/corrections.json','w'),ensure_ascii=False,indent=0)
print(len(C))
