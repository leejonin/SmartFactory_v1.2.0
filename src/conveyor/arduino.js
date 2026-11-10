import * as THREE from 'three';

/**
 * Arduino UNO R3 보드와 400구 브레드보드를 실측 치수로 만든다(단위 m). SW_Browser_ConveyorKit_001
 * UNO 좌표(보드 기준): 원점 = 기판 왼쪽 아래 모서리(USB·DC 잭 쪽), x = 오른쪽, y = 위(두께), z = -(기판 세로).
 * 핀 좌표는 UNO R3 표준 배치(인치)를 따른다: 위쪽 헤더 y=2.0", 아래쪽 헤더 y=0.1", 핀 간격 0.1",
 * D7(1.9")과 D8(1.74") 사이 0.16" 어긋남.
 */
const IN = 0.0254;
export const UNO_SIZE = { w: 2.7 * IN, h: 2.1 * IN, pcb: 0.0016, header: 0.0085 };
const DIGITAL_X = { 0: 2.6, 1: 2.5, 2: 2.4, 3: 2.3, 4: 2.2, 5: 2.1, 6: 2.0, 7: 1.9, 8: 1.74, 9: 1.64, 10: 1.54, 11: 1.44, 12: 1.34, 13: 1.24, GND: 1.14, AREF: 1.04, SDA: 0.94, SCL: 0.84 };
const POWER_X = { NC: 1.1, IOREF: 1.2, RESET: 1.3, '3V3': 1.4, '5V': 1.5, GND: 1.6, GND2: 1.7, VIN: 1.8 };
const ANALOG_X = { A0: 2.0, A1: 2.1, A2: 2.2, A3: 2.3, A4: 2.4, A5: 2.5 };
const HOLES = [[0.55, 0.1], [0.6, 2.0], [2.6, 1.4], [2.6, 0.3]];

