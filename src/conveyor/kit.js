import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { KIT, armDirection } from './sorter.js';
import { createArduinoUno, createBreadboard, UNO_SIZE } from './arduino.js';
// 실측 부품 모델: FreeCAD-library(CC-BY 3.0)의 STEP을 GLB로 변환. 출처·저작자 표시는 Asset/kit-parts/LICENSE.txt.
import servoUrl from '../../Asset/kit-parts/sg90.glb?url';
import hornUrl from '../../Asset/kit-parts/sg90_horn.glb?url';
import proxUrl from '../../Asset/kit-parts/prox_sensor.glb?url';
import bearingUrl from '../../Asset/kit-parts/bearing_608.glb?url';
import profileUrl from '../../Asset/kit-parts/profile_2020.glb?url';

const { L } = KIT;
/** 키트 치수(m). 사진 속 키트(공두이노 DIY 컨베이어 색상 분류)를 기준으로 한 추정값이다. */
const DIM = { rollerY: 0.0865, rollerR: 0.0115, beltT: 0.0015, sideZ: 0.047, plateZ: 0.061, plateT: 0.008 };
export const PALETTE = { red: '#d4161c', yellow: '#f2b419', green: '#1f8c3d' };

/** 3D 프린팅 PLA의 적층 줄무늬를 범프 맵으로 만든다(가로 0.2mm 레이어 느낌). */
function layerLines() {
  const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 64; const c = canvas.getContext('2d');
  for (let y = 0; y < 64; y++) { const v = 128 + (y % 4 < 2 ? 40 : -40); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(0, y, 8, 1); }
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 60); return t;
}
/** 고무 벨트의 잔무늬 텍스처(짙은 녹색 직조 + 미세 입자). */
function beltTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64; const c = canvas.getContext('2d');
  c.fillStyle = '#1b3b2c'; c.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 4) { c.fillStyle = x % 8 ? '#1f4231' : '#183526'; c.fillRect(x, 0, 2, 64); }
  for (let i = 0; i < 1400; i++) { const v = 30 + Math.random() * 40; c.fillStyle = `rgba(${v},${v + 30},${v + 15},0.5)`; c.fillRect(Math.random() * 256, Math.random() * 64, 1, 1); }
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
/** 메시를 만들어 그림자 설정과 함께 부모에 붙인다. */
function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
/** 끝단 측판 외곽선(롤러 축 주위 둥근 머리 + 벌어진 다리). 축 구멍은 608 베어링 외경 22mm. */
function plateShape() {
  const s = new THREE.Shape(), r = 0.022, cy = DIM.rollerY;
  s.moveTo(-0.04, 0); s.lineTo(0.04, 0); s.lineTo(0.04, 0.008); s.quadraticCurveTo(0.024, 0.016, 0.022, 0.035);
  s.lineTo(r, cy); s.absarc(0, cy, r, 0, Math.PI, false); s.lineTo(-0.022, 0.035); s.quadraticCurveTo(-0.024, 0.016, -0.04, 0.008); s.closePath();
  const hole = new THREE.Path(); hole.absarc(0, cy, 0.011, 0, Math.PI * 2, true); s.holes.push(hole);
  const lighten = new THREE.Path(); lighten.absellipse(0, 0.045, 0.009, 0.014, 0, Math.PI * 2, true); s.holes.push(lighten);
  return s;
}
/** 벨트 루프(윗면·아랫면·양 끝 반원)를 하나의 띠 메시로 만든다. u 좌표는 진행 거리라 텍스처 이동만으로 벨트가 돈다. */
function beltGeometry() {
  const R = DIM.rollerR + DIM.beltT, cy = DIM.rollerY, pts = [], seg = 24;
  for (let i = 0; i <= 40; i++) pts.push([L * i / 40, cy + R]);
  for (let i = 1; i <= seg; i++) { const a = Math.PI / 2 - Math.PI * i / seg; pts.push([L + R * Math.cos(a), cy + R * Math.sin(a)]); }
  for (let i = 1; i <= 40; i++) pts.push([L - L * i / 40, cy - R]);
  for (let i = 1; i <= seg; i++) { const a = -Math.PI / 2 - Math.PI * i / seg; pts.push([R * Math.cos(a), cy + R * Math.sin(a)]); }
  const pos = [], uv = [], idx = []; let s = 0;
  pts.forEach((p, i) => {
    if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    pos.push(p[0], p[1], -KIT.beltHalf, p[0], p[1], KIT.beltHalf); uv.push(s / 0.05, 0, s / 0.05, 1);
    if (i) { const a = 2 * (i - 1); idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** 점 목록을 지나는 전선(튜브). 가운데가 처지도록 sag만큼 내린다. */
function wire(parent, points, color, radius = 0.0009) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.4);
  return mesh(parent, new THREE.TubeGeometry(curve, Math.max(24, points.length * 16), radius, 6), new THREE.MeshStandardMaterial({ color, roughness: 0.45 }));
}
/** 3가닥 서보 케이블(갈색·빨강·주황)처럼 나란한 전선 묶음.
 * @param {THREE.Object3D} parent 붙일 부모. @param {number[][]} points 묶음이 지나는 경유점(월드 좌표, m).
 * @param {string[]} colors 전선 색(순서대로). @param {number} [gap] 전선 간격(m).
 * @param {number[][]} [starts] 전선마다 실제로 꽂힌 시작점(커넥터 윗면). 주면 그 점에서 위로 8mm 올라온 뒤 묶음 경로를 따른다.
 */
function bundle(parent, points, colors, gap = 0.0019, starts = null) {
  colors.forEach((color, i) => {
    const path = points.map(([x, y, z]) => [x, y + (i - (colors.length - 1) / 2) * gap * 0.3, z + (i - (colors.length - 1) / 2) * gap]);
    if (starts) path.unshift(starts[i], [starts[i][0], starts[i][1] + 0.008, starts[i][2]]);
    wire(parent, path, color);
  });
}
/** GLB 원본에서 최상단(축 끝) 정점들의 중심을 찾는다. 서보 출력축·혼 허브 정렬에 쓴다. */
function topCenter(object) {
  object.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(object), v = new THREE.Vector3(), sum = new THREE.Vector3(); let n = 0;
  object.traverse(o => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.y > box.max.y - 0.0012) { sum.add(v); n++; } } });
  return n ? sum.divideScalar(n) : box.getCenter(v);
}

