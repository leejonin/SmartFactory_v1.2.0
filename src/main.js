import './style.css';
import { AGV_SPEED } from './simulation.js';
import { FactorySimulation } from './factory.js';
import { LAYERS } from './layout.js';
const REGIONS=LAYERS.flatMap(layer=>layer.regions);
import { createScene,COLORS } from './scene.js';
import { sceneSwitch, rememberLine } from './sceneSwitch.js';

document.querySelector('#app').innerHTML=`
<header><div class="brand">FL<b>O</b>W</div><div class="divider"></div><div><h1>공장 물류 시뮬레이션</h1><p>FACTORY LOGISTICS / PROCESS CONTROL</p></div>${sceneSwitch('factory')}<div class="live"><i class="dot"></i><span id="running-label">시뮬레이션 실행 중</span></div></header>
<main class="workspace"><section class="viewport" aria-label="공장 3D 장면"><div class="scene-heading"><div class="eyebrow">INBOUND → SORT → DISPATCH</div><h2>물류의 흐름을 한눈에.</h2><p id="process-summary">한 공장 · 공정 1개 · 출하 도크 3개</p></div><div class="asset-status" id="asset-status">장비 모델 불러오는 중…</div><div class="canvas-note">드래그 이동 · 휠 확대 · 오른쪽 드래그 회전 · 컨베이어 클릭 시 상세</div><nav class="camera-tabs" aria-label="카메라 시점"><button data-view="top">탑뷰</button><button data-view="qr">QR 뷰</button><button data-view="agv">AGV 뷰</button></nav><div id="fatal" hidden></div></section>
<aside class="sidebar"><section class="section"><div class="section-title"><h2>운영 현황</h2><span class="tag">SIMULATION</span></div><div class="metrics"><div class="metric"><label>운반 완료</label><strong id="total">0</strong><small>상자</small></div><div class="metric"><label>이송 중</label><strong id="active">0</strong><small>상자</small></div></div><div class="control-row"><button class="control primary" id="pause">일시정지</button><button class="control" id="reset">초기화</button><select id="speed" aria-label="시뮬레이션 속도"><option value="1">1× 속도</option><option value="2">2× 속도</option><option value="5">5× 속도</option></select></div><div class="status-line"><label for="process-count">공정 수</label><select id="process-count"><option value="1" selected>1개</option><option value="2">2개</option><option value="3">3개</option><option value="4">4개</option></select></div><div class="status-line"><label for="fleet">공정당 AGV 대수</label><select id="fleet">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i===3?'selected':''}>${i+1}대</option>`).join('')}</select></div><p class="subtle">공정 수·AGV 대수 변경 시 운반·통계가 초기화됩니다.</p><div class="status-line"><span>경과 시간</span><b id="elapsed">00:00</b></div></section>
<section class="section"><div class="section-title"><h2>목적지별 출하</h2><span class="eyebrow" id="dock-count">3 DOCKS</span></div>${REGIONS.map((r,i)=>`<div class="route" data-process="${Math.floor(i/3)+1}"><i class="route-mark" style="background:${COLORS[i%3]}"></i><span>${r}<small>공정 ${Math.floor(i/3)+1} / DOCK 0${i%3+1}</small></span><strong id="dock-${i}">0</strong></div>`).join('')}</section>
<section class="section"><div class="section-title"><h2>QR 판독 / AGV</h2><span class="tag" id="scan-state">대기</span></div><div class="qr-panel"><canvas id="qr-preview" width="180" height="180" aria-label="최근 판독 목적지 QR"></canvas><div><strong id="read-region">상자 도착 대기</strong><p id="read-id">컨베이어 끝에서 판독</p></div></div><div id="agv-states"></div><button id="retry" class="control retry" hidden>QR 다시 읽기</button></section>
<section class="section"><div class="section-title"><h2>최근 작업</h2><span class="eyebrow">EVENT LOG</span></div><div class="events" id="events"><span>첫 상자를 기다리고 있습니다.</span></div><p class="subtle">각 공정 · 3초마다 생성 시도<br>컨베이어 0.5 m/s · AGV ${AGV_SPEED.toFixed(1)} m/s · 구간 예약 · 병렬 이동</p></section></aside></main>
<footer><span>● 로컬 시뮬레이션</span><span>1 unit = 1 m · 임시 운영값</span><span>FLOW / v1.1.2</span></footer>`;
const sim=new FactorySimulation({agvCount:4});
const images=sim.qrImages.flat();
const element=id=>document.getElementById(id);
let paused=false,speed=1,scene,accumulator=0,last=performance.now(),lastUi=0;
const stateNames={idle:'주차 대기',approaching:'QR 인계 위치 이동',staging:'QR 옆 선대기 이동',standby:'QR 옆 선대기',ready:'인계 대기',loading:'상자 인수 중',outbound:'도크 대기 위치로 이동',dockWaiting:'도크 앞 대기',docking:'도크 진입 중',unloading:'도크 인도 중',returning:'복귀 중'};
/** 경과 초를 분:초 형식으로 표시한다. */
function clock(seconds){return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;}
/** 화면 수치와 판독 결과를 실제 상태에서만 갱신한다. */
function updateUi(){
  const count=sim.layers.length;
  element('process-summary').textContent=`한 공장 · 공정 ${count}개 · 출하 도크 ${count*3}개`;
  element('dock-count').textContent=`${count*3} DOCKS`;
  document.querySelectorAll('[data-process]').forEach(row=>row.hidden=Number(row.dataset.process)>count);
  element('total').textContent=sim.delivered.reduce((a,b)=>a+b,0);element('active').textContent=sim.boxes.length;element('elapsed').textContent=clock(sim.time);
  sim.delivered.forEach((n,i)=>element(`dock-${i}`).textContent=n);element('agv-states').innerHTML=sim.agvs.map(a=>`<div class="status-line"><span>공정 ${a.layer.slice(1)} / AGV ${String(a.id+1).padStart(2,'0')}</span><b>${stateNames[a.state]}</b></div>`).join('');
  const failed=sim.boxes.some(b=>b.state==='error');element('retry').hidden=!failed;
  element('scan-state').textContent=failed?'판독 실패':sim.boxes.some(b=>b.state==='scan')?'판독 중':'대기';
  element('read-region').textContent=sim.lastRead?.destination||'상자 도착 대기';element('read-id').textContent=sim.lastRead?`공정 ${sim.lastRead.layer.slice(1)} / #${sim.lastRead.id} · QR 일치 확인`:'컨베이어 끝에서 판독';
  const canvas=element('qr-preview'),context=canvas.getContext('2d');
  if(sim.lastRead){const p=images[REGIONS.indexOf(sim.lastRead.destination)];canvas.width=p.width;canvas.height=p.height;context.putImageData(new ImageData(p.data,p.width,p.height),0,0);}
  else {context.fillStyle='#f4f6f1';context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle='#93a6a5';context.font='30px sans-serif';context.textAlign='center';context.fillText('QR',canvas.width/2,canvas.height/2+10);}
  element('events').replaceChildren(...sim.events.slice(0,5).map(e=>{const row=document.createElement('div');row.className='event';const t=document.createElement('time');t.textContent=clock(e.time);const msg=document.createElement('span');msg.textContent=e.message;row.append(t,msg);return row;}));
}
element('pause').onclick=()=>{paused=!paused;element('pause').textContent=paused?'재생':'일시정지';element('running-label').textContent=paused?'일시정지':'시뮬레이션 실행 중';};
element('reset').onclick=()=>{sim.reset();accumulator=0;updateUi();scene?.sync(sim);};
element('process-count').onchange=e=>{sim.setLayerCount(Number(e.target.value));accumulator=0;updateUi();scene?.sync(sim);};
element('fleet').onchange=e=>{sim.setAgvCount(Number(e.target.value));accumulator=0;updateUi();scene?.sync(sim);};
element('speed').onchange=e=>{speed=Number(e.target.value);};element('retry').onclick=()=>sim.retryScan();
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{scene?.view(button.dataset.view);for(const b of document.querySelectorAll('[data-view]')){b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));}};
/** 비활성 탭에서 경과한 시간을 건너뛰어 복귀 시 갑작스런 이동을 막는다. */
document.addEventListener('visibilitychange',()=>{last=performance.now();accumulator=0;});
try {
  scene=createScene(document.querySelector('.viewport'),sim.qrImages,text=>element('asset-status').textContent=text,id=>{rememberLine(id);location.href=`./conveyor.html?line=${id}`;});
  /** 렌더 속도와 무관하게 1/60초 고정 단계로 시뮬레이션을 실행한다. */
  function frame(now){
    const dt=Math.min((now-last)/1000,0.1);last=now;
    if(!paused&&!document.hidden){accumulator+=dt*speed;while(accumulator>=1/60){sim.step(1/60);accumulator-=1/60;}}
    scene.sync(sim);scene.render();if(now-lastUi>200){updateUi();lastUi=now;}requestAnimationFrame(frame);
  }
  updateUi();scene.sync(sim);
  requestAnimationFrame(frame);
} catch(error){element('fatal').hidden=false;element('fatal').textContent=`3D 화면을 시작하지 못했습니다. WebGL을 지원하는 브라우저에서 다시 열어주세요. ${error.message}`;console.error(error);}







