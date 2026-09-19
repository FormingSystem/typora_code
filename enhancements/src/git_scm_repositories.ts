import type {git_source_control} from "./git_source_control";
import {read_branch_status,type branch_status} from "./git_scm_data";
import {repository_branch_status} from "./git_graph_repository";
import {git_icon,git_icon_button} from "./git_icons";
import {workspace_element as el,workspace_button as button,workspace_menu} from "./workspace_widgets";
import {git_graph_text as text} from "./git_graph_i18n";

/** 非当前仓库只读分支摘要；所有写入口绑定已经完成加载的当前控制器。 */
type repository_row = {root:string;row:HTMLElement;select:HTMLButtonElement;branch:HTMLButtonElement;sync:HTMLButtonElement;update():void;paint(status:branch_status):void};
export class git_scm_repositories {
  container=el("div","git-scm-repositories-list");epoch=0;reader:ReturnType<git_source_control["panel"]["host"]["runner"]>|undefined;
  reader_key="";rows=new Map<string,repository_row>();disposed=false;active_root="";
  stop_progress:()=>void;stop_state:()=>void;
  constructor(public owner:git_source_control){
    this.container.setAttribute("aria-label",text("scm.repositories"));
    this.stop_progress=owner.panel.progress.subscribe(()=>this.update_disabled());
    this.stop_state=owner.panel.subscribe_state(()=>this.paint_current());
  }
  refresh():void{
    if(this.disposed)return;
    this.reader?.cancel();const panel=this.owner.panel,roots=panel.repository_paths([panel.root,...panel.known_repos()]);
    for(const [root,item] of this.rows)if(!roots.includes(root)){item.row.remove();this.rows.delete(root);}
    roots.forEach((root,index)=>{
      let item=this.rows.get(root);if(!item){item=this.create_row(root);this.rows.set(root,item);}
      if(this.container.children[index]!==item.row)this.container.insertBefore(item.row,this.container.children[index]||null);
    });
    this.paint_current();
    // 首次从子目录加载会规范化仓库根；先完成根切换，再给本批摘要读取编号。
    const epoch=++this.epoch;
    const rows=roots.filter(root=>root!==panel.root).map(root=>this.rows.get(root)!);
    if(!rows.length)return;
    if(!this.reader||this.reader_key!==panel.settings.git_path){this.reader?.dispose?.();this.reader=panel.host.runner(panel.settings);this.reader_key=panel.settings.git_path;}const reader=this.reader;
    let next=0;
    const worker=async()=>{while(next<rows.length){const item=rows[next++];try{
      const status=await read_branch_status(reader.run,item.root);if(this.disposed||epoch!==this.epoch)return;item.paint(status);
    }catch(error){if(!this.disposed&&epoch===this.epoch){item.row.title=String(error);item.row.dataset.error="true";}}}};
    void Promise.all(Array.from({length:Math.min(4,rows.length)},worker));
  }
  private create_row(root:string):repository_row{
      const panel=this.owner.panel;
      const row=el("div","git-scm-repository-row");row.dataset.root=root;row.dataset.workspaceInteraction="row";row.dataset.active=String(root===panel.root);
      const select=button("",()=>{if(!panel.disposed&&!panel.writing)void panel.switch_repo(root);},"git-scm-repository-name");select.title=root;select.append(git_icon("repo"),el("span","",panel.host.path_api.basename(root)));select.setAttribute("aria-pressed",String(root===panel.root));select.disabled=panel.writing;
      const branch=button("",()=>{},"git-scm-repository-branch"),sync=git_icon_button("sync",text("action.title.sync"),()=>{},"git-scm-repository-sync"),more=git_icon_button("more",text("scm.changes_and_operations"),()=>{},"git-scm-repository-more");
      const valid=()=>!this.disposed&&this.rows.get(root)?.row===row&&!panel.disposed&&root===panel.root&&panel.state?.root===root&&!panel.pending&&!panel.writing&&panel.container.dataset.state!=="error";
      branch.onclick=()=>{if(valid())panel.branch_picker.open();};branch.oncontextmenu=event=>workspace_menu(event,[{title:text("scm.configure_keybinding"),disabled:true,action(){}}]);
      sync.onclick=()=>{if(valid())void panel.network_action("sync");};
      more.onclick=event=>{if(valid())this.owner.more_menu(event);};row.oncontextmenu=event=>{if(valid())this.owner.more_menu(event);else{event.preventDefault();event.stopPropagation();}};
      let loaded=false,normal_title=sync.title,normal_icon="sync";
      const branch_label=el("span",""),sync_counts=el("span","");branch.append(git_icon("git-branch"),branch_label);sync.append(sync_counts);
      const update=()=>{select.disabled=panel.disposed||panel.writing;row.dataset.active=String(root===panel.root);select.setAttribute("aria-pressed",String(root===panel.root));branch.disabled=more.disabled=!loaded||!valid();sync.disabled=!loaded||!valid()||!panel.state?.branch||!panel.state?.head||!panel.state.remotes.length||!!panel.state.operation;
        const state=panel.progress.state,busy=root===panel.root&&state.busy,spinning=busy&&state.running&&["fetch","pull","push","sync"].includes(state.kind);
        const icon=spinning?"sync":normal_icon;if(sync.firstElementChild?.getAttribute("data-git-icon")!==icon)sync.firstElementChild?.replaceWith(git_icon(icon as "sync"|"cloud-upload"));
        row.setAttribute("aria-busy",String(busy));sync.classList.toggle("git-operation-spinning",spinning);sync.title=busy?state.label:normal_title;sync.setAttribute("aria-label",sync.title);
      };
      const paint=(status:branch_status)=>{
        const name=status.branch==="(detached)"?status.head.slice(0,8):status.branch,label=name+(status.dirty?"*":""),counts=status.upstream?`${status.behind}↓ ${status.ahead}↑`:"";
        if(branch_label.textContent!==label)branch_label.textContent=label;if(sync_counts.textContent!==counts)sync_counts.textContent=counts;branch.title=name;
        normal_title=status.upstream?`${status.upstream}: ${status.behind}↓ ${status.ahead}↑`:text("scm.publish_branch");normal_icon=status.upstream?"sync":"cloud-upload";
        row.removeAttribute("data-error");row.removeAttribute("title");loaded=true;update();
      };
      branch.disabled=sync.disabled=more.disabled=true;row.append(select,branch,sync,more);return {root,row,select,branch,sync,update,paint};
  }
  private paint_current():void{
    if(this.disposed)return;
    const panel=this.owner.panel;if(this.active_root!==panel.root){this.active_root=panel.root;this.epoch++;this.reader?.cancel();}
    if(panel.state?.root===panel.root)this.rows.get(panel.root)?.paint(repository_branch_status(panel.state));
    this.update_disabled();
  }
  update_disabled():void{for(const row of this.rows.values())row.update();}
  dispose():void{if(this.disposed)return;this.disposed=true;this.stop_progress();this.stop_state();this.epoch++;this.reader?.dispose?.();this.reader?.cancel();this.rows.clear();}
}
