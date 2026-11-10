import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INLETS, DOCKS, MAX_AGVS, agvHome } from './simulation.js';
import { LAYERS } from './layout.js';
import { createUR5e } from './ur5eModel.js';
import { STATIONS, ROBOT_SCALE, TOOL_LENGTH } from './robotSimulation.js';
import rollerUrl from '../Asset/straight-roller-conveyor.glb?url';
import beltUrl from '../Asset/belt-conveyor-straight.glb?url';
import agvUrl from '../Asset/warehouse-agv-with-shelf.glb?url';
import truckUrl from '../Asset/7-5-t-class-box-truck-with-roll-up-door.glb?url';
// 현장 소품: aws-robomaker-small-warehouse-world(MIT-0) DAE를 GLB로 변환한 에셋. 출처·라이선스는 Asset/aws-warehouse/LICENSE.txt.
import shelfDUrl from '../Asset/aws-warehouse/ShelfD_01.glb?url';
import shelfEUrl from '../Asset/aws-warehouse/ShelfE_01.glb?url';
import highRackUrl from '../Asset/aws-warehouse/ShelfF_01.glb?url';
import palletCUrl from '../Asset/aws-warehouse/ClutteringC_01.glb?url';
import palletDUrl from '../Asset/aws-warehouse/ClutteringD_01.glb?url';
import palletJackUrl from '../Asset/aws-warehouse/PalletJackB_01.glb?url';
import deskUrl from '../Asset/aws-warehouse/DeskC_01.glb?url';
import binUrl from '../Asset/aws-warehouse/TrashCanC_01.glb?url';
import concreteUrl from '../Asset/aws-warehouse/concrete_floor.jpg?url';
// UR5e 링크 메시: Universal_Robots_ROS2_Description(BSD-3) DAE를 GLB로 변환. 출처·라이선스는 Asset/ur5e/LICENSE.txt.
import urBaseUrl from '../Asset/ur5e/base.glb?url';
import urShoulderUrl from '../Asset/ur5e/shoulder.glb?url';
import urUpperarmUrl from '../Asset/ur5e/upperarm.glb?url';
import urForearmUrl from '../Asset/ur5e/forearm.glb?url';
import urWrist1Url from '../Asset/ur5e/wrist1.glb?url';
import urWrist2Url from '../Asset/ur5e/wrist2.glb?url';
import urWrist3Url from '../Asset/ur5e/wrist3.glb?url';
const UR5E_PARTS={base:urBaseUrl,shoulder:urShoulderUrl,upperarm:urUpperarmUrl,forearm:urForearmUrl,wrist1:urWrist1Url,wrist2:urWrist2Url,wrist3:urWrist3Url};

/** 건물 치수(m). 도크 벽은 도크 레벨러 바깥, 탑차 후면이 닿는 선이다. */
const WALL_X=24.9, LEFT_X=-25, BACK_Z=-16, CUT_H=1.1, FULL_H=7;
/** 공정마다 장비 4종과 현장 소품 8종을 불러온다. 상태 문구의 분모로 쓴다. */
const ASSETS_PER_LAYER=12;

export const COLORS = ['#dfad59', '#55aaa5', '#899bc7'];
const matCache = new Map();
/** 같은 색상 재질을 공유하여 장면의 자원 수를 제한한다. */
function material(color) { if (!matCache.has(color)) matCache.set(color,new THREE.MeshStandardMaterial({color,roughness:0.72,metalness:0.15})); return matCache.get(color); }
/** 바닥·구조물용 직육면체를 만든다. */
function block(parent,w,h,d,x,y,z,color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));
  mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
