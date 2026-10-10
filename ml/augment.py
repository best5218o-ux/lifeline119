import json, random, re
random.seed(7)
L=json.load(open('data/msgs_gold.json'))
tr=[r for r in L if r['dt']<'2026']
# 장소·기관 이름은 학습 기간(2023~2025) 문자에서만 뽑는다 (시험 2026과 섞이지 않게)
places=set(); orgs=set()
for r in tr:
    for m in re.finditer(r'([가-힣0-9]+(동|면|읍|리|가))\s*(일대|일원|일부|지역)',r['text']): places.add(m.group(1))
    m=re.findall(r'\[([^\]]+)\]',r['text'])
    if m: orgs.add(m[-1])
places=sorted(places); orgs=sorted(orgs)
def hhmm():
    h=random.randint(0,23); m=random.choice([0,5,10,12,15,20,27,30,35,40,45,50,52,58])
    return h,m
def onset():
    h,m=hhmm(); f=random.choice(['{p}{h:02d}:{m:02d}{s}','{p}{h}시 {m}분{s}','{p}{h}시{s}','{p}{h:02d}:{m:02d}','{p}새벽 {h:02d}:{m:02d}{s}','{p}{ap} {h12}시 {m}분{s}'])
    return f.format(p=random.choice(['오늘 ','금일 ','','현재 ']),h=h,m=m,s=random.choice(['경','','분경','경부터']),ap='오후' if h>=12 else '오전',h12=(h-12 if h>12 else h) or 12)
def eta():
    h,m=hhmm()
    return random.choice([f'{h:02d}:{m:02d}',f'{h}시',f'{h}시경',f'{h}시 {m}분',f'오후 {random.randint(1,11)}시경',f'오전 {random.randint(1,11)}시',f'내일 오전 {random.randint(6,11)}시',f'익일 {random.randint(0,5):02d}:00',f'{h}시까지',f'{h}시 이전'])
def dur():
    return random.choice([f'약 {random.randint(1,6)}시간',f'{random.randint(1,4)}~{random.randint(2,6)}시간',f'{random.choice([10,20,30,40])}분',f'{random.randint(1,3)}시간 이상',f'{random.randint(1,3)}~{random.randint(2,4)}일',f'{random.randint(1,2)}시간 30분 이내',f'{random.choice([30,40,50])}분 정도',f'최대 {random.randint(2,5)}시간',f'{random.randint(2,8)}시간 정도'])
def done():
    h,m=hhmm(); return random.choice([f'{h:02d}:{m:02d}경',f'{h}시',f'{h:02d}:{m:02d}',f'{h}시 {m}분'])
def hh(): return random.choice([f'{random.randint(2,9)*10}가구',f'{random.randint(10,999)}세대',f'약 {random.randint(1,9)}00세대',f'{random.randint(1,9)}00여세대'])
CAUSE={'설비고장':['변압기 고장','고압선 단선','지상개폐기 고장','전력설비 이상','배전선로 고장','전선 단락'],
 '차량·외물':['교통사고로 인한 전신주 파손','차량의 전신주 충돌','조류 접촉','사다리차 전선 접촉','버스 전신주 추돌'],
 '기상':['낙뢰','강풍','호우로 인한 수목 전도','폭설로 인한 전주 전도','돌풍'],
 '화재':['변압기 화재','인근 건물 화재','전신주 화재'],
 '과부하':['전력 사용 급증','전력 부족'],
 '공사·작업':['전력설비 교체 작업','선로 보수공사','긴급 복구 작업'],
 '산불':['산불 확산','산불'],'침수':['지하 전기실 침수','누수']}
def ro(w):
    ch=w[-1]; code=ord(ch)-0xAC00
    if 0<=code<11172:
        jong=code%28
        return w+('로' if jong in (0,8) else '으로')
    return w+'로'
class B:
    def __init__(s): s.t=''; s.sp=[]
    def a(s,x,lab=None):
        if lab: s.sp.append([len(s.t),len(s.t)+len(x),lab])
        s.t+=x; return s
