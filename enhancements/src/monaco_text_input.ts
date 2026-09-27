import {workspace_menu} from './workspace_widgets';

type text_input=HTMLInputElement|HTMLTextAreaElement;
/** 查找/替换等辅助文本框；Monaco代码输入代理仍由编辑器拥有。 */
export function monaco_text_input(target:EventTarget|null):text_input|undefined{
 if((target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement)&&target.closest('.monaco-editor')&&!target.classList.contains('inputarea'))return target;
}
export function run_text_input_command(input:text_input,command:string):void{
 if(!input.isConnected||input.disabled)return;
 if(input.readOnly&&!['copy','selectAll'].includes(command))return;
 input.focus({preventScroll:true});
 if(command==='selectAll'){input.select();return;}
 if(['copy','cut','paste'].includes(command)){
  const runtime=window as unknown as {reqnode?:(name:string)=>any};
  const clipboard=runtime.reqnode?.('electron')?.clipboard;
  if(clipboard){
   if(command==='paste')input.ownerDocument.execCommand('insertText',false,clipboard.readText());
   else{
    const start=input.selectionStart??0,end=input.selectionEnd??start;
    if(start!==end){clipboard.writeText(input.value.slice(start,end));if(command==='cut')input.ownerDocument.execCommand('delete');}
   }
   return;
  }
 }
 input.ownerDocument.execCommand(command);
}
export function monaco_text_input_menu(event:MouseEvent,input:text_input):()=>void{
 const start=input.selectionStart,end=input.selectionEnd;
 const entries=[['undo','撤销','Ctrl+Z'],['redo','重做','Ctrl+Y'],['cut','剪切','Ctrl+X'],['copy','复制','Ctrl+C'],['paste','粘贴','Ctrl+V'],['selectAll','全选','Ctrl+A']];
 return workspace_menu(event,entries.map(([command,title,shortcut])=>({id:'input_'+command,title,shortcut,separator:command==='cut'||command==='selectAll',disabled:input.disabled||input.readOnly&&!['copy','selectAll'].includes(command)||['copy','cut'].includes(command)&&start===end,action:()=>{
  if(!input.isConnected)return;input.focus({preventScroll:true});input.setSelectionRange(start,end);run_text_input_command(input,command);
 }})),'workspace-text-input-menu');
}
/** 宿主编辑快捷键不能越过此边界执行Markdown命令；浏览器管理本框撤销栈。 */
export function monaco_text_input_key(event:KeyboardEvent):boolean{
 const input=monaco_text_input(event.target);if(!input||event.isComposing||event.altKey||!(event.ctrlKey||event.metaKey))return false;
 const key=event.key.toLowerCase(),command=key==='z'?(event.shiftKey?'redo':'undo'):!event.shiftKey?({y:'redo',x:'cut',c:'copy',v:'paste',a:'selectAll'} as Record<string,string>)[key]:undefined;
 if(!command)return false;event.preventDefault();event.stopImmediatePropagation();run_text_input_command(input,command);return true;
}
