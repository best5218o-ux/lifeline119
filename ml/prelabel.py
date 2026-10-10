import json, re
L=json.load(open('data/msgs_power_raw.json'))
POW=r'정전|단전|복전|송전|통전|전력|전기|휴전'
def kind(t):
    t=t.replace('검정전기','검정 전기')
    if re.search(r'(전신주|전봇대)',t) and not re.search(r'정전|단전|복전|송전|전력|전기',t): return '무관'
    if not re.search(r'정전|단전|복전|송전|통전|휴전|전력\s*(공급|선로|설비|단선)|전기\s*(공급|설비)|전선|변압기|전신주',t): return '무관'
    if re.search(r'열차|전동열차|전차선|호선|코레일|철도',t) and not re.search(r'세대|가구|주민|아파트',t): return '무관'
    if re.search(r'단수|수돗물|상수도|급수|정수장|가압장',t) and not re.search(r'정전\s*(발생|되|중)|정전되어|세대\s*정전|정전\s*및\s*단수|정전\s*및\s*통신',t): return '무관'
    if re.search(r'(정전|단전|전원|전력|전기|복전|송전)[^.]{0,25}(복구\s*(가\s*)?(완료|되었|됨|됐)|정상화|복구되)|복전\s*완료(?!\s*예)|복구\s*완료\s*\(|통전|정상\s*(공급|송전)',t) and not re.search(r'(완료|복전)\s*(예상|예정)',t): return '복구'
    if re.search(r'지연|장시간|늦어|어려움|2~3일|며칠',t): return '지연'
    if re.search(r'정전\s*(예정|예상|될\s*수|우려|가능)|단전\s*(예정|가능)|정전이\s*예상|정전될|휴전',t) and not re.search(r'발생|정전되어|정전\s*중',t): return '예정'
    if re.search(r'대비|자제|적정\s*온도|사용\s*집중|급증하고',t) and not re.search(r'\d{1,2}\s*[:시]\s*\d{0,2}.{0,6}(경|부터)?.{0,20}정전',t): return '대비'
    return '발생'
CAUSES=[('화재',r'화재|불꽃|폭발|연기'),('침수',r'침수|누수|물이\s*차'),('차량·외물',r'교통사고|충돌|추돌|(?<!완)전복|사다리차|조류|까치|외물|접촉사고|반사경|크레인'),
        ('기상',r'낙뢰|강풍|돌풍|호우|대설|폭설|태풍|수목|나무\s*쓰러'),('과부하',r'전력\s*(사용|부족)|사용\s*(급증|집중)|과부하'),('공사·작업',r'(?<!전력)공사(?!\s*에서)|(?<!복구 )(?<!복구)작업\s*중|설비\s*교체|보수공사|포장'),
        ('설비고장',r'변압기|고압선|선로|단선|단락|차단기|케이블|개폐기|전선|설비|전압기|고장|노후|전도|파손'),('산불',r'산불')]
def cause(t):
    for c,rx in CAUSES:
        if re.search(rx,t): return c
    return None
def where(t):
    if re.search(r'단지\s*내|관리사무소|고객설비|오피스텔|지하\s*\d?층|아파트\s*내|전력\s*부족|단지\s*전력설비|전기실|수전',t): return '단지내부'
    if re.search(r'변전|선로|고압선|전신주|전봇대|개폐기|지상변압기|변압기|전선|송전탑|전력라인|계통|단선|단락',t): return '계통'
    return None
T=r'(?:(?:오늘|금일|현재|새벽|내일|익일|명일)\s*)*(?:(?:새벽|오전|오후)\s*)?\d{1,2}\s*(?::\s*\d{2}|시(?!간)(?:\s*\d{1,2}(?!\s*(?:시간|세대|가구))\s*분?)?)'
SPAN=[('DONE',T+r'\s*(?:분)?\s*경?(?=(?:(?!발생|예정)[^.]){0,30}(?:복구\s*(?:가\s*)?(?:완료|되었|됨)|복구되|복전\s*완료|복구완료|정상화))|(?<=완료\s)\(\d{1,2}:\d\d\)'),
      ('ETA',T+r'\s*(?:분)?\s*(?:경|까지|이전)?(?=[^.]{0,14}(?:복구\s*(?:완료\s*)?예정|복전\s*예상|예정|마무리|복구가?\s*예상))|'+T+r'\s*까지(?=\s*정전)|(?<=복구예정\()\d{1,2}:\d\d|복구\s*예정\s*시각\s*:?\s*\d{1,2}\s*시|복전\s*시각은\s*(?:익일)?\s*\d{1,2}:\d\d|(?<=예정시간은\s)\d{1,2}시\d{1,2}분|복구\s*완료\s*예정\s*시간[은 ]*\s*(?:\d\.\d+\.\s*)?\d{1,2}:\d\d|(?<=예상 복전 시각 )\d{1,2}:\d\d|(?<=복전 완료 예상 시각 )\d{1,2}시|(?<=예상 복구 시간 )\d{1,2}:\d\d|(?<=복구 예정 시간 )\d{1,2}:\d\d'),
      ('DUR',r'(?:약\s*|최대\s*)?\d+(?:\.\d+)?(?:\s*~\s*\d+)?\s*시간(?:\s*(?:이상|이내|정도|가량|내외))?(?=[^.]{0,12}(?:소요|복구|걸|예정|이내|정도|예상))|(?:약\s*)?\d+(?:\s*~\s*\d+)?\s*분(?:\s*(?:정도|이내))?\s*(?=[^.]{0,6}(?:소요|정도|이내|정전될|완료))|\(\d+시간 소요예정\)'),
      ('ONSET',T+r'\s*(?:분)?\s*(?:경|분경|부터|~)?(?=[^.]{0,40}(?:정전|단전|발생|사고|화재|충돌|추돌|전도|폭발))'),
      ('HH',r'\d+(?:,\d+)?\s*여?\s*(?:세대|가구)')]
def spans(t):
    out=[]
    for lab,rx in SPAN:
        for m in re.finditer(rx,t):
            s,e=m.start(),m.end()
            while s<e and t[s]==' ': s+=1
            while e>s and t[e-1]==' ': e-=1
            if e>s: out.append([s,e,lab])
    pri={'DONE':0,'ETA':1,'DUR':2,'ONSET':3,'HH':4}
    res=[]
    for x in sorted(out,key=lambda x:(pri[x[2]],x[0])):
        if any(not(x[1]<=y[0] or x[0]>=y[1]) for y in res): continue
        res.append(x)
    return sorted(res)
for r in L:
    t=r['text']; k=kind(t)
    r['lab']={'kind':k,'cause':cause(t) if k!='무관' else None,'where':where(t) if k!='무관' else None,'spans':spans(t) if k!='무관' else []}
json.dump(L,open('data/msgs_prelabel.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
from collections import Counter; print(Counter(r['lab']['kind'] for r in L))
