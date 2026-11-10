import { Simulation, GAP } from './simulation.js';
import { UR5E, forward, inverse } from './ur5e.js';

/**
 * 로봇팔 씬의 공정 상태기계. 유입·합류·QR 판독은 기존 Simulation을 그대로 쓰고,
 * AGV 운반(stepAgv) 대신 UR5e 3대가 판독된 상자를 집어 목적지별 출하 컨베이어에 올린다. SW_Browser_Robot_001
 * 좌표: 공정 기준(기존과 같음) x = 메인 컨베이어 진행 방향, y = 높이, z = 폭. 단위 m·초.
 */
export const ROBOT_SCALE = 2.2;      // 상자(0.85 m)에 맞춘 표시·동작 배율. 실제 UR5e 도달 거리 0.85 m × 2.2 = 1.87 m.
export const TOOL_LENGTH = 0.12;      // 진공 그리퍼 길이(로봇 원래 크기 기준, m).
export const BOX = { half: 0.275, topY: 1.565 };  // 상자 반높이, 컨베이어 위 상자 윗면 높이.
export const BELT_SPEED = 0.5;
const LIFT = 0.45;                    // 집기·놓기 전 위쪽 대기 높이(m).
/** 로봇 3대: 목적지 k(공정 regions 순서, 도크 z -7·0·7)를 맡는다. pickX = 메인 연장 컨베이어 정지 위치, place = 출하 컨베이어 시작점, lane = 탑차까지 경로. */
export const STATIONS = [
  { base: { x: 10.5, y: 1.05, z: -1.25 }, yaw: -Math.PI / 2, pickX: 10.5, lane: [{ x: 10.5, z: -2.6 }, { x: 10.5, z: -7 }, { x: 25.8, z: -7 }] },
  { base: { x: 16.5, y: 1.05, z: -0.95 }, yaw: -Math.PI / 2, pickX: 15.6, lane: [{ x: 17.4, z: 0 }, { x: 25.8, z: 0 }] },
  { base: { x: 13.0, y: 1.05, z: 1.25 }, yaw: Math.PI / 2, pickX: 13.0, lane: [{ x: 13.0, z: 2.6 }, { x: 13.0, z: 7 }, { x: 25.8, z: 7 }] },
];
/** 로봇 동작 단계와 시간(초). 목표 자세 이름은 keyframes의 키. */
const PHASES = [
  ['toPick', 'pickAbove', 1.0], ['down', 'pick', 0.45], ['grip', 'pick', 0.3], ['up', 'pickAbove', 0.45],
  ['toPlace', 'placeAbove', 1.3], ['downPlace', 'place', 0.45], ['release', 'place', 0.3], ['upPlace', 'placeAbove', 0.45], ['home', 'home', 0.9],
];
export const ROBOT_STATE_NAMES = { idle: '대기', toPick: '집기 위치로 이동', down: '하강', grip: '흡착', up: '들어 올림', toPlace: '출하 컨베이어로 이동', downPlace: '내려놓기', release: '흡착 해제', upPlace: '상승', home: '대기 자세로 복귀' };

