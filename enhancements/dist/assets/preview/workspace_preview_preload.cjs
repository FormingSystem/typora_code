// Only trusted find gestures leave the isolated guest; no API is exposed to page scripts.
const {ipcRenderer}=require('electron');
let find_open=false;
ipcRenderer.on('typora-code-preview-find-state',(_event,value)=>{find_open=value===true;});
window.addEventListener('keydown',event=>{
  if(!event.isTrusted||event.isComposing||event.altKey)return;
  let action;
  if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&event.key.toLowerCase()==='f')action='open';
  else if(!event.ctrlKey&&!event.metaKey&&event.key==='F3')action=event.shiftKey?'previous':'next';
  else if(find_open&&event.key==='Escape')action='close';
  if(!action)return;event.preventDefault();event.stopImmediatePropagation();ipcRenderer.sendToHost('typora-code-preview-find',action);
},true);
