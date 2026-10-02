import {create_search_preview_context} from "./workspace_search_preview_context";
import {workspace_text} from "./workspace_i18n";
import {apply_workspace_row_selection} from "./workspace_list_selection";
import {create_preview_scale_controls} from "./workspace_preview_scale";
import {DEFAULT_SEARCH_REGEX} from './workspace_search_matcher';
import {bind_preview_resize} from "./workspace_preview_resize";
import {SIDEBAR_MIN_WIDTH,EDITOR_MIN_WIDTH,resize_workspace_sidebar} from "./workspace_sidebar_sash";
import {register_workspace_context_guard} from "./workspace_context";
import {is_composing_key,is_terminal_input} from "./workspace_keyboard";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_file_icons, workspace_file_icon} from "./workspace_file_icons";
import { create_workspace_lifetime } from "./workspace_lifetime";
import type { graph_core, graph_leaf } from "./git_graph_host";
import type { workspace_file_host } from "./workspace_files";
import { workspace_element as el, workspace_button as button, workspace_dialog, workspace_menu } from "./workspace_widgets";
import { git_icon, git_icon_button, git_disclosure, type git_icon_name } from "./git_icons";
import { create_workspace_search_engine, type workspace_search_result, type workspace_search_file, type workspace_search_match, type workspace_search_options } from "./workspace_search_engine";
import { create_git_runner } from "./git_graph_runtime";
import { parse_status } from "./git_graph_repository";
import { git_diff_editor } from "./git_diff_editor";
import { create_lookup_preview } from "./workspace_lookup_preview";
import { detect_binary_bytes, is_markdown_file } from "./file_language";
import { bind_workspace_selection_search, type workspace_selection_request } from "./workspace_selection_search";
import { file_key } from "./workspace_file_uri";
import search_css from "./workspace_search.css";
const search_path_order = new Intl.Collator("zh-CN", {numeric: true});

