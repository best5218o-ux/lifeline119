import json, subprocess, numpy as np, glob
seeds=sorted(glob.glob('runs/aug_s*_pred.json'))
r=subprocess.run(['python3','evaluate.py','runs/tfidf_lr_pred.json','runs/tfidf_lr_aug_pred.json',*seeds,'--hybrid'],capture_output=True,text=True)
S=json.load(open('runs/eval_summary.json'))
rule=S[0]; tfidf=S[1]; tfidf_aug=S[2]
ai=[x for x in S if x['name'].startswith('runs/aug') and '규칙' not in x['name']]
hyb=[x for x in S if x['name'].startswith('runs/aug') and '규칙' in x['name']]
def agg(rows,k): v=[x[k] for x in rows if x.get(k) is not None]; return [float(np.mean(v)),float(np.std(v))] if v else None
keys=['kind_acc','kind_macroF1','cause_acc_known','span_F1','eta_hit','eta_false']
out={'test':'2026-01~10 실제 재난문자 204건(학습에 안 쓴 기간)','train':'2023-09~2025-12 실제 238건 + 템플릿 증강 1,500건','n_seeds':len(ai),
     'rule':{k:rule.get(k) for k in keys},'tfidf':{k:tfidf.get(k) for k in keys},'tfidf_aug':{k:tfidf_aug.get(k) for k in keys},
     'ai':{k:agg(ai,k) for k in keys},'ai_rule':{k:agg(hyb,k) for k in keys},'eta_n':rule['eta_n']}
json.dump(out,open('runs/final_eval.json','w'),ensure_ascii=False,indent=1)
print(json.dumps(out,ensure_ascii=False,indent=1))
