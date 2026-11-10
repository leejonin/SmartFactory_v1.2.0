# v1.2.0 버전·저장소·접속 주소 변경

- 문서 버전: v0.0.0
- 문서 초기 생성 일시: 2026-11-10 18:30:45 KST
- 문서 수정 일시: 2026-11-10 18:36:12 KST
- 지시자: 이종인
- 작업자: GPT-6 (Codex) — Git 반영, 버전·저장소 이름 변경과 재배포 검증
- 기능 ID: SW_Browser_Logistics_001
- 관련 기능 ID: SW_Browser_Robot_001, SW_Browser_ConveyorKit_001
- 목적: 사용자가 로봇팔 화면이 포함된 최신 앱을 v1.2.0 이름과 주소로 찾을 수 있도록 한다.
- 목표: 앱·세 화면·저장소·배포 주소를 v1.2.0으로 통일하고 원격 반영과 재배포를 확인한다.

## 개요와 용어

사용자가 변경사항 푸시를 요청한 뒤 v1.2.0 수정·재배포, 이어 저장소 이름과 접속 주소도 같은 버전으로 수정하도록 지정했다. 원격 저장소는 소스가 보관되는 GitHub 위치이며 배포 주소는 웹앱 접속 위치다.

## 수정 전후·실제 코드

- 로봇팔 소스·모델·테스트·문서 26개 파일은 커밋 `0fd2586`으로 main에 반영했다. 직전 Actions 42790827330은 build·deploy 성공했다.
- `package.json`과 `package-lock.json`의 앱 버전(루트·빈 이름 packages 항목)을 1.1.2에서 1.2.0으로 변경했다. 의존성 버전은 변경하지 않았다.

```json
"version": "1.2.0"
```

- `src/main.js`, `src/robotMain.js`, `src/conveyor/main.js`의 footer 표시를 각각 아래 실제 코드로 바꿨다. 각 화면 진입 시 main.js가 HTML을 구성하며 표시한다.

```html
<span>FLOW / v1.2.0</span>
```

- 공개 저장소를 `leejonin/SmartFactory_v1.1.2`에서 `leejonin/SmartFactory_v1.2.0`으로 변경했다. 공개 설정 PUBLIC은 GitHub API로 대조했고 origin도 새 주소로 변경했다.
- README의 버전 설명, clone 명령, 폴더 이름과 배포 링크를 새 이름으로 맞췄다. Vite base는 기존 상대 경로 `./`이므로 코드 변경 없이 새 배포 폴더의 파일을 참조한다.
- 변경 커밋 `d122b045698d8cec485f8dc0b10d0c492463ee9b`를 새 저장소 main에 푸시하고 원격 HEAD 일치를 확인했다. 강제 푸시나 이력 재작성은 하지 않았다.
- 임시 측정 스크립트 `tests/_measure_tmp.mjs`는 로컬에 보존하고 커밋에서 제외했다. node_modules·dist도 전송하지 않았다.

## 검증과 기술 환경

- 로봇팔 구현을 포함한 로컬 `npm test`는 31개 통과, 실패 0개였다. 그 뒤 버전 표시만 바꿨고 로컬 `npm run build`가 다시 성공했다.
- package·lock의 앱 버전과 세 화면 표시가 모두 v1.2.0인지 확인했다. 전송 파일의 절대 파일 시스템 경로 검사도 통과했다.
- UR5e GLB 7개의 JSON 메타데이터를 검사해 로컬 절대 경로가 없고 버퍼가 파일 내부에 포함됐음을 확인했다.
- 환경: Node.js v24.18.0, npm 11.16.0, Vite 8.3.5, Three.js 0.187.0. 기존 `Info/기술_환경.md`의 환경과 같으며 패키지 변경 없음. GitHub Actions·Pages는 서비스 버전 지정 없음.
- 배포 흐름: main push → 의존성 설치 → 테스트 → 세 페이지 빌드 → 파일 업로드 → Pages 배포. 새 함수·API나 시뮬레이션 로직은 이번 버전 변경에서 추가하지 않았다.

## 남은 문제와 범위

- SW_Browser_Logistics_Unresolved_001: 기존 500kB 초과 공통 청크 경고 유지(680.08kB, gzip 170.97kB). 로컬 빌드는 성공했다.
- SW_Browser_Logistics_Unverified_003, SW_Browser_Robot_Unverified_002, SW_Browser_ConveyorKit_Unverified_002: 이번 작업에서 실제 GPU·모바일·저사양 기기 조작은 재검증하지 않았다.
- 새로 확인된 미해결 실행 버그·에러: 기록할 문제 없음.
- 기존 로봇팔 계획·구현 기록: `Info/plan/2026-11-10/182200_로봇팔씬_plan.md`, `Info/소프트웨어/로봇팔/SW_Browser_Robot_001/day/2026-11-10_182200_SW_Browser_Robot_001_로봇팔씬구현.md`.

## 재배포 최종 결과

- [Actions 42791230911](https://github.com/leejonin/SmartFactory_v1.2.0/actions/runs/42791230911): build·deploy 모두 성공. build 37초, deploy 4분 54초. 게시 도중 이전 파일이 응답했으나 게시 완료 후 최신 빌드로 재확인했다.
- [공장 전체](https://leejonin.github.io/SmartFactory_v1.2.0/), [로봇팔](https://leejonin.github.io/SmartFactory_v1.2.0/robot.html), [컨베이어 상세](https://leejonin.github.io/SmartFactory_v1.2.0/conveyor.html?line=L1)가 새 접속 주소다.
- 2026-11-10 18:36:12 KST, 캐시 구분용 쿼리를 붙여 배포 파일 35개가 HTTP 200임을 확인했다. HTML·JS·CSS는 GET 본문 SHA-256이 검증한 로컬 빌드와 일치했다. 세 화면 JS에 v1.2.0이 들어 있다. GLB·이미지는 HEAD 응답을 확인했다.
- 이번 접속 검증은 파일 응답·내용 확인이며 실제 GPU 화면 조작을 재검증한 것은 아니다. 기존 미확인 항목은 위 범위대로 유지한다.
- 추가로 캐시 구분 쿼리가 없는 일반 index.html·robot.html·conveyor.html 주소도 로컬 빌드와 본문이 일치함을 확인했다.