/** 메시를 만들어 그림자 설정과 함께 부모에 붙인다. */
function part(parent, geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
const std = (color, roughness = 0.5, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** UNO 기판 외곽(오른쪽 위·아래 모서리 모따기)과 고정 구멍 4개. */
function outline() {
  const { w, h } = UNO_SIZE, s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(w - 0.001, 0); s.lineTo(w, 0.001); s.lineTo(w, h - 0.0025); s.lineTo(w - 0.0025, h); s.lineTo(0, h); s.closePath();
  for (const [x, y] of HOLES) { const p = new THREE.Path(); p.absarc(x * IN, y * IN, 0.0016, 0, Math.PI * 2, true); s.holes.push(p); }
  return s;
}
/** 기판 윗면 실크 인쇄(글자·로고·헤더 라벨·구멍 테두리)를 투명 캔버스에 그린다. 20 px = 1 mm. */
function silkscreen() {
  const K = 20, W = Math.round(UNO_SIZE.w * 1000 * K), H = Math.round(UNO_SIZE.h * 1000 * K);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const c = canvas.getContext('2d');
  const px = inch => inch * 25.4 * K, py = inch => H - inch * 25.4 * K; // 인치 → 캔버스(위가 y=2.1")
  c.fillStyle = '#f4f8fb'; c.strokeStyle = '#f4f8fb'; c.textBaseline = 'middle';
  const text = (t, x, y, size, rotate = 0, align = 'center', weight = 600) => { c.save(); c.translate(x, y); c.rotate(rotate); c.font = `${weight} ${size}px Arial, sans-serif`; c.textAlign = align; c.fillText(t, 0, 0); c.restore(); };
  // 위쪽 헤더 라벨(세로 글씨, 헤더 아래쪽에 위에서 아래로)
  const top = { AREF: 'AREF', GND: 'GND', 13: '13', 12: '12', 11: '~11', 10: '~10', 9: '~9', 8: '8', 7: '7', 6: '~6', 5: '~5', 4: '4', 3: '~3', 2: '2', 1: 'TX→1', 0: 'RX←0' };
  for (const [k, t] of Object.entries(top)) text(t, px(DIGITAL_X[k]), py(1.88), 34, -Math.PI / 2, 'right');
  c.lineWidth = 5; c.beginPath(); c.moveTo(px(1.15), py(1.62)); c.lineTo(px(2.68), py(1.62)); c.stroke();
  text('DIGITAL (PWM~)', px(2.3), py(1.69), 46, 0, 'center', 700);
  const bottom = { IOREF: 'IOREF', RESET: 'RESET', '3V3': '3.3V', '5V': '5V', GND: 'GND', GND2: 'GND', VIN: 'Vin' };
  for (const [k, t] of Object.entries(bottom)) text(t, px(POWER_X[k]), py(0.24), 32, -Math.PI / 2, 'left');
  for (const [k] of Object.entries(ANALOG_X)) text(k, px(ANALOG_X[k]), py(0.24), 34, -Math.PI / 2, 'left');
  c.beginPath(); c.moveTo(px(1.15), py(0.58)); c.lineTo(px(1.85), py(0.58)); c.moveTo(px(1.93), py(0.58)); c.lineTo(px(2.6), py(0.58)); c.stroke();
  text('POWER', px(1.5), py(0.52), 44, 0, 'center', 700); text('ANALOG IN', px(2.25), py(0.52), 44, 0, 'center', 700);
  // 로고(∞ 안에 −·+)와 ARDUINO, UNO 테두리
  const lx = px(1.43), ly = py(1.5);
  c.lineWidth = 16; for (const dx of [-62, 62]) { c.beginPath(); c.arc(lx + dx, ly, 52, 0, Math.PI * 2); c.stroke(); }
  c.lineWidth = 12; c.beginPath(); c.moveTo(lx - 86, ly); c.lineTo(lx - 38, ly); c.moveTo(lx + 38, ly); c.lineTo(lx + 86, ly); c.moveTo(lx + 62, ly - 24); c.lineTo(lx + 62, ly + 24); c.stroke();
  text('ARDUINO', lx, ly + 92, 60, 0, 'center', 800);
  c.lineWidth = 5; c.setLineDash([10, 7]); c.beginPath(); c.roundRect(px(1.9), py(1.56), px(0.6), px(0.27), 60); c.stroke(); c.setLineDash([]);
  text('UNO', px(2.2), py(1.425), 104, 0, 'center', 400);
  text('L', px(0.98), py(1.62), 34); text('TX', px(1.0), py(1.37), 30); text('RX', px(1.0), py(1.27), 30); text('ON', px(2.62), py(1.39), 30, 0, 'left');
  // 고정 구멍 테두리(도금 링)
  c.lineWidth = 22; c.strokeStyle = '#e9edf0'; for (const [x, y] of HOLES) { c.beginPath(); c.arc(px(x), py(y), 2.2 * K, 0, Math.PI * 2); c.stroke(); }
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/** Arduino UNO R3를 만든다.
 * @returns {{group: THREE.Group, pin: (name: string) => THREE.Vector3, jack: {x:number,y:number,z:number}, holes: number[][]}}
 *   pin(name): 'D0'~'D13'·'GND_TOP'·'AREF'·'5V'·'GND'·'VIN'·'A0'~'A5' 등 헤더 구멍 윗면의 보드 좌표(m).
 *   jack: DC 잭 입구 중심(보드 좌표). holes: 고정 구멍 중심 [x, z](보드 좌표).
 */
export function createArduinoUno() {
  const group = new THREE.Group(), { w, h, pcb, header } = UNO_SIZE;
  const black = std('#1b1d20', 0.6), silver = std('#c9ced3', 0.28, 0.9), dark = std('#2a2d31', 0.45, 0.2);
  const board = new THREE.ExtrudeGeometry(outline(), { depth: pcb, bevelEnabled: false, curveSegments: 20 }); board.rotateX(-Math.PI / 2);
  part(group, board, std('#123f6b', 0.6), 0, 0, 0);
  const silk = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: silkscreen(), transparent: true, roughness: 0.6, depthWrite: false }));
  silk.rotation.x = -Math.PI / 2; silk.position.set(w / 2, pcb + 0.00005, -h / 2); group.add(silk);
  // 암 헤더(검정 플라스틱, 높이 8.5mm) + 윗면 구멍(어두운 사각).
  const holeGeo = new THREE.BoxGeometry(0.0011, 0.0002, 0.0011), holeMat = std('#050505', 0.9);
  const headerRow = (xs, yIn) => {
    const x0 = Math.min(...xs) * IN - 0.00127, x1 = Math.max(...xs) * IN + 0.00127;
    part(group, new THREE.BoxGeometry(x1 - x0, header, 0.00254), black, (x0 + x1) / 2, pcb + header / 2, -yIn * IN);
    for (const x of xs) part(group, holeGeo, holeMat, x * IN, pcb + header + 0.00005, -yIn * IN);
  };
  headerRow([0, 1, 2, 3, 4, 5, 6, 7].map(k => DIGITAL_X[k]), 2.0);
  headerRow([8, 9, 10, 11, 12, 13, 'GND', 'AREF', 'SDA', 'SCL'].map(k => DIGITAL_X[k]), 2.0);
  headerRow(Object.values(POWER_X), 0.1); headerRow(Object.values(ANALOG_X), 0.1);
  // USB-B(은색, 왼쪽으로 6mm 돌출)와 DC 잭(검정).
  part(group, new THREE.BoxGeometry(0.016, 0.0109, 0.012), silver, 0.0017, pcb + 0.00545, -1.5 * IN);
  part(group, new THREE.BoxGeometry(0.0012, 0.0075, 0.0082), dark, -0.0062, pcb + 0.0055, -1.5 * IN);
  part(group, new THREE.BoxGeometry(0.0138, 0.011, 0.009), black, 0.0051, pcb + 0.0055, -0.33 * IN);
  const bore = new THREE.CylinderGeometry(0.003, 0.003, 0.0006, 20); bore.rotateZ(Math.PI / 2);
  part(group, bore, std('#000000', 0.9), -0.0019, pcb + 0.0058, -0.33 * IN);
  // 리셋 버튼, 크리스털, 전해 콘덴서 2개, 레귤레이터, USB 변환 칩, ATmega328P(DIP-28).
  part(group, new THREE.BoxGeometry(0.006, 0.0032, 0.006), silver, 0.25 * IN, pcb + 0.0016, -1.92 * IN);
  part(group, new THREE.CylinderGeometry(0.0017, 0.0017, 0.0016, 20), std('#b5322a', 0.5), 0.25 * IN, pcb + 0.004, -1.92 * IN);
  const xtal = new THREE.CapsuleGeometry(0.0021, 0.0068, 4, 12); xtal.rotateZ(Math.PI / 2); xtal.scale(1, 0.7, 1);
  part(group, xtal, silver, 0.98 * IN, pcb + 0.0016, -1.13 * IN);
  for (const x of [0.97, 1.17]) {
    part(group, new THREE.CylinderGeometry(0.0032, 0.0032, 0.0075, 24), std('#d9dde0', 0.3, 0.7), x * IN, pcb + 0.00375, -0.32 * IN);
    const cap = new THREE.CylinderGeometry(0.00322, 0.00322, 0.0002, 24, 1, false, 0, Math.PI); part(group, cap, black, x * IN, pcb + 0.0076, -0.32 * IN).rotation.y = Math.PI / 2;
  }
  part(group, new THREE.BoxGeometry(0.0065, 0.0016, 0.0035), black, 0.6 * IN, pcb + 0.0008, -0.68 * IN);
  part(group, new THREE.BoxGeometry(0.0065, 0.0003, 0.003), silver, 0.6 * IN - 0.0042, pcb + 0.00015, -0.68 * IN);
  part(group, new THREE.BoxGeometry(0.005, 0.001, 0.005), black, 0.95 * IN, pcb + 0.0005, -1.45 * IN);
  part(group, new THREE.BoxGeometry(0.0035, 0.0009, 0.0035), black, 0.92 * IN, pcb + 0.00045, -0.85 * IN);
  const chip = part(group, new THREE.BoxGeometry(0.0356, 0.0036, 0.0075), std('#16181a', 0.5), 2.07 * IN, pcb + 0.0021, -0.83 * IN);
  for (const dx of [-0.0142, 0.0142]) part(chip, new THREE.CylinderGeometry(0.0009, 0.0009, 0.0002, 16), std('#2b2e32', 0.7), dx, 0.0018, 0);
  const leg = new THREE.BoxGeometry(0.0005, 0.0026, 0.0012);
  for (let i = 0; i < 14; i++) for (const s of [-1, 1]) part(group, leg, silver, 2.07 * IN - 0.0165 + i * 0.00254, pcb + 0.0012, -0.83 * IN + s * 0.0042);
  // LED(L·TX·RX 주황/노랑, ON 초록).
  const led = (x, y, color) => part(group, new THREE.BoxGeometry(0.0016, 0.0006, 0.0008), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }), x * IN, pcb + 0.0003, -y * IN);
  led(1.05, 1.62, '#ffb347'); led(1.08, 1.37, '#ffe08a'); led(1.08, 1.27, '#ffe08a'); led(2.55, 1.39, '#43e06a');

  const pin = name => {
    const top = pcb + header;
    if (name === 'GND_TOP') return new THREE.Vector3(DIGITAL_X.GND * IN, top, -2.0 * IN);
    if (/^D\d+$/.test(name)) return new THREE.Vector3(DIGITAL_X[name.slice(1)] * IN, top, -2.0 * IN);
    if (name in DIGITAL_X) return new THREE.Vector3(DIGITAL_X[name] * IN, top, -2.0 * IN);
    if (name in POWER_X) return new THREE.Vector3(POWER_X[name] * IN, top, -0.1 * IN);
    if (name in ANALOG_X) return new THREE.Vector3(ANALOG_X[name] * IN, top, -0.1 * IN);
    throw new Error(`알 수 없는 UNO 핀: ${name}`);
  };
  return { group, pin, jack: { x: -0.0019, y: pcb + 0.0058, z: -0.33 * IN }, holes: HOLES.map(([x, y]) => [x * IN, -y * IN]) };
}

