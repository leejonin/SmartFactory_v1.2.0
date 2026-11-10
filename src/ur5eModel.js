import * as THREE from 'three';
import { UR5E } from './ur5e.js';

/**
 * UR5e 3D 모델 조립(링크별 GLB를 URDF 관절 체인에 붙인다). SW_Browser_Robot_001
 * 링크 GLB는 원본 DAE의 Z-up 좌표를 유지해 변환했으므로, 로봇 전체를 x축 -90° 돌려 장면(Y-up)에 맞춘다.
 */
const m4 = a => new THREE.Matrix4().set(...a);
/** URDF rpy로 회전을 설정한다(R = Rz·Ry·Rx → Euler 'ZYX'). */
const setOrigin = (o, xyz, rpy) => { o.position.set(...xyz); o.rotation.set(rpy[0], rpy[1], rpy[2], 'ZYX'); };

/** 로봇 한 대를 만든다.
 * @param {Record<string, THREE.Object3D>} meshes 링크 이름(base·shoulder·upperarm·forearm·wrist1·wrist2·wrist3) → GLB 장면(공유 원본; 복제해서 붙인다).
 * @param {{scale?: number, toolLength?: number}} [options] 표시 배율, 공구(진공 그리퍼) 길이(m, 로봇 원래 크기 기준).
 * @returns {{root: THREE.Group, setJoints: (q: number[]) => void, gripper: THREE.Group}}
 */
export function createUR5e(meshes, { scale = 1, toolLength = 0.12 } = {}) {
  const root = new THREE.Group(); root.scale.setScalar(scale);
  const zup = new THREE.Group(); zup.rotation.x = -Math.PI / 2; root.add(zup);
  const attach = (parent, { file, xyz, rpy }) => {
    const holder = new THREE.Group(); setOrigin(holder, xyz, rpy);
    const model = meshes[file].clone(true); model.traverse(n => { if (n.isMesh) { n.castShadow = n.receiveShadow = true; } }); holder.add(model); parent.add(holder);
  };
  const base = new THREE.Group(); base.matrixAutoUpdate = false; base.matrix.copy(m4(UR5E.base.origin)); zup.add(base);
  attach(base, UR5E.base.mesh);
  const joints = []; let parent = base;
  for (const j of UR5E.joints) {
    const origin = new THREE.Group(); origin.matrixAutoUpdate = false; origin.matrix.copy(m4(j.origin)); parent.add(origin);
    const joint = new THREE.Group(); origin.add(joint); attach(joint, j.mesh); joints.push(joint); parent = joint;
  }
  // 진공 그리퍼: tool0 좌표(z가 공구 방향)에 은색 몸통과 검정 흡착컵.
  const tool0 = new THREE.Group(); tool0.matrixAutoUpdate = false; tool0.matrix.copy(m4(UR5E.tool0)); parent.add(tool0);
  const gripper = new THREE.Group(); tool0.add(gripper);
  const body = new THREE.CylinderGeometry(0.032, 0.032, toolLength * 0.55, 24); body.rotateX(Math.PI / 2);
  const steel = new THREE.MeshStandardMaterial({ color: '#b9bec3', metalness: 0.85, roughness: 0.3 }), rubber = new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 0.8 });
  const b = new THREE.Mesh(body, steel); b.position.z = toolLength * 0.275; b.castShadow = true; gripper.add(b);
  const cup = new THREE.CylinderGeometry(0.045, 0.03, toolLength * 0.2, 24); cup.rotateX(-Math.PI / 2);
  const c = new THREE.Mesh(cup, rubber); c.position.z = toolLength * 0.9; c.castShadow = true; gripper.add(c);
  return { root, gripper, setJoints(q) { joints.forEach((j, i) => { j.rotation.z = q[i]; }); } };
}
