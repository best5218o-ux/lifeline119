#!/usr/bin/env python3
"""road_times.py — 시나리오 자원→가구, 가구→가구 도로망 최단 이동시간 표를 만든다.

입력
  data/scenarios.json                      시나리오 S1~S5 resources/households, ALL_DJ.households
  <tiles_dir>/{dj,sp}_*.json               OpenStreetMap Overpass API 응답(JSON) 타일
                                           dj = 대전·세종 근처 위도 36.18~36.50 경도 127.25~127.56
                                           sp = 서울 송파 근처 위도 37.45~37.54 경도 127.03~127.19
출력
  data/road_times.json

도로망: OSM highway = motorway~residential, living_street, service, road (자동차 통행 도로)
속도  : OSM maxspeed 태그(제한속도, km/h)가 있으면 그 값, 없으면 도로 분류별 법정 제한속도
        (도로교통법 시행규칙 제19조 — 「안전속도 5030」: 도시부 일반도로 50, 이면도로·주거 30,
         자동차전용도로 최고 90(trunk 기본 80으로 보수 적용), 고속도로 100) — 「제한속도 기준」.
        긴급차량 감속·신호대기·교차로 지체 계수는 근거 자료를 확인하지 못해 적용하지 않았다.
        → 이 시간은 「제한속도로 끊김 없이 달린 경우」의 하한에 가깝다.
일방통행: oneway=yes/1/true(정방향), -1(역방향), junction=roundabout, highway=motorway(_link) 은 일방.
최단경로: scipy.sparse.csgraph.dijkstra (방향 그래프, 가중치 = 시간[h]).
스냅  : 각 점을 그 지역 최대 강연결성분(SCC) 노드 중 가장 가까운 노드로 스냅. 스냅 거리 기록, 300 m 초과 경고.
        스냅 구간(점↔노드) 이동시간은 시간에 더하지 않는다(도로망 구간만).

사용: python3 -I prep/road_times.py <tiles_dir> [repo_dir]
"""
import sys, os, json, glob, math, re, statistics, random
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra, connected_components
from scipy.spatial import cKDTree

TILES = sys.argv[1]
REPO = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEFAULT_KMH = {  # 분류별 기본 제한속도(maxspeed 태그 없을 때)
    'motorway': 100, 'motorway_link': 60, 'trunk': 80, 'trunk_link': 50,
    'primary': 50, 'primary_link': 50, 'secondary': 50, 'secondary_link': 50,
    'tertiary': 50, 'tertiary_link': 50, 'unclassified': 30, 'road': 30,
    'residential': 30, 'living_street': 20, 'service': 20,
}
R_EARTH = 6371008.8


def hav_m(la1, lo1, la2, lo2):
    p1, p2 = np.radians(la1), np.radians(la2)
    dp, dl = p2 - p1, np.radians(np.asarray(lo2) - np.asarray(lo1))
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * R_EARTH * np.arcsin(np.sqrt(a))


def parse_speed(tags, hw):
    v = tags.get('maxspeed')
    if v:
        m = re.match(r'^\s*(\d+(?:\.\d+)?)\s*(mph)?', v)
        if m:
            s = float(m.group(1)) * (1.609 if m.group(2) else 1)
            if 5 <= s <= 130:
                return s, 'tag'
    return DEFAULT_KMH[hw], 'default'


def load_region(tag):
    nodes, ways = {}, {}
    files = sorted(glob.glob(os.path.join(TILES, f'{tag}_*.json')))
    for f in files:
        for e in json.load(open(f))['elements']:
            if e['type'] == 'node':
                nodes[e['id']] = (e['lat'], e['lon'])
            elif e['type'] == 'way':
                ways[e['id']] = e
    return files, nodes, ways


