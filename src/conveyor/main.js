import '../style.css';
import './style.css';
import { Sorter, KIT } from './sorter.js';
import { createKitScene, PALETTE } from './kit.js';
import { LAYERS } from '../layout.js';
import { sceneSwitch, rememberLine } from '../sceneSwitch.js';

/** 공정 컨베이어 상세 화면: 공두이노 DIY 컨베이어 색상 분류 키트를 실물 크기로 재현한다. SW_Browser_Logistics_001 */
const lineId = LAYERS.some(l => l.id === new URLSearchParams(location.search).get('line')) ? new URLSearchParams(location.search).get('line') : 'L1';
const NAMES = { red: '빨강', yellow: '노랑', green: '초록' };
document.title = `공정 ${lineId.slice(1)} 컨베이어 상세 · FLOW`;
rememberLine(lineId);
document.querySelector('#app').innerHTML = `
<header><div class="brand">FL<b>O</b>W</div><div class="divider"></div><div><h1>공정 ${lineId.slice(1)} · 컨베이어 색상 분류 라인</h1><p>DIY CONVEYOR COLOR SORTER · 1:1 SCALE</p></div>${sceneSwitch('conveyor', lineId)}<div class="live"><i class="dot"></i><span id="state">동작 중</span></div></header>
<main class="workspace"><section class="viewport" aria-label="컨베이어 색상 분류 키트 3D">
<div class="asset-status" id="asset-status">부품 모델 불러오는 중…</div>
<div class="canvas-note">드래그 이동 · 휠 확대 · 오른쪽 드래그 회전</div>
<nav class="camera-tabs" aria-label="카메라 시점"><button data-view="overview" class="active">전체</button><button data-view="sensor">센서</button><button data-view="gates">분류 게이트</button><button data-view="board">제어 보드</button></nav></section>
<aside class="sidebar">
<section class="section"><div class="section-title"><h2>분류 현황</h2><span class="tag">LIVE</span></div>
${['red', 'yellow', 'green'].map(c => `<div class="bin"><i style="background:${PALETTE[c]}"></i><span>${NAMES[c]} 상자</span><strong id="count-${c}">0</strong></div>`).join('')}
<div class="control-row"><button class="control primary" id="pause">일시정지</button><button class="control" id="reset">초기화</button><select id="speed" aria-label="속도"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></div></section>
<section class="section"><div class="section-title"><h2>센서</h2><span class="tag" id="ir">대기</span></div>
<div class="reading"><div class="swatch" id="swatch"></div><div><strong id="read-color">판독 대기</strong><p id="read-rgb">컬러센서 아래를 지나면 판독</p></div></div>
<div class="flow"><span>투입</span><b>→</b><span>근접센서 감지</span><b>→</b><span>컬러 판독</span><b>→</b><span>서보 게이트</span><b>→</b><span>색별 상자</span></div></section>
<section class="section"><div class="section-title"><h2>최근 동작</h2><span class="eyebrow">EVENT</span></div><div class="events" id="events"></div></section>
<section class="section parts"><div class="section-title"><h2>구성 부품</h2></div>
<ul><li>아두이노 UNO R3 · 투명 아크릴 받침 · 400구 브레드보드(5V·GND 레일)</li><li>L9110S형 모터 드라이버 · 점퍼선(D2·D5·D6·D9·D10·A4·A5)</li><li>SG90 서보 2개 + 노랑·초록 분류 팔</li><li>원통형 적외선 근접센서 · 컬러센서 모듈</li><li>DC 기어모터 + 타이밍 벨트 구동</li><li>2020 알루미늄 프로파일 · 608 베어링 · 녹색 고무 벨트</li><li>3D 프린팅 주황 프레임 · 아크릴 분류 상자 3개</li></ul>
<p class="subtle">벨트 ${(KIT.speed * 100).toFixed(1)} cm/s · 블록 ${KIT.half * 2000} mm · 벨트 길이 ${KIT.L * 1000} mm(추정)<br>부품 모델: FreeCAD-library(CC-BY 3.0) 기반 변환. 키트 외형은 판매 사진 기준 추정.</p></section>
</aside></main>
<footer><span>● 공정 ${lineId.slice(1)} 상세</span><span>1 unit = 1 m · 실물 크기</span><span>FLOW / v1.2.0</span></footer>`;

const element = id => document.getElementById(id);
const sorter = new Sorter();
let paused = false, speed = 1, last = performance.now(), acc = 0, lastUi = 0, kit;
/** 패널 수치를 상태기계 값으로 갱신한다. */
function updateUi() {
  for (const c of ['red', 'yellow', 'green']) element(`count-${c}`).textContent = sorter.counts[c];
  element('ir').textContent = sorter.ir ? '감지' : '대기'; element('ir').classList.toggle('hot', sorter.ir);
  const r = sorter.lastReading;
  element('swatch').style.background = r ? `rgb(${r.rgb.join(',')})` : '#2a363d';
  element('read-color').textContent = r ? `#${r.id} ${NAMES[r.color]}` : '판독 대기';
  element('read-rgb').textContent = r ? `R ${r.rgb[0]} · G ${r.rgb[1]} · B ${r.rgb[2]}` : '컬러센서 아래를 지나면 판독';
  element('events').replaceChildren(...sorter.events.map(e => { const d = document.createElement('div'); d.className = 'event'; d.innerHTML = `<time>${e.time.toFixed(1)}s</time>`; const s = document.createElement('span'); s.textContent = e.message; d.append(s); return d; }));
}
element('pause').onclick = () => { paused = !paused; element('pause').textContent = paused ? '재생' : '일시정지'; element('state').textContent = paused ? '일시정지' : '동작 중'; };
element('reset').onclick = () => { sorter.reset(); updateUi(); };
element('speed').onchange = e => { speed = Number(e.target.value); };
for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => { kit?.view(b.dataset.view); document.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('active', x === b)); };
document.addEventListener('visibilitychange', () => { last = performance.now(); acc = 0; });
try {
  kit = createKitScene(document.querySelector('.viewport'), text => element('asset-status').textContent = text);
  /** 1/60초 고정 단계로 상태기계를 돌리고 매 프레임 그린다. */
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now; let stepped = 0;
    if (!paused && !document.hidden) { acc += dt * speed; while (acc >= 1 / 60) { sorter.step(1 / 60); acc -= 1 / 60; stepped += 1 / 60; } }
    kit.sync(sorter, stepped); kit.render(); if (now - lastUi > 150) { updateUi(); lastUi = now; } requestAnimationFrame(frame);
  }
  updateUi(); requestAnimationFrame(frame);
} catch (error) { element('asset-status').textContent = `3D 화면을 시작하지 못했습니다: ${error.message}`; console.error(error); }
