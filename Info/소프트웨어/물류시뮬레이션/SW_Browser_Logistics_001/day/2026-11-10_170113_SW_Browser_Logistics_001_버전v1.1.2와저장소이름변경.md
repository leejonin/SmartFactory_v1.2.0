# 버전 v1.1.2와 저장소 이름 변경 준비

- 문서 버전: v0.0.0
- 생성·수정: 2026-11-10 17:01:13 KST
- 기능 ID: SW_Browser_Logistics_001 (관련 SW_Browser_ConveyorKit_001)
- 지시자: 이종인 / 작업자: Claude Opus 5.5 (Claude)
- 목적: 배포 사용자가 저장소 이름과 화면 버전을 같은 번호로 보고 최신 배포를 찾게 한다.
- 목표: 앱 버전을 v1.1.2로, 저장소를 SmartFactory_v1.1.2로 맞추고 재배포가 성공함을 확인한다.

## 요청
"SmartFactory_v1.1.1로 깃 푸시하고 버전 v1.1.2로 수정 재배포까지". 질문으로 범위를 확인했고, 저장소 이름과 앱 버전을 모두 바꾸는 것으로 답을 받았다.

## 변경
- 앱 버전 v0.0.21 → v1.1.2: ./package.json, ./package-lock.json(2곳), ./src/main.js·./src/conveyor/main.js 화면 하단.
- ./README.md: 앱 버전 설명, clone 명령, 배포 링크를 SmartFactory_v1.1.2로 바꿨다. base 설명이 예전 값(`/SmartFactory_v1.1.0/`)으로 남아 실제 설정(`./`)과 달라서 함께 고쳤다.
- 과거 day 문서 속 예전 저장소 이름은 당시 기록이므로 그대로 둔다.

## push·이름 변경·재배포
- 이 작업 환경에는 GitHub 계정 연결이 없다(add_repo: link your GitHub account). 그래서 커밋·push·이름 변경은 사용자가 PC 터미널에서 실행한다.
- 대상은 Public 저장소다(익명 git ls-remote 성공으로 확인). 사용자가 명시적으로 지정했다.
- 올리는 파일에 PC 절대 경로가 없음을 검사했다.
- 결과(push 성공, Actions 결과, 새 배포 주소 응답)는 확인 후 이 문서에 덧붙인다. 아직 미확인.

## 2026-11-10 17:08:31 KST 후속 확인

- 후속 작업자: GPT-6 (Codex). 기존 작성 당시 기록은 보존한다.
- 사용자의 후속 답변으로 공개 저장소 이름도 SmartFactory_v1.1.2로 변경하는 범위를 확인했다.
- 이름 변경·origin 변경·main 푸시 완료. 앱 v1.1.2와 보드·배선 커밋 `52caf71` 및 원격 README 이력을 보존한 병합 `cb41749`를 반영했다.
- Actions 42780124540의 build·deploy 성공, 새 배포 파일 25개의 HTTP 200과 두 화면 스크립트의 v1.1.2를 확인했다.
- 상세 확인 및 잔여 경고: 같은 폴더의 `2026-11-10_170831_SW_Browser_Logistics_001_v1.1.2푸시와재배포.md`.