/** 공정 좌표 점 → 로봇 base_link(Z-up, 배율 제거) 좌표. */
export function toRobot(station, p) {
  const dx = (p.x - station.base.x) / ROBOT_SCALE, dy = (p.y - station.base.y) / ROBOT_SCALE, dz = (p.z - station.base.z) / ROBOT_SCALE;
  const c = Math.cos(-station.yaw), s = Math.sin(-station.yaw), lx = dx * c + dz * s, lz = -dx * s + dz * c;
  return [lx, -lz, dy];
}
/** 로봇 base_link 좌표 → 공정 좌표. */
export function fromRobot(station, [x, y, z]) {
  const lx = x * ROBOT_SCALE, ly = z * ROBOT_SCALE, lz = -y * ROBOT_SCALE, c = Math.cos(station.yaw), s = Math.sin(station.yaw);
  return { x: station.base.x + lx * c + lz * s, y: station.base.y + ly, z: station.base.z - lx * s + lz * c };
}
/** 목표 점을 향하도록 어깨 회전을 맞춘 홈 자세(역기구학 시작값). 홈 자세 공구 끝은 base x축에서 약 15°(atan2(0.1333, 0.4919)) 옆에 있다. */
const seedToward = ([x, y]) => { const q = [...UR5E.home]; q[0] = Math.atan2(y, x) - Math.atan2(0.1333, 0.4919); return q; };
/** 스테이션별 핵심 자세(관절각)를 한 번 계산해 둔다. 실패하면 오류를 던져 잘못된 배치를 바로 드러낸다. */
export const KEYFRAMES = STATIONS.map((st, i) => {
  const solve = (p, seed) => { const r = inverse(toRobot(st, p), seed, TOOL_LENGTH); if (r.error > 0.001) throw new Error(`로봇 ${i + 1} 역기구학 실패(${r.error.toFixed(4)} m)`); return r.q; };
  const pickP = { x: st.pickX, y: BOX.topY, z: 0 }, placeP = { x: st.lane[0].x, y: BOX.topY, z: st.lane[0].z };
  const pickAbove = solve({ ...pickP, y: pickP.y + LIFT }, seedToward(toRobot(st, pickP)));
  const pick = solve(pickP, pickAbove);
  const placeAbove = solve({ ...placeP, y: placeP.y + LIFT }, seedToward(toRobot(st, placeP)));
  const place = solve(placeP, placeAbove);
  const home = seedToward(toRobot(st, { x: (pickP.x + placeP.x) / 2, y: BOX.topY, z: (pickP.z + placeP.z) / 2 }));
  return { home, pickAbove, pick, placeAbove, place };
});
/** 출하 경로 길이. */
const laneLength = lane => lane.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - lane[i].x, p.z - lane[i].z), 0);
/** 경로 시작에서 거리 s인 점. */
function alongLane(lane, s) {
  for (let i = 1; i < lane.length; i++) {
    const a = lane[i - 1], b = lane[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (s <= len || i === lane.length - 1) { const t = Math.min(1, s / len); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }
    s -= len;
  }
  return lane[lane.length - 1];
}
const smooth = t => t * t * (3 - 2 * t);

export class RobotSimulation extends Simulation {
  /** @param {{decode: Function, random?: Function, regions?: string[]}} options 기존 Simulation과 같다(AGV 대수는 쓰지 않음). */
  constructor(options) { super({ ...options, agvCount: 1 }); }
  /** 기존 상태 초기화 + 로봇 3대를 대기 자세로. */
  reset() {
    super.reset();
    this.robots = STATIONS.map((st, k) => ({ id: k, dock: k, state: 'idle', t: 0, box: null, from: [...KEYFRAMES[k].home], q: [...KEYFRAMES[k].home] }));
  }
  /** AGV 단계 대신 실행: 판독 완료 상자 연장 이송 → 로봇 집기·놓기 → 출하 컨베이어 → 탑차 적재. */
  stepAgv(dt) {
    for (const b of this.boxes) if (b.state === 'waiting') { b.state = 'post'; b.dock = this.regions.indexOf(b.read); this.log(`#${b.id} 로봇 ${b.dock + 1} 쪽으로 이송`); }
    // 메인 연장 컨베이어(z=0, x 8→): 앞 상자와 간격을 지키며 자기 로봇 정지 위치까지.
    const line = this.boxes.filter(b => ['post', 'pickwait'].includes(b.state)).sort((a, b) => b.x - a.x);
    line.forEach((b, i) => {
      if (b.state !== 'post') return;
      const stop = STATIONS[b.dock].pickX, ahead = i ? line[i - 1].x - GAP : Infinity;
      b.x = Math.min(b.x + BELT_SPEED * dt, stop, ahead);
      if (b.x >= stop) { b.state = 'pickwait'; }
    });
    for (const r of this.robots) this.stepRobot(r, dt);
    // 출하 컨베이어: 같은 경로의 앞 상자와 간격 유지, 끝(탑차 안)에 닿으면 적재 집계 후 제거.
    for (let k = 0; k < 3; k++) {
      const lane = STATIONS[k].lane, len = laneLength(lane);
      const onLane = this.boxes.filter(b => b.state === 'lane' && b.dock === k).sort((a, b) => b.s - a.s);
      onLane.forEach((b, i) => {
        b.s = Math.min(b.s + BELT_SPEED * dt, i ? onLane[i - 1].s - GAP : Infinity);
        const p = alongLane(lane, b.s); b.x = p.x; b.z = p.z;
        if (b.s >= len) { this.delivered[k]++; b.state = 'shipped'; this.log(`#${b.id} ${b.read} 탑차 적재`); }
      });
    }
    this.boxes = this.boxes.filter(b => b.state !== 'shipped');
  }
  /** 로봇 한 대의 단계를 진행한다. 관절각은 단계 시작 자세에서 목표 자세로 부드럽게 보간한다. */
  stepRobot(r, dt) {
    const keys = KEYFRAMES[r.id];
    if (r.state === 'idle') {
      const box = this.boxes.find(b => b.state === 'pickwait' && b.dock === r.id);
      if (!box) return;
      r.box = box; this.begin(r, 0); return;
    }
    const index = PHASES.findIndex(p => p[0] === r.state), [, target, duration] = PHASES[index];
    // 놓기 직전 출하 컨베이어 시작점이 비어 있지 않으면 위에서 기다린다.
    if (r.state === 'downPlace' && r.t === 0 && this.boxes.some(b => b.state === 'lane' && b.dock === r.id && b.s < GAP)) return;
    r.t = Math.min(duration, r.t + dt);
    const k = smooth(r.t / duration); r.q = r.from.map((v, i) => v + (keys[target][i] - v) * k);
    if (r.box && r.box.state === 'carried') this.holdBox(r);
    if (r.t < duration) return;
    if (r.state === 'grip') { r.box.state = 'carried'; this.log(`#${r.box.id} 로봇 ${r.id + 1} 흡착`); }
    if (r.state === 'release') { r.box.state = 'lane'; r.box.s = 0; r.box.y = undefined; r.box = null; }
    if (index + 1 < PHASES.length) this.begin(r, index + 1); else { r.state = 'idle'; r.t = 0; }
  }
  /** 단계를 시작한다(현재 관절각을 보간 시작점으로 저장). */
  begin(r, index) { r.state = PHASES[index][0]; r.t = 0; r.from = [...r.q]; }
  /** 흡착 중인 상자를 공구 끝 아래에 매단다(상자 윗면 = 공구 끝). */
  holdBox(r) {
    const p = fromRobot(STATIONS[r.id], forward(r.q, TOOL_LENGTH).tcp);
    r.box.x = p.x; r.box.z = p.z; r.box.y = p.y - BOX.half;
  }
}
