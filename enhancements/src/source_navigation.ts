import {monaco_text_input} from "./monaco_text_input";
import * as monaco from "monaco-editor/editor/editor.api";
import type {language_navigation_kind,language_position,language_location} from "./language_locations";
import {pick_history_item} from "./workspace_history_picker";
import {notify_navigation_selection} from "./reading_navigation_ports";
import {source_navigation_gestures} from "./source_navigation_gesture";
import {workspace_text, workspace_text as localize} from "./workspace_i18n";

/** Navigation entry for active source code; requests, target selection, and opening share one cancelable transaction. */
export function bind_source_navigation(editor:monaco.editor.ICodeEditor,options:{
 valid():boolean;query(kind:language_navigation_kind,position:language_position,signal:AbortSignal):Promise<language_location[]>;
 open(target:language_location,signal:AbortSignal):Promise<void>;notice(message:string):void;
}){
 const model=editor.getModel()!,root=editor.getDomNode()!;
 source_navigation_gestures.add(editor);
 let disposed=false,request:AbortController|undefined,down:{line:number;column:number;x:number;y:number}|undefined;
 const labels:Record<language_navigation_kind,string>={definition:workspace_text("source_navigation_go_to_definition"),declaration:workspace_text("source_navigation_go_to_declaration"),implementation:workspace_text("source_navigation_go_to_implementation"),references:workspace_text("source_navigation_find_references")};
 const cancel=()=>{request?.abort();down=undefined;};
 const run=async(kind:language_navigation_kind,position=editor.getPosition())=>{
  if(disposed||!position||!options.valid())return;cancel();const controller=request=new AbortController(),version=model.getVersionId();
  const valid=()=>!disposed&&!controller.signal.aborted&&options.valid()&&!model.isDisposed()&&model.getVersionId()===version;
  try{
   notify_navigation_selection(true);
   const locations=await options.query(kind,{line:position.lineNumber-1,character:position.column-1},controller.signal);
   if(!valid())return;
   if(!locations.length){const missing={definition:'navigation_no_definition',declaration:'navigation_no_declaration',implementation:'navigation_no_implementation',references:'navigation_no_references'} as const;options.notice(localize(missing[kind]));return;}
   const target=locations.length===1?locations[0]:await pick_history_item(localize('navigation_select_target',{action:labels[kind]}),locations.map(value=>({label:value.file_path.split(/[\\/]/u).at(-1)!+":"+(value.range.start.line+1),description:value.file_path+":"+(value.range.start.character+1),file_path:value.file_path,value})),controller.signal);
   if(!target||!valid())return;
   // Opening switches the active leaf and destroys this binding; transactions are only accepted before being passed to the file layer.
   await options.open(target,controller.signal);
  }catch(error){if(valid()&&(error as Error).name!=="AbortError")options.notice(String((error as Error).message||error));}
 };
 const modified=(event:monaco.IMouseEvent)=>event.leftButton&&event.ctrlKey&&!event.shiftKey&&!event.altKey&&!event.metaKey;
 const listeners=[editor.onMouseDown(event=>{
  const p=event.target.position;
  down=modified(event.event)&&event.target.type===monaco.editor.MouseTargetType.CONTENT_TEXT&&p?{line:p.lineNumber,column:p.column,x:event.event.posx,y:event.event.posy}:undefined;
 }),editor.onMouseUp(event=>{
  const start=down;down=undefined;const p=event.target.position;
  if(start&&modified(event.event)&&event.target.type===monaco.editor.MouseTargetType.CONTENT_TEXT&&p&&start.line===p.lineNumber&&Math.abs(start.x-event.event.posx)<=3&&Math.abs(start.y-event.event.posy)<=3){event.event.preventDefault();void run("definition",p);}
 }),editor.onDidChangeCursorPosition(()=>request?.abort()),model.onDidChangeContent(cancel),model.onDidChangeLanguage(cancel)];
 const key=(event:KeyboardEvent)=>{
  if(event.key==="Escape"){cancel();return;}
  if(!options.valid()||monaco_text_input(event.target))return;
  if(event.isComposing||event.altKey||event.metaKey||event.key!=="F12"||event.ctrlKey&&event.shiftKey)return;
  event.preventDefault();event.stopImmediatePropagation();void run(event.shiftKey?"references":event.ctrlKey?"implementation":"definition");
 };
 root.addEventListener("keydown",key,true);
 return {run,entries:()=>Object.entries(labels).map(([kind,title])=>({id:"source_navigation_"+kind,title,shortcut:kind==="definition"?"F12":kind==="implementation"?"Ctrl+F12":kind==="references"?"Shift+F12":undefined,action:()=>void run(kind as language_navigation_kind)})),dispose(){if(disposed)return;disposed=true;source_navigation_gestures.delete(editor);cancel();root.removeEventListener("keydown",key,true);for(const listener of listeners)listener.dispose();}};
}