/** 400구 브레드보드(82.5 × 54.5 × 8.5 mm). 열 1~30 × 행 a~j, 위·아래 전원 레일(+빨강·−파랑).
 * 좌표(보드 중심 기준): x = 열 방향, z = +가 j·아래 레일 쪽.
 * @returns {{group: THREE.Group, hole: (col: number, row: string) => THREE.Vector3}}
 *   row: 'a'~'j' 또는 'top+'·'top-'·'bot+'·'bot-'. 반환값은 구멍 윗면의 브레드보드 좌표(m).
 */
export function createBreadboard() {
  const group = new THREE.Group(), W = 0.0825, D = 0.0545, H = 0.0085, P = 0.00254;
  const rowsZ = { a: -5.5, b: -4.5, c: -3.5, d: -2.5, e: -1.5, f: 1.5, g: 2.5, h: 3.5, i: 4.5, j: 5.5, 'top-': -8.5, 'top+': -7.5, 'bot+': 7.5, 'bot-': 8.5 };
  const colX = col => (col - 15.5) * P;
  const K = 16, cw = Math.round(W * 1000 * K), ch = Math.round(D * 1000 * K);
  const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch; const c = canvas.getContext('2d');
  c.fillStyle = '#f3f2ee'; c.fillRect(0, 0, cw, ch);
  const cx = x => (x + W / 2) * 1000 * K, cz = z => (z + D / 2) * 1000 * K;
  c.fillStyle = '#d9d7d0'; c.fillRect(0, cz(-0.0011), cw, 0.0022 * 1000 * K);
  for (const [z, color] of [[-9.6, '#2f62c9'], [-6.4, '#d23b2f'], [6.4, '#d23b2f'], [9.6, '#2f62c9']]) { c.fillStyle = color; c.fillRect(cx(-0.037), cz(z * P) - 4, 0.074 * 1000 * K, 8); }
  c.fillStyle = '#3a3b3d';
  for (const [row, zr] of Object.entries(rowsZ)) for (let col = 1; col <= 30; col++) {
    if (row.length > 1 && col % 6 === 0) continue;
    const s = 0.0011 * 1000 * K; c.fillRect(cx(colX(col)) - s / 2, cz(zr * P) - s / 2, s, s);
  }
  c.font = '600 22px Arial'; c.fillStyle = '#8a8983'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let col = 1; col <= 30; col += 5) c.fillText(String(col), cx(colX(col)), cz(-6.6 * P));
  const top = new THREE.CanvasTexture(canvas); top.colorSpace = THREE.SRGBColorSpace; top.anisotropy = 8;
  const side = std('#ecebe6', 0.7);
  part(group, new THREE.BoxGeometry(W, H, D), [side, side, new THREE.MeshStandardMaterial({ map: top, roughness: 0.7 }), side, side, side], 0, H / 2, 0);
  const hole = (col, row) => {
    if (!(row in rowsZ)) throw new Error(`알 수 없는 브레드보드 행: ${row}`);
    return new THREE.Vector3(colX(col), H, rowsZ[row] * P);
  };
  return { group, hole };
}
