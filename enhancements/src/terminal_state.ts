export type terminal_state={active_id:string;location?:"panel"|"editor";panel_visible:boolean};
const readers=new WeakMap<object,()=>terminal_state>();

/** 只注册领域所有者的实时读取函数，不复制会话或面板状态。 */
export function bind_terminal_state(owner:object,read:()=>terminal_state){
  readers.set(owner,read);
  return ()=>{if(readers.get(owner)===read)readers.delete(owner);};
}
export function read_terminal_state(owner:object):terminal_state|undefined{return readers.get(owner)?.();}
