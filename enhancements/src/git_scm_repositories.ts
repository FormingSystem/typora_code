import type {git_source_control} from "./git_source_control";
import {read_branch_status} from "./git_scm_data";
import {checkout_entries} from "./git_scm_menus";
import {git_icon,git_icon_button} from "./git_icons";
import {workspace_element as el,workspace_button as button,workspace_menu} from "./workspace_widgets";
import {git_graph_text as text} from "./git_graph_i18n";

/** 非当前仓库只读分支摘要；所有写入口绑定已经完成加载的当前控制器。 */
export class git_scm_repositories {
  container=el("div","git-scm-repositories-list");epoch=0;reader:ReturnType<git_source_control["panel"]["host"]["runner"]>|undefined;
  reader_key=""; update_rows:(()=>void)[]=[];
  stop_progress:()=>void;
  constructor(public owner:git_source_control){this.container.setAttribute("aria-label",text("scm.repositories"));this.stop_progress=owner.panel.progress.subscribe(()=>this.update_disabled());}
  refresh():void{
    this.reader?.cancel();const panel=this.owner.panel,epoch=++this.epoch;
    if(!this.reader||this.reader_key!==panel.settings.git_path){this.reader?.dispose?.();this.reader=panel.host.runner(panel.settings);this.reader_key=panel.settings.git_path;}const reader=this.reader;this.update_rows=[];
    const roots=panel.repository_paths([panel.root,...panel.known_repos()]);this.container.replaceChildren();
    const rows=roots.map(root=>{
      const row=el("div","git-scm-repository-row");row.dataset.root=root;row.dataset.workspaceInteraction="row";row.dataset.active=String(root===panel.root);
      const select=button("",()=>{if(!panel.disposed&&!panel.writing)void panel.switch_repo(root);},"git-scm-repository-name");select.title=root;select.append(git_icon("repo"),el("span","",panel.host.path_api.basename(root)));select.setAttribute("aria-pressed",String(root===panel.root));select.disabled=panel.writing;
      const branch=button("",()=>{},"git-scm-repository-branch"),sync=git_icon_button("sync",text("action.title.sync"),()=>{},"git-scm-repository-sync"),more=git_icon_button("more",text("scm.changes_and_operations"),()=>{},"git-scm-repository-more");
      const valid=()=>epoch===this.epoch&&!panel.disposed&&root===panel.root&&panel.state?.root===root&&!panel.pending&&!panel.writing&&panel.container.dataset.state!=="error";
      branch.onclick=event=>{if(valid())panel.configured_menu(event,"checkout",checkout_entries(panel));};branch.oncontextmenu=event=>workspace_menu(event,[{title:text("scm.configure_keybinding"),disabled:true,action(){}}]);
      sync.onclick=()=>{if(valid())void panel.network_action("sync");};
      more.onclick=event=>{if(valid())this.owner.more_menu(event);};row.oncontextmenu=event=>{if(valid())this.owner.more_menu(event);else{event.preventDefault();event.stopPropagation();}};
      let loaded=false,normal_title=sync.title,normal_icon="sync";
      const update=()=>{select.disabled=panel.writing;branch.disabled=more.disabled=!loaded||!valid();sync.disabled=!loaded||!valid()||!panel.state?.branch||!panel.state?.head||!panel.state.remotes.length||!!panel.state.operation;
        const state=panel.progress.state,busy=root===panel.root&&state.busy,spinning=busy&&state.running&&["fetch","pull","push","sync"].includes(state.kind);
        normal_icon=sync.dataset.normalIcon||normal_icon;normal_title=sync.dataset.normalTitle||normal_title;
        const icon=spinning?"sync":normal_icon;if(sync.firstElementChild?.getAttribute("data-git-icon")!==icon)sync.firstElementChild?.replaceWith(git_icon(icon as "sync"|"cloud-upload"));
        row.setAttribute("aria-busy",String(busy));sync.classList.toggle("git-operation-spinning",spinning);sync.title=busy?state.label:normal_title;sync.setAttribute("aria-label",sync.title);
      };this.update_rows.push(update);
      branch.disabled=sync.disabled=more.disabled=true;row.append(select,branch,sync,more);this.container.append(row);return {root,row,branch,sync,more,valid,ready:()=>{loaded=true;update();}};
    });
    let next=0;
    const worker=async()=>{while(next<rows.length){const item=rows[next++];try{const status=await read_branch_status(reader.run,item.root);if(epoch!==this.epoch)return;const branch=status.branch==="(detached)"?status.head.slice(0,8):status.branch;item.branch.replaceChildren(git_icon("git-branch"),el("span","",branch+(status.dirty?"*":"")));item.branch.title=branch;item.sync.replaceChildren(git_icon(status.upstream?"sync":"cloud-upload"),el("span","",status.upstream?`${status.behind}↓ ${status.ahead}↑`:""));item.sync.title=status.upstream?`${status.upstream}: ${status.behind}↓ ${status.ahead}↑`:text("scm.publish_branch");item.sync.dataset.normalTitle=item.sync.title;item.sync.dataset.normalIcon=status.upstream?"sync":"cloud-upload";item.ready();}catch(error){if(epoch===this.epoch){item.row.title=String(error);item.row.dataset.error="true";}}}};
    void Promise.all(Array.from({length:Math.min(4,rows.length)},worker));
  }
  update_disabled():void{for(const update of this.update_rows)update();}
  dispose():void{this.stop_progress();this.epoch++;this.reader?.dispose?.();this.reader?.cancel();this.update_rows=[];}
}