def mk(kind):
    b=B(); p=random.choice(places); o=random.choice(orgs); c=random.choice(list(CAUSE)+[None]*4); cp=random.choice(CAUSE[c]) if c else None
    if kind=='발생':
        v=random.randint(0,5)
        if v==0: b.a(onset(),'ONSET').a(f' {p} 일대 정전 발생, {random.choice(["한전에서","한국전력공사에서",""])} 복구 중이니 안전사고에 유의하시기 바랍니다. [{o}]')
        elif v==1: b.a(onset(),'ONSET').a(' '+(ro(cp)+' ' if cp else '')+f'{p} 일대 정전이 발생하여 복구 중입니다. 복구까지 ').a(dur(),'DUR').a(f' 소요 예상. [{o}]')
        elif v==2: b.a((ro(cp)+' 인해 ' if cp else '')+f'{p} 일부 지역 정전, ').a(eta(),'ETA').a(f' 복구 예정입니다. 엘리베이터 이용을 자제하세요.[{o}]')
        elif v==3: b.a(f'현재 {p} 정전으로 복구 중이며 ').a(dur(),'DUR').a(f' 소요될 예정입니다.[{o}]')
        elif v==4: b.a((ro(cp)+' ' if cp else '')+f'{p} ').a(hh(),'HH').a(f' 정전 중입니다. 전기기기 전원을 차단해 주세요.[{o}]')
        else: b.a(f'{p} 정전 복구가 지연되어 ').a(eta(),'ETA').a(f' 복구될 예정입니다. 양해 바랍니다.[{o}]')
    elif kind=='복구':
        v=random.randint(0,4)
        if v==0: b.a(onset(),'ONSET').a(f' {p} 일대 발생한 정전은 ').a(done(),'DONE').a(f' 복구 완료되었습니다.[{o}]')
        elif v==1: b.a(f'{p} 정전 복구가 완료되었습니다.[{o}]')
        elif v==2: b.a(f'금일 {p} 일대에서 발생한 정전은 복구되었음을 알려드립니다. [{o}]')
        elif v==3: b.a(f'{p} 정전은 ').a(done(),'DONE').a(f'부로 전력 공급이 정상화되었습니다.[{o}]')
        else: b.a(f'{p} 일원 정전 임시 복구됐으며, 완전 복구까지 ').a(dur(),'DUR').a(f' 소요 예정입니다.[{o}]')
    elif kind=='예정':
        v=random.randint(0,2)
        if v==0:
            h=random.randint(8,22); b.a(random.choice(['금일 ','내일 ',''])).a(f'{h}시','ONSET').a('~').a(f'{(h+random.randint(1,6))%24}시','ETA').a(f' {p} 일대 {ro(random.choice(CAUSE["공사·작업"]))} 정전이 예정되어 있으니 양해 바랍니다.[{o}]')
        elif v==1:
            ck=random.choice(['산불','기상']); b.a(f'{ro(random.choice(CAUSE[ck]))} {p} 일대 정전이 될 수 있으니 대비하시기 바랍니다.[{o}]'); c=ck
        else: b.a(f'{p} 일대 {ro(random.choice(CAUSE["공사·작업"]))} ').a(dur(),'DUR').a(f' 정전될 예정이니 양해 바랍니다.[{o}]')
        c='공사·작업' if v!=1 else c
    elif kind=='대비':
        b.a(random.choice(['무더위로 전력 사용이 급증하여 정전이 우려됩니다. 에어컨 적정온도 유지 등 전기 사용을 자제해 주세요.','태풍 북상 예보, 정전에 대비하여 손전등과 휴대폰 충전 등을 준비해 주시기 바랍니다.','최근 전기 사용 집중으로 정전이 잇따르고 있습니다. 고전력 기기 동시 사용을 자제해 주시기 바랍니다.','정전 시 엘리베이터 이용을 자제하고 촛불 대신 손전등을 사용하세요.'])+f'[{o}]')
    else:
        b.a(random.choice([f'{p} 일대 상수도 누수 복구 완료, 수돗물 공급을 재개합니다.',f'{p} 도로 복구 완료로 통행이 재개되었습니다.',f'{p} 전신주 전도로 도로 양방향 통제 중이니 우회하시기 바랍니다.','낙뢰가 예상되니 나무, 전신주 주변 접근을 자제하시기 바랍니다.',f'열차 전차선 단전으로 {p} 구간 운행이 지연되고 있습니다.',f'{p} 일대 단수 발생, 복구 중입니다.'])+f'[{o}]')
        c=None
    return {'sn':-1,'dt':'2025/01/01 00:00:00','text':b.t,'lab':{'kind':kind,'cause':c if kind in ('발생','복구','예정') else ('과부하' if kind=='대비' and '전력' in b.t else None),'where':None,'spans':b.sp},'synthetic':True}
S=[mk(k) for k in random.choices(['발생','복구','예정','대비','무관'],weights=[4,3,1.5,1,2],k=1500)]
json.dump(S,open('data/synthetic_aug.json','w'),ensure_ascii=False,indent=0)
print(len(places),len(orgs)); [print(x['lab']['kind'],x['lab']['cause'],x['text'][:90]) for x in S[:8]]