/** 키트 3D 장면을 만들고 상태기계(sorter)를 매 프레임 반영한다. SW_Browser_Logistics_001
 * @param {HTMLElement} container 캔버스를 넣을 요소. @param {(text:string)=>void} onStatus 부품 로딩 문구 콜백.
 * @returns {{sync:(s:import('./sorter.js').Sorter)=>void, render:()=>void, view:(name:string)=>void, ready:Promise<void>}}
 */
export function createKitScene(container, onStatus) {
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'kit-canvas'; container.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9e8e4');
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture; scene.environmentIntensity = 0.75;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.005, 10);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.minDistance = 0.08; controls.maxDistance = 2.2; controls.maxPolarAngle = Math.PI / 2.05;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }; controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }; controls.screenSpacePanning = false;
  const key = new THREE.DirectionalLight('#fff6ea', 2.6); key.position.set(-0.25, 0.9, 0.55); key.target.position.set(0.3, 0, 0); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -0.55, right: 0.55, top: 0.55, bottom: -0.55, near: 0.1, far: 2.5 }); key.shadow.radius = 5; key.shadow.bias = -0.0002; key.shadow.normalBias = 0.002;
  scene.add(key, key.target, new THREE.HemisphereLight('#ffffff', '#bdb9b0', 0.6));

  // 재질: PLA(주황·노랑·초록·검정), 알루미늄, 아크릴, 고무, 탁자.
  const lines = layerLines();
  const pla = color => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, bumpMap: lines, bumpScale: 0.6 });
  const M = {
    orange: pla('#e8560b'), black: pla('#1d1f22'), yellowPla: pla(PALETTE.yellow), greenPla: pla('#2fa24f'),
    alu: new THREE.MeshStandardMaterial({ color: '#cfd3d6', metalness: 0.92, roughness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: '#9aa0a5', metalness: 0.95, roughness: 0.25 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.9, roughness: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.85 }),
    table: new THREE.MeshStandardMaterial({ color: '#f3f2ef', roughness: 0.92 }),
    pcb: new THREE.MeshStandardMaterial({ color: '#1b6fb0', roughness: 0.55 }),
  };
  const acrylic = (tint, opacity = 0.42) => new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

  const table = mesh(scene, new THREE.PlaneGeometry(4, 4), M.table); table.rotation.x = -Math.PI / 2; table.castShadow = false;
  const kit = new THREE.Group(); scene.add(kit);

  // 끝단 측판(양쪽 끝 × 앞뒤), 하단 보강대, 롤러와 축.
  const plateGeo = new THREE.ExtrudeGeometry(plateShape(), { depth: DIM.plateT, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 28 });
  for (const x of [0, L]) for (const side of [-1, 1]) { const p = mesh(kit, plateGeo, M.orange, x, 0, side * DIM.plateZ - DIM.plateT / 2); p.userData.part = '끝단 측판(3D 프린팅)'; }
  for (const x of [0, L]) { mesh(kit, new THREE.BoxGeometry(0.06, 0.008, DIM.plateZ * 2), M.orange, x, 0.004, 0); mesh(kit, new THREE.BoxGeometry(0.012, 0.02, DIM.plateZ * 2), M.orange, x, 0.03, 0); }
  const roller = new THREE.CylinderGeometry(DIM.rollerR, DIM.rollerR, KIT.beltHalf * 2 + 0.004, 40); roller.rotateX(Math.PI / 2);
  const shaft = new THREE.CylinderGeometry(0.004, 0.004, DIM.plateZ * 2 + 0.03, 16); shaft.rotateX(Math.PI / 2);
  const rollers = [0, L].map(x => { const g = new THREE.Group(); g.position.set(x, DIM.rollerY, 0); mesh(g, roller, M.alu); mesh(g, shaft, M.steel); kit.add(g); return g; });
  const belt = beltTexture(); const beltMat = new THREE.MeshStandardMaterial({ map: belt, roughness: 0.82, side: THREE.DoubleSide });
  mesh(kit, beltGeometry(), beltMat);
  // 입구 가이드(주황 판 2개, 깔때기 모양).
  for (const side of [-1, 1]) {
    const guide = mesh(kit, new THREE.BoxGeometry(0.17, 0.013, 0.004), M.orange, 0.085, KIT.beltY + 0.0075, side * 0.036); guide.rotation.y = side * 0.13;
    mesh(kit, new THREE.BoxGeometry(0.014, 0.022, 0.016), M.orange, 0.13, KIT.beltY - 0.004, side * 0.05);
  }
  // 적외선 근접센서 브래킷(뒤쪽).
  mesh(kit, new THREE.BoxGeometry(0.02, 0.04, 0.004), M.orange, KIT.irX, KIT.beltY + 0.004, -0.066);
  // 컬러센서 지지대(검정 PLA)와 하우징.
  mesh(kit, new RoundedBoxGeometry(0.014, 0.075, 0.012, 2, 0.0015), M.black, KIT.sensorX, 0.115, -0.074);
  mesh(kit, new RoundedBoxGeometry(0.014, 0.01, 0.084, 2, 0.0015), M.black, KIT.sensorX, 0.152, -0.036);
  const housing = mesh(kit, new RoundedBoxGeometry(0.032, 0.03, 0.032, 3, 0.0025), M.black, KIT.sensorX, 0.133, 0);
  for (const [dx, dz] of [[-0.011, -0.011], [0.011, -0.011], [-0.011, 0.011], [0.011, 0.011]]) mesh(housing, new THREE.CylinderGeometry(0.0016, 0.0016, 0.001, 12), M.steel, dx, 0.0151, dz);
  const pcb = mesh(kit, new THREE.BoxGeometry(0.02, 0.0016, 0.02), M.pcb, KIT.sensorX, 0.1172, 0);
  const ledMat = new THREE.MeshStandardMaterial({ color: '#fffbea', emissive: '#fff4d0', emissiveIntensity: 0.2 });
  for (const [dx, dz] of [[-0.006, -0.006], [0.006, -0.006], [-0.006, 0.006], [0.006, 0.006]]) mesh(pcb, new THREE.BoxGeometry(0.0025, 0.001, 0.0025), ledMat, dx, -0.0012, dz);
  const sensorLight = new THREE.SpotLight('#fff3d6', 0, 0.12, 0.7, 0.6); sensorLight.position.set(KIT.sensorX, 0.115, 0); sensorLight.target.position.set(KIT.sensorX, 0.09, 0); scene.add(sensorLight, sensorLight.target);
  const irDot = mesh(kit, new THREE.SphereGeometry(0.0016, 12, 8), new THREE.MeshStandardMaterial({ color: '#550000', emissive: '#ff2a1a', emissiveIntensity: 0 }), KIT.irX, KIT.beltY + 0.012, -0.072);

  // 분류 상자(투명 아크릴, 색 띠), 위가 열린 5면체.
  const box = (x, z, tint, size = 0.1, h = 0.09) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); kit.add(g); const m = acrylic(tint), t = 0.0025;
    mesh(g, new THREE.BoxGeometry(size, t, size), m, 0, t / 2, 0);
    for (const [w, d, px, pz] of [[size, t, 0, size / 2], [size, t, 0, -size / 2], [t, size, size / 2, 0], [t, size, -size / 2, 0]]) mesh(g, new THREE.BoxGeometry(w, h, d), m, px, h / 2, pz);
    g.traverse(o => { if (o.isMesh) o.castShadow = false; }); return g;
  };
  box(KIT.bins.red.x, KIT.bins.red.z, '#ff4a3d'); box(KIT.bins.yellow.x, KIT.bins.yellow.z, '#ffd23a'); box(KIT.bins.green.x, KIT.bins.green.z, '#3fd36a');

  // 분류 게이트: 서보 받침(주황), 서보·혼(실측 모델), 색 팔(PLA).
  const gates = {};
  for (const [name, gate] of Object.entries(KIT.gates)) {
    const pivot = new THREE.Group(); pivot.position.set(gate.x, KIT.beltY + 0.0015, gate.z); kit.add(pivot);
    mesh(kit, new THREE.BoxGeometry(0.044, 0.006, 0.026), M.orange, gate.x + 0.008, 0.071, gate.z + gate.side * 0.004);
    mesh(kit, new THREE.BoxGeometry(0.044, 0.024, 0.006), M.orange, gate.x + 0.008, 0.08, gate.side * 0.06);
    const arm = new THREE.Group(); pivot.add(arm);
    const paddle = mesh(arm, new THREE.BoxGeometry(KIT.armLength, 0.014, 0.004), name === 'yellow' ? M.yellowPla : M.greenPla, KIT.armLength / 2, 0.009, 0);
    mesh(arm, new THREE.CylinderGeometry(0.006, 0.006, 0.016, 20), name === 'yellow' ? M.yellowPla : M.greenPla, 0, 0.008, 0);
    paddle.userData.part = `${name === 'yellow' ? '노랑' : '초록'} 분류 팔`;
    gates[name] = { pivot, arm, gate };
  }

  // 구동부: 출구 쪽 앞면 기어모터 + 타이밍 풀리·벨트.
  const drive = new THREE.Group(); drive.position.set(L, 0, DIM.plateZ + DIM.plateT / 2); kit.add(drive);
  const motorBody = new THREE.CylinderGeometry(0.0125, 0.0125, 0.034, 32); motorBody.rotateX(Math.PI / 2);
  const gearBox = new THREE.CylinderGeometry(0.0125, 0.0125, 0.02, 32); gearBox.rotateX(Math.PI / 2);
  mesh(drive, motorBody, new THREE.MeshStandardMaterial({ color: '#2a2c2f', metalness: 0.6, roughness: 0.35 }), 0, 0.04, 0.036);
  mesh(drive, gearBox, new THREE.MeshStandardMaterial({ color: '#b9a46c', metalness: 0.85, roughness: 0.3 }), 0, 0.04, 0.009);
  const pulleyGeo = new THREE.CylinderGeometry(0.0072, 0.0072, 0.007, 24); pulleyGeo.rotateX(Math.PI / 2);
  const pulleys = [mesh(drive, pulleyGeo, M.black, 0, 0.04, 0.0035), mesh(drive, pulleyGeo, M.black, 0, DIM.rollerY, 0.0035)];
  for (const p of pulleys) for (let i = 0; i < 6; i++) { const r = mesh(p, new THREE.BoxGeometry(0.0016, 0.012, 0.0072), M.alu, 0, 0, 0); r.rotation.z = i * Math.PI / 3; r.scale.y = 1; }
  const timing = new THREE.CatmullRomCurve3([[0.0075, 0.04], [0.0075, DIM.rollerY], [0, DIM.rollerY + 0.0077], [-0.0075, DIM.rollerY], [-0.0075, 0.04], [0, 0.04 - 0.0077]].map(([x, y]) => new THREE.Vector3(x, y, 0.0035)), true);
  mesh(drive, new THREE.TubeGeometry(timing, 80, 0.0011, 6, true), M.rubber);

  // 제어부: 투명 아크릴 받침 + 황동 스페이서 + Arduino UNO R3(표준 핀 배치로 모델링) + 모터 드라이버, 옆에 400구 브레드보드.
  const board = new THREE.Group(); board.position.set(0.3, 0, 0.3); kit.add(board);
  mesh(board, new THREE.BoxGeometry(0.11, 0.003, 0.085), acrylic('#eef8ff', 0.35), 0, 0.0015, 0).castShadow = false;
  const uno = createArduinoUno(); uno.group.position.set(-UNO_SIZE.w / 2, 0.014, UNO_SIZE.h / 2); board.add(uno.group);
  for (const [hx, hz] of uno.holes) {
    const x = hx - UNO_SIZE.w / 2, z = hz + UNO_SIZE.h / 2;
    mesh(board, new THREE.CylinderGeometry(0.0022, 0.0022, 0.011, 6), M.brass, x, 0.0085, z);
    mesh(board, new THREE.CylinderGeometry(0.0027, 0.0027, 0.0012, 12), M.steel, x, 0.0162, z);
    mesh(board, new THREE.BoxGeometry(0.008, 0.003, 0.008), M.rubber, x, -0.001, z);
  }
  const breadboard = createBreadboard(); breadboard.group.position.set(0.405, 0, 0.3); kit.add(breadboard.group);
  // 모터 드라이버(L9110S형 소형 모듈): 아두이노 핀은 모터 전류를 직접 감당하지 못하므로 드라이버를 거친다.
  const driver = new THREE.Group(); driver.position.set(0.0455, 0.003, 0); board.add(driver);
  mesh(driver, new THREE.BoxGeometry(0.019, 0.0016, 0.026), new THREE.MeshStandardMaterial({ color: '#b3261e', roughness: 0.55 }), 0, 0.0028, 0);
  for (const [x, z] of [[-0.007, -0.011], [0.007, -0.011], [-0.007, 0.011], [0.007, 0.011]]) mesh(driver, new THREE.CylinderGeometry(0.0012, 0.0012, 0.002, 8), M.brass, x, 0.001, z);
  for (const z of [-0.0045, 0.0045]) mesh(driver, new THREE.BoxGeometry(0.004, 0.0012, 0.005), M.black, 0.001, 0.0042, z);
  const terminalMat = new THREE.MeshStandardMaterial({ color: '#2a6fd6', roughness: 0.5 });
  for (const z of [-0.0062, 0.0062]) mesh(driver, new THREE.BoxGeometry(0.0075, 0.0085, 0.0098), terminalMat, 0.0055, 0.0078, z);
  const DRIVER_PINS = { VCC: -0.0038, GND: -0.0013, IA: 0.0013, IB: 0.0038 }; // 드라이버 기준 z
  scene.updateMatrixWorld(true);

  // 배선: 점퍼선 끝의 검정 플러그를 헤더·브레드보드 구멍에 꽂는다. 5V·GND는 브레드보드 전원 레일로 나눠 각 장치에 공급한다.
  const dupont = new THREE.BoxGeometry(0.00254, 0.014, 0.00254);
  /** 구멍(holder 좌표 p) 위에 플러그 하우징을 꽂고, 전선이 나오는 하우징 윗면의 월드 좌표를 돌려준다. */
  const plugAt = (holder, p) => { mesh(holder, dupont, M.black, p.x, p.y + 0.007, p.z); return holder.localToWorld(new THREE.Vector3(p.x, p.y + 0.014, p.z)).toArray(); };
  /** 두 플러그 사이 점퍼선: 각 끝에서 위로 8mm 나온 뒤 둥글게 넘어간다. */
  const jumper = (a, b, color, lift = 0.022) => wire(kit, [a, [a[0], a[1] + 0.008, a[2]], [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + lift, (a[2] + b[2]) / 2], [b[0], b[1] + 0.008, b[2]], b], color);
  const pinOf = name => plugAt(uno.group, uno.pin(name));
  const holeOf = (col, row) => plugAt(breadboard.group, breadboard.hole(col, row));
  /** 장치 케이블 끝 커넥터(여러 핀 일체형 검정 하우징)를 브레드보드 한 행의 연속된 열에 꽂고, 핀별 전선 출구(월드)를 돌려준다. */
  const deviceConnector = (cols, row) => {
    const ps = cols.map(c => breadboard.hole(c, row)), cx = (ps[0].x + ps[ps.length - 1].x) / 2;
    mesh(breadboard.group, new THREE.BoxGeometry(0.00254 * cols.length, 0.014, 0.00254), M.black, cx, ps[0].y + 0.007, ps[0].z);
    return ps.map(p => breadboard.group.localToWorld(new THREE.Vector3(p.x, p.y + 0.014, p.z)).toArray());
  };
  const RED = '#c22a24', BLACK = '#1b1b1b';
  // 아두이노 전원 → 위 레일, 위·아래 레일 연결.
  jumper(pinOf('5V'), holeOf(4, 'top+'), RED, 0.03); jumper(pinOf('GND'), holeOf(5, 'top-'), BLACK, 0.03);
  jumper(holeOf(29, 'top+'), holeOf(29, 'bot+'), RED, 0.012); jumper(holeOf(28, 'top-'), holeOf(28, 'bot-'), BLACK, 0.012);
  /** 장치 하나: 커넥터를 g행에 꽂고 G·V는 아래 레일, 신호선은 아두이노 핀으로 잇는다. 반환값은 장치 케이블 시작점. */
  const device = (cols, signals) => {
    const starts = deviceConnector(cols, 'g');
    jumper(holeOf(cols[0], 'j'), holeOf(cols[0], 'bot-'), BLACK, 0.008); jumper(holeOf(cols[1], 'j'), holeOf(cols[1], 'bot+'), RED, 0.008);
    signals.forEach(([pinName, color], k) => jumper(holeOf(cols[2 + k], 'i'), pinOf(pinName), color, 0.035));
    return starts;
  };
  const servoCable = ['#5a3a22', RED, '#e88a1f'];
  // 서보: 노랑 D9, 초록 D10 (갈색 G · 빨강 V · 주황 신호). 근접센서 D2. 컬러센서(I2C) A4 SDA · A5 SCL.
  bundle(kit, [[0.36, 0.004, 0.25], [0.33, 0.003, 0.12], [0.33, 0.004, 0.07], [0.39, 0.06, 0.07], [gate('yellow')[0] + 0.02, 0.078, gate('yellow')[2] + 0.004]], servoCable, 0.0019, device([3, 4, 5], [['D9', '#e88a1f']]));
  bundle(kit, [[0.37, 0.004, 0.252], [0.31, 0.003, 0.2], [0.3, 0.003, 0.0], [0.54, 0.003, -0.06], [0.535, 0.05, -0.072], [gate('green')[0] + 0.02, 0.078, gate('green')[2] - 0.004]], servoCable, 0.0019, device([8, 9, 10], [['D10', '#7b4fc9']]));
  bundle(kit, [[0.38, 0.004, 0.254], [0.26, 0.003, 0.2], [0.22, 0.003, 0.0], [0.2, 0.003, -0.14], [0.21, 0.08, -0.145], [KIT.irX, 0.112, -0.139]], [BLACK, RED, '#e2c21c'], 0.0016, device([14, 15, 16], [['D2', '#ececec']]));
  bundle(kit, [[0.39, 0.004, 0.256], [0.275, 0.003, 0.2], [0.265, 0.003, 0.0], [0.28, 0.003, -0.09], [KIT.sensorX - 0.004, 0.06, -0.085], [KIT.sensorX - 0.006, 0.14, -0.078]], [BLACK, RED, '#2f6fd1', '#e2c21c'], 0.0016, device([19, 20, 21, 22], [['A4', '#2f6fd1'], ['A5', '#e2c21c']]));
  // 모터 드라이버: VCC·GND는 위 레일, IA ← D5, IB ← D6. 나사 단자 → 모터(빨강·검정).
  const driverPin = z => plugAt(driver, new THREE.Vector3(-0.008, 0.0036, z));
  jumper(driverPin(DRIVER_PINS.VCC), holeOf(1, 'top+'), RED, 0.02); jumper(driverPin(DRIVER_PINS.GND), holeOf(2, 'top-'), BLACK, 0.02);
  jumper(pinOf('D5'), driverPin(DRIVER_PINS.IA), '#e2c21c', 0.03); jumper(pinOf('D6'), driverPin(DRIVER_PINS.IB), '#2fae5a', 0.03);
  const terminals = [-0.0062, 0.0062].map(z => driver.localToWorld(new THREE.Vector3(0.0055, 0.012, z)).toArray());
  bundle(kit, [[0.352, 0.03, 0.262], [0.36, 0.004, 0.258], [0.47, 0.003, 0.255], [0.56, 0.003, 0.19], [0.575, 0.02, 0.125], [L, 0.04, 0.105]], [RED, BLACK], 0.0018, terminals);
  // 전원: 배럴 플러그를 DC 잭에 끝까지 꽂고(보드 바깥 -x로 나옴) 스위치까지 케이블.
  const { jack } = uno, plugGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 20); plugGeo.rotateZ(Math.PI / 2);
  mesh(uno.group, plugGeo, M.rubber, jack.x - 0.011, jack.y, jack.z);
  const at = (x, y, z) => uno.group.localToWorld(new THREE.Vector3(x, y, z)).toArray();
  wire(kit, [at(jack.x - 0.022, jack.y, jack.z), at(jack.x - 0.032, jack.y - 0.004, jack.z), at(jack.x - 0.05, -0.012, jack.z + 0.004), [0.2, 0.003, 0.34], [0.12, 0.003, 0.35], [0.04, 0.004, 0.355]], '#151515', 0.0019);
  mesh(kit, new THREE.BoxGeometry(0.032, 0.012, 0.016), M.rubber, 0.025, 0.006, 0.357).rotation.y = 0.15;
  wire(kit, [[0.008, 0.004, 0.36], [-0.05, 0.003, 0.375], [-0.11, 0.005, 0.4]], '#151515', 0.0019);
  const plug = new THREE.CylinderGeometry(0.0045, 0.0045, 0.024, 20); plug.rotateZ(Math.PI / 2); mesh(kit, plug, M.rubber, -0.123, 0.005, 0.402);

  // 책상 위 여분 블록(사진처럼 앞쪽에 둔 색 블록).
  const cubeGeo = new RoundedBoxGeometry(KIT.half * 2, KIT.half * 2, KIT.half * 2, 3, 0.0022);
  const cubeMat = Object.fromEntries(Object.entries(PALETTE).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, bumpMap: lines, bumpScale: 0.3 })]));
  [['green', 0.04, 0.15, 0.2], ['green', 0.066, 0.165, 0.5], ['red', 0.12, 0.2, 0.1], ['red', 0.12, 0.226, 0.1], ['yellow', 0.035, 0.235, -0.1], ['yellow', 0.062, 0.235, -0.12]].forEach(([c, x, z, r]) => mesh(kit, cubeGeo, cubeMat[c], x, KIT.half, z).rotation.y = r);
  /** 게이트 피벗 좌표 [x,y,z]. */
  function gate(name) { const g = KIT.gates[name]; return [g.x, 0.08, g.z]; }

  // 실측 부품 GLB 불러오기: 서보·혼, 근접센서, 베어링, 2020 프로파일. (보드는 arduino.js에서 직접 모델링)
  const loader = new GLTFLoader(); let loaded = 0; const total = 5;
  const done = () => onStatus(`${++loaded}/${total} 실측 부품 모델 준비 완료`);
  const load = (url, apply) => loader.loadAsync(url).then(g => { const root = g.scene; root.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); apply(root); done(); })
    .catch(error => { onStatus('부품 모델 오류 · 일부 형상 생략'); console.error('키트 부품 로드 실패', url, error); });
  const ready = Promise.all([
    load(servoUrl, root => {
      const top = topCenter(root);
      for (const { gate: g } of Object.values(gates)) { const s = root.clone(); s.position.set(-top.x, -top.y, -top.z); const holder = new THREE.Group(); holder.add(s); holder.position.set(g.x, KIT.beltY - 0.002, g.z); holder.rotation.y = Math.PI / 2; kit.add(holder); }
    }),
    load(hornUrl, root => {
      const top = topCenter(root), b = new THREE.Box3().setFromObject(root), far = b.max.x - top.x > top.x - b.min.x ? 1 : -1;
      for (const { arm } of Object.values(gates)) { const h = root.clone(); h.position.set(-top.x, -top.y + 0.0035, -top.z); const holder = new THREE.Group(); holder.add(h); holder.scale.x = far; arm.add(holder); }
    }),
    load(proxUrl, root => { const b = new THREE.Box3().setFromObject(root), c = b.getCenter(new THREE.Vector3()); root.position.sub(c); const g = new THREE.Group(); g.add(root); g.rotation.x = Math.PI / 2; g.position.set(KIT.irX, KIT.beltY + 0.012, -0.105); kit.add(g); }),
    load(bearingUrl, root => { const b = new THREE.Box3().setFromObject(root), c = b.getCenter(new THREE.Vector3()); root.position.sub(c); for (const x of [0, L]) for (const side of [-1, 1]) { const g = new THREE.Group(); g.add(root.clone()); g.rotation.x = Math.PI / 2; g.position.set(x, DIM.rollerY, side * DIM.plateZ); kit.add(g); } }),
    load(profileUrl, root => {
      const b = new THREE.Box3().setFromObject(root), size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()); root.position.sub(c);
      const place = (x0, x1, z) => { const g = new THREE.Group(); g.add(root.clone()); g.rotation.y = Math.PI / 2; g.scale.set(1, 1, (x1 - x0) / size.z); g.position.set((x0 + x1) / 2, DIM.rollerY, z); g.traverse(o => { if (o.isMesh) o.material = M.alu; }); kit.add(g); };
      place(0, L, -DIM.sideZ); place(0, L, DIM.sideZ); place(0.024, L - 0.024, 0);
    }),
  ]);

  // 움직이는 상자들(상태기계 id별 메시).
  const cubes = new Map();
  /** 상태기계 값을 장면에 반영한다(벨트 텍스처 이동, 풀리 회전, 게이트 각도, 센서 불빛, 상자 위치). */
  function sync(sorter, dt) {
    belt.offset.x -= KIT.speed * dt / 0.05; rollers.forEach(r => r.rotation.z -= KIT.speed * dt / DIM.rollerR); pulleys.forEach(p => p.rotation.z -= KIT.speed * dt / DIM.rollerR);
    for (const [name, g] of Object.entries(gates)) { const d = armDirection(g.gate, sorter.gates[name].k); g.arm.rotation.y = -Math.atan2(d.z, d.x); }
    sensorLight.intensity = sorter.sensorLight * 0.6; ledMat.emissiveIntensity = 0.2 + sorter.sensorLight * 3;
    irDot.material.emissiveIntensity = sorter.ir ? 4 : 0.2;
    const alive = new Set(sorter.cubes.map(c => c.id));
    for (const [id, m] of cubes) if (!alive.has(id)) { kit.remove(m); cubes.delete(id); }
    for (const c of sorter.cubes) {
      let m = cubes.get(c.id); if (!m) { m = mesh(kit, cubeGeo, cubeMat[c.color]); cubes.set(c.id, m); }
      m.position.set(c.x, c.y, c.z); m.rotation.set(c.roll, c.yaw, c.pitch);
    }
  }
  /** 정해 둔 시점으로 카메라를 옮긴다. */
  let activeView = 'overview';
  function view(name) {
    activeView = name;
    const presets = { overview: [[-0.02, 0.56, 0.86], [0.33, 0.05, 0.09]], sensor: [[0.2, 0.22, 0.2], [0.27, 0.1, -0.02]], gates: [[0.3, 0.3, 0.27], [0.46, 0.08, 0]], board: [[0.31, 0.2, 0.47], [0.35, 0.02, 0.3]] };
    const [p, t] = presets[name] || presets.overview; camera.position.fromArray(p); controls.target.fromArray(t);
    // 창이 좁으면(세로형) 같은 범위가 보이도록 카메라를 비율만큼 뒤로 뺀다.
    if (camera.aspect < 1.6) camera.position.sub(controls.target).multiplyScalar(1.6 / Math.max(0.5, camera.aspect)).add(controls.target);
    controls.update();
  }
  const observer = new ResizeObserver(() => { const { width, height } = container.getBoundingClientRect(); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); renderer.setSize(width, height); view(activeView); });
  observer.observe(container); view('overview');
  return { sync, view, ready, render() { controls.update(); renderer.render(scene, camera); }, renderer, camera, controls };
}
