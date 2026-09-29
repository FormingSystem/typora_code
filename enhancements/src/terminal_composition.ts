import {create_workspace_lifetime} from "./workspace_lifetime";

/** Retain the browser input method's default behavior, adapt xterm 6 input boundary; submitted text is still only sent by xterm. */
export function bind_terminal_composition(textarea:HTMLTextAreaElement){
  const lifetime=create_workspace_lifetime();
  let prefix="",composing=false,timer=0;
  // xterm marks pure Shift as seen input before custom key handling, mistakenly discard without compositionend of the Sogou insertText.
  // Isolate pure Shift presses only at the parent level, retain browser default behavior and xterm's input/keyup cleaning, do not resend text.
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
  // The next combination may be earlier than the delayed submission; first normalize the old results, then let xterm record the new starting point.
  lifetime.listen(textarea,"compositionstart",()=>{flush();prefix=textarea.value;composing=true;},true);
  lifetime.listen(textarea,"compositionend",event=>{
    if(!composing)return;
    composing=false;
    const committed=(event as CompositionEvent).data,previous=prefix;
    prefix="";
    if(!previous||!committed)return;
    // The browser can update DOM after the listener. The capture phase first registers, and the same 0ms queue as xterm is normalized first and then truncated.
    const record={previous,committed};pending=record;
    // Process immediately when DOM is updated. Continuous combinations do not wait for the previous xterm truncation before resuming the prefix.
    normalize(record);
    timer=window.setTimeout(()=>flush(record),0);
  },true);
  lifetime.listen(textarea,"blur",invalidate);
  lifetime.add(invalidate);
  return lifetime;
}