def build_graph(nodes, ways):
    ids = list(nodes.keys())
    idx = {n: i for i, n in enumerate(ids)}
    lat = np.array([nodes[n][0] for n in ids]); lon = np.array([nodes[n][1] for n in ids])
    U, V, W = [], [], []
    stat = {'ways': 0, 'oneway_ways': 0, 'speed_tag_km': 0.0, 'speed_default_km': 0.0}
    for w in ways.values():
        t = w.get('tags', {}); hw = t.get('highway')
        if hw not in DEFAULT_KMH:
            continue
        nd = [idx[n] for n in w['nodes'] if n in idx]
        if len(nd) < 2:
            continue
        kmh, src = parse_speed(t, hw)
        ow = t.get('oneway', '')
        fwd, bwd = True, True
        if ow in ('yes', '1', 'true') or t.get('junction') in ('roundabout', 'circular') or (hw in ('motorway', 'motorway_link') and ow != 'no'):
            bwd = False
        if ow == '-1':
            fwd, bwd = False, True
        if ow in ('reversible', 'alternating'):
            continue
        a = np.array(nd[:-1]); b = np.array(nd[1:])
        d = hav_m(lat[a], lon[a], lat[b], lon[b])
        h = d / 1000.0 / kmh
        stat['ways'] += 1; stat['oneway_ways'] += (not (fwd and bwd))
        stat['speed_tag_km' if src == 'tag' else 'speed_default_km'] += float(d.sum()) / 1000
        if fwd:
            U.append(a); V.append(b); W.append(h)
        if bwd:
            U.append(b); V.append(a); W.append(h)
    U = np.concatenate(U); V = np.concatenate(V); W = np.concatenate(W)
    n = len(ids)
    G = csr_matrix((W, (U, V)), shape=(n, n))  # 중복 간선은 합산되므로 아래에서 최소값으로 정리
    # 중복(같은 두 노드를 잇는 서로 다른 way) → 최소 시간 유지
    order = np.lexsort((W, V, U))
    U, V, W = U[order], V[order], W[order]
    keep = np.ones(len(U), bool); keep[1:] = (U[1:] != U[:-1]) | (V[1:] != V[:-1])
    G = csr_matrix((W[keep], (U[keep], V[keep])), shape=(n, n))
    return G, lat, lon, stat


