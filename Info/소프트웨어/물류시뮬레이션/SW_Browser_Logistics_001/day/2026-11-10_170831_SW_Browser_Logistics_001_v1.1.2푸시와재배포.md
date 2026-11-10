# v1.1.2 Git 반영과 재배포 완료

- 문서 버전: v0.0.0
- 문서 초기 생성·수정 일시: 2026-11-10 17:08:31 KST
- 작업 일시: 2026-11-10 17:03~17:08 KST
- 지시자: 이종인
- 작업자: GPT-6 (Codex) — 원격 병합, 저장소 이름 변경, 푸시·배포 검증과 기록
- 기능 ID: SW_Browser_Logistics_001 / 관련 기능 ID: SW_Browser_ConveyorKit_001
- 목적: 사용자가 최신 아두이노 보드·배선 변경이 포함된 v1.1.2에 접속하도록 한다.
- 목표: 공개 저장소 이름과 앱 버전을 v1.1.2로 맞추고 main 푸시, Pages 배포와 배포 파일 응답을 확인한다.

## 개요·용어

사용자가 변경사항 Git 푸시·v1.1.2 수정·재배포를 요청했고, 후속 답변에서 공개 저장소 이름도 SmartFactory_v1.1.2로 바꾸도록 지정했다. 원격은 GitHub의 소스 저장소이며 Pages는 실제 웹앱을 제공하는 서비스다.

## 수정 전후와 실제 동작

- 기존 로컬 커밋 `52caf71`에 아두이노 보드·배선 변경과 v1.1.2 수정이 이미 들어 있었다. 이 코드를 추가 수정하지 않고 검증한 뒤 반영했다.
- 원격 main에는 로컬에 없던 README 변경 `be7c751`이 있었다. 이력을 보존하는 병합 커밋 `cb41749`를 만들고 README의 앱 버전·clone·배포 링크는 v1.1.2로, 실제 Vite base 설명은 `./`로 유지했다.
- 공개 저장소 `leejonin/SmartFactory_v1.1.1`을 `leejonin/SmartFactory_v1.1.2`로 변경하고 origin URL을 새 주소로 맞췄다. 공개 설정 PUBLIC은 GitHub API로 확인했다.
- main 푸시 후 원격 HEAD가 `cb4174978df981951cbead722e7e82fd698e3e9c`와 일치함을 확인했다. 강제 푸시나 이력 재작성은 하지 않았다.
- 전송할 두 커밋의 메시지와 변경 파일 내용을 검사해 절대 파일 시스템 경로가 검출되지 않았다. node_modules·dist는 전송하지 않았다.

버전 근거는 `package.json`의 실제 항목이다.

```json
"version": "1.1.2"
```

`package-lock.json`의 루트와 packages의 빈 이름 항목도 1.1.2다. `src/main.js`와 `src/conveyor/main.js`는 각각 화면 footer에 아래 실제 표시 코드를 포함한다.

```html
<span>FLOW / v1.1.2</span>
```

브라우저 진입 시 각 main.js가 화면을 구성하면서 버전을 표시한다. `.github/workflows/pages.yml`은 main push를 받아 의존성 설치 → 테스트 → Vite 다중 페이지 빌드 → dist 업로드 → Pages 배포 순서로 실행한다. 이번 변경에서는 새 함수나 API를 추가하지 않았다.

## 확인 방법과 결과

- 로컬 `npm test`: 27개 통과, 실패 0개.
- 로컬 `npm run build`: 성공. index.html·conveyor.html과 자원 생성.
- Actions [42780124540](https://github.com/leejonin/SmartFactory_v1.1.2/actions/runs/42780124540): build·deploy 모두 성공. 배포 단계 완료 2026-11-10 17:07:59 KST.
- [공장 전체](https://leejonin.github.io/SmartFactory_v1.1.2/)와 [컨베이어 상세](https://leejonin.github.io/SmartFactory_v1.1.2/conveyor.html?line=L1)를 포함한 배포 파일 25개가 HTTP 200으로 응답했다. HTML·JS·CSS는 GET 본문의 SHA-256이 로컬 검증 빌드와 일치했고 두 화면 JS에 v1.1.2가 포함됨을 확인했다. 이미지·GLB는 HEAD 응답을 확인했다.
- 사용 기술: Node.js v24.18.0, npm 11.16.0, Vite 8.3.5, Three.js 0.187.0. 실행 출력과 잠금 파일 기준이며 기존 `Info/기술_환경.md`의 버전과 같다. GitHub Actions·Pages는 서비스 버전 지정 없음.

## 남은 문제·검증 범위

- SW_Browser_Logistics_Unresolved_001: 기존 500kB 초과 청크 경고 유지. 이번 공통 청크는 680.04kB, gzip 170.94kB이며 빌드·배포는 성공했다.
- SW_Browser_Logistics_Unverified_003 및 SW_Browser_ConveyorKit_Unverified_002: 이번 작업에서 브라우저 렌더링·모바일·저사양 기기 재검증은 수행하지 않았다. HTTP·파일 내용 검증을 화면 조작 검증으로 간주하지 않는다.
- 새로 확인된 미해결 실행 버그·에러: 기록할 문제 없음.
- 별도 신규 계획 문서는 작성하지 않았다. 이전 준비 기록은 같은 day 폴더의 `2026-11-10_170113_SW_Browser_Logistics_001_버전v1.1.2와저장소이름변경.md`에 보존했다.
