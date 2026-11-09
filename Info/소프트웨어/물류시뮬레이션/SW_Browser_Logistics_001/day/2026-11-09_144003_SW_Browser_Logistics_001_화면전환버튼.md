# 화면 전환 버튼

- 문서 버전: v0.0.0
- 생성·수정: 2026-11-09 14:40:03 KST
- 기능 ID: SW_Browser_Logistics_001 (관련 SW_Browser_ConveyorKit_001)
- 지시자: 이종인 / 작업자: Claude Opus 5.5 (Claude)
- 목적: 공장 전체와 컨베이어 상세를 버튼으로 오가게 한다.
- 목표: 두 화면 상단 오른쪽에 [공장 전체 | 컨베이어 상세 공정 N] 전환 버튼을 두고 양방향 이동을 확인한다.

## 요청
"전체 공장 시스템의 씬 2개(기존 공장 화면, 새 컨베이어 상세 화면)를 버튼으로 클릭하면 왔다 갔다 할 수 있게."

## 변경
- ./src/sceneSwitch.js(신규): sceneSwitch(active, line) 버튼 HTML, rememberLine(id)/lastLine() — 마지막으로 본 공정을 sessionStorage에 기억(실패 시 L1).
```js
export function sceneSwitch(active, line = lastLine()) {
  const item = (key, href, label) => `<a href="${href}" class="${active === key ? 'active' : ''}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="scene-switch" aria-label="화면 전환">${item('factory', './index.html', '공장 전체')}${item('conveyor', `./conveyor.html?line=${line}`, `컨베이어 상세 <small>공정 ${line.slice(1)}</small>`)}</nav>`;
}
```
- ./src/main.js: 상단에 sceneSwitch('factory'). 컨베이어 클릭 시 rememberLine(id) 후 이동.
- ./src/conveyor/main.js: 상단 "← 공장 전체" 링크를 FLOW 로고 + sceneSwitch('conveyor', lineId)로 바꿈. 열린 공정을 rememberLine.
- ./src/style.css: .scene-switch 스타일(현재 화면 강조색 #f2b75c, 900px 이하에서 공정 표기 숨김, 640px 이하 축소). ./src/conveyor/style.css에서 쓰지 않게 된 .back 제거.
- 앱 버전 v0.0.19 → v0.0.20(package.json·package-lock.json·두 화면 하단).

## 확인
- npm test: 27개 통과, 실패 0.
- 작업 환경 Chromium(실제 소스): 공장 화면에서 "컨베이어 상세" 클릭 → /conveyor.html?line=L1, 해당 버튼 강조. conveyor.html?line=L3에서 "공장 전체" 클릭 → /index.html, 전환 버튼이 "컨베이어 상세 공정 3 → ./conveyor.html?line=L3"을 가리킴(공정 기억). 콘솔 오류 없음.
- 사용자 PC 개발 서버는 확인 시점에 꺼져 있어 내장 브라우저 확인은 하지 않았다. 빌드는 기존 Pages CI(17afd61 배포 성공 기록)와 같은 설정이며 이번 변경 후 빌드는 미실행.
