import json,sys
L=json.load(open(sys.argv[1])); a,b=int(sys.argv[2]),int(sys.argv[3])
for i,r in enumerate(L[a:b],a):
    l=r['lab']; t=r['text']
    sp=' '.join(f"{x[2]}:{t[x[0]:x[1]]}" for x in l['spans'])
    print(f"{i}|{r['dt'][2:16]}|{l['kind']}|{l['cause']}|{l['where']}|{sp}\n   {t[:230]}")
