import type * as monaco from 'monaco-editor/editor/editor.api';
import {CursorColumns} from 'monaco-editor/editor/common/core/cursorColumns';

export type line_position={line:number;column:number;visible_column:number};
export type line_target={text:string;tab_size:number;valid():boolean;on_invalidate?(listener:()=>void):()=>void;preview(position:line_position):void;restore():void;accept(position:line_position,signal:AbortSignal):void|Promise<void>};

/** Source positions are one-based; tabs use the same visible-column conversion as Monaco. */
export function parse_line_position(value:string,lines:readonly string[],tab_size:number):line_position|undefined{
 const parts=value.trim().replace(/^:/u,'').split(/[:,#]/u);
 if(parts.length>2||!/^[-+]?\d+$/u.test(parts[0]?.trim()||''))return;
 let line=Number(parts[0]);if(!Number.isSafeInteger(line))return;
 line=Math.min(lines.length,Math.max(1,line<0?lines.length+1+line:line));
 const text=lines[line-1]||'',max=CursorColumns.visibleColumnFromColumn(text,text.length+1,tab_size)+1;
 const raw=parts[1]?.trim();if(raw&&!/^[-+]?\d+$/u.test(raw))return;
 let visible_column=raw?Number(raw):1;if(!Number.isSafeInteger(visible_column))return;
 visible_column=Math.min(max,Math.max(1,visible_column<0?max+visible_column:visible_column));
 return {line,column:CursorColumns.columnFromVisibleColumn(text,visible_column-1,tab_size),visible_column};
}

export function monaco_line_target(editor:monaco.editor.ICodeEditor,active:()=>boolean):line_target|undefined{
 const model=editor.getModel();if(!model||model.isDisposed())return;
 const version=model.getVersionId(),state=editor.saveViewState();
 const valid=()=>active()&&!model.isDisposed()&&editor.getModel()===model&&model.getVersionId()===version;
 const preview=(position:line_position)=>{if(valid())editor.revealPositionInCenter({lineNumber:position.line,column:position.column});};
  return {text:model.getValue(),tab_size:model.getOptions().tabSize,valid,preview,
  on_invalidate(listener){const subscriptions=[model.onDidChangeContent(listener),model.onWillDispose(listener),editor.onDidChangeModel(listener)];return()=>subscriptions.forEach(item=>item.dispose());},
  restore(){if(valid()&&state)editor.restoreViewState(state);},
  accept(position){if(!valid())return;editor.setPosition({lineNumber:position.line,column:position.column});preview(position);editor.focus();}};
}