/** 한글 표지판을 CanvasTexture로 생성한다. */
function label(parent,text,x,y,z,width=3,color='#24363b',ground=false) {
  const canvas=document.createElement('canvas'); canvas.width=768;canvas.height=128;
  const c=canvas.getContext('2d'); c.fillStyle=color; c.font='600 56px "Malgun Gothic", sans-serif'; c.textAlign='center';c.textBaseline='middle';c.fillText(text,384,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width/6),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  mesh.position.set(x,y,z); if(ground) mesh.rotation.x=-Math.PI/2;parent.add(mesh);return mesh;
}
/** 원본 GLB를 상자 범위에 맞추고 바닥 원점을 정렬한다. */
function fitModel(source,width,height,depth) {
  const result=new THREE.Group();const model=source.clone(true);result.add(model);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  model.position.set(-center.x,-bounds.min.y,-center.z);
  result.scale.set(width/size.x,height/size.y,depth/size.z);return result;
}
/** 정적 모델(트럭·현장 소품·도크 구조물)의 같은 재질 메시를 합쳐 반복 배치의 그리기 호출을 줄인다. */
function batchStatic(model) {
  model.updateMatrixWorld(true);const groups=new Map(),result=new THREE.Group();
  model.traverse(n=>{
    if(!n.isMesh)return;
    const key=n.material.uuid+Object.keys(n.geometry.attributes).sort().join(',')+Boolean(n.geometry.index);
    if(!groups.has(key))groups.set(key,{material:n.material,geometries:[]});
    groups.get(key).geometries.push(n.geometry.clone().applyMatrix4(n.matrixWorld));
  });
  for(const group of groups.values()){
    const merged=mergeGeometries(group.geometries);if(!merged)throw new Error('정적 메시 병합 실패');
    const mesh=new THREE.Mesh(merged,group.material);mesh.castShadow=true;mesh.receiveShadow=true;result.add(mesh);
    group.geometries.forEach(g=>g.dispose());
  }
  return result;
}
/** 캔버스로 반복 무늬 텍스처를 만든다. 같은 무늬는 한 번만 만들어 공유한다.
 * @param {string} key 무늬 이름. 'hatch'(노랑·검정 사선), 'panel'(샌드위치 패널 골), 'asphalt'(아스팔트 입자).
 * @returns {THREE.CanvasTexture} RepeatWrapping이 설정된 텍스처.
 */
const patternCache=new Map();
function pattern(key){
  if(patternCache.has(key))return patternCache.get(key);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');
  if(key==='hatch'){c.fillStyle='#f2c230';c.fillRect(0,0,128,128);c.fillStyle='#1d1f20';for(let i=-128;i<256;i+=48){c.beginPath();c.moveTo(i,0);c.lineTo(i+24,0);c.lineTo(i+24-128,128);c.lineTo(i-128,128);c.fill();}}
  else if(key==='panel'){c.fillStyle='#dfe3e1';c.fillRect(0,0,128,128);for(let x=0;x<128;x+=32){c.fillStyle='#c7cdcb';c.fillRect(x,0,3,128);c.fillStyle='#eef1ef';c.fillRect(x+3,0,2,128);}}
  else {c.fillStyle='#45494b';c.fillRect(0,0,128,128);for(let i=0;i<900;i++){const v=55+Math.random()*40|0;c.fillStyle=`rgb(${v},${v},${v+2})`;c.fillRect(Math.random()*128,Math.random()*128,1.5,1.5);}}
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  patternCache.set(key,texture);return texture;
}
/** 반복 무늬 재질을 면 크기에 맞춰 만든다. 텍스처 이미지는 공유하고 반복 횟수만 다르게 한다.
 * @param {string} key pattern() 무늬 이름.
 * @param {number} repeatX 가로 반복 수. @param {number} repeatY 세로 반복 수.
 */
const patternedCache=new Map();
function patterned(key,repeatX,repeatY,roughness=0.8){
  const id=`${key}:${repeatX}:${repeatY}:${roughness}`;if(patternedCache.has(id))return patternedCache.get(id);
  const map=pattern(key).clone();map.repeat.set(repeatX,repeatY);map.needsUpdate=true;
  const result=new THREE.MeshStandardMaterial({map,roughness,metalness:0.05});patternedCache.set(id,result);return result;
}
/** 정적 소품 모델 복제본을 바닥 좌표에 놓는다. 형상·재질은 원본과 공유한다.
 * @param {THREE.Object3D} parent 붙일 부모. @param {THREE.Object3D} source GLB 원본 장면.
 * @param {number} x 바닥 x(m). @param {number} z 바닥 z(m). @param {number} [rotation=0] y축 회전(rad).
 */
function place(parent,source,x,z,rotation=0){
  const model=source.clone(true);model.position.set(x,0,z);model.rotation.y=rotation;
  model.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});parent.add(model);return model;
}
/** H형강 기둥과 하부 노랑·검정 충돌 보호대를 만든다. height가 CUT_H이면 단면 처리된 기둥이다. */
function column(parent,x,z,height){
  block(parent,0.36,height,0.36,x,height/2,z,'#3d4b55');
  const guard=new THREE.Mesh(new THREE.BoxGeometry(0.5,Math.min(0.9,height),0.5),patterned('hatch',1,1.2,0.6));
  guard.position.set(x,Math.min(0.9,height)/2,z);guard.castShadow=true;parent.add(guard);
}
/** 실제 장비 모델·공장 환경·카메라를 생성하고 시뮬레이션 상태를 그린다. SW_Browser_Logistics_001
 * @param {HTMLElement} container 캔버스를 넣을 요소. @param {object[][]} qrImages 공정별 QR 이미지. @param {(text:string)=>void} onAssetStatus 장비 로딩 문구.
 * @param {(lineId:string)=>void} [onConveyorSelect] 컨베이어를 클릭(끌기 아님)했을 때 공정 id로 호출된다.
 * @param {{mode?:'agv'|'robot'}} [options] 'robot'이면 AGV 대신 UR5e 3대와 출하 컨베이어를 배치한다(로봇팔 씬). SW_Browser_Robot_001
 */
