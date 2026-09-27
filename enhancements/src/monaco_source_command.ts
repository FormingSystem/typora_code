import * as monaco from 'monaco-editor/editor/editor.api';
import {InMemoryClipboardMetadataManager,generateDataToCopyAndStoreInMemory} from 'monaco-editor/editor/browser/controller/editContext/clipboardUtils.js';

/** 嵌入宿主没有VS Code主进程的triggerPaste端口；正文仍由Monaco粘贴处理器编辑。 */
export function run_monaco_source_command(editor:monaco.editor.ICodeEditor,command:string):void{
 editor.focus();
 if(['editor.action.clipboardPasteAction','editor.action.clipboardCopyAction','editor.action.clipboardCutAction'].includes(command)){
  if(command!=='editor.action.clipboardCopyAction'&&editor.getOption(monaco.editor.EditorOption.readOnly))return;
  const runtime=window as unknown as {reqnode?:(name:string)=>any},clipboard=runtime.reqnode?.('electron')?.clipboard;
  if(clipboard){
   if(command!=='editor.action.clipboardPasteAction'){
    if(!editor.hasModel()||editor.getSelection()?.isEmpty()&&!editor.getOption(monaco.editor.EditorOption.emptySelectionClipboard))return;
    // 沿用上游Electron复制回退，保留整行、多光标和后续粘贴元数据。
    const {dataToCopy:data_to_copy}=generateDataToCopyAndStoreInMemory((editor as any)._getViewModel(),undefined,false);
    clipboard.writeText(data_to_copy.text);
    if(command==='editor.action.clipboardCutAction')editor.trigger('workspace-menu','cut',null);
    return;
   }
   const text=clipboard.readText(),metadata=InMemoryClipboardMetadataManager.INSTANCE.get(text);
   if(text)editor.trigger('workspace-menu','paste',{text,pasteOnNewLine:!!metadata?.isFromEmptySelection&&editor.getOption(monaco.editor.EditorOption.emptySelectionClipboard),multicursorText:metadata?.multicursorText??null,mode:metadata?.mode??null});
   return;
  }
 }
 const action=editor.getAction(command);if(action)void action.run();else editor.trigger('workspace-menu',command,null);
}
