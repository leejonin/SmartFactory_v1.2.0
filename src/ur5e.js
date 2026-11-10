/**
 * UR5e 협동로봇 기구학(3D와 분리된 순수 계산). SW_Browser_Robot_001
 * 치수는 Universal_Robots_ROS2_Description(BSD-3) config/ur5e/default_kinematics.yaml·visual_parameters.yaml과
 * urdf/ur_macro.xacro의 관절 체인을 그대로 옮겼다. 좌표: URDF base_link 기준 Z-up, 단위 m, 각도 rad.
 * 체인: base_link →(rpy 0 0 π) base_link_inertia → 관절 6개(각 관절은 원점 변환 후 z축 회전) → flange → tool0.
 */

/** URDF rpy(roll·pitch·yaw)와 위치로 4×4 변환(열 우선 배열 대신 행 우선 [16])을 만든다. R = Rz(yaw)·Ry(pitch)·Rx(roll). */
export function originMatrix([x, y, z], [r, p, w]) {
  const cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p), cy = Math.cos(w), sy = Math.sin(w);
  return [
    cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, x,
    sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, y,
    -sp, cp * sr, cp * cr, z,
    0, 0, 0, 1,
  ];
}
/** 4×4 행렬 곱 a·b. */
export function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[i * 4 + k] * b[k * 4 + j]; out[i * 4 + j] = s; }
  return out;
}
/** z축 회전 행렬. */
const rotZ = q => originMatrix([0, 0, 0], [0, 0, q]);
const PI = Math.PI;

/** 관절 원점(부모 링크 기준)과 링크별 외형 메시 오프셋. 이름은 URDF 링크 이름을 따른다. */
export const UR5E = {
  base: { origin: originMatrix([0, 0, 0], [0, 0, PI]), mesh: { file: 'base', xyz: [0, 0, 0], rpy: [0, 0, PI] } },
  joints: [
    { name: 'shoulder_pan', origin: originMatrix([0, 0, 0.1625], [0, 0, 0]), mesh: { file: 'shoulder', xyz: [0, 0, 0], rpy: [0, 0, PI] } },
    { name: 'shoulder_lift', origin: originMatrix([0, 0, 0], [1.570796327, 0, 0]), mesh: { file: 'upperarm', xyz: [0, 0, 0.138], rpy: [PI / 2, 0, -PI / 2] } },
    { name: 'elbow', origin: originMatrix([-0.425, 0, 0], [0, 0, 0]), mesh: { file: 'forearm', xyz: [0, 0, 0.007], rpy: [PI / 2, 0, -PI / 2] } },
    { name: 'wrist_1', origin: originMatrix([-0.3922, 0, 0.1333], [0, 0, 0]), mesh: { file: 'wrist1', xyz: [0, 0, -0.127], rpy: [PI / 2, 0, 0] } },
    { name: 'wrist_2', origin: originMatrix([0, -0.0997, -2.044881182297852e-11], [1.570796327, 0, 0]), mesh: { file: 'wrist2', xyz: [0, 0, -0.0997], rpy: [0, 0, 0] } },
    { name: 'wrist_3', origin: originMatrix([0, 0.0996, -2.042830148012698e-11], [1.570796326589793, PI, PI]), mesh: { file: 'wrist3', xyz: [0, -0.0005, -0.0989], rpy: [PI / 2, 0, 0] } },
  ],
  /** wrist_3_link → flange → tool0(공구 좌표, z축이 공구 방향). */
  tool0: multiply(originMatrix([0, 0, 0], [0, -PI / 2, -PI / 2]), originMatrix([0, 0, 0], [PI / 2, 0, PI / 2])),
  /** 정격 도달 거리(m)·관절 한계(±2π, 팔꿈치 ±π). */
  reach: 0.85,
  /** 대기 자세(UR 기본 '홈': 공구가 아래를 향함). */
  home: [0, -PI / 2, PI / 2, -PI / 2, -PI / 2, 0],
};

/** 정기구학: 각 링크 좌표계와 tool0, 공구 끝(tcp, tool0에서 공구 길이만큼)을 base_link 기준으로 계산한다.
 * @param {number[]} q 관절각 6개. @param {number} [toolLength=0] tool0 z축 방향 공구 길이(m).
 * @returns {{links: number[][], tool0: number[], tcp: number[]}} links[0]=base_link_inertia, links[1..6]=shoulder~wrist_3.
 */
export function forward(q, toolLength = 0) {
  const links = []; let m = UR5E.base.origin; links.push(m);
  UR5E.joints.forEach((j, i) => { m = multiply(multiply(m, j.origin), rotZ(q[i])); links.push(m); });
  const tool0 = multiply(m, UR5E.tool0);
  const tcp = [tool0[3] + tool0[2] * toolLength, tool0[7] + tool0[6] * toolLength, tool0[11] + tool0[10] * toolLength];
  return { links, tool0, tcp };
}

/** 역기구학(감쇠 최소자승 반복): 공구 끝을 목표 위치로 보내고 공구 축을 아래(-z)로 향하게 한다.
 * 공구 축 주위 회전은 자유로 두어 손목이 자연스러운 자세를 고르게 한다.
 * @param {number[]} target 목표 공구 끝 위치 [x,y,z](base_link 기준, m). @param {number[]} seed 시작 관절각.
 * @param {number} [toolLength=0] 공구 길이. @returns {{q: number[], error: number}} 관절각과 남은 위치 오차(m).
 */
export function inverse(target, seed = UR5E.home, toolLength = 0) {
  const q = [...seed];
  const residual = qq => {
    const { tool0, tcp } = forward(qq, toolLength), zAxis = [tool0[2], tool0[6], tool0[10]];
    // 위치 오차 3개 + 공구 축 z와 목표 축 (0,0,-1)의 외적(z × t = (-z_y, z_x, 0)). 자세 항은 0.3배 가중.
    return [target[0] - tcp[0], target[1] - tcp[1], target[2] - tcp[2], -zAxis[1] * 0.3, zAxis[0] * 0.3, 0];
  };
  for (let iter = 0; iter < 200; iter++) {
    const r = residual(q); const err = Math.hypot(r[0], r[1], r[2]) + Math.hypot(r[3], r[4]);
    if (err < 1e-5) break;
    const J = [], h = 1e-6;
    for (let k = 0; k < 6; k++) { const qq = [...q]; qq[k] += h; const rk = residual(qq); J.push(rk.map((v, i) => (r[i] - v) / h)); } // J[k] = ∂(-r)/∂q_k
    // (JᵀJ + λ²I) Δq = Jᵀ r
    const lambda = 0.02, A = Array.from({ length: 6 }, (_, a) => Array.from({ length: 6 }, (_, b) => J[a].reduce((s, v, i) => s + v * J[b][i], 0) + (a === b ? lambda * lambda : 0)));
    const g = J.map(col => col.reduce((s, v, i) => s + v * r[i], 0));
    const dq = solve(A, g); for (let k = 0; k < 6; k++) q[k] += Math.max(-0.3, Math.min(0.3, dq[k]));
  }
  const { tcp } = forward(q, toolLength);
  return { q, error: Math.hypot(target[0] - tcp[0], target[1] - tcp[1], target[2] - tcp[2]) };
}
/** 6×6 연립방정식(가우스 소거, 부분 피벗). */
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}
