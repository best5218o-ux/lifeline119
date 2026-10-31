# 라이프라인 119 (Lifeline 119)

2026 AI 라이프 솔루션 챌린지 출품작 (팀 SAVE_KOREA) — 아이디어 챌린지 후보작 「전력안심망 AI」 구현.
정전 때 의료기기를 쓰는 가구마다 배터리가 버티는 최소 시간과 전기가 돌아오는 최대 시간을 비교해, 배터리가 먼저 끝날 집에 119 비상전원을 먼저 보내도록 추천하는 상황실 도구.

- 테스트: GitHub Pages (index.html). 가구는 모두 합성 데이터입니다.
- `models/notice-ko/`: 재난문자 해석 AI (KoELECTRA-small 미세조정, ONNX int8 14.7MB, 브라우저 실행)
- `ml/`: 재난문자 수집·라벨·학습·평가 코드와 라벨 데이터(재난안전데이터공유플랫폼 공개 재난문자 442건)
- 지도 타일 © OpenStreetMap contributors

## 결과 재현 (Node 18+, Python 3)

| 명령 | 결과 (2026-10-31 제출본) |
|---|---|
| `cd eval && ROAD=1 node eval_s5.js` | 남대전변전소 화재 2021 재현, 300회: 배터리 소진 조치 없음 6.8 → AI 배정 2.6 (명부 순 3.2 · 가까운 순 3.2) |
| `cd eval && node eval_dispatch.js` | 서구 가상 광역정전 문자① : 27.7 → 15.4 (명부 순 16.9) |
| `cd eval && ROAD=1 node export_opt.js && python3 eval_opt.py` | 참값 분포를 아는 최적 배정(헝가리안) 대비 남대전 92% · 서구 99% |
| `cd eval && node eval_m1.js ./m1_ocr_test.json` | 합성 이름표 시험 210장: 모델 자동입력 165 · 다른 모델로 잘못 채움 0 |
| `cd ml && python3 final_eval.py` | 재난문자 해석 AI — 2026년 문자 204건 시험 (학습에 안 씀) |

- 이동시간: `data/road_times.json` = OpenStreetMap 도로망 최단경로 소요시간 (OSRM, `prep/road_osrm.py`). 신호·혼잡 미반영.
- 실시간 공공 API: `DATA_GO_KR_KEY=<공공데이터포털 인증키> python3 prep/fetch_live.py` — 기상 초단기실황 · 응급실 실시간 병상 · 전기차 충전기 · 식약처 품목·회수. 인증키는 저장소에 넣지 않습니다.
