/** 공장 전체(index.html)와 컨베이어 상세(conveyor.html) 두 화면을 오가는 상단 전환 버튼. SW_Browser_Logistics_001 · SW_Browser_ConveyorKit_001 */
const KEY = 'flow:lastLine';
const LINES = ['L1', 'L2', 'L3', 'L4'];

/** 마지막으로 본 공정 id를 기억한다. 저장소를 쓸 수 없는 환경(비공개 창 등)에서는 조용히 넘어간다.
 * @param {string} id L1~L4.
 */
export function rememberLine(id) { try { if (LINES.includes(id)) sessionStorage.setItem(KEY, id); } catch { /* 기억 실패는 무시: 기본 L1 사용 */ } }

/** 마지막으로 본 공정 id. 없으면 L1. @returns {string} */
export function lastLine() { try { const id = sessionStorage.getItem(KEY); return LINES.includes(id) ? id : 'L1'; } catch { return 'L1'; } }

/** 전환 버튼 HTML. 현재 화면 버튼은 강조하고 aria-current로 표시한다.
 * @param {'factory'|'conveyor'} active 현재 화면. @param {string} [line] 컨베이어 상세로 갈 때 열 공정 id.
 * @returns {string}
 */
export function sceneSwitch(active, line = lastLine()) {
  const item = (key, href, label) => `<a href="${href}" class="${active === key ? 'active' : ''}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="scene-switch" aria-label="화면 전환">${item('factory', './index.html', '공장 전체')}${item('conveyor', `./conveyor.html?line=${line}`, `컨베이어 상세 <small>공정 ${line.slice(1)}</small>`)}</nav>`;
}
