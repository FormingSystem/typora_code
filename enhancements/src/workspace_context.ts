/** 工作区切换代次与业务否决；根目录仍由宿主唯一持有。 */
let epoch=0, switching=false;
const guards=new Set<()=>string|undefined>();
export const workspace_context_epoch=()=>epoch;
export const workspace_context_switching=()=>switching;
export function register_workspace_context_guard(guard:()=>string|undefined){guards.add(guard);return()=>{guards.delete(guard);};}
export function assert_workspace_context_ready(){for(const guard of guards){const reason=guard();if(reason)throw new Error(reason);}}
export function begin_workspace_context_switch(){if(switching)throw new Error("工作区正在切换，请稍后重试。");assert_workspace_context_ready();switching=true;epoch++;}
export function finish_workspace_context_switch(){switching=false;window.dispatchEvent(new Event("linux-note-workspace-context-changed"));}
export function cancel_workspace_context_switch(){switching=false;}
