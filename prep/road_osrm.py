#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""시나리오별 자원·가구 사이 도로 이동시간 표 (OSRM table API, OpenStreetMap 도로망 자동차 경로)
  python3 -I prep/road_osrm.py   → data/road_times.json
직선거리×1.4÷30km/h 가정을 실제 도로망 최단경로 소요시간으로 바꾼다.
OSRM 소요시간은 도로 분류별 속도 프로필 기준이며 신호 대기·혼잡은 반영하지 않는다(실시간 교통은 경찰청 교통소통정보 연계 예정).
"""
import json, os, time, urllib.request, datetime
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SC = json.load(open(os.path.join(REPO, 'data', 'scenarios.json'), encoding='utf-8'))
URL = 'https://router.project-osrm.org/table/v1/driving/'
def table(pts):
    coords = ';'.join('%.6f,%.6f' % (lo, la) for la, lo in pts)
    for i in range(6):
        try:
            with urllib.request.urlopen(URL + coords + '?annotations=duration,distance', timeout=120) as r:
                j = json.load(r)
            if j.get('code') == 'Ok': return j
        except Exception as e: err = e
        time.sleep(3 + 2 * i)
    raise RuntimeError('OSRM 실패')
out = {'src': 'OSRM table API(router.project-osrm.org, OpenStreetMap 도로망 자동차 프로필) %s 계산 — 신호 대기·혼잡 미반영' % datetime.date.today(), 'sc': {}}
for k in ['S1', 'S2', 'S3', 'S4', 'S5']:
    sc = SC[k]; ids, pts = [], []
    for r in sc.get('resources', []): ids.append(r['id']); pts.append((r['lat'], r['lon']))
    for h in sc['households']: ids.append(h['id']); pts.append((h['lat'], h['lon']))
    j = table(pts)
    T = [[None if v is None else round(v / 3600, 4) for v in row] for row in j['durations']]
    snap = [round(d['distance']) for d in j['sources']]
    out['sc'][k] = {'ids': ids, 't': T, 'snap_m': snap}
    print(k, len(ids), 'max snap', max(snap)); time.sleep(1)
json.dump(out, open(os.path.join(REPO, 'data', 'road_times.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
