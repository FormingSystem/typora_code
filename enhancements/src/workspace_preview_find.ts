import {workspace_text} from './workspace_i18n';
import {workspace_element as el} from './workspace_widgets';
import {git_icon_button} from './git_icons';
import {register_workspace_dismissal,type workspace_dismiss_layer} from './workspace_focus';

export type preview_find_result={current:number;total:number;error?:string};
export type preview_find_target={search(query:string,direction:number,repeat:boolean,report:(result:preview_find_result)=>void):void;clear():void;focus():void};

/** One preview owns its query and focus route; content adapters only own matches. */
export function create_preview_find(root:HTMLElement,target:()=>preview_find_target|undefined){
  const bar=el('div','workspace-preview-find'),input=el('input'),status=el('span','workspace-preview-find-status');
  bar.hidden=true;bar.setAttribute('role','search');input.type='text';input.placeholder=workspace_text('preview_find_placeholder');input.setAttribute('aria-label',input.placeholder);
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  let active=false,disposed=false,revision=0,owner:preview_find_target|undefined,layer:workspace_dismiss_layer|undefined;
  const owns_focus=()=>root.contains(document.activeElement)||(active&&(document.activeElement===document.body||document.activeElement===document.documentElement));
  const previous=git_icon_button('arrow-up',workspace_text('preview_find_previous'),()=>run(-1,true));
  const next=git_icon_button('arrow-down',workspace_text('preview_find_next'),()=>run(1,true));
  const close_button=git_icon_button('close',workspace_text('preview_find_close'),()=>close(true));
  const open_button=git_icon_button('search',workspace_text('preview_find_open'),()=>open());open_button.dataset.previewFindOpen='true';
  const close=(restore=false)=>{revision++;owner?.clear();owner=undefined;bar.hidden=true;status.textContent='';layer?.dispose();layer=undefined;open_button.setAttribute('aria-expanded','false');if(restore)target()?.focus();};
  const run=(direction=1,repeat=false)=>{
    if(disposed||bar.hidden)return;const current=target(),token=++revision;
    if(owner!==current){owner?.clear();owner=current;}previous.disabled=next.disabled=true;
    status.textContent='';if(!current)return;
    current.search(input.value,direction,repeat,result=>{
      if(disposed||token!==revision||bar.hidden||owner!==current)return;
      status.textContent=result.error||(input.value?(result.total?workspace_text('preview_find_count',{current:result.current,total:result.total}):workspace_text('preview_find_no_results')):'');
      status.title=status.textContent;previous.disabled=next.disabled=!result.total;
    });
  };
  const open=()=>{
    if(disposed||!target())return;active=true;bar.hidden=false;open_button.setAttribute('aria-expanded','true');
    layer?.dispose();layer=register_workspace_dismissal(()=>owns_focus()&&!bar.hidden?[bar]:[],()=>close(true),{outside:false,focus_out:false,window_blur:false});
    input.focus({preventScroll:true});input.select();run();
  };
  bar.append(input,status,previous,next,close_button);
  input.addEventListener('input',()=>run());
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();event.stopPropagation();run(event.shiftKey?-1:1,true);}});
  const inside=(event:Event)=>event.composedPath().includes(root);
  const select=(event:Event)=>{active=inside(event);};
  const key=(event:KeyboardEvent)=>{
    if(disposed||event.isComposing||event.altKey||!root.isConnected||!root.getClientRects().length||!(inside(event)||owns_focus()))return;
    if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&event.key.toLowerCase()==='f'){
      event.preventDefault();event.stopImmediatePropagation();open();
    }else if(event.key==='F3'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();if(bar.hidden)open();else run(event.shiftKey?-1:1,true);}
  };
  window.addEventListener('pointerdown',select,true);window.addEventListener('focusin',select,true);window.addEventListener('keydown',key,true);
  return {bar,open_button,open,refresh:()=>run(),close,reset(){close();input.value='';active=false;},sync(){open_button.disabled=!target();},request(action:string){if(action==='open')open();else if(action==='close'&&!bar.hidden)close(true);else if(action==='next'||action==='previous'){if(bar.hidden)open();else run(action==='next'?1:-1,true);}},dispose(){if(disposed)return;close();disposed=true;window.removeEventListener('pointerdown',select,true);window.removeEventListener('focusin',select,true);window.removeEventListener('keydown',key,true);bar.remove();}};
}
