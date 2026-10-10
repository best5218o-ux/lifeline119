import sys, json, torch, os, shutil
sys.argv=[sys.argv[0],'0','tmp']; 
src=os.environ.get('PT'); dst=os.environ.get('DST','export')
import importlib.util
from transformers import AutoTokenizer, AutoModel
import torch.nn as nn
BASE='monologg/koelectra-small-v3-discriminator'
KIND=['발생','복구','예정','대비','무관']; CAUSE=['미상','설비고장','차량·외물','기상','화재','과부하','공사·작업','산불','침수']
SP=['ONSET','ETA','DUR','DONE','HH']; TAGS=['O']+[f'{p}-{s}' for s in SP for p in 'BI']
class MT(nn.Module):
    def __init__(s):
        super().__init__(); s.enc=AutoModel.from_pretrained(BASE); h=s.enc.config.hidden_size
        s.drop=nn.Dropout(0.1); s.k=nn.Linear(h,len(KIND)); s.c=nn.Linear(h,len(CAUSE)); s.t=nn.Linear(h,len(TAGS))
    def forward(s,ids,mask):
        H=s.enc(input_ids=ids,attention_mask=mask).last_hidden_state
        return s.k(H[:,0]), s.c(H[:,0]), s.t(H)
m=MT(); m.load_state_dict(torch.load(src)); m.eval()
os.makedirs(dst,exist_ok=True)
ids=torch.tensor([[2,100,200,3]]); mask=torch.ones_like(ids)
torch.onnx.export(m,(ids,mask),f'{dst}/model.onnx',input_names=['input_ids','attention_mask'],output_names=['kind','cause','tags'],
  dynamic_axes={'input_ids':{0:'b',1:'n'},'attention_mask':{0:'b',1:'n'},'kind':{0:'b'},'cause':{0:'b'},'tags':{0:'b',1:'n'}},opset_version=14, dynamo=False)
from onnxruntime.quantization import quantize_dynamic, QuantType
quantize_dynamic(f'{dst}/model.onnx',f'{dst}/model_int8.onnx',weight_type=QuantType.QInt8)
tok=AutoTokenizer.from_pretrained(BASE); tok.save_pretrained(dst)
json.dump({'kind':KIND,'cause':CAUSE,'tags':TAGS,'base':BASE},open(f'{dst}/labels.json','w'),ensure_ascii=False)
print(os.path.getsize(f'{dst}/model.onnx')/1e6, os.path.getsize(f'{dst}/model_int8.onnx')/1e6)
