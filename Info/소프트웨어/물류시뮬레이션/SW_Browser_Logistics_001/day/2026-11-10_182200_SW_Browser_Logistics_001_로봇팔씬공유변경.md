# 로봇팔 씬 추가에 따른 공유 코드 변경

- 문서 버전: v0.0.0
- 생성·수정: 2026-11-10 18:22:00 KST
- 기능 ID: SW_Browser_Logistics_001 / 관련 SW_Browser_Robot_001
- 지시자: 이종인 / 작업자: Claude Opus 5.5 (Claude)
- 목적: 로봇팔 화면이 공장 화면 코드를 복사하지 않고 재사용하게 한다(ForAgents 4.11).

## 변경
- ./src/factory.js: FactorySimulation에 SimulationClass 옵션(기본 Simulation)과 robots 합계 추가. 공장 화면 동작은 같다.
- ./src/scene.js: createScene 5번째 인자 {mode}(기본 'agv'). 기본값이면 기존 장면과 같다.
- ./src/sceneSwitch.js: 전환 버튼에 로봇팔(./robot.html) 추가. 공장·컨베이어 상세 화면에도 버튼 3개가 보인다.

## 확인
- npm test 31개 통과. 작업 환경 Chromium에서 index.html 장비 48/48, AGV 4대, 콘솔 오류 없음.
- 상세 기록: ./Info/소프트웨어/로봇팔/SW_Browser_Robot_001/day/2026-11-10_182200_SW_Browser_Robot_001_로봇팔씬구현.md
