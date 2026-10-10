import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
L=json.load(open('data/msgs_gold.json'))
import sys
tr=[r for r in L if r['dt']<'2026']; te=[r for r in L if r['dt']>='2026']
AUG='aug' in sys.argv
if AUG: tr=tr*3+json.load(open('data/synthetic_aug.json'))
gk=lambda r:'발생' if r['lab']['kind']=='지연' else r['lab']['kind']
v=TfidfVectorizer(analyzer='char_wb',ngram_range=(1,3),min_df=2,sublinear_tf=True)
X=v.fit_transform([r['text'] for r in tr]); Xt=v.transform([r['text'] for r in te])
mk=LogisticRegression(C=10,max_iter=2000,class_weight='balanced').fit(X,[gk(r) for r in tr])
rel=[i for i,r in enumerate(tr) if r['lab']['kind']!='무관']
mc=LogisticRegression(C=10,max_iter=2000,class_weight='balanced').fit(X[rel],[tr[i]['lab']['cause'] or '미상' for i in rel])
pk=mk.predict(Xt); pc=mc.predict(Xt)
json.dump({'pred':[{'kind':a,'cause':None if b=='미상' else b,'spans':None} for a,b in zip(pk,pc)]},open('runs/tfidf_lr_aug_pred.json' if AUG else 'runs/tfidf_lr_pred.json','w'),ensure_ascii=False)
print('ok')
