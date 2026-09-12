import {read_text_color_open,rewrite_text_colors,type text_color_run,type text_color_cut} from "./markdown_text_color";

type native_command={type?:string;id?:string;json?:{content:{text:string};[key:string]:unknown};[key:string]:unknown};
type native_node={cid:string;get(key:string):unknown};
type native_editor={
  getMarkdown():string;getNode(id:string):native_node|undefined;
  sourceView:{inSourceMode:boolean};selection:{buildUndo():native_command|null};
  contextMenu:{show(event:MouseEvent,target?:Element):unknown;hide():void};
  undo:{endSnap(force:boolean):void;exeCommand(command:native_command):unknown;register(command:{undo:native_command[];redo:native_command[]}):void;
    UndoManager:{buildReplaceUndo(node:native_node):native_command;buildAttrUndo?(node:native_node,key:string):native_command}};
};
export type text_color_runtime={File?:{isLocked?:boolean;isFileLoading?():boolean;bundle?:object;editor?:native_editor}};
type block_snapshot={id:string;table_id?:string;source:string;runs:text_color_run[];cuts:text_color_cut[];selected:text_color_cut[]};
export type text_color_selection={editor:native_editor;bundle:object;owner:unknown;markdown:string;cursor:native_command;blocks:block_snapshot[]};
const meta_selector=".md-meta,.md-content";
const forbidden_selector=".CodeMirror,.md-math,.md-inline-math,.md-image,.md-fences,.md-rawblock,script,style,textarea,input";
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));

export function capture_text_color(runtime:text_color_runtime,owner:unknown):text_color_selection|undefined{
  const file=runtime.File,e=file?.editor,root=document.querySelector("#write"),s=window.getSelection();
  if(!e?.undo?.UndoManager?.buildReplaceUndo||!e.contextMenu?.hide||!file?.bundle||file.isLocked||file.isFileLoading?.()||e.sourceView.inSourceMode||!root||!s||s.isCollapsed||s.rangeCount!==1)return;
  const range=s.getRangeAt(0);if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return;
  const cursor=e.selection.buildUndo();if(!cursor||cursor.type!=="cursor")return;
  const blocks:block_snapshot[]=[];
  for(const block of root.querySelectorAll<HTMLElement>("[cid]")){
    if(block.querySelector("[cid]")||!range.intersectsNode(block))continue;
    const id=block.getAttribute("cid")!,node=e.getNode(id);if(!node)continue;
    const source=block.textContent||"";const texts:{node:Text;start:number;end:number;selected?:text_color_cut}[]=[];
    const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);let offset=0,current:Node|null;
    while((current=walker.nextNode())){
      const text=current as Text,start=offset,end=offset+text.length;offset=end;
      let selected:text_color_cut|undefined;
      if(text.length&&range.comparePoint(text,0)!==1&&range.comparePoint(text,text.length)!==-1){
        const left=range.startContainer===text?range.startOffset:0,right=range.endContainer===text?range.endOffset:text.length;
        if(right>left)selected={start:start+left,end:start+right};
      }
      texts.push({node:text,start,end,selected});
    }
    const visible=texts.filter(item=>(!item.node.parentElement?.closest(meta_selector)||item.node.parentElement?.closest('[md-inline="html_entity"]')));
    if(!visible.some(item=>item.selected))continue;
    if(!["paragraph","heading","table_cell","def_footnote"].includes(String(node.get("type")))||visible.some(item=>item.selected&&item.node.parentElement?.closest(forbidden_selector)))throw new Error("字体颜色适用于普通 Markdown 文字；请避开代码块、公式和图片。");
    if(node.get("text")!==source)throw new Error("当前段落含有无法安全映射的特殊语法，请重新选取普通文字。");
    const managed=new Map<Element,string>(),cuts:text_color_cut[]=[];
    const cut_element=(element:Element)=>{const inside=texts.filter(item=>element.contains(item.node));if(inside.length)cuts.push({start:inside[0].start,end:inside.at(-1)!.end});};
    for(const wrapper of block.querySelectorAll('[md-inline="html_inline"]')){
      const before=wrapper.querySelector(":scope > .md-before"),after=wrapper.querySelector(":scope > .md-after");
      const color=before&&read_text_color_open(before.textContent||"");
      if(color&&after?.textContent==="</span>"){managed.set(wrapper,color);cut_element(before!);cut_element(after);}
    }
    const color_at=(element:Element|null)=>{while(element&&element!==block){const color=managed.get(element);if(color)return color;element=element.parentElement;}return undefined;};
    const runs:text_color_run[]=[],selected:text_color_cut[]=[];
    const code_seen=new Set<Element>();
    for(const item of visible){
      const code=item.node.parentElement?.closest('[md-inline="code"],[md-inline="escape"],[md-inline="html_entity"]');
      if(code){
        if(code_seen.has(code))continue;code_seen.add(code);
        const content=visible.filter(part=>code.contains(part.node));const all=texts.filter(part=>code.contains(part.node));
        const hits=content.filter(part=>part.selected);
        if(hits.length&&(hits.length!==content.length||hits.some(part=>part.selected!.start!==part.start||part.selected!.end!==part.end)))throw new Error("行内代码或转义字符请完整选中后设色，避免改变原内容。");
        const span={start:all[0].start,end:all.at(-1)!.end};runs.push({...span,color:color_at(code)});if(hits.length)selected.push(span);continue;
      }
      if(item.end>item.start)runs.push({start:item.start,end:item.end,color:color_at(item.node.parentElement)});
      if(item.selected)selected.push(item.selected);
    }
    blocks.push({id,table_id:block.closest('[mdtype="table"][cid]')?.getAttribute("cid")||undefined,source,runs,cuts,selected});
  }
  if(!blocks.length)return;
  return {editor:e,bundle:file.bundle,owner,markdown:e.getMarkdown(),cursor:clone(cursor),blocks};
}

