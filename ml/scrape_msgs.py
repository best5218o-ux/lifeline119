import re, json, time, urllib.parse, urllib.request, html, concurrent.futures as cf
BASE='https://www.safetydata.go.kr/disaster-data/'
def get(u):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=40) as r: return r.read().decode('utf-8','replace')
        except Exception as e: time.sleep(2+i)
    return ''
def rows(kw):
    h=get(BASE+'disasterNotification?keyword='+urllib.parse.quote(kw)+'&cntPerPage=2000')
    tb=h[h.find('<tbody'):h.find('</tbody>')]
    out=[]
    for tr in re.findall(r'<tr.*?</tr>',tb,re.S):
        sn=re.search(r'sn=(\d+)',tr); tds=re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S)
        if not sn or len(tds)<3: continue
        txt=lambda s: html.unescape(re.sub(r'<[^>]+>','',s)).strip()
        t=re.sub(r'\s+',' ',txt(tds[1])); t=re.sub(r'N$','',t).strip()
        out.append({'sn':int(sn.group(1)),'text':t,'dt':txt(tds[2])})
    tot=re.search(r'총\s*([\d,]+)\s*건',h)
    return out, tot.group(1) if tot else None
KW=['정전','단전','전기 공급','송전','한전','한국전력','전력 공급','복구 완료','복구완료','복전','전력설비','변압기','전신주','전봇대','정전복구','휴전']
allm={}; stats={}
for kw in KW:
    rs,tot=rows(kw); stats[kw]=(len(rs),tot)
    for r in rs: allm.setdefault(r['sn'],dict(r,kws=[]))['kws'].append(kw)
print(stats, len(allm))
import os
L0=sorted(allm.values(),key=lambda r:r['sn']); json.dump(L0,open('data/msgs_power_raw.json','w',encoding='utf-8'),ensure_ascii=False)
cache=json.load(open('data/rgn_cache.json')) if os.path.exists('data/rgn_cache.json') else {}
def region(sn):
    if str(sn) in cache and cache[str(sn)]: return sn, cache[str(sn)]
    h=get(BASE+'disasterNotificationDetail?sn=%d'%sn)
    t=re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',h)))
    m=re.search(r'\d{4}/\d\d/\d\d \d\d:\d\d:\d\d\s*\[([^\]]+)\]',t)
    return sn, (m.group(1) if m else None)
with cf.ThreadPoolExecutor(2) as ex:
    for k,(sn,rg) in enumerate(ex.map(region, list(allm))):
        allm[sn]['rgn']=rg; cache[str(sn)]=rg
        if k%25==0: json.dump(cache,open('data/rgn_cache.json','w'),ensure_ascii=False)
json.dump(cache,open('data/rgn_cache.json','w'),ensure_ascii=False)
L=sorted(allm.values(),key=lambda r:r['sn'])
json.dump(L,open('data/msgs_power.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
print('saved',len(L),'no region',sum(1 for r in L if not r['rgn']))
