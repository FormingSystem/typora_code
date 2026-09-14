import {create_workspace_lifetime} from "./workspace_lifetime";

/** 保留浏览器输入法默认行为，适配xterm 6输入边界；已提交文本仍只由xterm发送。 */
export function bind_terminal_composition(textarea:HTMLTextAreaElement){
  const lifetime=create_workspace_lifetime();
  let prefix="",composing=false,timer=0;
  // xterm在自定义键处理之前把纯Shift记为已见输入，误丢无compositionend的搜狗insertText。
  // 在父级只隔离纯Shift按下，保留浏览器默认行为和xterm的input/keyup清理，不补发文字。
  const input_parent=textarea.parentElement;
  if(input_parent)lifetime.listen(input_parent,"keydown",event=>{
    const key=event as KeyboardEvent;
    if(event.target===textarea&&!composing&&!key.isComposing&&key.keyCode!==229&&!key.ctrlKey&&!key.altKey&&!key.metaKey&&!key.getModifierState("AltGraph")&&(key.key==="Shift"||key.keyCode===16))event.stopPropagation();
  },true);
  let pending:{previous:string;committed:string}|undefined;
  const normalize=(record:{previous:string;committed:string})=>{
    if(lifetime.disposed||!textarea.isConnected||textarea.value!==record.committed)return;
    const start=textarea.selectionStart,end=textarea.selectionEnd,direction=textarea.selectionDirection;
    textarea.value=record.previous+record.committed;
    textarea.setSelectionRange(record.previous.length+start,record.previous.length+end,direction);
  };
  const flush=(record=pending)=>{
    if(!record||pending!==record)return;
    clearTimeout(timer);timer=0;pending=undefined;
    normalize(record);
  };
  const invalidate=()=>{clearTimeout(timer);timer=0;pending=undefined;prefix="";composing=false;};
  // 下一次组合可能早于延迟提交；先归一化旧结果，再让xterm记录新的起点。
  lifetime.listen(textarea,"compositionstart",()=>{flush();prefix=textarea.value;composing=true;},true);
  lifetime.listen(textarea,"compositionend",event=>{
    if(!composing)return;
    composing=false;
    const committed=(event as CompositionEvent).data,previous=prefix;
    prefix="";
    if(!previous||!committed)return;
    // 浏览器可在监听器之后更新DOM。捕获阶段先登记，与xterm相同的0ms队列先归一化再截取。
    const record={previous,committed};pending=record;
    // DOM已更新时立即处理，连续组合不会等到上一轮xterm截取之后才恢复前缀。
    normalize(record);
    timer=window.setTimeout(()=>flush(record),0);
  },true);
  lifetime.listen(textarea,"blur",invalidate);
  lifetime.add(invalidate);
  return lifetime;
}
