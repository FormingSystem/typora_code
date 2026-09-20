import {commit_web_entry} from "./git_commit_web_action";
import type {git_graph_panel} from "./git_graph_panel";
import {graph_actions} from "./git_graph_actions";
import {compare_files,EMPTY,require_revision} from "./git_graph_repository";
import {read_worktrees} from "./git_scm_data";
import {workspace_element as el,workspace_button as button,workspace_dialog,type workspace_menu_entry} from "./workspace_widgets";
import {git_graph_text as text} from "./git_graph_i18n";

export function checkout_entries(panel:git_graph_panel,hash?:string):workspace_menu_entry[]{
  const state=panel.state;if(!state)return [];
  return state.refs.filter(ref=>(!hash||ref.hash===hash)&&/^refs\/(heads|remotes)\//u.test(ref.name)&&!ref.name.endsWith("/HEAD")).map(ref=>{
    const local=ref.name.startsWith("refs/heads/"),name=ref.name.replace(/^refs\/(heads|remotes)\//u,"");
    const remote=state.remotes.filter(remote=>name.startsWith(remote.name+"/")).sort((a,b)=>b.name.length-a.name.length)[0]?.name||"";
    return {id:"checkout:"+ref.name,title:name,checked:local&&state.branch===name,disabled:panel.writing||local&&state.branch===name,action:()=>panel.action_dialog(local?"branch_checkout":"remote_checkout",local?"branch":"remote",name,ref.hash,local?{}:{branch:name.slice(remote.length+1)})};
  });
}
/** 比较固定对象 ID；所有文件交给既有只读审阅器，保持完整的前后文件导航。 */
export async function open_scm_comparison(panel:git_graph_panel,from:string,to:string):Promise<void>{
  const state=panel.state;if(!state)return;const runner=panel.runner,root=panel.root,epoch=++panel.workbench.load_epoch;
  try{const files=await compare_files(runner.run,state,from,to);if(panel.disposed||root!==panel.root||runner!==panel.runner||epoch!==panel.workbench.load_epoch)return;if(!files.length){panel.report(text("history.no_changed_files"));return;}await panel.workbench.open_file(files[0],from,to,files);}catch(error){if(!panel.disposed&&root===panel.root&&runner===panel.runner)panel.report(error);}
}
export function commit_entries(panel:git_graph_panel,hash:string):workspace_menu_entry[]{
  const state=panel.state;if(!state)return [];
  const root=panel.root,runner=panel.runner;
  const read=async(action:()=>Promise<void>)=>{try{if(!panel.disposed&&root===panel.root&&runner===panel.runner)await action();}catch(error){if(root===panel.root&&runner===panel.runner)panel.report(error);}};
  const action=(id:string):workspace_menu_entry=>({id,title:graph_actions.find(action=>action.id===id)!.title,disabled:panel.writing,action:()=>panel.action_dialog(id,"commit",hash,hash)});
  const checkout=checkout_entries(panel,hash);
  const deletes:workspace_menu_entry[]=state.refs.filter(ref=>ref.hash===hash&&/^refs\/(heads|remotes)\//u.test(ref.name)&&!ref.name.endsWith("/HEAD")).map(ref=>{
    const local=ref.name.startsWith("refs/heads/"),name=ref.name.replace(/^refs\/(heads|remotes)\//u,"");
    const remote=state.remotes.filter(remote=>name.startsWith(remote.name+"/")).sort((a,b)=>b.name.length-a.name.length)[0]?.name||"";
    return {id:"delete:"+ref.name,title:name,disabled:panel.writing||local&&name===state.branch||ref.name===state.tracking?.upstream,action:()=>panel.action_dialog(local?"branch_delete":"remote_branch_delete",local?"branch":"remote",name,hash,local?{}:{remote,branch:name.slice(remote.length+1)})};
  });
  const open_changes=()=>void read(async()=>{
    const parent=state.commits.find(commit=>commit.hash===hash)?.parents[0]||(await runner.run(root,["show","-s","--format=%P",require_revision(hash),"--"])).trim().split(" ")[0]||EMPTY;
    if(root===panel.root&&runner===panel.runner)await open_scm_comparison(panel,parent,hash);
  });
  const compare_with=()=>{
    const dialog=workspace_dialog(text("scm.compare_with")),search=el("input"),list=el("div");search.type="search";search.placeholder=text("scm.search_references");search.setAttribute("aria-label",search.placeholder);dialog.content.append(search,list);
    for(const ref of state.refs){const node=button(ref.name.replace(/^refs\//u,""),()=>{dialog.close();if(root===panel.root&&runner===panel.runner)void open_scm_comparison(panel,ref.hash,hash);});node.dataset.compareRef=ref.name;list.append(node);}
    search.oninput=()=>{for(const node of list.children)(node as HTMLElement).hidden=!node.textContent?.toLocaleLowerCase().includes(search.value.toLocaleLowerCase());};
  };
  return [
    {id:"open_changes",title:text("history.open_changes"),action:open_changes},
    commit_web_entry(panel,hash),
    {id:"checkout",title:text("scm.checkout"),children:checkout,disabled:!checkout.length,separator:true,action(){}},
    {...action("commit_checkout"),title:text("scm.checkout_detached")},
    {...action("branch_create"),separator:true},
    {id:"delete_branch",title:text("scm.delete_branch"),children:deletes,disabled:!deletes.length,action(){}},
    {...action("tag_add"),separator:true},
    {...action("cherry_pick"),separator:true},
    {id:"compare_remote",title:text("scm.compare_remote"),separator:true,disabled:!state.tracking?.upstream_hash,action:()=>void open_scm_comparison(panel,state.tracking!.upstream_hash,hash)},
    {id:"compare_base",title:text("scm.compare_base"),disabled:!state.tracking?.base_hash,action:()=>void open_scm_comparison(panel,state.tracking!.base_hash,hash)},
    {id:"compare_with",title:text("scm.compare_with"),disabled:!state.refs.length,action:compare_with},
    {id:"copy_hash",title:text("scm.copy_commit_hash"),separator:true,action:()=>void read(()=>panel.host.copy(hash))},
    {id:"copy_message",title:text("scm.copy_commit_message"),action:()=>void read(async()=>{const message=await runner.run(root,["show","-s","--format=%B",require_revision(hash),"--"]);if(root===panel.root&&runner===panel.runner)await panel.host.copy(message.replace(/\r?\n$/u,""));})},
    {id:"additional_git_actions",title:text("scm.additional_git_actions"),separator:true,children:[...graph_actions.filter(item=>item.targets.includes("commit")&&!["branch_create","commit_checkout","tag_add","cherry_pick"].includes(item.id)).map(item=>action(item.id)),{id:"archive",title:text("graph.archive_zip"),action:()=>panel.archive_dialog(hash)}],action(){}},
  ];
}
export function show_worktrees(panel:git_graph_panel):void{
  const root=panel.root,runner=panel.runner,dialog=workspace_dialog(text("scm.worktrees"));dialog.content.textContent=text("graph.loading_repository");
  const valid=()=>!panel.disposed&&root===panel.root&&runner===panel.runner&&dialog.root.isConnected;
  void(async()=>{try{
    const entries=await read_worktrees(runner.run,root);if(!valid())return;dialog.content.replaceChildren();
    for(const entry of entries){
      const row=el("div","git-scm-worktree-entry");row.append(el("strong","",entry.branch.replace(/^refs\/heads\//u,"")||entry.head.slice(0,8)),el("div","",entry.path));
      const open=button(text("scm.worktree_open"),()=>{if(!valid())return;dialog.close();panel.host.open_folder(entry.path);});open.disabled=entry.bare||entry.prunable;
      const new_window=button(text("scm.worktree_new_window"),()=>{if(!valid())return;dialog.close();panel.host.open_folder(entry.path,true);});new_window.disabled=open.disabled;
      const remove=button(text("scm.worktree_remove"),()=>{if(!valid())return;dialog.close();panel.action_dialog("worktree_remove","worktree",entry.path,entry.head);});remove.disabled=entry.main||entry.locked||entry.prunable||entry.bare||panel.host.path_api.resolve(entry.path)===panel.host.path_api.resolve(root)||panel.writing;
      row.append(open,new_window,remove);dialog.content.append(row);
    }
  }catch(error){if(valid())dialog.content.textContent=String(error);}})();
  const create=button(text("scm.worktree_add"),()=>{if(!valid())return;dialog.close();panel.action_dialog("worktree_add","repository","",panel.state?.head);});create.disabled=!panel.state?.head||panel.writing;dialog.footer.prepend(create);
}
