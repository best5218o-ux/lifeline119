# 라이프라인 119 (Lifeline 119)

2026 AI 라이프 솔루션 챌린지 출품작 (팀 SAVE_KOREA) — 아이디어 챌린지 후보작 「전력안심망 AI」 구현.
정전 때 의료기기를 쓰는 가구마다 배터리가 버티는 최소 시간과 전기가 돌아오는 최대 시간을 비교해, 배터리가 먼저 끝날 집에 119 비상전원을 먼저 보내도록 추천하는 상황실 도구.

- 테스트: GitHub Pages (index.html). 가구는 모두 합성 데이터입니다.
- `models/notice-ko/`: 재난문자 해석 AI (KoELECTRA-small 미세조정, ONNX int8 14.7MB, 브라우저 실행)
- `ml/`: 재난문자 수집·라벨·학습·평가 코드와 라벨 데이터(재난안전데이터공유플랫폼 공개 재난문자 442건)
- 지도 타일 © OpenStreetMap contributors
