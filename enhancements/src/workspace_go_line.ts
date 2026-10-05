import {workspace_text as text} from './workspace_i18n';
import {navigation_editor,notify_navigation_selection} from './reading_navigation_ports';
import {parse_line_position,type line_target} from './workspace_line_target';
import {native_document_active} from './workspace_view_state';
import {reveal_markdown_location} from './workspace_markdown_location';
import {capture_workspace_focus,register_workspace_dismissal} from './workspace_focus';
import {acquire_workspace_style} from './workspace_styles';
import {acquire_workspace_interaction} from './workspace_interaction';
import {is_composing_key,is_terminal_input} from './workspace_keyboard';
import {get_workspace_quick_open} from './workspace_quick_open';
import type {workspace_file_host} from './workspace_files';
import css from './workspace_quick_open.css';

export const GO_LINE_COMMAND='typora_code:go_line';
export function active_line_target(files:workspace_file_host,runtime:any=window):line_target|undefined{
 const port=navigation_editor().line_target?.();if(port)return port;
 if(!native_document_active(files,runtime)||runtime.File?.editor?.sourceView?.inSourceMode||runtime.File?.isFileLoading?.())return;
 const editor=runtime.File.editor,leaf=files.core.app.workspace.activeLeaf;
 if(!editor?.getMarkdown||!editor.sourceView?.gotoLine)return;
 const content=editor.getMarkdown();
 return {text:content,tab_size:4,valid:()=>native_document_active(files,runtime)&&files.core.app.workspace.activeLeaf===leaf&&editor.getMarkdown()===content,
  preview(){},restore(){},accept:async(position,signal)=>{await reveal_markdown_location({line:position.line,column:position.column},signal);}};
}

/** Quick input owns presentation only; each editor owns its model and navigation session. */
export function bind_workspace_go_line(files:workspace_file_host){
 let close_current:((restore_focus?:boolean,restore_position?:boolean)=>void)|undefined,disposed=false;
 const open=()=>{
  if(disposed)return;
  const existing=document.querySelector<HTMLInputElement>('.workspace-go-line input');if(existing){existing.focus();existing.select();return;}
  const target=active_line_target(files);if(!target)return;
  get_workspace_quick_open()?.close();notify_navigation_selection(true);
  const lines=target.text.replace(/\r\n?/gu,'\n').split('\n'),focus=capture_workspace_focus(),controller=new AbortController();
  const root=document.createElement('section');root.className='workspace-quick-open workspace-go-line';root.setAttribute('role','dialog');root.setAttribute('aria-label',text('go_line_title'));
  const row=document.createElement('div');row.className='workspace-quick-open-input-row';
  const input=document.createElement('input');input.type='text';input.value=':';input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label',text('go_line_title'));input.setAttribute('role','combobox');input.setAttribute('aria-expanded','true');input.setAttribute('aria-autocomplete','none');
  const list=document.createElement('div');list.className='workspace-quick-open-results';list.setAttribute('role','listbox');list.id='workspace-go-line-results';input.setAttribute('aria-controls',list.id);
  const result=document.createElement('button');result.type='button';result.className='workspace-quick-open-result is-selected';result.setAttribute('role','option');result.setAttribute('aria-selected','true');result.id='workspace-go-line-position';result.tabIndex=-1;input.setAttribute('aria-activedescendant',result.id);result.setAttribute('aria-live','polite');
  row.append(input);list.append(result);root.append(row,list);document.body.append(root);
  const style=acquire_workspace_style('typora-code-quick-open-style',css),interaction=acquire_workspace_interaction(root);
  let closed=false,busy=false,frame=0,stop_invalid:(()=>void)|undefined;
  const close=(restore_focus=true,restore_position=true)=>{if(closed)return;closed=true;controller.abort();cancelAnimationFrame(frame);stop_invalid?.();layer.dispose();root.remove();style.remove();interaction.remove();if(restore_position&&target.valid())target.restore();if(restore_focus)focus.restore();if(close_current===close)close_current=undefined;};
  close_current=close;
  const layer=register_workspace_dismissal(()=>[root],reason=>{if(!busy)close(reason==='escape');},{window_blur:true});
  stop_invalid=target.on_invalidate?.(()=>close(false,false));
  const update=()=>{
   if(!target.valid()){close(false,false);return;}
   const position=parse_line_position(input.value,lines,target.tab_size);
   result.textContent=position?text('go_line_position',{line:position.line,column:position.visible_column}):text('go_line_prompt',{count:lines.length});
   result.setAttribute('aria-disabled',String(!position));input.setAttribute('aria-invalid',String(!position&&input.value!==':'));
   cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;if(!closed&&position&&target.valid())target.preview(position);});
  };
  const accept=async()=>{
   if(busy||closed)return;if(!target.valid()){close(false,false);return;}
   const position=parse_line_position(input.value,lines,target.tab_size);if(!position)return;
   busy=true;cancelAnimationFrame(frame);target.restore();notify_navigation_selection(true);
   try{await target.accept(position,controller.signal);if(!closed){notify_navigation_selection(true);close(false,false);}}
   catch(error){if(!closed&&!controller.signal.aborted){result.textContent=String((error as Error).message||error);input.focus();}}
   finally{busy=false;}
  };
  input.oninput=()=>{if(!busy)update();};input.onkeydown=event=>{if(is_composing_key(event))return;if(event.key==='Enter'){event.preventDefault();event.stopPropagation();void accept();}};
  result.onmousedown=event=>event.preventDefault();result.onclick=()=>void accept();update();input.focus();input.setSelectionRange(1,1);
 };
 const stop=files.core.app.commands.register({id:GO_LINE_COMMAND,title:text('go_line_title'),scope:'global',callback:open});
 const key=(event:KeyboardEvent)=>{
  if(is_composing_key(event)||event.repeat||!event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.code!=='KeyG'||is_terminal_input(event))return;
  const element=event.target instanceof Element?event.target:null;
  if(element?.closest('.workspace-link-dock,.workspace-lookup-preview')||document.querySelector('[aria-modal="true"]:not([hidden])'))return;
  if(element?.closest('input,textarea,[contenteditable="true"]')&&!element.closest('#write,#typora-source,.workspace-go-line')&&!element.matches('.inputarea'))return;
  if(!active_line_target(files))return;event.preventDefault();event.stopImmediatePropagation();files.core.app.commands.run(GO_LINE_COMMAND);
 };
 window.addEventListener('keydown',key,true);window.addEventListener('linux-note-workspace-context-changed',cancel_active);
 function cancel_active(){close_current?.(false,false);}
 const stop_leaf=files.core.app.workspace.on('active-leaf:change',cancel_active);
 return {open,dispose(){disposed=true;cancel_active();stop();stop_leaf();window.removeEventListener('keydown',key,true);window.removeEventListener('linux-note-workspace-context-changed',cancel_active);}};
}