export function createScene(container,qrImages,onAssetStatus,onConveyorSelect,{mode='agv'}={}) {
  const robotMode=mode==='robot';
  const scene=new THREE.Scene();scene.background=new THREE.Color('#cbd4d3');scene.fog=new THREE.Fog('#cbd4d3',400,750);
  const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  renderer.domElement.className='scene';renderer.domElement.setAttribute('aria-label',robotMode?'4개 공정의 16개 유입구, QR 4개, UR5e 협동로봇, 출하 컨베이어와 탑차':'4개 공정의 16개 유입구, QR 4개, AGV, 출하 도크와 탑차 각 12대를 보여주는 3D 공장');container.prepend(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(42,1,0.1,800);camera.position.set(28,31,34);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,-1);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2.08;controls.minDistance=4;controls.maxDistance=400;
  // 지도처럼 왼쪽 드래그로 바닥을 따라 화면을 끌어 이동하고, 오른쪽 드래그로 회전한다. 터치는 한 손가락 이동, 두 손가락 확대·회전.
  controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_ROTATE};controls.screenSpacePanning=false;controls.update();
  scene.add(new THREE.HemisphereLight('#f4faff','#657781',2.7));
  const sun=new THREE.DirectionalLight('#fff4df',3.2);sun.position.set(-12,100,42);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-100,right:120,top:160,bottom:-160,near:1,far:300});sun.shadow.normalBias=0.04;scene.add(sun);
  const world=scene, loader=new GLTFLoader(),assetCache=new Map();let loaded=0,truckBatch,visibleCount=1;
  // 네 물류 라인이 공유하는 하나의 건물. 실내는 콘크리트, 도크 벽 밖은 아스팔트 진입로다.
  // 뒤·왼쪽 벽은 전체 높이, 카메라 쪽(도크·앞) 벽은 CUT_H 높이에서 자른 단면으로 보여 내부를 가리지 않는다.
  const concrete=new THREE.TextureLoader().load(concreteUrl);concrete.wrapS=concrete.wrapT=THREE.RepeatWrapping;concrete.colorSpace=THREE.SRGBColorSpace;concrete.anisotropy=8;
  const inside=WALL_X-LEFT_X, outside=37-WALL_X;
  const floor=new THREE.Mesh(new THREE.BoxGeometry(inside,0.2,120),new THREE.MeshStandardMaterial({map:concrete,color:'#a2a5a1',roughness:0.88,metalness:0}));
  floor.position.set((LEFT_X+WALL_X)/2,-0.15,44);floor.receiveShadow=true;world.add(floor);
  const apron=new THREE.Mesh(new THREE.BoxGeometry(outside,0.2,120),patterned('asphalt',outside/3,40,0.95));
  apron.position.set(WALL_X+outside/2,-0.16,44);apron.receiveShadow=true;world.add(apron);
  const panel=patterned('panel',inside/2,1);
  const backWall=new THREE.Mesh(new THREE.BoxGeometry(inside,FULL_H,0.3),panel);backWall.position.set((LEFT_X+WALL_X)/2,FULL_H/2,BACK_Z-0.15);backWall.receiveShadow=true;world.add(backWall);
  block(world,inside,1.2,0.34,(LEFT_X+WALL_X)/2,0.6,BACK_Z-0.13,'#a9adaa');
  const leftWall=new THREE.Mesh(new THREE.BoxGeometry(0.3,FULL_H,120),patterned('panel',60,1));leftWall.position.set(LEFT_X-0.15,FULL_H/2,44);leftWall.receiveShadow=true;world.add(leftWall);
  const leftKick=block(world,0.34,1.2,120,LEFT_X-0.13,0.6,44,'#a9adaa');
  for(let x=LEFT_X+6;x<WALL_X-2;x+=8)column(world,x,BACK_Z+0.2,FULL_H);
  const leftColumns=new THREE.Group();world.add(leftColumns);
  for(let z=BACK_Z+8;z<120;z+=8)column(leftColumns,LEFT_X+0.2,z,FULL_H);
  // 앞쪽 단면 벽과 마지막 공정 앞 도크 벽 조각은 공정 수에 따라 resizeFloor에서 위치를 맞춘다.
  const frontWall=block(world,inside,CUT_H,0.3,(LEFT_X+WALL_X)/2,CUT_H/2,0,'#c9cecc');
  const frontCap=block(world,inside,0.05,0.32,(LEFT_X+WALL_X)/2,CUT_H+0.02,0,'#2b3439');
  const dockTail=block(world,0.3,CUT_H,1,WALL_X,CUT_H/2,0,'#c9cecc');
  block(world,0.3,CUT_H,1.5,WALL_X,CUT_H/2,BACK_Z+0.75,'#c9cecc');
  /** 동일 기본 장면을 공정 원점에 배치하고 독립 상태 동기화 함수를 만든다. */
  function buildLayer(definition,qrImages){
    const scene=new THREE.Group();scene.name=definition.id;scene.userData.layerId=definition.id;
    scene.position.set(definition.x,0,definition.z);world.add(scene);
    const regions=definition.regions;
    // 움직이지 않는 도크·벽·바닥 표시 구조물. 다 만든 뒤 재질별로 합쳐 한 번에 그린다.
    const decor=new THREE.Group();
  label(scene,'공정 ' + definition.id.slice(1) + ' / PROCESS',-15,0.025,12.6,9,'#486367',true);
  if(!robotMode){
  for(let x=-18;x<22;x+=2) block(scene,1.1,0.015,0.07,x,0.006,3.1,'#d8b15d');
  for(let z=-11;z<=12;z+=1.7){block(scene,0.08,0.015,0.85,14.5,0.01,z,'#d8b15d');block(scene,0.08,0.015,0.85,20.5,0.01,z,'#8ac0bb');}
  label(scene,'OUTBOUND',16,0.025,-10,3,'#6f633d',true);
  label(scene,'RETURN',19,0.025,14,3,'#426a65',true);
  }
  const beltGroup=new THREE.Group();beltGroup.userData.lineId=definition.id;scene.add(beltGroup);
  const placeholders=[];
  /** 모델 로딩 전에도 이송 경로를 정확하게 표시한다. */
  function conveyor(x,z,length,vertical=false) {
    const g=new THREE.Group();g.position.set(x,0,z);if(vertical)g.rotation.y=Math.PI/2;
    block(g,length,0.16,1.35,0,0.91,0,'#364a51');
    for(const side of [-0.68,0.68])block(g,length,0.18,0.06,0,0.98,side,'#a6b3b3');
    for(const xx of [-length/2+0.3,length/2-0.3])for(const zz of [-0.52,0.52])block(g,0.09,0.9,0.09,xx,0.45,zz,'#596b70');
    beltGroup.add(g);placeholders.push({g,x,z,length,vertical});
  }
  for(let x=-12;x<=6;x+=4)conveyor(x,0,4);
  conveyor(7,0,2);
  for(const inlet of INLETS.slice(1))conveyor(inlet.x,-4.75,8.5,true);
  // 유입구: 문틀 대신 입고 팔레트(박스 적재)를 두고, 투입 위치를 노랑·검정 바닥 표시로 구분한다.
  const inletPallets=[];
  for(let i=0;i<4;i++) {
    const p=INLETS[i]; label(scene,`0${i+1}  유입`,p.x,0.04,p.z-1.5,2.7,'#435d61',true);
    const mark=new THREE.Mesh(new THREE.PlaneGeometry(i?1.6:0.3,i?0.3:1.6),patterned('hatch',i?4:1,i?1:4,0.6));
    mark.rotation.x=-Math.PI/2;mark.position.set(i?p.x:p.x-0.75,0.012,i?p.z-0.75:p.z);decor.add(mark);
    inletPallets.push(i?{x:p.x,z:-11.65,r:0}:{x:-16.7,z:0,r:Math.PI/2});
  }
  // 상자 판독 구간: 산업용 스캔 게이트(회색 프레임, 상단 판독 헤드, 경광등).
  const scanner=new THREE.Group();scanner.position.x=8;scene.add(scanner);
  for(const z of [-0.94,0.94])block(scanner,0.14,2.5,0.14,0,1.25,z,'#4a5961');
  block(scanner,0.26,0.16,2,0,2.5,0,'#4a5961');block(scanner,0.35,0.2,0.5,0,2.32,0,'#1c2428');
  block(scanner,0.16,0.4,0.16,0,2.78,0.82,'#e8a33a');block(scanner,0.42,0.6,0.22,0,1.2,-1.16,'#d9dedc');
  const scanLight=block(scanner,0.015,0.015,1.2,0,1.61,0,'#55dbb3');scanLight.material=new THREE.MeshBasicMaterial({color:'#56e8b5'});
  label(scene,'QR / SCAN',8,0.035,2,3,'#3e5a5d',true);
  const agv=new THREE.Group(),agvModels=[];let fallbackAgv=null;
  if(!robotMode){
  for(const z of [1.6,3.4])block(scene,2.1,0.018,0.05,10,0.02,z,'#ddbe74');
  label(scene,'NEXT AGV',10,0.035,4.1,2,'#6d653c',true);
  block(scene,2,0.12,1.3,9,0.92,0,'#50646a');
  scene.add(agv);agvModels.push(agv);
  fallbackAgv=block(agv,1.65,0.55,1.35,0,0.38,0,'#d2a34c');
  block(agv,1.6,0.12,1.25,0,0.94,0,'#8c9b9a');
  for(const z of [-0.66,0.66])block(agv,1.3,0.18,0.06,0,0.83,z,'#b8c6c5');
  for(let i=0;i<MAX_AGVS;i++){
    const {x,z}=agvHome(i);block(decor,2.2,0.018,1.9,x,0.006,z,'#6f7679');block(decor,0.5,0.03,0.3,x-0.85,0.02,z,'#2a3236');
    label(scene,`AGV ${String(i+1).padStart(2,'0')}`,x,0.035,z+1.15,2,'#425f61',true);
  }
  } else {
    // 로봇팔 씬: 판독 뒤 메인 연장 컨베이어(x 8→16.4), 로봇별 출하 컨베이어(→ 탑차 안 x 25.4).
    // 로봇 3대는 메인 컨베이어 옆 받침대(높이 1.05 m) 위에 서서 자기 목적지 상자만 집는다. 배치 좌표는 robotSimulation.js STATIONS.
    for(const x of [9.05,11.15,13.25,15.35])conveyor(x,0,2.1);
    const segments=(x0,x1,z)=>{const n=Math.ceil((x1-x0)/4.3),len=(x1-x0)/n;for(let k=0;k<n;k++)conveyor(x0+len*(k+0.5),z,len);};
    conveyor(10.5,-4.175,4.45,true);segments(9.825,25.4,-7);
    segments(16.9,25.4,0);
    conveyor(13,4.175,4.45,true);segments(12.325,25.4,7);
    STATIONS.forEach((st,k)=>{
      const {x,y,z}=st.base;
      block(scene,0.5,y-0.06,0.5,x,(y-0.06)/2,z,'#5d6a70');block(scene,0.62,0.06,0.62,x,y-0.03,z,'#3b464b');
      const zone=new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.1),patterned('hatch',3,3,0.6));zone.rotation.x=-Math.PI/2;zone.position.set(x,0.012,z);decor.add(zone);
      label(scene,`ROBOT 0${k+1}`,x+(k===1?1.4:-1.4),0.035,z+(k===2?0.4:-0.4),1.8,'#3f5b5f',true);
      const lane=st.lane,mid=lane[lane.length-2];
      label(scene,`출하 0${k+1} → 탑차`,mid.x+5,0.035,mid.z+(k===2?1.15:-1.15),2.6,COLORS[k],true);
    });
  }
  const dockModels=[];
  for(let i=0;i<3;i++) {
    const d=DOCKS[i];
    if(!robotMode){block(decor,2.2,0.018,1.9,19,0.02,d.z-2.5,'#6f7679');label(scene,`도크 0${i+1} 대기`,19,0.035,d.z-3.8,2.6,'#426a65',true);}
    // 도크 앞 하역 구역(목적지 색 경계선)과 문턱 안전 표시.
    block(decor,3.0,0.02,3.4,d.x-0.3,0.01,d.z,'#8e9290');
    for(const z of [-1.7,1.7])block(decor,3.0,0.035,0.09,d.x-0.3,0.03,d.z+z,COLORS[i]);
    const sill=new THREE.Mesh(new THREE.PlaneGeometry(0.3,3.0),patterned('hatch',1,8,0.6));sill.rotation.x=-Math.PI/2;sill.position.set(d.x+1.05,0.03,d.z);decor.add(sill);
    label(scene,`0${i+1}  ${regions[i]}`,d.x-0.6,0.05,d.z+2.25,3.2,COLORS[i],true);
    // 도크 레벨러(강판), 고무 범퍼, 도크 셸터, 볼라드. 도크 벽은 CUT_H 높이 단면이다.
    block(decor,1.7,0.06,2.4,d.x+2.05,0.03,d.z,'#7b8287');
    block(decor,0.08,0.065,2.4,d.x+1.24,0.035,d.z,'#e0b23a');
    for(const z of [-1.25,1.25])block(decor,0.22,0.32,0.4,WALL_X+0.26,1.0,d.z+z,'#141719');
    for(const z of [-1.6,1.6])block(decor,0.5,3.2,0.32,WALL_X+0.4,1.6,d.z+z,'#24292c');
    block(decor,0.5,0.55,3.52,WALL_X+0.4,3.47,d.z,'#24292c');
    for(const z of [-1.85,1.85]){const post=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,1.1,12),material('#e7b52f'));post.position.set(WALL_X-0.45,0.55,d.z+z);post.castShadow=true;decor.add(post);}
    for(const z of [-1.95,1.95])block(decor,7.5,0.012,0.1,WALL_X+4.4,0.0,d.z+z,'#e9ece8');
    const bay=new THREE.Group();bay.position.set(d.x+6.6,0,d.z);bay.rotation.y=Math.PI;scene.add(bay);dockModels.push(bay);
    block(bay,4.6,2.8,2.3,0,1.65,0,'#d4dedb');block(bay,1.7,2.1,2.2,3,1.3,0,'#839ca2');
    for(const x of [-1.6,2.8])for(const z of [-1.1,1.1])block(bay,0.75,0.75,0.25,x,0.4,z,'#283c44');
  }
  // 도크 벽 단면: 도크 개구부(폭 3.5m)를 뺀 구간만 세우고, 위에 단면 표시용 어두운 띠를 둔다.
  const dockEdges=[-14.5,...DOCKS.flatMap(d=>[d.z-1.75,d.z+1.75]),14.5];
  for(let k=0;k<dockEdges.length;k+=2){
    const z0=dockEdges[k],z1=dockEdges[k+1],mid=(z0+z1)/2,len=z1-z0;
    block(decor,0.3,CUT_H,len,WALL_X,CUT_H/2,mid,'#c9cecc');block(decor,0.32,0.05,len,WALL_X,CUT_H+0.02,mid,'#2b3439');
    column(decor,WALL_X-0.25,mid,CUT_H);
  }
  decor.updateMatrixWorld(true);scene.add(batchStatic(decor));
  // 현장 소품 배치 좌표(공정 기준, m). AGV 경로·상자 이송 구간·바닥 표지와 겹치지 않는 자리만 사용한다.
  const rackRow=[-16,-12.08,-8.16,-4.24,-0.32,3.6];
  const propSpots={
    shelfD:rackRow.filter((_,k)=>k%2===0).map(x=>({x,z:-13.9,r:0})),
    shelfE:rackRow.filter((_,k)=>k%2===1).map(x=>({x,z:-13.9,r:0})),
    highRack:[{x:-22.4,z:0,r:0}],
    palletC:inletPallets,
    palletD:[{x:23.8,z:DOCKS[0].z-3.5,r:0},{x:23.8,z:DOCKS[1].z+3.5,r:0}],
    palletJack:[{x:23.9,z:DOCKS[2].z+3.5,r:Math.PI/2}],
    desk:[{x:6.5,z:-2.6,r:Math.PI}],
    bin:[{x:-23.2,z:11.5,r:Math.PI/2}],
  };
  const qrTextures=qrImages.map(p=>{const t=new THREE.DataTexture(p.data,p.width,p.height,THREE.RGBAFormat);t.needsUpdate=true;t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;return t;});
  const boxGeometry=new THREE.BoxGeometry(0.85,0.55,0.72), qrGeometry=new THREE.PlaneGeometry(0.48,0.48);
  const tapeGeometry=new THREE.BoxGeometry(0.1,0.557,0.725),bandGeometry=new THREE.BoxGeometry(0.86,0.08,0.73);
  const boxMaterial=material('#bd955e'), tapeMaterial=material('#dfc596');
  const qrMaterials=qrTextures.map(t=>new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide}));
  const boxes=new Map(),robotModels=[];
  /** 활성 상자만 보관하고 배송된 메시를 장면에서 제거한다. */
  function sync(sim) {
    const alive=new Set(sim.boxes.map(b=>b.id));for(const [id,g] of boxes)if(!alive.has(id)){scene.remove(g);boxes.delete(id);}
    for(const b of sim.boxes){
      let g=boxes.get(b.id);
      if(!g){
        g=new THREE.Group();const mesh=new THREE.Mesh(boxGeometry,boxMaterial);mesh.castShadow=true;g.add(mesh);
        const tape=new THREE.Mesh(tapeGeometry,tapeMaterial);g.add(tape);
        const qr=new THREE.Mesh(qrGeometry,qrMaterials[regions.indexOf(b.destination)]);qr.rotation.x=-Math.PI/2;qr.position.set(0,0.281,0);g.add(qr);
        const band=new THREE.Mesh(bandGeometry,material(COLORS[regions.indexOf(b.destination)]));band.position.y=-0.19;g.add(band);
        boxes.set(b.id,g);scene.add(g);
      }
      g.position.set(b.x,b.y??1.29,b.z);
    }
    if(robotMode)sim.robots.forEach((r,i)=>robotModels[i]?.setJoints(r.q));
    else {
    while(agvModels.length<sim.agvs.length){const clone=agv.clone(true);scene.add(clone);agvModels.push(clone);}
    while(agvModels.length>sim.agvs.length)scene.remove(agvModels.pop());
    sim.agvs.forEach((a,i)=>agvModels[i].position.set(a.x,0,a.z));
    }
    scanLight.visible=sim.boxes.some(b=>b.state==='scan') && Math.sin(sim.time*15)>0;
  }

  /** GLB 적용 실패는 상태 표시로 알리고 기본 장비 형상을 유지한다. */
  /** UR5e 링크 7종을 한 묶음으로 불러와(공정 간 공유) 스테이션마다 로봇을 조립한다. 묶음은 장비 1종으로 센다. */
  async function loadRobots(){
    try{
      if(!assetCache.has('ur5e'))assetCache.set('ur5e',Promise.all(Object.entries(UR5E_PARTS).map(([key,url])=>loader.loadAsync(url).then(r=>[key,r.scene]))).then(Object.fromEntries));
      const meshes=await assetCache.get('ur5e');
      STATIONS.forEach(st=>{const robot=createUR5e(meshes,{scale:ROBOT_SCALE,toolLength:TOOL_LENGTH});robot.root.position.set(st.base.x,st.base.y,st.base.z);robot.root.rotation.y=st.yaw;scene.add(robot.root);robotModels.push(robot);});
      loaded++;onAssetStatus(`${loaded}/${LAYERS.length*ASSETS_PER_LAYER} 전체 공정 장비·설비 준비 완료`);
    }catch(error){onAssetStatus(`로봇 모델 오류 · 로봇 숨김`);console.error('UR5e 로드 실패',error);}
  }
  async function load(url,apply) {
    try {if(!assetCache.has(url))assetCache.set(url,loader.loadAsync(url));const result=await assetCache.get(url);apply(result.scene.clone(true));loaded++;onAssetStatus(`${loaded}/${LAYERS.length*ASSETS_PER_LAYER} 전체 공정 장비·설비 준비 완료`);}
    catch(error){onAssetStatus(`장비 모델 오류 · 기본 형상 사용`);console.error('장비 로드 실패',error);}
  }
  const assetsReady=Promise.all([
    load(rollerUrl,model=>{const cartons=[];model.traverse(n=>{if(/Cartons/i.test(n.name))cartons.push(n);});cartons.forEach(n=>n.removeFromParent());for(const p of placeholders.filter(p=>!p.vertical)){beltGroup.remove(p.g);const m=fitModel(model,p.length,1,1.35);m.position.set(p.x,0,p.z);beltGroup.add(m);}}),
    load(beltUrl,model=>{const cartons=[];model.traverse(n=>{if(/Cartons/i.test(n.name))cartons.push(n);});cartons.forEach(n=>n.removeFromParent());for(const p of placeholders.filter(p=>p.vertical)){beltGroup.remove(p.g);const m=fitModel(model,p.length,1,1.35);m.rotation.y=Math.PI/2;m.position.set(p.x,0,p.z);beltGroup.add(m);}}),
    robotMode?loadRobots():load(agvUrl,model=>{const remove=[];model.traverse(n=>{if(/Fabric[_ ]bins|Pod[_ ]frame|Stored[_ ]boxes/i.test(n.name))remove.push(n);});remove.forEach(n=>n.removeFromParent());const m=fitModel(model,1.8,0.82,1.45);agv.remove(fallbackAgv);agv.add(m);while(agvModels.length>1)scene.remove(agvModels.pop());}),
    load(truckUrl,model=>{const batched=truckBatch||(truckBatch=batchStatic(model));for(const bay of dockModels){bay.clear();bay.add(fitModel(batched,6.6,3.25,2.5));}}),
    ...Object.entries({shelfD:shelfDUrl,shelfE:shelfEUrl,highRack:highRackUrl,palletC:palletCUrl,palletD:palletDUrl,palletJack:palletJackUrl,desk:deskUrl,bin:binUrl})
      .map(([key,url])=>load(url,model=>{const bounds=new THREE.Box3().setFromObject(model);model.position.y-=bounds.min.y;const group=new THREE.Group();for(const s of propSpots[key])place(group,model,s.x,s.z,s.r);scene.add(batchStatic(group));}))
  ]);
    return {sync,assetsReady,group:scene,beltGroup};
  }
  const layerViews=LAYERS.map((definition,i)=>buildLayer(definition,qrImages[i]));
  const assetsReady=Promise.all(layerViews.map(layer=>layer.assetsReady));
  /** 같은 프레임에서 네 공정의 상태를 각각 대응하는 장면에 반영한다. */
  function sync(factory){
    const count=factory.layers.length;
    if(visibleCount!==count){visibleCount=count;resizeFloor();view(activeView);}
    layerViews.forEach((layer,i)=>layer.group.visible=i<count);
    factory.layers.forEach((layer,i)=>layerViews[i].sync(layer.simulation));
  }
  /** 활성 공정 범위에 바닥·진입로·벽·기둥과 접근성 설명을 맞춘다. */
  function resizeFloor(){
    const depth=33+29*(visibleCount-1),center=depth/2-16;
    for(const mesh of [floor,apron,leftWall,leftKick]){mesh.scale.z=depth/120;mesh.position.z=center;}
    concrete.repeat.set(inside/6,depth/6);apron.material.map.repeat.set(outside/3,depth/3);leftWall.material.map.repeat.set(depth/2,1);
    const front=BACK_Z+depth;frontWall.position.z=frontCap.position.z=front+0.15;
    const lastEdge=LAYERS[visibleCount-1].z+14.5;dockTail.scale.z=front-lastEdge;dockTail.position.z=(front+lastEdge)/2;
    leftColumns.children.forEach(c=>c.visible=c.position.z<front-1);
    renderer.domElement.setAttribute('aria-label',`${visibleCount}개 공정의 유입구 ${visibleCount*4}개, QR ${visibleCount}개, 출하 도크와 탑차 각 ${visibleCount*3}개를 보여주는 3D 공장`);
  }
  resizeFloor();
  layerViews.forEach((layer,i)=>layer.group.visible=i<visibleCount);
  /** 기준 카메라로 전환하며 OrbitControls 직접 조작을 유지한다. */
  let activeView='overview';
  function view(name) {
    activeView=name;
    const center=(33+29*(visibleCount-1))/2-16,scale=0.48+0.52*(visibleCount-1)/3;
    const presets={top:[[6,175*scale,center+0.01],[6,0,center]],qr:[[14,8,10],[7,1,0]],agv:[[24,15,21],[14,0.7,2]],robot:[[21,8.5,9.5],[13.2,1.2,-0.8]],overview:[[6+84*scale,145*scale,center+121*scale],[6,0,center]]};
    const [p,t]=presets[name]||presets.overview;camera.position.fromArray(p);controls.target.fromArray(t);
    if(name==='top'||name==='overview')camera.position.sub(controls.target).multiplyScalar(Math.max(1,(name==='top'?0.5:0.85)/camera.aspect)).add(controls.target);
    controls.update();
  }
  // 컨베이어 클릭: 5px·0.5초 안의 짧은 클릭만 선택으로 본다(왼쪽 드래그 화면 이동과 구분). 마우스를 올리면 손가락 커서.
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null,hoverTimer=0;
  /** 화면 좌표 아래의 보이는 공정 컨베이어 id. 없으면 null. */
  function conveyorAt(event){
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(layerViews.filter(l=>l.group.visible).map(l=>l.beltGroup),true)[0];
    let o=hit?.object;while(o&&!o.userData.lineId)o=o.parent;return o?.userData.lineId||null;
  }
  if(onConveyorSelect){
    renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)down={x:e.clientX,y:e.clientY,t:performance.now()};});
    renderer.domElement.addEventListener('pointerup',e=>{if(!down||e.button!==0)return;const short=Math.hypot(e.clientX-down.x,e.clientY-down.y)<5&&performance.now()-down.t<500;down=null;if(!short)return;const id=conveyorAt(e);if(id)onConveyorSelect(id);});
    renderer.domElement.addEventListener('pointermove',e=>{if(e.buttons||performance.now()-hoverTimer<120)return;hoverTimer=performance.now();renderer.domElement.style.cursor=conveyorAt(e)?'pointer':'';});
  }
  const observer=new ResizeObserver(()=>{const {width,height}=container.getBoundingClientRect();camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);view(activeView);});observer.observe(container);
  return {sync,view,assetsReady,render(){controls.update();renderer.render(scene,camera);}, get stats(){return renderer.info.render;}};
}





