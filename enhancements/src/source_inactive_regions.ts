import type {language_range} from './language_locations';
import {acquire_workspace_style} from './workspace_styles';
import css from './source_inactive_regions.css';

const owners=new WeakMap<object,{ids:string[];style:{remove():void}}>();
/** The range comes from the compilation service; decorations follow the shared model, historical snapshots do not borrow the current project state. */
export function set_source_inactive_regions(model:any,ranges:language_range[]=[]):void{
 const previous=owners.get(model);
 if(model.isDisposed()){previous?.style.remove();owners.delete(model);return;}
 const line_count=model.getLineCount();
 const valid=ranges.filter(range=>range.start.line<line_count&&range.end.line<line_count&&range.start.character<=model.getLineMaxColumn(range.start.line+1)-1&&range.end.character<=model.getLineMaxColumn(range.end.line+1)-1);
 if(!valid.length){if(previous){model.deltaDecorations(previous.ids,[]);previous.style.remove();owners.delete(model);}return;}
 const owner=previous||{ids:[],style:acquire_workspace_style('typora-code:inactive-regions',css)};
 owner.ids=model.deltaDecorations(owner.ids,valid.map(range=>({range:{startLineNumber:range.start.line+1,startColumn:range.start.character+1,endLineNumber:range.end.line+1,endColumn:range.end.character+1},options:{description:'clangd inactive region',inlineClassName:'source-inactive-region'}})));
 owners.set(model,owner);
}