/** File search occupies a dedicated sidebar panel, with fixed input area and separate scrolling result area. */
export function bind_workspace_search(core: graph_core, files: workspace_file_host) {
  const lifetime=create_workspace_lifetime();
  const preview_context=lifetime.own(create_search_preview_context());
  try {
  const style = acquire_workspace_style("typora-code-style:workspace_search", search_css, {});
  lifetime.add(()=>style.remove());
  const file_icon_style = acquire_workspace_file_icons();
  lifetime.add(()=>file_icon_style.remove());
  const runtime = window as unknown as {reqnode(name:string):any};
  const runner = create_git_runner({child_process:runtime.reqnode("child_process"),process:runtime.reqnode("process")});
  lifetime.add(()=>runner.cancel());
  const engine = create_workspace_search_engine({fs:files.fs,path_api:files.path_api,git_run:runner.run,read_open_text:files.read_text,platform:runtime.reqnode("process").platform});
  const native_sidebar = document.querySelector<HTMLElement>("#typora-sidebar");
  const input = (label: string, placeholder = label) => { const node = el("input"); node.type="text"; node.placeholder=placeholder; node.setAttribute("aria-label",label); node.autocomplete="off"; node.spellcheck=false; return node; };
  const panels = new Map<string, HTMLElement>(); let serial = 0, disposed = false, replacing=false;
  lifetime.add(register_workspace_context_guard(()=>replacing?workspace_text("search_search_and_replace_is_writing_a_file_please_complete_the_ope"):undefined));
  class search_editor_view extends core.WorkspaceView {
    containerEl = el("section", "workspace-search-editor"); icon="fa-search";
    onOpen() { const panel = panels.get(this.leaf.state.path); if (panel) this.containerEl.replaceChildren(panel); else this.containerEl.textContent=workspace_text("search_please_rerun_the_search_in_the_search_sidebar"); }
  }
  lifetime.add(core.app.viewManager.registerView("linux_note.search_results", leaf => new search_editor_view(leaf)));
  class search_sidebar extends core.SidebarPanel {
    containerEl = el("section", "linux-note-workspace-search");
    query = el("textarea"); replacement = input(workspace_text("remote_workspace_picker_replace")); includes = input(workspace_text("search_included_files"), workspace_text("search_for_example_md_src")); excludes = input(workspace_text("search_excluded_files"), workspace_text("search_for_example_c_h"));
    form = el("div", "workspace-search-form"); results = el("div", "workspace-search-results"); status = el("div", "workspace-search-status");
    replace_row = el("div", "workspace-search-input-row workspace-search-replace"); details = el("div", "workspace-search-details");
    body = el("div", "workspace-search-body"); split = el("div", "workspace-search-split");
    preview = lifetime.own(create_lookup_preview(files,undefined,{visible_match:(file,match)=>this.follow_preview(file,match)})); preview_section = el("section", "workspace-search-preview-section");
    preview_toggle = git_icon_button("chevron-down", workspace_text("search_collapse_preview"), () => this.set_preview_open(!this.preview_open)); preview_open = true;
    preview_scale = lifetime.own(create_preview_scale_controls(this.preview));
    reading_match_id = "";
    selected?: {file:workspace_search_file;match:workspace_search_match}; remembered = new Map<string,string>(); open_generation = 0;
    options: workspace_search_options = {query:"",regex:DEFAULT_SEARCH_REGEX,use_ignore:true}; result?: workspace_search_result;
    controller?: AbortController; visible=false; timer=0; tree=false; sort="path"; only_open=false; only_changed=false; history: string[]=[]; history_index=-1;
    git_status = new Map<string,string>();
    render_versions = new WeakMap<HTMLElement,number>();
    rendered_groups = new WeakMap<HTMLElement,workspace_search_file>();
    omitted_files = new Set<string>();
    native_observer = new MutationObserver(() => this.clear_native());
    constructor() {
      super();lifetime.add(acquire_workspace_interaction(this.containerEl).remove);
      lifetime.add(()=>{++this.open_generation;clearTimeout(this.timer);this.controller?.abort();this.native_observer.disconnect();this.containerEl.remove();});
      this.containerEl.setAttribute("data-linux-note-workspace-search","ready");this.results.dataset.workspaceList="";
      // Apply fixed/top:0 to all header by Typora; the workspace toolbar uses an independent div, avoiding overlap with the main title bar.
      const heading = el("div", "workspace-search-heading"); heading.append(el("strong","",workspace_text("search_search")));
      heading.append(git_icon_button("refresh",workspace_text("search_refresh_search"),()=>void this.search()),
        git_icon_button("clear-all",workspace_text("search_clear_search_results"),()=>{clearTimeout(this.timer);this.controller?.abort();this.controller=undefined;this.clear_results();this.status.textContent="";}),
        git_icon_button("new-file",workspace_text("search_open_search_results_in_editor"),()=>this.open_results()),
        git_icon_button("collapse-all",workspace_text("search_all_collapse_expand"),()=>{const nodes=[...this.results.querySelectorAll("details")];const open=nodes.some(node=>!node.open);nodes.forEach(node=>this.set_group_open(node,open));}));
      const show_options=(event:MouseEvent)=>workspace_menu(event,[
          {title:workspace_text("search_display_as_list"),checked:!this.tree,action:()=>{this.tree=false;this.render();}}, {title:workspace_text("search_display_as_tree"),checked:this.tree,action:()=>{this.tree=true;this.render();}},
          {title:workspace_text("search_sort_by_path"),checked:this.sort==="path",action:()=>{this.sort="path";this.render();}}, {title:workspace_text("search_sort_by_result_count"),checked:this.sort==="count",action:()=>{this.sort="count";this.render();}}
        ]);
      heading.oncontextmenu=show_options;heading.append(git_icon_button("more",workspace_text("search_search_view_options"),show_options));
      const query_row=el("div","workspace-search-input-row");
      const disclosure=git_icon_button("chevron-right",workspace_text("search_expand_replace"),()=>{const open=this.replace_row.hidden;this.replace_row.hidden=!open;disclosure.setAttribute("aria-expanded",String(open));disclosure.title=open?workspace_text("search_collapse_replace"):workspace_text("search_expand_replace");disclosure.setAttribute("aria-label",disclosure.title);});
      disclosure.setAttribute("aria-expanded","false"); disclosure.classList.add("workspace-search-replace-toggle");
      this.query.rows=1;this.query.placeholder=workspace_text("search_search");this.query.setAttribute("aria-label",workspace_text("search_search_content"));this.query.spellcheck=false;
      const query_box=el("div","workspace-search-query-box");query_box.append(this.query);
      const toggles=el("div","workspace-search-input-actions");
      const toggle = (label:string, key:keyof workspace_search_options, icon:git_icon_name) => {
        const node=button("",()=>{this.options[key]=!this.options[key] as never;node.setAttribute("aria-pressed",String(Boolean(this.options[key])));this.schedule();});
        node.title=label;node.setAttribute("aria-label",label);node.setAttribute("aria-pressed",String(Boolean(this.options[key])));node.dataset.searchOption=key;
        // Buttons of this type for Codicons are already Aa and ab in the *.* format, ultimately using the same-source official SVG.
        node.replaceChildren(git_icon(icon));
        return node;
      };
      toggles.append(toggle(workspace_text("terminal_surface_case_sensitive"), "case_sensitive", "case-sensitive"),toggle(workspace_text("terminal_surface_whole_word_match"),"whole_word","whole-word"),toggle(workspace_text("quick_open_use_regular_expressions"),"regex","regex"));
      query_box.append(toggles);query_row.append(disclosure,query_box);
      const replace_box=el("div","workspace-search-query-box");replace_box.append(this.replacement,toggle(workspace_text("search_case_sensitive"),"preserve_case","preserve-case"));
      this.replace_row.append(replace_box,git_icon_button("replace-all",workspace_text("search_replace_all_preview_first"),()=>void this.replace()));this.replace_row.hidden=true;
      const options_row=el("div","workspace-search-options-row");
      const include_label=el("label","",workspace_text("search_included_files"));this.includes.id="linux-note-search-include";include_label.htmlFor=this.includes.id;
      const more=git_icon_button("more",workspace_text("search_show_hide_search_details"),()=>{this.details.hidden=!this.details.hidden;include_label.hidden=this.details.hidden;more.setAttribute("aria-expanded",String(!this.details.hidden));});more.setAttribute("aria-expanded","true");
      options_row.append(include_label,more);
      const include_box=el("div","workspace-search-query-box workspace-search-pattern-box");
      const only_changed=git_icon_button("edit-code",workspace_text("search_search_only_changes_in_source_code_management"),()=>{this.only_changed=!this.only_changed;if(this.only_changed)this.only_open=false;update_scope();this.schedule();});
      const only_open=git_icon_button("book",workspace_text("search_search_only_open_editors"),()=>{this.only_open=!this.only_open;if(this.only_open)this.only_changed=false;update_scope();this.schedule();});
      const update_scope=()=>{only_open.setAttribute("aria-pressed",String(this.only_open));only_changed.setAttribute("aria-pressed",String(this.only_changed));};update_scope();
      include_box.append(this.includes,only_changed,only_open);
      const exclude_label=el("label","workspace-search-exclude-label",workspace_text("search_excluded_files"));this.excludes.id="linux-note-search-exclude";exclude_label.htmlFor=this.excludes.id;
      const exclude_box=el("div","workspace-search-query-box workspace-search-pattern-box");
      const ignore=git_icon_button("exclude",workspace_text("search_use_gitignore_and_default_exclusion_settings"),()=>{this.options.use_ignore=!this.options.use_ignore;ignore.setAttribute("aria-pressed",String(this.options.use_ignore));this.schedule();});ignore.setAttribute("aria-pressed","true");
      exclude_box.append(this.excludes,ignore);this.details.append(include_box,exclude_label,exclude_box);this.form.append(query_row,this.replace_row,options_row,this.details,this.status);
      const preview_heading=el("div","workspace-search-preview-heading");preview_heading.setAttribute("role","toolbar");preview_heading.setAttribute("aria-label",workspace_text("search_preview_toolbar"));
      this.preview_toggle.append(el("span","",workspace_text("reading_minimap_preview")));this.preview_toggle.setAttribute("aria-expanded","true");
      const return_anchor=git_icon_button("target",workspace_text("search_return_preview_anchor"),()=>this.preview.reveal_match(),"workspace-search-return-anchor");
      preview_heading.append(this.preview_toggle,return_anchor,this.preview_scale.container);this.preview_section.append(preview_heading,this.preview.container);this.preview_section.hidden=true;
      this.split.tabIndex=0;this.split.setAttribute("role","separator");this.split.setAttribute("aria-orientation","horizontal");this.split.setAttribute("aria-label",workspace_text("search_adjust_search_results_and_preview_height"));this.split.setAttribute("aria-valuemin","15");this.split.setAttribute("aria-valuemax","75");this.split.hidden=true;this.set_split(40);
      this.body.append(this.results,this.split,this.preview_section);
      lifetime.own(bind_preview_resize(this.preview_section,()=>({width:native_sidebar?.contains(this.containerEl)?native_sidebar.offsetWidth:this.preview_section.offsetWidth,height:this.preview_section.offsetHeight}),size=>{
        if(Math.abs(size.height-this.preview_section.offsetHeight)>1)this.set_split(100-(size.height+this.split.offsetHeight)/Math.max(1,this.body.clientHeight)*100);
        if(native_sidebar?.contains(this.containerEl)){
          const ribbon=document.querySelector<HTMLElement>('.typ-ribbon')?.offsetWidth||48;
          const width=Math.max(SIDEBAR_MIN_WIDTH,Math.min(document.documentElement.clientWidth-ribbon-EDITOR_MIN_WIDTH,size.width));
          resize_workspace_sidebar(width);
        }else this.preview_section.style.width=Math.max(SIDEBAR_MIN_WIDTH,Math.min(this.body.clientWidth,size.width))+'px';
      },['east','north-east']));
      this.status.setAttribute("role","status");this.results.setAttribute("aria-label",workspace_text("search_file_search_results"));this.containerEl.append(heading,this.form,this.body);
      this.query.oninput=()=>{this.query.style.height="auto";this.query.style.height=Math.min(100,this.query.scrollHeight)+"px";this.schedule();};
      this.includes.oninput=this.excludes.oninput=()=>this.schedule();
      this.query.onkeydown=event=>{
        if(event.isComposing||event.keyCode===229)return;
        if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();this.clear_results();void this.search();}
        if(event.key==="Escape"){event.preventDefault();clearTimeout(this.timer);this.timer=0;this.controller?.abort();if(this.containerEl.dataset.state==="waiting"){this.containerEl.dataset.state="stopped";this.status.textContent=workspace_text("search_search_stopped");}}
        if((event.key==="ArrowUp"||event.key==="ArrowDown")&&event.altKey&&this.history.length){event.preventDefault();this.history_index=Math.max(0,Math.min(this.history.length-1,this.history_index+(event.key==="ArrowUp"?1:-1)));this.query.value=this.history[this.history_index];this.schedule();}
      };
      this.containerEl.addEventListener("keydown",event=>event.stopPropagation());
      this.split.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();this.split.focus({preventScroll:true});this.split.setPointerCapture(event.pointerId);
        const move=(next:PointerEvent)=>{const box=this.body.getBoundingClientRect();this.set_split((next.clientY-box.top)/Math.max(1,box.height)*100);};
        const stop=()=>{this.split.removeEventListener("pointermove",move);this.split.removeEventListener("pointerup",stop);this.split.removeEventListener("pointercancel",stop);this.split.removeEventListener("lostpointercapture",stop);};
        this.split.addEventListener("pointermove",move);this.split.addEventListener("pointerup",stop);this.split.addEventListener("pointercancel",stop);this.split.addEventListener("lostpointercapture",stop);};
      this.split.onkeydown=event=>{if(["ArrowUp","ArrowDown"].includes(event.key)){event.preventDefault();this.set_split(Number(this.split.getAttribute("aria-valuenow"))+(event.key==="ArrowUp"?-5:5));}};
    }
    set_split(value:number){value=Math.max(15,Math.min(75,Math.round(value)));this.body.style.setProperty("--search-results-size",`${value}%`);this.split.setAttribute("aria-valuenow",String(value));}
    set_preview_open(open:boolean){this.preview_open=open;this.preview_section.classList.toggle("is-collapsed",!open);this.preview.container.hidden=!open;this.split.hidden=!open||this.preview_section.hidden;this.body.classList.toggle("has-preview",open&&!this.preview_section.hidden);this.preview_toggle.setAttribute("aria-expanded",String(open));this.preview_toggle.title=open?workspace_text("search_collapse_preview"):workspace_text("search_preview_expansion");this.preview_toggle.setAttribute("aria-label",this.preview_toggle.title);}
    clear_results(){preview_context.clear();this.reading_match_id="";this.preview.clear();++this.open_generation;this.render_versions.set(this.results,(this.render_versions.get(this.results)||0)+1);this.omitted_files.clear();this.result=undefined;this.selected=undefined;this.results.replaceChildren();this.preview_section.hidden=true;this.split.hidden=true;this.body.classList.remove("has-preview");this.containerEl.dataset.state="waiting";}
    clear_native(){if(this.visible&&native_sidebar){const classes=["active-tab-files","active-tab-outline","ty-show-search","ty-on-search"];if(classes.some(name=>native_sidebar.classList.contains(name)))native_sidebar.classList.remove(...classes);}}
    onshow(){this.visible=true;this.clear_native();if(native_sidebar)this.native_observer.observe(native_sidebar,{attributes:true,attributeFilter:["class"]});}
    onhide(){this.visible=false;this.native_observer.disconnect();}
    schedule(){clearTimeout(this.timer);this.controller?.abort();this.controller=undefined;this.clear_results();this.status.textContent="";this.timer=window.setTimeout(()=>void this.search(),250);}
    path_key(path:string){return file_key(files.path_api.resolve(path));}
    async read_git_status(root:string,signal:AbortSignal){
      const statuses=new Map<string,string>();
      try{
        const git_root=(await runner.run(root,["rev-parse","--show-toplevel"])).trim();
        if(signal.aborted)return {statuses,changed_files:undefined};
        const changes=parse_status(await runner.run(git_root,["status","--porcelain=v1","-z","--untracked-files=all"]));
        for(const change of changes){const status=change.status==="??"?"U":change.work_status?.trim()||change.index_status?.trim()||change.status;statuses.set(this.path_key(files.path_api.resolve(git_root,change.path)),status);}
        return {statuses,changed_files:changes.map(change=>files.path_api.resolve(git_root,change.path))};
      }catch{return {statuses,changed_files:undefined};}
    }

    update_status(){
      const result=this.result;if(!result)return;
      const count=result.counts;this.status.replaceChildren(el("span","workspace-search-counts",workspace_text("search_found_results_in_files", {value_0: String(count.matched_files), value_1: String(count.matches)})+(result.cancelled?workspace_text("search_stopped"):"")));
      if(result.options.use_ignore!==false&&(count.skipped.ignored||count.skipped.excluded))this.status.append(el("p","workspace-search-scope-note",workspace_text("search_applied_git_ignore_rules_with_default_exclusion_to_search_fo")));
      if(count.matches)this.status.append(button(workspace_text("search_open_in_editor"),()=>this.open_results(),"workspace-search-open-editor"));
      if(result.notices.length){const note=el("details","workspace-search-notices");note.append(el("summary","",workspace_text("search_search_scope_explanation")),el("p","",result.notices.join("\n")));this.status.append(note);}
    }
    remove_result(file:workspace_search_file,group:HTMLElement){
      const result=this.result;if(!result||!result.files.includes(file))return;
      preview_context.remove(file.file_path);
      this.omitted_files.add(file.file_path);
      result.files=result.files.filter(item=>item!==file);result.counts.matched_files=result.files.length;result.counts.matches=result.files.reduce((sum,item)=>sum+item.matches.length,0);
      group.remove();this.update_status();this.render();
      if(this.selected?.file===file){this.selected=undefined;this.preview_section.hidden=true;this.split.hidden=true;this.body.classList.remove("has-preview");++this.open_generation;}
    }
    async search(){
      clearTimeout(this.timer);this.timer=0;this.controller?.abort();this.controller=undefined;this.clear_results();if(!this.query.value||disposed){this.status.textContent="";return;}
      const controller=new AbortController();this.controller=controller;this.containerEl.dataset.state="searching";this.status.textContent=workspace_text("search_searching");
      controller.signal.addEventListener("abort",()=>runner.cancel(),{once:true});
      const stop=git_icon_button("search-stop",workspace_text("search_stop_search"),()=>controller.abort());this.status.append(stop);
      const open_files:string[]=[];core.app.workspace.eachLeaves(leaf=>{const state=files.editor_state(leaf);if(state.kind!=="other"&&state.file_path&&files.path_api.isAbsolute(state.file_path))open_files.push(state.file_path);});
      try{
        const root=files.context_root();this.git_status=new Map();
        // Git Decorations and content search in parallel; only "Only modified files" requires the Git scope.
        const git_pending=this.read_git_status(root,controller.signal).then(git=>{
          if(!disposed&&this.controller===controller&&!controller.signal.aborted){this.git_status=git.statuses;for(const group of this.results.querySelectorAll<HTMLElement>('.workspace-search-file')){const status=git.statuses.get(this.path_key(group.dataset.path!));if(status&&!group.querySelector('.workspace-search-git-status')){const badge=el('span','workspace-search-git-status',status);badge.dataset.status=status;group.querySelector('summary')?.insertBefore(badge,group.querySelector('.workspace-search-file-actions'));}}}return git;
        });
        const git=this.only_changed?await git_pending:undefined;if(disposed||this.controller!==controller)return;
        if(this.only_changed&&!git?.changed_files)throw new Error(workspace_text("search_the_current_folder_is_not_in_the_git_repository_so_it_cannot"));
        const scope=this.only_changed?git?.changed_files:this.only_open?open_files:undefined;
        const options={...this.options,open_files,query:this.query.value,include:this.includes.value,exclude:this.excludes.value,...(scope?{file_paths:scope}:{}),...(folder_path?{folder_path}:{})};
        const progressive:workspace_search_result={root,options,files:[],counts:{scanned_files:0,searched_files:0,matched_files:0,matches:0,skipped:{binary:0,ignored:0,excluded:0,links:0,unreadable:0}},cancelled:true,notices:[]};
        this.result=progressive;let progress_time=0;const render_tasks:Promise<void>[]=[];let render_error:unknown;
        const result=await engine.search(root,options,{signal:controller.signal,on_file:(file,counts)=>{
          if(disposed||this.controller!==controller||controller.signal.aborted)return;
          preview_context.publish(file);progressive.files.push(file);progressive.counts=counts;render_tasks.push(this.render(this.results,file).catch(error=>{render_error ||= error;}));
          if(performance.now()-progress_time>=80){progress_time=performance.now();this.status.replaceChildren(el('span','workspace-search-counts',workspace_text("search_searching_files_results", {value_0: String(counts.matched_files), value_1: String(counts.matches)})),stop);}
        }});
        await Promise.all(render_tasks);if(disposed||this.controller!==controller)return;if(render_error)throw render_error;
        if(this.omitted_files.size){result.files=result.files.filter(file=>!this.omitted_files.has(file.file_path));result.counts.matched_files=result.files.length;result.counts.matches=result.files.reduce((sum,file)=>sum+file.matches.length,0);}
        this.result=result;await this.render();if(disposed||this.controller!==controller)return;this.containerEl.dataset.state=result.cancelled?"stopped":"ready";
        this.history=[this.query.value,...this.history.filter(value=>value!==this.query.value)].slice(0,30);this.history_index=-1;
        this.update_status();
        if(!result.cancelled&&!this.selected&&result.files[0]?.matches[0])this.select(result.files[0],result.files[0].matches[0]);
      }catch(error){if(!disposed&&this.controller===controller){this.clear_results();this.containerEl.dataset.state="error";this.status.textContent=String(error);}}
    }
    set_group_open(group:HTMLDetailsElement,open:boolean){
      group.open=open;group.querySelector(":scope>summary")?.setAttribute("aria-expanded",String(open));const toggle=group.querySelector<HTMLButtonElement>(":scope>summary>.workspace-search-file-toggle");
      if(toggle){toggle.setAttribute("aria-expanded",String(open));toggle.title=workspace_text("search_matches", {value_0: String(open?workspace_text("search_collapse"):workspace_text("search_expand")), value_1: String(group.querySelector("summary")?.title||workspace_text("recent_view_file"))});toggle.setAttribute("aria-label",toggle.title);}
    }
    async render(target:HTMLElement=this.results,new_file?:workspace_search_file){
      // Sorting, view switching, and removing results only reorders the current list; the toggle for each file should not be reset to fully expanded.
      const version=(this.render_versions.get(target)||0)+(new_file?0:1);this.render_versions.set(target,version);
      // Reuse existing nodes after the progressive list is completed; only reordering; preserve mouse preview, keyboard focus, and scroll position.
      if(!new_file&&!this.tree&&this.result){
        const groups=new Map([...target.querySelectorAll<HTMLElement>(':scope>.workspace-search-file')].map(group=>[group.dataset.path,group]));
        if(target.children.length===groups.size&&groups.size===this.result.files.length&&this.result.files.every(file=>this.rendered_groups.get(groups.get(file.file_path)!)===file)){
          const ordered=[...this.result.files].sort((a,b)=>this.sort==='count'?b.matches.length-a.matches.length:search_path_order.compare(a.relative_path,b.relative_path));
          const focused=document.activeElement instanceof HTMLElement&&target.contains(document.activeElement)?document.activeElement:undefined;const scroll=target.scrollTop;
          for(let index=0;index<ordered.length;index++){const group=groups.get(ordered[index].file_path)!;if(target.children[index]!==group)target.insertBefore(group,target.children[index]||null);}
          if(focused?.isConnected&&document.activeElement!==focused)focused.focus({preventScroll:true});target.scrollTop=scroll;return;
        }
      }
      const open_states=new Map(new_file?[]:[...target.querySelectorAll<HTMLDetailsElement>("details[data-search-group]")].map(node=>[node.getAttribute("data-search-group")!,node.open]));
      if(!new_file)target.replaceChildren();if(!this.result)return;const result=this.result;
      const current=()=>!disposed&&this.render_versions.get(target)===version&&(target!==this.results||this.result===result);
      const sorted=new_file?[new_file]:[...result.files].sort((a,b)=>this.sort==="count"?b.matches.length-a.matches.length:search_path_order.compare(a.relative_path,b.relative_path));
      const directories=new Map<string,HTMLElement>();
      if(new_file)for(const directory of target.querySelectorAll<HTMLElement>('.workspace-search-directory'))directories.set(directory.getAttribute('data-search-group')!.slice('directory:'.length),directory);
      let rendered=0,deadline=performance.now()+8;
      for(const file of sorted){
        if(!current())return;
        let parent=target;
        if(this.tree){const parts=file.relative_path.split("/").slice(0,-1);let key="";for(const part of parts){key+=part+"/";let nested=directories.get(key);if(!nested){const folder=el("details","workspace-search-directory");const state_key="directory:"+key;folder.setAttribute("data-search-group",state_key);folder.open=open_states.get(state_key)??true;const summary=el("summary");summary.append(git_disclosure(),el("span","",part));folder.append(summary);parent.append(folder);directories.set(key,folder);nested=folder;}parent=nested;}}
        const group=el("details","workspace-search-file"),state_key="file:"+file.file_path;group.setAttribute("data-search-group",state_key);group.open=open_states.get(state_key)??true;group.dataset.path=file.file_path;
        const summary=el("summary");summary.title=file.relative_path;summary.tabIndex=0;
        const label=el("span","workspace-search-file-name",files.path_api.basename(file.file_path));
        const path=el("span","workspace-search-file-path",files.path_api.dirname(file.relative_path).replace(/^\.$/u,""));
        // SVG Icons remain pointer-events:none; fully hit area provided by real buttons, not relying on SVG becoming event.target.
        const disclosure=button("",()=>{},"workspace-search-file-toggle");disclosure.append(git_disclosure());
        disclosure.onclick=event=>{event.preventDefault();event.stopPropagation();if(event.detail<2)this.set_group_open(group,!group.open);};
        disclosure.onkeydown=event=>{if(!["Enter"," "].includes(event.key))return;event.preventDefault();event.stopPropagation();this.set_group_open(group,!group.open);};
        summary.append(disclosure,workspace_file_icon(file.file_path),label,path);
        const git_status=this.git_status.get(this.path_key(file.file_path));
        if(git_status){const badge=el("span","workspace-search-git-status",git_status);badge.dataset.status=git_status;badge.title=({M:workspace_text("search_modified"),A:workspace_text("search_added"),D:workspace_text("search_deleted"),R:workspace_text("search_renamed"),C:workspace_text("reading_code_copy_copied"),U:workspace_text("search_untracked_or_with_conflicts")} as Record<string,string>)[git_status]||git_status;summary.append(badge);}
        const actions=el("span","workspace-search-file-actions");const count=el("span","workspace-search-file-count",String(file.matches.length));
        const remove=git_icon_button("close",workspace_text("search_remove_from_results"),()=>this.remove_result(file,group),"workspace-search-remove");remove.onclick=event=>{event.preventDefault();event.stopPropagation();this.remove_result(file,group);};actions.append(count,remove);summary.append(actions);
        let pointer_open = group.open;
        summary.onmousedown=event=>{if(event.button===0&&event.detail<2)pointer_open=group.open;};
        summary.onclick=event=>{if((event.target as Element).closest("button"))return;event.preventDefault();if(event.detail>=2)return;this.set_group_open(group,!group.open);this.select(file,this.file_match(file));};
        summary.onfocus=()=>this.select(file,this.file_match(file));
        summary.ondblclick=event=>{if((event.target as Element).closest("button,.git-disclosure-icon"))return;event.preventDefault();this.set_group_open(group,pointer_open);this.open_match(file,this.file_match(file));};
        summary.onkeydown=event=>{
          if(event.target!==summary||event.isComposing)return;
          if([" ","ArrowLeft","ArrowRight"].includes(event.key)){event.preventDefault();event.stopPropagation();this.set_group_open(group,event.key==="ArrowLeft"?false:event.key==="ArrowRight"?true:!group.open);return;}
          this.navigate(event,summary,file,()=>this.file_match(file),target);
        };
        summary.oncontextmenu=event=>workspace_menu(event,[{title:workspace_text("search_open_current_preview_location"),action:()=>this.open_match(file,this.file_match(file))}, {title:workspace_text("editor_actions_copy_path"),action:()=>files.copy(file.file_path)}, {title:workspace_text("file_path_actions_copy_relative_path"),action:()=>files.copy(file.relative_path)}, {title:workspace_text("search_replace_matches_in_this_file"),action:()=>void this.replace(file.file_path)}, {title:workspace_text("search_remove_from_results"),action:()=>this.remove_result(file,group)}]);
        group.append(summary);this.set_group_open(group,group.open);parent.append(group);
        for(const match of file.matches){
          if(rendered++%64===63||performance.now()>deadline){await new Promise<void>(resolve=>window.setTimeout(resolve,0));if(!current())return;deadline=performance.now()+8;}
          const row=button("",()=>this.select(file,match),"workspace-search-match");row.dataset.matchId=match.id;row.title=`${file.relative_path}:${match.line}:${match.column}\n${match.preview}`;row.setAttribute("aria-label",workspace_text("search_line_column", {value_0: String(file.relative_path), value_1: String(match.line), value_2: String(match.column), value_3: String(match.preview)}));
          const selected=this.selected?.match.id===match.id;apply_workspace_row_selection(row,selected,selected);row.setAttribute("aria-current",this.reading_match_id===row.dataset.matchId?"location":"false");
          row.append(el("span","workspace-search-line",String(match.line)));const preview=el("span","workspace-search-preview");let start=0;
          for(const range of match.preview_ranges){preview.append(document.createTextNode(match.preview.slice(start,range.start)),el("mark","",match.preview.slice(range.start,range.end)));start=range.end;}preview.append(document.createTextNode(match.preview.slice(start)));row.append(preview);
          row.oncontextmenu=event=>workspace_menu(event,[{title:workspace_text("search_open_matching_location"),action:()=>this.open_match(file,match)}, {title:workspace_text("file_tree_open_on_the_right"),action:()=>this.open_match(file,match,"right")}, {title:workspace_text("search_copy_matching_line"),action:()=>files.copy(match.preview)}, {title:workspace_text("search_replace_this_match"),action:()=>void this.replace(file.file_path,[match.id])}]);
          row.onfocus=()=>this.select(file,match);row.ondblclick=event=>{event.preventDefault();this.open_match(file,match);};row.onkeydown=event=>this.navigate(event,row,file,()=>match,target);
          group.append(row);
        }
        this.rendered_groups.set(group,file);
      }
    }
    follow_preview(file:workspace_search_file,match:workspace_search_match){
      if(disposed||this.selected?.file!==file)return;
      this.reading_match_id=match.id;
      let current:HTMLElement|undefined;
      for(const row of this.results.querySelectorAll<HTMLElement>("[data-match-id]")){
        const active=row.dataset.matchId===match.id;row.setAttribute("aria-current",active?"location":"false");if(active)current=row;
      }
      if(!current?.getClientRects().length)return;
      const row=current.getBoundingClientRect(),list=this.results.getBoundingClientRect();
      if(row.top<list.top)this.results.scrollTop+=row.top-list.top;
      else if(row.bottom>list.bottom)this.results.scrollTop+=row.bottom-list.bottom;
    }
    file_match(file:workspace_search_file){return file.matches.find(match=>match.id===this.remembered.get(file.file_path))||file.matches[0];}
    select(file:workspace_search_file,match:workspace_search_match){

      if(!match||disposed)return;this.preview_section.hidden=false;this.set_preview_open(true);
      if(this.selected?.file===file&&this.selected.match===match){this.preview.reveal_match();return;}
      ++this.open_generation;this.reading_match_id=match.id;this.selected={file,match};this.remembered.set(file.file_path,match.id);preview_context.publish(file);
      for(const row of this.results.querySelectorAll<HTMLElement>("[data-match-id]")){const selected=row.dataset.matchId===match.id;apply_workspace_row_selection(row,selected,selected);row.setAttribute("aria-current",this.reading_match_id===row.dataset.matchId?"location":"false");}

      void Promise.resolve(this.preview.show(file,match,"",true)).catch(error=>{if(!disposed&&this.selected?.match===match)this.status.textContent=String(error);});
    }
    navigate(event:KeyboardEvent,row:HTMLElement,file:workspace_search_file,match:()=>workspace_search_match,target:HTMLElement){
      if(event.isComposing)return;if(event.key==="Enter"){event.preventDefault();this.open_match(file,match());return;}
      if(!["ArrowUp","ArrowDown"].includes(event.key))return;event.preventDefault();
      const rows=[...target.querySelectorAll<HTMLElement>(".workspace-search-file>summary,.workspace-search-match")].filter(node=>node.getClientRects().length);
      rows[Math.max(0,Math.min(rows.length-1,rows.indexOf(row)+(event.key==="ArrowUp"?-1:1)))]?.focus();
    }
    open_match(file:workspace_search_file,match:workspace_search_match,group="active"){
      const generation=++this.open_generation;const current=()=>!disposed&&generation===this.open_generation;
      void(async()=>{
        const stat=await files.fs.promises.stat(file.file_path);if(!current())return;if(!stat.isFile())throw new Error(workspace_text("search_the_file_has_changed_please_refresh_the_search_results"));
        const bytes=await files.fs.promises.readFile(file.file_path);if(!current())return;if(detect_binary_bytes(bytes))throw new Error(workspace_text("search_the_file_has_changed_please_refresh_the_search_results"));
        const text=await files.read_text(file.file_path);if(!current())return;
        const position=(offset:number)=>{const newline=/\r\n|\r|\n/gu;let line=1,start=0,found:RegExpExecArray|null;while((found=newline.exec(text))&&found.index+found[0].length<=offset){line++;start=found.index+found[0].length;}return{line,column:offset-start+1};};
        const from=position(match.start),to=position(match.end);
        if(text.slice(match.start,match.end)!==match.text||from.line!==match.line||from.column!==match.column||to.line!==match.end_line||to.column!==match.end_column)throw new Error(workspace_text("search_the_file_has_changed_please_refresh_the_search_results_and_t"));
        await files.open_file(file.file_path,{line:match.line,column:match.column,end_line:match.end_line,end_column:match.end_column,source:!is_markdown_file(file.file_path),expected_text:match.text},group);
      })().catch(error=>{if(current())this.status.textContent=String(error instanceof Error?error.message:error);});
    }
    open_results(){if(!this.result)return;const panel=el("div","workspace-search-editor-results");panel.append(el("h3","",workspace_text("search_search_ea25a11e", {value_0: String(this.result.options.query)})));const list=el("div");this.render(list);panel.append(list);const uri=workspace_text("search_typ_linux_note_search_results_search_results", {value_0: String(++serial)});panels.set(uri,panel);const parent=core.app.workspace.activeLeaf?.parent;if(!parent)return;const leaf=core.app.workspace.createLeaf({type:"linux_note.search_results",state:{path:uri,git_cwd:files.context_root()}});parent.appendChild(leaf);core.app.workspace.activeLeaf=leaf;}
    async replace(file_path?:string,match_ids?:string[]){
      if(!this.result)return;
      const dialog=workspace_dialog(workspace_text("search_replace_preview"));lifetime.add(()=>dialog.close());const editors:git_diff_editor[]=[];const original_close=dialog.close;dialog.close=()=>{editors.forEach(editor=>editor.dispose());original_close();};
      const cleanup=new MutationObserver(()=>{if(!dialog.root.isConnected){editors.splice(0).forEach(editor=>editor.dispose());cleanup.disconnect();}});cleanup.observe(document.body,{childList:true});lifetime.add(()=>{cleanup.disconnect();editors.splice(0).forEach(editor=>editor.dispose());});
      try{
        if(this.containerEl.dataset.state==='searching')throw new Error(workspace_text("search_search_is_still_in_progress_please_wait_for_completion_or_st"));
        if(!match_ids&&(this.result.cancelled))throw new Error(workspace_text("search_the_search_is_not_complete_please_rescan_before_performing_a"));
        const visible_ids=match_ids||this.result.files.filter(file=>!file_path||file.file_path===file_path).flatMap(file=>file.matches.map(match=>match.id));
        const plan=await engine.prepare_replace(this.result,this.replacement.value,{file_path,match_ids:visible_ids});if(disposed||!dialog.root.isConnected)return;
        dialog.content.append(el("p","",workspace_text("search_replace_files_with_matches", {value_0: String(plan.files.length), value_1: String(plan.match_count)})));
        const picker=el("select");picker.setAttribute("aria-label",workspace_text("search_preview_replace_file"));for(const file of plan.files){const option=el("option","",file.relative_path);option.value=file.file_path;picker.append(option);}
        const preview=el("div","workspace-search-replace-preview");dialog.content.append(picker,preview);
        const show=()=>{editors.splice(0).forEach(editor=>editor.dispose());const file=plan.files.find(file=>file.file_path===picker.value);if(file){const editor=new git_diff_editor({title:file.relative_path,file:file.relative_path,left:file.before_text,right:file.after_text,left_label:workspace_text("search_before_replacement"),right_label:workspace_text("search_after_replacement")});editors.push(editor);preview.replaceChildren(editor.container);}};picker.onchange=show;show();
        const error=el("p");dialog.content.append(error);const apply=button(workspace_text("search_confirm_replacement"),()=>{if(!dialog.root.isConnected||replacing)return;replacing=true;apply.disabled=true;void engine.apply_replace(plan,{can_write:paths=>paths.every(files.can_write)}).then(result=>{files.refresh_files(result.files);dialog.close();void this.search();}).catch(problem=>{error.textContent=String(problem);apply.disabled=false;}).finally(()=>{replacing=false;});});apply.disabled=!plan.match_count;dialog.footer.prepend(apply);
      }catch(error){dialog.content.append(el("p","",String(error)));}
    }
  }
  let folder_path="";
  const panel=new search_sidebar();lifetime.add(core.app.workspace.sidebar.addPanel(panel));panel.ribbonButton={id:"linux_note:search"};
  const folder_scope=el("div","workspace-search-folder-scope");folder_scope.hidden=true;
  panel.details.prepend(folder_scope);
  const clear_folder=()=>{folder_path="";folder_scope.hidden=true;folder_scope.replaceChildren();};
  const show=(toggle=false,focus=true)=>{if(disposed)return;if(!panel.visible)core.app.workspace.sidebar.switch(search_sidebar);else if(toggle)core.app.workspace.sidebar.toggle();else core.app.workspace.sidebar.show();if(focus&&panel.visible)panel.query.focus();};
  const search=async(request:workspace_selection_request)=>{if(disposed||typeof request.query!=="string"||!request.query.trim())return;panel.query.value=request.query;panel.options.regex=false;panel.containerEl.querySelector('[data-search-option="regex"]')?.setAttribute("aria-pressed","false");panel.containerEl.dataset.sourcePath=request.source_path||"";show(false,false);panel.clear_results();await panel.search();};
  const find_in_folder=(path:string)=>{if(disposed)return;folder_path=path;folder_scope.hidden=false;const label=el("span","",files.path_api.relative(files.context_root(),path).split(files.path_api.sep).join("/")||workspace_text("search_project_root_directory"));label.title=label.textContent||"";folder_scope.replaceChildren(label,git_icon_button("close",workspace_text("search_cancel_folder_search_scope"),()=>{clear_folder();panel.schedule();}));panel.details.hidden=false;show();panel.schedule();};
  lifetime.own(bind_workspace_selection_search(core,files,search));
  const activity_click=(event:MouseEvent)=>{const target=event.target instanceof Element?event.target.closest<HTMLElement>('.typ-ribbon-item[data-id="core.search"]'):null;if(!target)return;event.preventDefault();event.stopImmediatePropagation();show(true);};
  lifetime.listen(document,"click",activity_click as EventListener,true);
  lifetime.add(core.app.commands.register({id:"linux_note:search",title:workspace_text("search_search_search_in_file"),scope:"global",callback:()=>show()}));
  const keydown=(event:KeyboardEvent)=>{if(is_composing_key(event)||is_terminal_input(event))return;if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==="f"&&!event.altKey&&!document.querySelector('[role="dialog"][aria-modal="true"]')){event.preventDefault();event.stopImmediatePropagation();show();}};
  lifetime.listen(window,"keydown",keydown as EventListener,true);
  const renamed=()=>{if(!disposed&&panel.query.value.trim())panel.schedule();};
  lifetime.listen(window,"linux-note-workspace-renamed",renamed);
  const dispose=()=>{if(disposed)return;disposed=true;
    const leaves:graph_leaf[]=[];core.app.workspace.eachLeaves(leaf=>{if(panels.has(leaf.state.path))leaves.push(leaf);});for(const leaf of leaves){leaf.parent.removeTab?.(leaf.state.path);leaf.view.containerEl.remove();}
    if(core.app.workspace.sidebar.activePanel===panel){core.app.workspace.sidebar.hide();core.app.workspace.sidebar.activePanel=undefined;}
    lifetime.dispose();panels.clear();};
  lifetime.listen(window,"unload",dispose);
  const refresh_context=()=>{if(!disposed){clear_folder();panel.schedule();}};
  return {show,search,find_in_folder,refresh_context,container:panel.containerEl,dispose};
  } catch(error) { lifetime.dispose(); throw error; }
}
