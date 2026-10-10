import json, random, sys, numpy as np, torch, torch.nn as nn, datetime as dt, time
from transformers import AutoTokenizer, AutoModel
sys.path.insert(0,'.')
SEED=int(sys.argv[1]) if len(sys.argv)>1 else 13
OUT=sys.argv[2] if len(sys.argv)>2 else 'model_mt'
FULL=len(sys.argv)>3 and sys.argv[3]=='full'   # 전체 데이터로 학습(배포용)
random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED); torch.set_num_threads(2)
BASE='monologg/koelectra-small-v3-discriminator'
KIND=['발생','복구','예정','대비','무관']; CAUSE=['미상','설비고장','차량·외물','기상','화재','과부하','공사·작업','산불','침수']
SP=['ONSET','ETA','DUR','DONE','HH']; TAGS=['O']+[f'{p}-{s}' for s in SP for p in 'BI']
L=json.load(open('data/msgs_gold.json'))
def kmap(k): return '발생' if k=='지연' else k
tok=AutoTokenizer.from_pretrained(BASE)
def encode(r):
    e=tok(r['text'],truncation=True,max_length=128,return_offsets_mapping=True)
    tags=[0]*len(e['input_ids'])
    for s,t,lab in r['lab']['spans']:
        first=True
        for i,(a,b) in enumerate(e['offset_mapping']):
            if a==b: continue
            if a>=s and b<=t+0 or (a<t and b>s):
                tags[i]=TAGS.index(('B-' if first else 'I-')+lab); first=False
    return dict(ids=e['input_ids'],tags=tags,kind=KIND.index(kmap(r['lab']['kind'])),
                cause=CAUSE.index(r['lab']['cause'] or '미상'),has_cause=int(r['lab']['kind']!='무관'))
tr=[r for r in L if FULL or r['dt']<'2026']; te=[r for r in L if r['dt']>='2026']
AUG=json.load(open('data/synthetic_aug.json')) if 'aug' in OUT else []
tr=tr*3+AUG
Dtr=[encode(r) for r in tr]; Dte=[encode(r) for r in te]
class MT(nn.Module):
    def __init__(s):
        super().__init__(); s.enc=AutoModel.from_pretrained(BASE); h=s.enc.config.hidden_size
        s.drop=nn.Dropout(0.1); s.k=nn.Linear(h,len(KIND)); s.c=nn.Linear(h,len(CAUSE)); s.t=nn.Linear(h,len(TAGS))
    def forward(s,ids,mask):
        H=s.enc(input_ids=ids,attention_mask=mask).last_hidden_state; H=s.drop(H)
        return s.k(H[:,0]), s.c(H[:,0]), s.t(H)
def batch(B):
    m=max(len(b['ids']) for b in B)
    ids=torch.tensor([b['ids']+[0]*(m-len(b['ids'])) for b in B]); mask=(ids!=0).long()
    tags=torch.tensor([b['tags']+[-100]*(m-len(b['tags'])) for b in B])
    return ids,mask,tags,torch.tensor([b['kind'] for b in B]),torch.tensor([b['cause'] if b['has_cause'] else -100 for b in B])
model=MT(); opt=torch.optim.AdamW(model.parameters(),lr=1e-4,weight_decay=0.01)
EP=25; ce=nn.CrossEntropyLoss(ignore_index=-100)
steps=EP*((len(Dtr)+15)//16); sched=torch.optim.lr_scheduler.OneCycleLR(opt,max_lr=1e-4,total_steps=steps,pct_start=0.1)
t0=time.time()
for ep in range(EP):
    model.train(); random.shuffle(Dtr); tot=0
    for i in range(0,len(Dtr),16):
        ids,mask,tags,k,c=batch(Dtr[i:i+16]); lk,lc,lt=model(ids,mask)
        loss=ce(lk,k)+ce(lc,c)+ce(lt.reshape(-1,lt.shape[-1]),tags.reshape(-1))
        opt.zero_grad(); loss.backward(); opt.step(); sched.step(); tot+=loss.item()
    if ep%5==4: print('ep',ep+1,'loss %.3f'%tot,'%.0fs'%(time.time()-t0),flush=True)
model.eval()
def predict(texts):
    out=[]
    with torch.no_grad():
        for t in texts:
            e=tok(t,truncation=True,max_length=128,return_offsets_mapping=True,return_tensors='pt')
            lk,lc,lt=model(e['input_ids'],e['attention_mask'])
            pk=KIND[lk.argmax(-1).item()]; pc=CAUSE[lc.argmax(-1).item()]
            tg=lt.argmax(-1)[0].tolist(); off=e['offset_mapping'][0].tolist(); spans=[]; cur=None
            for (a,b),ti in zip(off,tg):
                if a==b: continue
                lab=TAGS[ti]
                if lab=='O': 
                    if cur: spans.append(cur); cur=None
                    continue
                bi,name=lab.split('-',1)
                if bi=='B' or not cur or cur[2]!=name:
                    if cur: spans.append(cur)
                    cur=[a,b,name]
                else: cur[1]=b
            if cur: spans.append(cur)
            out.append({'kind':pk,'cause':None if pc=='미상' else pc,'spans':spans,'pk':torch.softmax(lk,-1)[0].tolist()})
    return out
P=predict([r['text'] for r in te])
json.dump({'pred':P,'sn':[r['sn'] for r in te]},open(f'{OUT}_pred.json','w'),ensure_ascii=False)
torch.save(model.state_dict(),f'{OUT}.pt')
print('saved',OUT)
