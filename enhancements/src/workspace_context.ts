import {workspace_text} from "./workspace_i18n";
/** Workspace switching generations and business rejections; the root directory is still uniquely held by the host. */
let epoch=0, switching=false;
const guards=new Set<()=>string|undefined>();
export const workspace_context_epoch=()=>epoch;
export const workspace_context_switching=()=>switching;
export function register_workspace_context_guard(guard:()=>string|undefined){guards.add(guard);return()=>{guards.delete(guard);};}
export function assert_workspace_context_ready(){for(const guard of guards){const reason=guard();if(reason)throw new Error(reason);}}
export function begin_workspace_context_switch(){if(switching)throw new Error(workspace_text("context_the_workspace_is_switching_please_try_again_later"));assert_workspace_context_ready();switching=true;epoch++;}
export function finish_workspace_context_switch(){switching=false;window.dispatchEvent(new Event("linux-note-workspace-context-changed"));}
export function cancel_workspace_context_switch(){switching=false;}
