import type {git_graph_panel} from "./git_graph_panel";
import {commit_web_targets,commit_web_url,type commit_web_target} from "./git_commit_web";
import {workspace_button,workspace_dialog,type workspace_menu_entry} from "./workspace_widgets";
import {git_graph_text as text} from "./git_graph_i18n";

/** 浮层与菜单只读打开同一目标；不查网络、不改远端、不替用户推送。 */
export function commit_web_entry(panel:git_graph_panel,hash:string):workspace_menu_entry{
  const state=panel.state,root=panel.root,runner=panel.runner;
  const targets=commit_web_targets(state?.remotes||[],hash,state?.tracking?.remote);
  const valid=()=>!panel.disposed&&panel.root===root&&panel.runner===runner;
  let busy=false;
  const open=async(target:commit_web_target)=>{
    if(busy||!valid())return;busy=true;
    try{
      const urls=await runner.run(root,["remote","get-url",...(target.push?["--push"]:[]),"--all",target.remote]);
      if(!valid())return;
      if(!urls.trim().split(/\r?\n/u).some(url=>commit_web_url(url,hash)?.url===target.url)){panel.report(text("scm.web_remote_changed"));return;}
      await panel.host.open_url(target.url);
    }catch{if(valid())panel.report(text("scm.web_open_failed"));}finally{busy=false;}
  };
  return {id:"open_commit_web",title:targets.length===1?text("scm.open_provider",{provider:targets[0].provider}):text("scm.open_remote_web"),disabled:!targets.length,action(){
    if(busy||!valid()||!targets.length)return;
    if(targets.length===1){void open(targets[0]);return;}
    busy=true;
    const dialog=workspace_dialog(text("scm.choose_web_remote"),undefined,()=>{busy=false;});
    dialog.root.classList.add("git-commit-web-picker");
    for(const target of targets){
      const choice=workspace_button(target.remote+" · "+target.provider+" · "+target.repository_url,()=>{dialog.close();void open(target);});
      choice.dataset.commitWebRemote=target.remote;dialog.content.append(choice);
    }
    dialog.content.querySelector<HTMLButtonElement>("button")?.focus();
  }};
}
