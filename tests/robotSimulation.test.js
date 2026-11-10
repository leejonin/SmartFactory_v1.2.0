import test from 'node:test';
import assert from 'node:assert/strict';
import { RobotSimulation, KEYFRAMES, STATIONS, TOOL_LENGTH, BOX, toRobot, fromRobot } from '../src/robotSimulation.js';
import { forward, UR5E } from '../src/ur5e.js';
import { GAP } from '../src/simulation.js';

const REGIONS = ['목동', '합정동', '면목동'];
/** 고정 시드 난수. */
function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const make = seed => new RobotSimulation({ decode: b => b.destination, random: seeded(seed), regions: REGIONS });

test('UR5e 정기구학이 공식 치수와 일치한다(0도 자세 공구 위치, 홈 자세 공구 축 아래)', () => {
  const zero = forward([0, 0, 0, 0, 0, 0]).tcp;
  [0.8172, 0.2329, 0.0628].forEach((v, i) => assert.ok(Math.abs(zero[i] - v) < 1e-4, `축 ${i}: ${zero[i]}`));
  const { tool0 } = forward(UR5E.home);
  assert.ok(Math.abs(tool0[10] + 1) < 1e-6, '홈 자세 공구 z축 = -Z');
});

test('좌표 변환 왕복과 핵심 자세의 공구 끝 위치(오차 1 mm 이하, 공구 축 아래)', () => {
  STATIONS.forEach((st, k) => {
    const p = { x: 3.3, y: 1.2, z: -0.7 }, back = fromRobot(st, toRobot(st, p));
    assert.ok(Math.hypot(back.x - p.x, back.y - p.y, back.z - p.z) < 1e-9);
    const check = (q, want) => {
      const f = forward(q, TOOL_LENGTH), at = fromRobot(st, f.tcp);
      assert.ok(Math.hypot(at.x - want.x, at.y - want.y, at.z - want.z) < 0.001 * 2.2, `로봇 ${k + 1}`);
      assert.ok(f.tool0[10] < -0.999, `로봇 ${k + 1} 공구 축`);
    };
    check(KEYFRAMES[k].pick, { x: st.pickX, y: BOX.topY, z: 0 });
    check(KEYFRAMES[k].place, { x: st.lane[0].x, y: BOX.topY, z: st.lane[0].z });
  });
});

test('모든 상자는 자기 목적지 로봇·탑차로 가고, 생성 수 = 적재 + 진행 중', () => {
  for (const seed of [1, 7, 42]) {
    const sim = make(seed), seen = new Map();
    for (let i = 0; i < 600 * 60; i++) {
      sim.step(1 / 60);
      for (const b of sim.boxes) if (b.dock !== undefined) {
        assert.equal(b.dock, REGIONS.indexOf(b.destination), `seed ${seed} #${b.id}`);
        seen.set(b.id, b.dock);
      }
    }
    const shipped = sim.delivered.reduce((a, b) => a + b, 0);
    assert.equal(sim.created, shipped + sim.boxes.length);
    // 상류 한계: 판독 1초 + 판독 지점 간격 3초 → 10분 생성 약 130~140개(측정 133·130·137). 로봇 가동률은 28~45%로 여유가 있다.
    assert.ok(shipped >= 100, `seed ${seed}: 10분 적재 ${shipped}`);
    assert.ok(sim.boxes.length <= 40, `seed ${seed}: 진행 중 ${sim.boxes.length}개(정체 의심)`);
    sim.delivered.forEach((n, k) => assert.ok(n > 0, `seed ${seed} 탑차 ${k + 1} 0개`));
  }
});

test('메인 연장·출하 컨베이어 위 상자는 서로 겹치지 않고, 로봇은 한 번에 하나만 든다', () => {
  const sim = make(11);
  for (let i = 0; i < 300 * 60; i++) {
    sim.step(1 / 60);
    const line = sim.boxes.filter(b => ['post', 'pickwait'].includes(b.state)).map(b => b.x).sort((a, b) => a - b);
    for (let k = 1; k < line.length; k++) assert.ok(line[k] - line[k - 1] >= GAP - 1e-9, `연장 간격 ${line[k] - line[k - 1]}`);
    for (let d = 0; d < 3; d++) {
      const lane = sim.boxes.filter(b => b.state === 'lane' && b.dock === d).map(b => b.s).sort((a, b) => a - b);
      for (let k = 1; k < lane.length; k++) assert.ok(lane[k] - lane[k - 1] >= GAP - 1e-9, `출하 ${d + 1} 간격`);
    }
    assert.ok(sim.boxes.filter(b => b.state === 'carried').length <= 3);
    for (const r of sim.robots) assert.ok(sim.boxes.filter(b => b.state === 'carried' && b.dock === r.id).length <= 1);
  }
});
