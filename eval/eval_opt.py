# 기대 구조 수를 최대화하는 최적 배정(헝가리안, 슬롯=자원×적재)과 휴리스틱 비교
import json, numpy as np
from scipy.optimize import linear_sum_assignment
d=json.load(open('opt_mats.json')); res={}
for k,o in d.items():
    W=np.array(o['W']); r,c=linear_sum_assignment(-W); opt=W[r,c].sum()
    res[k]={'slots':o['slots'],'tasks':o['tasks'],'at_risk':round(o['atRisk'],2),'heuristic_expected_saved':round(o['heur'],2),'optimal_upper_bound':round(float(opt),2),'ratio':round(o['heur']/opt,3) if opt>0 else None}
print(json.dumps(res,ensure_ascii=False,indent=1)); json.dump(res,open('result_opt.json','w'),ensure_ascii=False,indent=1)
