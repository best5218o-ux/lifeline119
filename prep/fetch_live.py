#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""라이프라인 119 — 실시간 공공 API 수집기 (공공데이터포털 인증키 1개로 동작)

  DATA_GO_KR_KEY=<인증키(Decoding)> python3 prep/fetch_live.py

각 API를 호출해 data/live_<이름>.json 으로 저장한다. 앱은 파일이 있으면 읽고, 없으면 기존 데이터로 동작한다.
모두 data.go.kr 「자동승인」 API다 (2026-10-31 원문 페이지 확인).
2026-10-31 인증키 없이 호출해 「SERVICE_KEY_IS_NULL」(=경로 유효)을 확인한 경로: weather·ev·er·mfds·recall.
msgs(긴급재난문자)는 상세 페이지에 요청주소가 공개돼 있지 않아 활용신청 뒤 명세의 주소를 MSGS_URL 환경변수로 넣는다.
2026-10-31 실제 호출 확인: mfds는 PRDLST_NM(품목명)만 검색되고, recall은 type_name(모델명) 검색이 된다.

  weather   기상청 초단기실황 15084084        — 서구 행정동 격자 기온 → 한파·폭염 가중을 실측으로
  msgs      행안부 긴급재난문자 15134001        — 최근 문자 → M3 문자 해석 AI 입력
  ev        환경공단 전기차 충전기 15076352      — 서구 충전기 상태 → 일제 「통신이상」이면 정전 범위 보조 신호
  er        국립중앙의료원 응급의료기관 15000563  — 대전 응급실 실시간 가용병상 → 이송 후보
  mfds      식약처 의료기기 품목정보 15073906    — 사양 DB 모델명 검증
  recall    식약처 의료기기 회수·판매중지 15056785 — 등록 기기 회수 대상 경고
