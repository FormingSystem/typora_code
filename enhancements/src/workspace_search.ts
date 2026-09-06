import type { graph_core, graph_leaf } from "./git_graph_host";
import type { workspace_file_host } from "./workspace_files";
import { graph_element as el, graph_button as button, graph_dialog, graph_menu } from "./git_graph_widgets";
import { git_icon, git_icon_button, git_disclosure, type git_icon_name } from "./git_icons";
import { create_workspace_search_engine, type workspace_search_result, type workspace_search_file, type workspace_search_match, type workspace_search_options } from "./workspace_search_engine";
import { create_git_runner } from "./git_graph_runtime";
import { git_diff_editor } from "./git_diff_editor";
import search_css from "./workspace_search.css";

/** 文件搜索独占一个侧栏面板，输入区固定、结果区单独滚动。 */
export function bind_workspace_search(core: graph_core, files: workspace_file_host) {
  const style = el("style"); style.textContent = search_css; document.head.append(style);
  const runtime = window as unknown as {reqnode(name:string):any};
  const runner = create_git_runner({child_process:runtime.reqnode("child_process"),process:runtime.reqnode("process")});
  const engine = create_workspace_search_engine({fs:files.fs,path_api:files.path_api,git_run:runner.run,platform:runtime.reqnode("process").platform});
  const native_sidebar = document.querySelector<HTMLElement>("#typora-sidebar");
  const input = (label: string, placeholder = label) => { const node = el("input"); node.type="text"; node.placeholder=placeholder; node.setAttribute("aria-label",label); node.autocomplete="off"; node.spellcheck=false; return node; };
  const panels = new Map<string, HTMLElement>(); let serial = 0;
  class search_editor_view extends core.WorkspaceView {
    containerEl = el("section", "workspace-search-editor"); icon="fa-search";
    onOpen() { const panel = panels.get(this.leaf.state.path); if (panel) this.containerEl.replaceChildren(panel); else this.containerEl.textContent="请在搜索侧栏重新运行搜索。"; }
  }
  core.app.viewManager.registerView("linux_note.search_results", leaf => new search_editor_view(leaf));
  class search_sidebar extends core.SidebarPanel {
    containerEl = el("section", "linux-note-workspace-search");
    query = el("textarea"); replacement = input("替换"); includes = input("包含的文件", "例如 *.md, src/**"); excludes = input("排除的文件", "例如 *.c, *.h");
    form = el("div", "workspace-search-form"); results = el("div", "workspace-search-results"); status = el("div", "workspace-search-status");
    replace_row = el("div", "workspace-search-input-row workspace-search-replace"); details = el("div", "workspace-search-details");
    options: workspace_search_options = {query:"",use_ignore:true}; result?: workspace_search_result;
    controller?: AbortController; visible=false; timer=0; tree=false; sort="path"; only_open=false; history: string[]=[]; history_index=-1;
    native_observer = new MutationObserver(() => this.clear_native());
    constructor() {
      super();
      this.containerEl.setAttribute("data-linux-note-workspace-search","ready");
      const heading = el("header", "workspace-search-heading"); heading.append(el("strong","","搜索"));
      heading.append(git_icon_button("refresh","刷新搜索",()=>void this.search()),
        git_icon_button("clear-all","清除搜索结果",()=>{this.controller?.abort();this.result=undefined;this.results.replaceChildren();this.status.textContent="";}),
        git_icon_button("new-file","在编辑器中打开搜索结果",()=>this.open_results()),
        git_icon_button("collapse-all","全部折叠／展开",()=>{const nodes=[...this.results.querySelectorAll("details")];const open=nodes.some(node=>!node.open);nodes.forEach(node=>node.open=open);}),
        git_icon_button("more","搜索视图选项",()=>{const rect=heading.getBoundingClientRect();graph_menu(new MouseEvent("contextmenu",{clientX:rect.right-180,clientY:rect.bottom}),[
          {title:"以列表显示",checked:!this.tree,action:()=>{this.tree=false;this.render();}}, {title:"以树形显示",checked:this.tree,action:()=>{this.tree=true;this.render();}},
          {title:"按路径排序",checked:this.sort==="path",action:()=>{this.sort="path";this.render();}}, {title:"按结果数排序",checked:this.sort==="count",action:()=>{this.sort="count";this.render();}}
        ]);}));
      const query_row=el("div","workspace-search-input-row");
      const disclosure=git_icon_button("chevron-right","展开替换",()=>{const open=this.replace_row.hidden;this.replace_row.hidden=!open;disclosure.setAttribute("aria-expanded",String(open));disclosure.title=open?"收起替换":"展开替换";});
      disclosure.setAttribute("aria-expanded","false"); disclosure.classList.add("workspace-search-replace-toggle");
      this.query.rows=1;this.query.placeholder="搜索";this.query.setAttribute("aria-label","搜索内容");this.query.spellcheck=false;
      const query_box=el("div","workspace-search-query-box");query_box.append(this.query);
      const toggles=el("div","workspace-search-input-actions");
      const toggle = (label:string, key:keyof workspace_search_options, icon:git_icon_name) => {
        const node=button("",()=>{this.options[key]=!this.options[key] as never;node.setAttribute("aria-pressed",String(Boolean(this.options[key])));this.schedule();});
        node.title=label;node.setAttribute("aria-label",label);node.setAttribute("aria-pressed",String(Boolean(this.options[key])));node.dataset.searchOption=key;
        // Codicons 的此类按钮本身就是 Aa、ab、.* 形式，最终使用同源官方 SVG。
        node.replaceChildren(git_icon(icon));
        return node;
      };
      toggles.append(toggle("区分大小写", "case_sensitive", "case-sensitive"),toggle("全字匹配","whole_word","whole-word"),toggle("使用正则表达式","regex","regex"));
      query_box.append(toggles);query_row.append(disclosure,query_box);
      this.replace_row.append(this.replacement,toggle("保留大小写","preserve_case" as keyof workspace_search_options,"preserve-case"),git_icon_button("replace-all","全部替换（先预览）",()=>void this.replace()));this.replace_row.hidden=true;
      const options_row=el("div","workspace-search-options-row");const more=git_icon_button("more","显示／隐藏搜索详细信息",()=>{this.details.hidden=!this.details.hidden;more.setAttribute("aria-expanded",String(!this.details.hidden));});more.setAttribute("aria-expanded","true");
      options_row.append(more);
      const include_label=el("label","","包含的文件");include_label.append(this.includes);
      const only_open=button("仅已打开",()=>{this.only_open=!this.only_open;only_open.setAttribute("aria-pressed",String(this.only_open));this.schedule();});only_open.title="仅搜索已打开的编辑器";only_open.setAttribute("aria-pressed","false");include_label.append(only_open);
      const exclude_label=el("label","","排除的文件");exclude_label.append(this.excludes);
      const ignore=button("使用忽略规则",()=>{this.options.use_ignore=!this.options.use_ignore;ignore.setAttribute("aria-pressed",String(this.options.use_ignore));this.schedule();});ignore.title="使用 .gitignore 和默认排除设置";ignore.setAttribute("aria-pressed","true");exclude_label.append(ignore);
      this.details.append(include_label,exclude_label);this.form.append(query_row,this.replace_row,options_row,this.details,this.status);
      this.status.setAttribute("role","status");this.results.setAttribute("aria-label","文件搜索结果");this.containerEl.append(heading,this.form,this.results);
      this.query.oninput=()=>{this.query.style.height="auto";this.query.style.height=Math.min(100,this.query.scrollHeight)+"px";this.schedule();};
      this.includes.oninput=this.excludes.oninput=()=>this.schedule();
      this.query.onkeydown=event=>{
        if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void this.search();}
        if(event.key==="Escape"){event.preventDefault();this.controller?.abort();}
        if((event.key==="ArrowUp"||event.key==="ArrowDown")&&event.altKey&&this.history.length){event.preventDefault();this.history_index=Math.max(0,Math.min(this.history.length-1,this.history_index+(event.key==="ArrowUp"?1:-1)));this.query.value=this.history[this.history_index];this.schedule();}
      };
      this.containerEl.addEventListener("keydown",event=>event.stopPropagation());
    }
    clear_native(){if(this.visible&&native_sidebar){const classes=["active-tab-files","active-tab-outline","ty-show-search","ty-on-search"];if(classes.some(name=>native_sidebar.classList.contains(name)))native_sidebar.classList.remove(...classes);}}
    onshow(){this.visible=true;this.clear_native();if(native_sidebar)this.native_observer.observe(native_sidebar,{attributes:true,attributeFilter:["class"]});this.query.focus();}
    onhide(){this.visible=false;this.native_observer.disconnect();}
    schedule(){clearTimeout(this.timer);this.controller?.abort();this.result=undefined;this.results.replaceChildren();this.timer=window.setTimeout(()=>void this.search(),250);}
    async search(){
      clearTimeout(this.timer);this.controller?.abort();this.result=undefined;if(!this.query.value){this.result=undefined;this.results.replaceChildren();this.status.textContent="";return;}
      const controller=new AbortController();this.controller=controller;this.status.textContent="正在搜索…";
      const stop=git_icon_button("search-stop","停止搜索",()=>controller.abort());this.status.append(stop);
      const open_files:string[]=[];if(this.only_open)core.app.workspace.eachLeaves(leaf=>{if(files.path_api.isAbsolute(leaf.state.path))open_files.push(leaf.state.path);else if(leaf.state.path.startsWith("typ://linux_note.source_file/"))open_files.push(decodeURIComponent(leaf.state.path.slice("typ://linux_note.source_file/".length)));});
      try{
        const result=await engine.search(files.context_root(),{...this.options,query:this.query.value,include:this.includes.value,exclude:this.excludes.value,...(this.only_open?{file_paths:open_files}:{})},{signal:controller.signal});
        if(this.controller!==controller)return;this.result=result;this.render();
        this.history=[this.query.value,...this.history.filter(value=>value!==this.query.value)].slice(0,30);this.history_index=-1;
        const count=result.counts;this.status.textContent=`在 ${count.matched_files} 个文件中找到 ${count.matches} 个结果`+(result.cancelled?" · 已停止":"")+(result.limit_reached?" · 已达到结果上限":"");
        if(result.notices.length){const note=el("details","workspace-search-notices");note.append(el("summary","","搜索范围说明"),el("p","",result.notices.join("\n")));this.status.append(note);}
      }catch(error){if(this.controller===controller){this.status.textContent=String(error);this.results.replaceChildren();}}
    }
    render(target:HTMLElement=this.results){
      target.replaceChildren();if(!this.result)return;
      const sorted=[...this.result.files].sort((a,b)=>this.sort==="count"?b.matches.length-a.matches.length:a.relative_path.localeCompare(b.relative_path,"zh-CN",{numeric:true}));
      const directories=new Map<string,HTMLElement>();
      for(const file of sorted){
        let parent=target;
        if(this.tree){const parts=file.relative_path.split("/").slice(0,-1);let key="";for(const part of parts){key+=part+"/";let nested=directories.get(key);if(!nested){const folder=el("details","workspace-search-directory");folder.open=true;const summary=el("summary");summary.append(git_disclosure(),el("span","",part));folder.append(summary);parent.append(folder);directories.set(key,folder);nested=folder;}parent=nested;}}
        const group=el("details","workspace-search-file");group.open=true;group.dataset.path=file.file_path;
        const summary=el("summary");summary.title=file.relative_path;
        const label=el("span","workspace-search-file-name",files.path_api.basename(file.file_path));
        const path=el("span","workspace-search-file-path",files.path_api.dirname(file.relative_path).replace(/^\.$/u,""));
        const count=el("span","workspace-search-file-count",String(file.matches.length));summary.append(git_disclosure(),label,path,count);
        summary.oncontextmenu=event=>graph_menu(event,[{title:"打开文件",action:()=>void files.open_file(file.file_path)}, {title:"复制路径",action:()=>files.copy(file.file_path)}, {title:"复制相对路径",action:()=>files.copy(file.relative_path)}, {title:"替换此文件中的匹配项…",action:()=>void this.replace(file.file_path)}, {title:"从结果中移除",action:()=>{this.result!.files=this.result!.files.filter(item=>item!==file);this.result!.counts.matched_files--;this.result!.counts.matches-=file.matches.length;this.status.textContent=`在 ${this.result!.counts.matched_files} 个文件中找到 ${this.result!.counts.matches} 个结果`;this.render();}}]);
        group.append(summary);
        for(const match of file.matches){
          const row=button("",()=>this.open_match(file,match),"workspace-search-match");row.dataset.matchId=match.id;row.title=`${file.relative_path}:${match.line}:${match.column}\n${match.preview}`;
          row.append(el("span","workspace-search-line",String(match.line)));const preview=el("span","workspace-search-preview");let start=0;
          for(const range of match.preview_ranges){preview.append(document.createTextNode(match.preview.slice(start,range.start)),el("mark","",match.preview.slice(range.start,range.end)));start=range.end;}preview.append(document.createTextNode(match.preview.slice(start)));row.append(preview);
          row.oncontextmenu=event=>graph_menu(event,[{title:"打开匹配位置",action:()=>this.open_match(file,match)}, {title:"在右侧打开",action:()=>this.open_match(file,match,"right")}, {title:"复制匹配行",action:()=>files.copy(match.preview)}, {title:"替换此匹配项…",action:()=>void this.replace(file.file_path,[match.id])}]);
          row.onkeydown=event=>{if(["ArrowUp","ArrowDown"].includes(event.key)){event.preventDefault();const nodes=[...target.querySelectorAll<HTMLButtonElement>(".workspace-search-match")].filter(node=>node.getClientRects().length);const index=nodes.indexOf(row);nodes[Math.max(0,Math.min(nodes.length-1,index+(event.key==="ArrowDown"?1:-1)))]?.focus();}};
          group.append(row);
        }parent.append(group);
      }
    }
    open_match(file:workspace_search_file,match:workspace_search_match,group="active"){void files.open_file(file.file_path,{line:match.line,column:match.column,end_line:match.end_line,end_column:match.end_column,source:true},group);}
    open_results(){if(!this.result)return;const panel=el("div","workspace-search-editor-results");panel.append(el("h3","",`搜索：${this.result.options.query}`));const list=el("div");this.render(list);panel.append(list);const uri=`typ://linux_note.search_results/${++serial}/搜索结果`;panels.set(uri,panel);const parent=core.app.workspace.activeLeaf?.parent;if(!parent)return;const leaf=core.app.workspace.createLeaf({type:"linux_note.search_results",state:{path:uri,git_cwd:files.context_root()}});parent.appendChild(leaf);core.app.workspace.activeLeaf=leaf;}
    async replace(file_path?:string,match_ids?:string[]){
      if(!this.result)return;
      const dialog=graph_dialog("替换预览");const editors:git_diff_editor[]=[];const original_close=dialog.close;dialog.close=()=>{editors.forEach(editor=>editor.dispose());original_close();};
      const cleanup=new MutationObserver(()=>{if(!dialog.root.isConnected){editors.splice(0).forEach(editor=>editor.dispose());cleanup.disconnect();}});cleanup.observe(document.body,{childList:true});
      try{
        if(!match_ids&&(this.result.cancelled||this.result.limit_reached))throw new Error("搜索未完成，请缩小范围后再执行批量替换。");
        const visible_ids=match_ids||this.result.files.filter(file=>!file_path||file.file_path===file_path).flatMap(file=>file.matches.map(match=>match.id));
        const plan=await engine.prepare_replace(this.result,this.replacement.value,{file_path,match_ids:visible_ids});
        dialog.content.append(el("p","",`将替换 ${plan.files.length} 个文件中的 ${plan.match_count} 个匹配项。`));
        const picker=el("select");picker.setAttribute("aria-label","预览替换文件");for(const file of plan.files){const option=el("option","",file.relative_path);option.value=file.file_path;picker.append(option);}
        const preview=el("div","workspace-search-replace-preview");dialog.content.append(picker,preview);
        const show=()=>{editors.splice(0).forEach(editor=>editor.dispose());const file=plan.files.find(file=>file.file_path===picker.value);if(file){const editor=new git_diff_editor({title:file.relative_path,file:file.relative_path,left:file.before_text,right:file.after_text,left_label:"替换前",right_label:"替换后"});editors.push(editor);preview.replaceChildren(editor.container);}};picker.onchange=show;show();
        const error=el("p");dialog.content.append(error);const apply=button("确认替换",()=>{apply.disabled=true;void engine.apply_replace(plan,{can_write:paths=>paths.every(files.can_write)}).then(result=>{files.refresh_files(result.files);dialog.close();void this.search();}).catch(problem=>{error.textContent=String(problem);apply.disabled=false;});});apply.disabled=!plan.match_count;dialog.footer.prepend(apply);
      }catch(error){dialog.content.append(el("p","",String(error)));}
    }
  }
  const panel=new search_sidebar();core.app.workspace.sidebar.addPanel(panel);panel.ribbonButton={id:"linux_note:search"};
  const show=(toggle=false)=>{if(!panel.visible)core.app.workspace.sidebar.switch(search_sidebar);else if(toggle)core.app.workspace.sidebar.toggle();else{core.app.workspace.sidebar.show();panel.query.focus();}};
  document.addEventListener("click",event=>{const target=event.target instanceof Element?event.target.closest<HTMLElement>('.typ-ribbon-item[data-id="core.search"]'):null;if(!target)return;event.preventDefault();event.stopImmediatePropagation();show(true);},true);
  core.app.commands.register({id:"linux_note:search",title:"搜索：在文件中查找",scope:"global",callback:()=>show()});
  window.addEventListener("keydown",event=>{if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==="f"&&!event.altKey&&!event.isComposing){event.preventDefault();event.stopImmediatePropagation();show();}},true);
  return {show,container:panel.containerEl};
}