def main():
    sc = json.load(open(os.path.join(REPO, 'data', 'scenarios.json')))
    dj_res = {}
    for k in ('S2', 'S3', 'S4', 'S5'):
        for r in sc[k]['resources']:
            dj_res.setdefault(r['id'] + '@' + k, r)
    jobs = {}
    for k in ('S1', 'S2', 'S3', 'S4', 'S5'):
        jobs[k] = ('sp' if k == 'S1' else 'dj', sc[k]['resources'], sc[k]['households'])
    # ALL_DJ: 자원이 없으므로 대전 시나리오(S2~S5) 자원 합집합을 쓴다 (같은 자원은 이름·좌표로 중복 제거)
    seen, all_res = set(), []
    for k in ('S2', 'S3', 'S4', 'S5'):
        for r in sc[k]['resources']:
            key = (r['name'], round(r['lat'], 6), round(r['lon'], 6))
            if key in seen:
                continue
            seen.add(key); all_res.append(dict(r, id=f"{k}.{r['id']}"))
    jobs['ALL_DJ'] = ('dj', all_res, sc['ALL_DJ']['households'])

    out = {}
    regions = {}
    for reg in ('dj', 'sp'):
        files, nodes, ways = load_region(reg)
        G, lat, lon, stat = build_graph(nodes, ways)
        ncomp, lab = connected_components(G, directed=True, connection='strong')
        big = np.bincount(lab).argmax()
        mask = lab == big
        lat0 = math.radians(float(lat.mean()))
        xy = np.c_[np.radians(lon) * math.cos(lat0) * R_EARTH, np.radians(lat) * R_EARTH]
        cand = np.where(mask)[0]
        tree = cKDTree(xy[cand])
        regions[reg] = dict(G=G, lat=lat, lon=lon, xy=xy, cand=cand, tree=tree, lat0=lat0)
        stat.update(tiles=len(files), nodes=int(G.shape[0]), edges=int(G.nnz), scc_nodes=int(mask.sum()))
        print(reg, stat, flush=True)
        out.setdefault('_graph', {})[reg] = stat

    def snap(R, la, lo):
        p = np.array([math.radians(lo) * math.cos(R['lat0']) * R_EARTH, math.radians(la) * R_EARTH])
        d, j = R['tree'].query(p)
        return int(R['cand'][j]), float(d)

    warn = []
    check = {}
    rng = random.Random(20261031)
    samples = []
    for k, (reg, res, hh) in jobs.items():
        R = regions[reg]
        pts, snapm, node = {}, {}, {}
        for p in list(res) + list(hh):
            pts[p['id']] = [p['lat'], p['lon']]
            node[p['id']], snapm[p['id']] = snap(R, p['lat'], p['lon'])
            if snapm[p['id']] > 300:
                warn.append(f"{k} {p['id']} 스냅 {snapm[p['id']]:.0f} m")
        origins = [r['id'] for r in res] + [h['id'] for h in hh]
        src_nodes = sorted(set(node[o] for o in origins))
        D = dijkstra(R['G'], directed=True, indices=src_nodes)
        row = {n: i for i, n in enumerate(src_nodes)}
        t = {}
        ratios = []
        hids = [h['id'] for h in hh]
        for a in origins:
            for b in hids:
                if a == b:
                    continue
                v = float(D[row[node[a]], node[b]])
                if not math.isfinite(v):
                    warn.append(f"{k} {a}->{b} 경로 없음"); continue
                t[f'{a}|{b}'] = round(v, 4)
                la1, lo1 = pts[a]; la2, lo2 = pts[b]
                straight = float(hav_m(la1, lo1, la2, lo2)) / 1000 * 1.4 / 30
                if straight > 0.005:  # 직선 0.1 km 미만 쌍은 비율 왜곡 → 제외
                    ratios.append(v / straight)
                    samples.append((k, a, b, float(hav_m(la1, lo1, la2, lo2)) / 1000, straight, v))
        if ratios:
            q = np.percentile(ratios, [10, 50, 90])
            check[k] = {'pairs': len(t), 'ratio_vs_haversine1.4_30kmh': {'P10': round(q[0], 3), 'median': round(q[1], 3), 'P90': round(q[2], 3)},
                        'snap_m': {'median': round(statistics.median(snapm.values()), 1), 'max': round(max(snapm.values()), 1)}}
        out[k] = {'pts': pts, 'snap_m': {i: round(v, 1) for i, v in snapm.items()}, 't': t}
        if k == 'ALL_DJ':
            out[k]['resources'] = [{'id': r['id'], 'name': r['name'], 'kind': r.get('kind'), 'lat': r['lat'], 'lon': r['lon']} for r in res]
        print(k, check.get(k), flush=True)

    out['src'] = ('OpenStreetMap(© OpenStreetMap contributors, ODbL) 도로망 — Overpass API(maps.mail.ru 미러) 타일 추출, '
                  f"기준 timestamp_osm_base {TIMESTAMP}. 국토교통부 표준노드링크(data.go.kr 15025526 → its.go.kr 제공)는 이 환경에서 its.go.kr 접속이 차단(연결 재설정)되어 쓰지 못함. "
                  '속도 = maxspeed 태그(제한속도), 없으면 분류별 법정 제한속도(motorway 100, trunk 80, primary~tertiary 50, residential·unclassified 30, service·living_street 20 km/h) — 「제한속도 기준」, '
                  '긴급차량 감속·신호·교차로 지체 계수 미적용(근거 미확보). 일방통행 반영. 단위 시간(h), 소수 4자리. 점은 최대 강연결성분의 최근접 노드로 스냅(snap_m), 스냅 구간 시간은 미포함. '
                  '키 "A|B" = A에서 B로 가는 시간(방향 있음). 출발 = 자원·가구, 도착 = 가구. ALL_DJ 의 자원은 S2~S5 자원 합집합(id = 시나리오.자원id).')
    out['check'] = check
    out['warn'] = warn
    rng.shuffle(samples)
    out['_samples'] = [{'sc': s[0], 'from': s[1], 'to': s[2], 'km_straight': round(s[3], 2), 'h_assume': round(s[4], 4), 'h_road': round(s[5], 4)} for s in samples[:15]]
    order = ['src', 'check', 'warn', '_graph', '_samples', 'S1', 'S2', 'S3', 'S4', 'S5', 'ALL_DJ']
    out = {k: out[k] for k in order if k in out}
    p = os.path.join(REPO, 'data', 'road_times.json')
    json.dump(out, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('saved', p, os.path.getsize(p), 'bytes; warn', len(warn))


def osm_timestamp():
    ts = set()
    for f in glob.glob(os.path.join(TILES, '*.json')):
        ts.add(json.load(open(f)).get('osm3s', {}).get('timestamp_osm_base', ''))
    ts = sorted(t for t in ts if t)
    return (ts[0] + ' ~ ' + ts[-1]) if len(ts) > 1 else (ts[0] if ts else '미상')


TIMESTAMP = osm_timestamp()
if __name__ == '__main__':
    main()
