import type {graph_leaf} from "./git_graph_host";
import type {workspace_file_host} from "./workspace_files";
import type {workspace_save_service} from "./workspace_save_service";
import type {local_history_entry} from "./workspace_local_history";
import {restore_history_entry} from "./workspace_history_restore";
import {git_diff_editor,type diff_document} from "./git_diff_editor";
import {decode_file_bytes} from "./file_language";
import {workspace_dialog,workspace_element as el,workspace_button} from "./workspace_widgets";
import {select_workspace_editor_group} from "./workspace_editor_settings";
import {workspace_leaf_tab} from "./workspace_leaf_tab";
import {workspace_file_icon} from "./workspace_file_icons";
import {file_key} from "./workspace_file_uri";

/** 本地历史和剪贴板比较是普通只读文档叶子，复用现有Monaco差异组件。 */
export function bind_workspace_history_view(files:workspace_file_host,saves:workspace_save_service){
  const core=files.core,workspace=core.app.workspace,type="typora_code.local_history";
  const payloads=new Map<string,{data:diff_document;entry?:local_history_entry;expected_hash?:string}>(),views=new Set<history_view>();
  const dialogs=new Set<ReturnType<typeof workspace_dialog>>(),dialog_owners=new Map<ReturnType<typeof workspace_dialog>,object>();let disposed=false;
  class history_view extends core.WorkspaceView{
    containerEl=el("section","workspace-history-document");icon="fa-history";editor?:git_diff_editor;
    constructor(leaf:graph_leaf){super(leaf);views.add(this);}
    onOpen(){
      if(disposed)return;const payload=payloads.get(this.leaf.state.path);if(!payload)return;
      if(!this.editor){
        this.editor=new git_diff_editor(payload.data,()=>payload.entry?[{title:"恢复此版本的内容…",action:()=>confirm_restore(payload)}]:[]);
        if(payload.entry){const restore=workspace_button("恢复内容…",()=>confirm_restore(payload));restore.dataset.historyRestore="true";this.editor.toolbar.prepend(restore);}
        this.containerEl.append(this.editor.container);
      }
      const tab=workspace_leaf_tab(this.leaf);if(tab){const label=tab.querySelector(".typ-file-basename");if(label)label.textContent=payload.data.title;tab.title=payload.data.title;tab.querySelector(".typ-file-ext")?.remove();}
      this.editor.editor.layout();
    }
    setIcon(){const tab=workspace_leaf_tab(this.leaf),payload=payloads.get(this.leaf.state.path);if(tab&&payload?.data.file){const icon=tab.querySelector(".typ-file-icon");if(icon){icon.className="typ-file-icon workspace-file-theme-slot";icon.replaceChildren(workspace_file_icon(payload.data.file));}}}
    onClose(){queueMicrotask(()=>{let present=false;workspace.eachLeaves(leaf=>{if(leaf===this.leaf)present=true;});if(!present){const payload=payloads.get(this.leaf.state.path);for(const dialog of dialogs)if(dialog_owners.get(dialog)===payload)dialog.close();this.editor?.dispose();views.delete(this);payloads.delete(this.leaf.state.path);}});}
  }
  const release=core.app.viewManager.registerView(type,leaf=>new history_view(leaf));
  function open(data:diff_document,entry?:local_history_entry,expected_hash?:string){
    if(disposed)return;const uri="typ://typora_code.local_history/"+crypto.randomUUID()+"/"+encodeURIComponent(data.title);
    payloads.set(uri,{data,entry,expected_hash});const group=select_workspace_editor_group(core,uri),leaf=workspace.createLeaf({type,state:{path:uri}});group.appendChild(leaf);workspace.activeLeaf=leaf;
  }
  async function open_entry(entry:local_history_entry){
    const bytes=await saves.history.read(entry);let right:string|undefined,expected_hash:string|undefined;
    try{const current=await saves.history.read_snapshot(entry.file_path);expected_hash=saves.history.hash(current);right=await files.read_text(entry.file_path);}catch(error){if((error as any).code!=="ENOENT")throw error;}
    if(disposed)return;
    open({title:files.path_api.basename(entry.file_path)+"（本地历史）",file:entry.file_path,left:decode_file_bytes(bytes).text,right,left_label:new Date(entry.timestamp).toLocaleString(),right_label:entry.file_path},entry,expected_hash);
  }
  const payload_present=(payload:object)=>{let present=false;workspace.eachLeaves(leaf=>{if(payloads.get(leaf.state.path)===payload)present=true;});return present;};
  const target_idle=(path:string)=>{let idle=files.can_write(path);workspace.eachLeaves(leaf=>{const state=files.editor_state(leaf);if(file_key(state.file_path)===file_key(path)&&(state.dirty||state.busy))idle=false;});return idle;};
  function confirm_restore(payload:{entry?:local_history_entry;expected_hash?:string}){
    if(!payload.entry||disposed||!payload_present(payload))return;const entry=payload.entry;
    const dirty:graph_leaf[]=[];workspace.eachLeaves(leaf=>{if(file_key(files.editor_state(leaf).file_path)===file_key(entry.file_path)&&files.editor_state(leaf).dirty)dirty.push(leaf);});
    const dialog=workspace_dialog("恢复文件内容","取消",()=>{dialogs.delete(dialog);dialog_owners.delete(dialog);});dialogs.add(dialog);dialog_owners.set(dialog,payload);
    const active=()=>!disposed&&dialog.root.isConnected&&payload_present(payload);
    const message=el("p","",`将 ${files.path_api.basename(entry.file_path)} 恢复到 ${new Date(entry.timestamp).toLocaleString()}。`),error=el("p");error.setAttribute("role","status");
    dialog.content.append(message,el("p","",dirty.length?"当前有未保存的修改。将先保存并保留当前版本，再恢复所选历史。":"恢复前会保留当前磁盘版本。"),error);
    let busy=false;
    const accept=workspace_button(dirty.length?"保存当前修改并恢复":"恢复",()=>{if(busy)return;busy=true;accept.disabled=true;
      void(async()=>{
        if(!active())return;let expected=payload.expected_hash;
        if(dirty.length){for(const leaf of dirty){const state=files.editor_state(leaf);if(!active()||file_key(state.file_path)!==file_key(entry.file_path)||state.busy)throw new Error("编辑器或恢复目标已变化，未执行恢复。");if(!await files.save_leaf(leaf))throw new Error("当前修改未能保存，未执行恢复。");}if(!active())return;const bytes=await saves.history.read_snapshot(entry.file_path);expected=saves.history.hash(bytes);}
        await restore_history_entry(files,saves.history,entry,expected,()=>active()&&target_idle(entry.file_path));
        await saves.history.flush();if(!active())return;
        if(!target_idle(entry.file_path))throw new Error("磁盘已恢复，但编辑器又有修改或正在保存，已保留当前编辑内容。");
        files.refresh_files([entry.file_path]);saves.notify();
        await files.open_file(entry.file_path);if(!active())return;
        const leaf=workspace.activeLeaf,state=leaf&&files.editor_state(leaf);
        // 源码由refresh_files更新；原生Markdown只在目标仍活动且无草稿时重载。
        if(state?.kind==="markdown"&&file_key(state.file_path)===file_key(entry.file_path)&&!state.dirty&&!state.busy)files.reload_active();
        dialog.close();
      })().catch(problem=>{if(dialog.root.isConnected){error.textContent=String(problem instanceof Error?problem.message:problem);busy=false;accept.disabled=false;}});
    });dialog.footer.prepend(accept);
  }
  return{open,open_entry,dispose(){disposed=true;for(const dialog of dialogs)dialog.close();for(const view of views)view.editor?.dispose();views.clear();payloads.clear();dialog_owners.clear();release();}};
}