"""
import json, os, sys, urllib.parse, urllib.request, datetime

KEY = os.environ.get('DATA_GO_KR_KEY')
OUT = os.path.join(os.path.dirname(__file__), '..', 'data')
KST = datetime.timezone(datetime.timedelta(hours=9))

# 서구 행정동 중심 → 기상청 격자(nx, ny)는 기상청 LCC 변환식으로 계산한다
import math
def latlon_to_grid(lat, lon):
    RE, GRID, SLAT1, SLAT2, OLON, OLAT, XO, YO = 6371.00877, 5.0, 30.0, 60.0, 126.0, 38.0, 43, 136
    D = math.pi / 180.0; re = RE / GRID; s1, s2, ol, oa = SLAT1 * D, SLAT2 * D, OLON * D, OLAT * D
    sn = math.log(math.cos(s1) / math.cos(s2)) / math.log(math.tan(math.pi * 0.25 + s2 * 0.5) / math.tan(math.pi * 0.25 + s1 * 0.5))
    sf = math.pow(math.tan(math.pi * 0.25 + s1 * 0.5), sn) * math.cos(s1) / sn
    ro = re * sf / math.pow(math.tan(math.pi * 0.25 + oa * 0.5), sn)
    ra = re * sf / math.pow(math.tan(math.pi * 0.25 + lat * D * 0.5), sn)
    th = lon * D - ol
    th = th - 2 * math.pi if th > math.pi else th + 2 * math.pi if th < -math.pi else th
    th *= sn
    return int(ra * math.sin(th) + XO + 0.5), int(ro - ra * math.cos(th) + YO + 0.5)

import time, xml.etree.ElementTree as ET
def get(url, params):
    q = urllib.parse.urlencode({'serviceKey': KEY, **params})
    last = None
    for i in range(6):  # 포털 연결이 자주 끊겨 재시도
        try:
            with urllib.request.urlopen(url + '?' + q, timeout=60) as r:
                t = r.read().decode('utf-8')
            if t.lstrip().startswith('<'):  # XML 응답(응급의료기관 등)은 item 목록으로 바꾼다
                root = ET.fromstring(t)
                return {'items': [{c.tag: c.text for c in it} for it in root.iter('item')], 'resultCode': (root.findtext('.//resultCode') or '')}
            return json.loads(t)
        except Exception as e:
            last = e; time.sleep(3 + i * 2)
    raise last

def save(name, obj):
    obj = {'fetched_at': datetime.datetime.now(KST).isoformat(timespec='minutes'), **obj}
    json.dump(obj, open(os.path.join(OUT, 'live_%s.json' % name), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('저장', name)

def weather():
    dongs = json.load(open(os.path.join(OUT, 'dongs.geojson'), encoding='utf-8'))['features']
    now = datetime.datetime.now(KST) - datetime.timedelta(minutes=45)
    out = {}
    for f in dongs:
        p = f['properties']
        if not p['adm_cd'].startswith('25030'): continue
        ring = f['geometry']['coordinates'][0][0] if f['geometry']['type'] == 'MultiPolygon' else f['geometry']['coordinates'][0]
        lon = sum(c[0] for c in ring) / len(ring); lat = sum(c[1] for c in ring) / len(ring)
        nx, ny = latlon_to_grid(lat, lon)
        j = get('https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst',
                {'pageNo': 1, 'numOfRows': 20, 'dataType': 'JSON', 'base_date': now.strftime('%Y%m%d'), 'base_time': now.strftime('%H00'), 'nx': nx, 'ny': ny})
        items = j['response']['body']['items']['item']
        out[p['adm_nm']] = {i['category']: i['obsrValue'] for i in items}
    save('weather', {'src': '기상청 초단기실황 (data.go.kr 15084084)', 'dong': out})

def msgs():
    url = os.environ.get('MSGS_URL')
    if not url: raise RuntimeError('MSGS_URL 미설정 — 활용신청 화면의 요청주소를 넣으세요')
    j = get(url, {'pageNo': 1, 'numOfRows': 100, 'returnType': 'json'})
    save('msgs', {'src': '행정안전부 긴급재난문자 (data.go.kr 15134001)', 'raw': j})

def ev():
    j = get('https://apis.data.go.kr/B552584/EvCharger/getChargerInfo', {'pageNo': 1, 'numOfRows': 9999, 'dataType': 'JSON', 'zcode': '30', 'zscode': '30170', 'kind': ''})
    save('ev', {'src': '한국환경공단 전기자동차 충전소 정보 (data.go.kr 15076352)', 'raw': j})

def er():
    j = get('https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire', {'STAGE1': '대전광역시', 'pageNo': 1, 'numOfRows': 100})
    save('er', {'src': '국립중앙의료원 응급의료기관 정보 (data.go.kr 15000563)', 'raw': j})

def mfds():
    # 검색 파라미터는 품목명(PRDLST_NM)뿐이라 품목별로 전부 받아 모델명(TYPE_INFO)으로 거른다
    out = {}
    for pn in ['인공호흡기', '산소발생기', '흡인기', '기침유발기']:
        items, p = [], 1
        while True:
            j = get('https://apis.data.go.kr/1471000/MdeqPrdlstInfoService02/getMdeqPrdlstInfoInq02', {'type': 'json', 'pageNo': p, 'numOfRows': 100, 'PRDLST_NM': pn})
            its = [i.get('item', i) for i in j.get('body', {}).get('items', [])]
            items += its
            if not its or len(items) >= j['body']['totalCount'] or p >= 15: break
            p += 1
        out[pn] = items
    save('mfds', {'src': '식약처 의료기기 품목정보 (data.go.kr 15073906)', 'raw': out})

def recall():
    out = {m: get('https://apis.data.go.kr/1471000/MdlpRtrvlSleStpgeInfoService04/getTypeNameList04', {'type': 'json', 'pageNo': 1, 'numOfRows': 100, 'type_name': m})
           for m in ['Astral', 'Trilogy', 'KR2110X15B', 'LTV', 'Inogen', 'HT50', 'Legendair', 'Stellar', 'EverFlo', 'SimplyGo']}
    save('recall', {'src': '식약처 의료기기 회수·판매중지 (data.go.kr 15056785)', 'raw': out})

if __name__ == '__main__':
    if not KEY:
        sys.exit('DATA_GO_KR_KEY 환경변수에 공공데이터포털 인증키를 넣어 주세요. (각 API 활용신청은 자동승인)')
    for name in (sys.argv[1:] or ['weather', 'msgs', 'ev', 'er', 'mfds', 'recall']):
        try: globals()[name]()
        except Exception as e: print('실패', name, e)
