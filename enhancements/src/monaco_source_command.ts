import * as monaco from 'monaco-editor/editor/editor.api';
import {InMemoryClipboardMetadataManager,generateDataToCopyAndStoreInMemory} from 'monaco-editor/editor/browser/controller/editContext/clipboardUtils.js';
import {CopyAction,CutAction,PasteAction} from 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js';

/** Bind upstream keyboard commands to the same host adapter used by source menus. */
export function bind_monaco_source_clipboard(editor:monaco.editor.ICodeEditor):monaco.IDisposable{
 const actions=[CopyAction,CutAction,PasteAction].filter(Boolean);
 const bindings=actions.map(action=>action.addImplementation(10001,'typora-code-source',()=>{
  if(!editor.hasTextFocus()||!editor.hasModel()||!(window as any).reqnode?.('electron')?.clipboard)return false;
  run_monaco_source_command(editor,action.id);
  return true;
 }));
 return {dispose(){for(const binding of bindings)binding.dispose();}};
}

/** The embedded host lacks VS Code's triggerPaste service; Monaco still owns model edits. */
export function run_monaco_source_command(editor:monaco.editor.ICodeEditor,command:string):void{
 editor.focus();
 if(['editor.action.clipboardPasteAction','editor.action.clipboardCopyAction','editor.action.clipboardCutAction'].includes(command)){
  if(command!=='editor.action.clipboardCopyAction'&&editor.getOption(monaco.editor.EditorOption.readOnly))return;
  const runtime=window as unknown as {reqnode?:(name:string)=>any},clipboard=runtime.reqnode?.('electron')?.clipboard;
  if(clipboard){
   if(command!=='editor.action.clipboardPasteAction'){
    if(!editor.hasModel()||editor.getSelection()?.isEmpty()&&!editor.getOption(monaco.editor.EditorOption.emptySelectionClipboard))return;
    // Preserve upstream whole-line and multi-cursor clipboard metadata.
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
