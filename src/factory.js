import { LAYERS } from './layout.js';
import { Simulation } from './simulation.js';
import { encodeRegion, decodeRegion } from './qr.js';

/** 동일 운영 로직의 선택한 공정을 독립 실행하고 기존 화면에 합계를 제공한다. SW_Browser_Logistics_001 */
export class FactorySimulation {
  /** 공정당 같은 AGV 대수를 사용하고 QR 이미지는 목적지마다 한 번 생성한다.
   * @param {object} options AGV 대수(agvCount, 기본 4), 공정 수(layerCount, 기본 1), 난수원(random),
   *   공정 상태기계 클래스(SimulationClass, 기본 Simulation; 로봇팔 씬은 RobotSimulation. SW_Browser_Robot_001).
   */
  constructor({agvCount=4, layerCount=1, random=Math.random, SimulationClass=Simulation}={}) {
    this.qrImages=LAYERS.map(layer=>layer.regions.map(encodeRegion));
    this.allLayers=LAYERS.map((layer,i)=>({...layer,simulation:new SimulationClass({agvCount,random,regions:layer.regions,
      decode:b=>decodeRegion(this.qrImages[i][layer.regions.indexOf(b.destination)],layer.regions)})}));
    this.layers=this.allLayers.slice(0,1);
    this.setLayerCount(layerCount);
  }
  /** 선택한 공정에 동일한 고정 시간 단계를 적용한다. */
  step(dt){for(const layer of this.layers)layer.simulation.step(dt);}
  /** 모든 공정의 진행·집계를 초기화한다. */
  reset(){for(const layer of this.allLayers)layer.simulation.reset();}
  /** 모든 공정에 같은 N대를 적용한다. */
  setAgvCount(count){for(const layer of this.allLayers)layer.simulation.setAgvCount(count);}
  /** 표시·실행할 공정을 선택하고 전체 진행을 초기화한다. SW_Browser_Logistics_001
   * @param {number} count 1~4 범위의 정수. 같은 값은 진행을 유지한다.
   * @throws {RangeError} 지원 범위 밖의 값.
   */
  setLayerCount(count){
    if(!Number.isInteger(count)||count<1||count>LAYERS.length)throw new RangeError('공정 수는 1~4 정수여야 합니다.');
    if(this.layers.length===count)return;
    this.reset();this.layers=this.allLayers.slice(0,count);
  }
  /** 판독 실패 상자만 기존 규칙대로 다시 읽는다. */
  retryScan(){for(const layer of this.layers)layer.simulation.retryScan();}
  /** 동기 실행 중인 전체 모의 시간. */
  get time(){return this.layers[0].simulation.time;}
  /** 화면용 활성 상자 합계. 내부 상태는 각 공정이 소유한다. */
  get boxes(){return this.layers.flatMap(layer=>layer.simulation.boxes);}
  /** L1~L4의 각 도크 순서로 나열한 활성 도크 출하 수량. */
  get delivered(){return this.layers.flatMap(layer=>layer.simulation.delivered);}
  /** 화면에서 공정을 구분하는 장비 상태. */
  get agvs(){return this.layers.flatMap(layer=>layer.simulation.agvs.map(a=>({...a,layer:layer.id})));}
  /** 로봇팔 씬의 로봇 상태(공정 id 포함). AGV 공정이면 빈 배열. */
  get robots(){return this.layers.flatMap(layer=>(layer.simulation.robots||[]).map(r=>({...r,layer:layer.id})));}
  /** 최근 판독 결과를 공정 이름·시각과 함께 전달한다. */
  get lastRead(){return this.layers.flatMap(layer=>layer.simulation.lastRead?[{...layer.simulation.lastRead,layer:layer.id}]:[]).sort((a,b)=>b.time-a.time)[0]||null;}
  /** 서로 같은 상자 번호라도 공정 이름으로 구분하는 최근 기록. */
  get events(){return this.layers.flatMap(layer=>layer.simulation.events.map(e=>({...e,message:`공정 ${layer.id.slice(1)} · ${e.message}`}))).sort((a,b)=>b.time-a.time).slice(0,8);}
}
