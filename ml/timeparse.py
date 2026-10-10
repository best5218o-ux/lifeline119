import re, datetime as dt
def _hm(s):
    s=s.replace(' ','')
    m=re.search(r'(\d{1,2})[:시](\d{1,2})?',s)
    if not m: return None
    h=int(m.group(1)); mi=int(m.group(2)) if m.group(2) else 0
    return h,mi
def parse_point(s, sent, mode):
    """s: span text, sent: datetime of message, mode: 'past' (onset/done) or 'future' (eta). returns datetime"""
    t=s.replace(' ','')
    day=0
    if re.search(r'내일|익일|명일',t): day=1
    md=re.search(r'(\d{1,2})\.(\d{1,2})\.',t)
    hm=_hm(re.sub(r'\d{1,2}\.\d{1,2}\.','',t))
    if not hm: return None
    h,mi=hm
    if h==24: h,mi,day=0,mi,day+1
    pm=('오후' in t); am=('오전' in t or '새벽' in t)
    cands=[]
    base=sent.replace(hour=0,minute=0,second=0,microsecond=0)
    if md:
        try: base=base.replace(month=int(md.group(1)),day=int(md.group(2)))
        except: pass
        day=0
    hours=[h]
    if pm and h<12: hours=[h+12]
    elif not am and h<=12 and not pm: hours=[h,h+12] if h<12 else [h]
    for hh in hours:
        for dd in ([day] if (day or md) else [-1,0,1]):
            try: cands.append(base+dt.timedelta(days=dd,hours=hh,minutes=mi))
            except: pass
    if not cands: return None
    if mode=='past':
        ok=[c for c in cands if c<=sent+dt.timedelta(minutes=10)]
        return max(ok) if ok else min(cands)
    else:
        ok=[c for c in cands if c>=sent-dt.timedelta(minutes=10)]
        return min(ok) if ok else max(cands)
def parse_dur(s):
    t=s.replace(' ','')
    if '반나절' in t: return 5.0
    m=re.search(r'(\d+(?:\.\d+)?)(?:~(\d+(?:\.\d+)?))?일',t)
    if m: a=float(m.group(1)); b=float(m.group(2) or a); return 24*(a+b)/2
    hrs=0; got=False
    m=re.search(r'(\d+(?:\.\d+)?)(?:[~-](\d+(?:\.\d+)?))?시간',t)
    if m: a=float(m.group(1)); b=float(m.group(2) or a); hrs+= (b if '최대' in t or '이내' in t else (a+b)/2); got=True
    m=re.search(r'(?:시간)?(\d+)(?:~(\d+))?분',t)
    if m: a=float(m.group(1)); b=float(m.group(2) or a); hrs+= ((b if ('이내' in t) else (a+b)/2))/60; got=True
    return hrs if got else None
def restoration_from_spans(text, spans, sent):
    """returns dict with onset, eta (expected restoration datetime), done"""
    out={}
    for s,e,lab in spans:
        st=text[s:e]
        if lab=='ONSET' and 'onset' not in out:
            v=parse_point(st,sent,'past'); 
            if v: out['onset']=v
        elif lab=='ETA':
            v=parse_point(st,sent,'future')
            if v: out['eta']=v
        elif lab=='DONE':
            v=parse_point(st,sent,'past')
            if v: out['done']=v
        elif lab=='DUR':
            d=parse_dur(st)
            if d is not None: out['dur_h']=d
    if 'eta' not in out and 'dur_h' in out:
        out['eta']=sent+dt.timedelta(hours=out['dur_h'])
    return out
