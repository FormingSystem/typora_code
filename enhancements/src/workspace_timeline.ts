import {workspace_language_tag} from "./workspace_locale";
import {workspace_text} from "./workspace_i18n";
import type {workspace_file_host} from "./workspace_files";
import type {workspace_save_service} from "./workspace_save_service";
import type {bind_workspace_history_view} from "./workspace_history_view";
import {read_workspace_save_settings,set_workspace_save_settings,observe_workspace_save_settings,open_workspace_save_settings} from "./workspace_save_settings";
import {get_workspace_app} from "./workspace_bootstrap";
import {pick_history_item} from "./workspace_history_picker";
import {workspace_element as el,workspace_menu,type workspace_menu_entry} from "./workspace_widgets";
import {git_icon,git_icon_button} from "./git_icons";
import {create_git_runner} from "./git_graph_runtime";
import {read_file_history} from "./git_graph_repository";
import {load_graph_settings} from "./git_graph_settings";
import {decode_file_bytes} from "./file_language";
import {create_workspace_lifetime} from "./workspace_lifetime";
import {file_key} from "./workspace_file_uri";

type timeline_item={timestamp:number;label:string;description:string;source:"git"|"local";open():Promise<void>;menu?():workspace_menu_entry[]};
/** Git and local snapshot saving are two independent sources, filtering, fixing files, and refreshing are handled by this panel. */
export function bind_workspace_timeline(files:workspace_file_host,saves:workspace_save_service,viewer:ReturnType<typeof bind_workspace_history_view>,explorer:{show():void}){
  const lifetime=create_workspace_lifetime(),settings=get_workspace_app()!.settings,workspace=files.core.app.workspace,runtime=window as any;
  const initial=settings.get("workspace_timeline") as Record<string,boolean>|undefined;
  const state={collapsed:initial?.collapsed!==false,git:initial?.git!==false,local:initial?.local!==false,pinned:false};let target="",epoch=0,refresh_timer:ReturnType<typeof setTimeout>|undefined;
  const container=el("section","workspace-timeline"),heading=el("div","workspace-explorer-section-heading workspace-section-header"),toggle=el("button","workspace-explorer-section-title workspace-section-title"),actions=el("div","workspace-explorer-section-actions workspace-section-actions"),list=el("div","workspace-timeline-list");toggle.type="button";list.setAttribute("aria-label",workspace_text("timeline_timeline_recording"));
  heading.append(toggle,actions);container.append(heading,list);const runners=new Set<ReturnType<typeof create_git_runner>>();let listing:ReturnType<typeof create_git_runner>|undefined;
  const remember=()=>settings.set_and_save("workspace_timeline",{collapsed:state.collapsed,git:state.git,local:state.local});
  const run=(action:()=>Promise<unknown>)=>void action().catch(error=>{if(!lifetime.disposed)saves.report(error);});
  const pin=git_icon_button("pinned",workspace_text("timeline_keep_the_current_file"),()=>{state.pinned=!state.pinned;render();follow();});
  const refresh=git_icon_button("refresh",workspace_text("timeline_refresh_timeline"),()=>run(load));
  const filter=git_icon_button("filter",workspace_text("timeline_filter_timeline_sources"),()=>{});filter.onclick=event=>workspace_menu(event,[
    {title:workspace_text("timeline_git_history"),checked:state.git,action:()=>{state.git=!state.git;remember();run(load);}},
    {title:workspace_text("timeline_local_history"),checked:state.local,action:()=>{state.local=!state.local;remember();run(load);}},
  ],"workspace-menu-compact");
  const more=git_icon_button("more",workspace_text("timeline_more_operations_on_timeline"),()=>{});more.onclick=event=>workspace_menu(event,[{title:workspace_text("timeline_local_history_find_the_entry_to_restore"),action:()=>run(find_entry)},{title:workspace_text("timeline_auto_save_and_local_history_settings"),action:open_workspace_save_settings}],"workspace-menu-compact");actions.append(pin,refresh,filter,more);
  function render(){container.hidden=!read_workspace_save_settings()["timeline.enabled"];container.classList.toggle("is-collapsed",state.collapsed);list.hidden=state.collapsed;toggle.replaceChildren(git_icon(state.collapsed?"chevron-right":"chevron-down"),el("span","workspace-explorer-section-label",workspace_text("explorer_sections_timeline")),el("span","workspace-timeline-target",target?files.path_api.basename(target):""));toggle.title=target;toggle.setAttribute("aria-expanded",String(!state.collapsed));pin.setAttribute("aria-pressed",String(state.pinned));}
  toggle.onclick=()=>{state.collapsed=!state.collapsed;remember();render();run(load);};
  function follow(){const leaf=workspace.activeLeaf,path=leaf?files.editor_state(leaf).file_path:"";if(!state.pinned&&file_key(path)!==file_key(target)){target=path;render();run(load);}}
  const make_runner=()=>create_git_runner({child_process:runtime.reqnode("child_process"),process:runtime.reqnode("process")},{executable:load_graph_settings(localStorage,files.context_root()||"").git_path});
  async function load(){
    const revision=++epoch;listing?.cancel();listing=undefined;if(lifetime.disposed||container.hidden||state.collapsed)return;
    const path=target;list.replaceChildren(el("p","",path?workspace_text("timeline_reading_history"):workspace_text("timeline_select_a_file_to_view_the_timeline")));if(!path)return;
    const items:timeline_item[]=[],errors:string[]=[];
    const results=await Promise.allSettled([
      (async()=>{if(!state.local)return;for(const entry of await saves.history.list(path))items.push({timestamp:entry.timestamp,label:source_label(entry.source),description:path,source:"local",open:()=>viewer.open_entry(entry),menu:()=>[{title:workspace_text("timeline_compare_with_current_file"),action:()=>run(()=>viewer.open_entry(entry))},{title:workspace_text("timeline_delete_history_entry"),action:()=>run(async()=>{await saves.history.remove(entry);await load();})}]});})(),
      (async()=>{if(!state.git)return;const reader=listing=make_runner();try{
        let root:string;try{root=(await reader.run(files.path_api.dirname(path),["rev-parse","--show-toplevel"])).trim();}catch(error){if(/not a git repository|cannot change to.*No such file/iu.test(String(error)))return;throw error;}
        const relative=files.path_api.relative(root,path).replaceAll("\\","/");
        for(const item of await read_file_history(reader.run,root,relative,100))items.push({timestamp:Date.parse(item.commit.date),label:item.commit.subject,description:item.commit.author+" · "+item.commit.hash.slice(0,8),source:"git",open:async()=>{
          const content=make_runner();runners.add(content);try{
            const read=async(hash:string,file:string)=>decode_file_bytes(await content.run_bytes(root,["show",hash+":"+file])).text;
            const left=item.commit.parents[0]&&!item.file.status.startsWith("A")?await read(item.commit.parents[0],item.file.old_path||item.file.path):"";
            const right=item.file.status.startsWith("D")?"":await read(item.commit.hash,item.file.path);
            if(!lifetime.disposed)viewer.open({title:files.path_api.basename(path)+" ("+item.commit.hash.slice(0,8)+")",file:path,left,right,left_label:item.commit.parents[0]?.slice(0,8)||workspace_text("timeline_empty_file"),right_label:item.commit.hash.slice(0,8)});
          }finally{content.cancel();runners.delete(content);}
        }});
      }finally{reader.cancel();if(listing===reader)listing=undefined;}})(),
    ]);
    if(lifetime.disposed||revision!==epoch)return;
    for(const result of results)if(result.status==="rejected")errors.push(String(result.reason instanceof Error?result.reason.message:result.reason));
    list.replaceChildren();for(const item of items.sort((a,b)=>b.timestamp-a.timestamp)){
      const button=el("button","workspace-timeline-entry");button.type="button";button.dataset.historySource=item.source;button.title=item.label+"\n"+new Date(item.timestamp).toLocaleString(workspace_language_tag())+"\n"+item.description;
      button.append(git_icon(item.source==="local"?"history":"git-commit"),el("span","workspace-timeline-label",item.label),el("span","workspace-timeline-date",new Date(item.timestamp).toLocaleString(workspace_language_tag())));button.onclick=()=>run(item.open);if(item.menu)button.oncontextmenu=event=>{event.preventDefault();workspace_menu(event,item.menu!(),"workspace-menu-compact");};list.append(button);
    }
    for(const error of errors){const message=el("p","",error);message.setAttribute("role","status");list.append(message);}
    if(!items.length&&!errors.length)list.append(el("p","",state.git||state.local?workspace_text("timeline_no_history_local_history_will_retain_versions_after_successf"):workspace_text("timeline_select_at_least_one_timeline_source")));
  }
  const pickers=new Set<AbortController>();
  async function find_entry(){
    const abort=new AbortController();pickers.add(abort);try{
      const resources=await saves.history.resources();if(lifetime.disposed)return;
      const path=await pick_history_item(workspace_text("timeline_select_a_file_to_view_local_history"),resources.map(item=>({label:files.path_api.basename(item.file_path),description:files.path_api.dirname(item.file_path),file_path:item.file_path,value:item.file_path})),abort.signal);if(!path||lifetime.disposed)return;
      const entries=await saves.history.list(path);if(lifetime.disposed)return;
      const entry=await pick_history_item(workspace_text("timeline_select_a_local_history_entry_to_open"),entries.map(item=>({label:source_label(item.source),description:new Date(item.timestamp).toLocaleString(workspace_language_tag()),value:item})),abort.signal);
      if(entry&&!lifetime.disposed)await viewer.open_entry(entry);
    }finally{pickers.delete(abort);}
  }
  function open(path:string){if(!files.path_api.isAbsolute(path))return;target=path;state.collapsed=false;state.pinned=false;remember();set_workspace_save_settings({"timeline.enabled":true});explorer.show();render();run(load);}
  const schedule=()=>{if(refresh_timer)clearTimeout(refresh_timer);refresh_timer=setTimeout(()=>{refresh_timer=undefined;run(load);},50);};
  lifetime.add(saves.subscribe_history(schedule));lifetime.add(observe_workspace_save_settings(()=>{render();schedule();}));lifetime.add(workspace.on("active-leaf:change",follow));lifetime.add(workspace.on("file:open",follow));lifetime.add(workspace.on("layout-changed",follow));
  lifetime.add(files.core.app.commands.register({id:"linux_note:local_history_restore",title:workspace_text("timeline_local_history_find_the_entry_to_restore"),scope:"global",callback:()=>run(find_entry)}));
  lifetime.add(files.core.app.commands.register({id:"linux_note:timeline",title:workspace_text("timeline_file_open_timeline"),scope:"global",callback:()=>{const path=files.current_file();if(path)open(path);}}));
  render();follow();
  lifetime.listen(window,"linux-note-workspace-context-changed",()=>{
    epoch++;listing?.cancel();listing=undefined;for(const runner of runners)runner.cancel();for(const picker of pickers)picker.abort();
    if(refresh_timer)clearTimeout(refresh_timer);refresh_timer=undefined;state.pinned=false;target="";list.replaceChildren();render();
  });
  return{container,open,find_entry,refresh:load,dispose(){lifetime.dispose();epoch++;listing?.cancel();for(const runner of runners)runner.cancel();for(const picker of pickers)picker.abort();if(refresh_timer)clearTimeout(refresh_timer);container.remove();}};
}
function source_label(source:string){return({"File Saved":workspace_text("timeline_file_saved"),"File Restored":workspace_text("timeline_file_restored"),"Before Restore":workspace_text("timeline_restore_previous_version"),"File Renamed":workspace_text("timeline_file_renamed")} as Record<string,string>)[source]||source;}