/** 复用 Typora 1.14.10 replace/cursor 命令，一次注册完整局部事务；不修改整篇正文或系统剪贴板。 */
export function apply_text_color(runtime:text_color_runtime,owner:unknown,snapshot:text_color_selection,color?:string):boolean{
  const e=snapshot.editor,file=runtime.File;
  if(!file||file.editor!==e||file.bundle!==snapshot.bundle||owner!==snapshot.owner||file.isLocked||file.isFileLoading?.()||e.sourceView.inSourceMode||e.getMarkdown()!==snapshot.markdown)throw new Error("文档或选区已变化，请重新选中文字后设置颜色。");
  const changes=snapshot.blocks.map(block=>{
    const node=e.getNode(block.id);if(!node||node.get("text")!==block.source)throw new Error("段落已变化，请重新选择。");
    const runs:text_color_run[]=[];
    for(const run of block.runs){let pos=run.start;for(const hit of block.selected){const left=Math.max(run.start,hit.start),right=Math.min(run.end,hit.end);if(right<=left)continue;if(left>pos)runs.push({start:pos,end:left,color:run.color});runs.push({start:left,end:right,color});pos=right;}if(pos<run.end)runs.push({start:pos,end:run.end,color:run.color});}
    const result=rewrite_text_colors(block.source,runs,block.cuts,{start:block.selected[0].start,end:block.selected.at(-1)!.end});
    const before=clone(e.undo.UndoManager.buildReplaceUndo(node)),after=clone(before);
    if(!after.json?.content||typeof after.json.content.text!=="string")throw new Error("当前 Typora 不支持安全的段落颜色事务。");
    after.json.content.text=result.text;return {block,before,after,result};
  });
  if(changes.every(change=>change.result.text===change.block.source))return false;
  // Typora 的 table.userText 保存原表格源码；原生文本格式操作会使它失效。
  // 将缓存属性与单元格替换放在同一撤销事务，不能只改屏幕上的单元格。
  const table_commands=[...new Set(changes.map(change=>change.block.table_id).filter(Boolean))].map(id=>{
    const table=e.getNode(id!),build=e.undo.UndoManager.buildAttrUndo;
    if(!table||!build)throw new Error("当前 Typora 不支持安全的表格颜色事务。");
    const before=clone(build(table,"userText")),after={...before,value:undefined};return {before,after};
  });
  e.undo.endSnap(true);
  // endSnap 可能收纳刚结束的输入；不能在随后发现身份变化时覆盖它。
  if(e.getMarkdown()!==snapshot.markdown)throw new Error("段落输入尚未结束，请重新选择后设色。");
  const first=changes[0],last=changes.at(-1)!;
  const cursor:native_command={type:"cursor",...(first===last?{id:first.block.id}:{startId:first.block.id,endId:last.block.id}),start:first.result.selection!.start,end:last.result.selection!.end};
  try{
    for(const change of changes)e.undo.exeCommand(clone(change.after));
    for(const command of table_commands)e.undo.exeCommand(clone(command.after));
    e.undo.exeCommand(clone(cursor));
    e.undo.register({undo:[snapshot.cursor,...table_commands.map(c=>c.before),...changes.map(c=>c.before)],redo:[...changes.map(c=>c.after),...table_commands.map(c=>c.after),cursor]});
  }catch(error){for(const change of changes)e.undo.exeCommand(clone(change.before));for(const command of table_commands)e.undo.exeCommand(clone(command.before));e.undo.exeCommand(clone(snapshot.cursor));throw error;}
  return true;
}
