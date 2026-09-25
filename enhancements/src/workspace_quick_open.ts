import type {graph_leaf} from "./git_graph_host";
import {workspace_leaf_tab} from "./workspace_leaf_tab";
import {git_icon,git_icon_button} from "./git_icons";
import {DEFAULT_SEARCH_REGEX,query_expression,type search_path_match} from './workspace_search_matcher';
import {create_search_matcher} from './workspace_search_worker_client';
import {capture_workspace_focus,register_workspace_dismissal,type workspace_focus_snapshot,type workspace_dismiss_layer} from "./workspace_focus";
import css from "./workspace_quick_open.css";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_file_icons, workspace_file_icon} from "./workspace_file_icons";
import type { workspace_file_host } from "./workspace_files";

import {create_quick_matcher,append_quick_highlights,type quick_file,type quick_match} from "./workspace_quick_open_matcher";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {workspace_context_epoch,workspace_context_switching} from "./workspace_context";
type quick_open_binding = {root:HTMLElement;input:HTMLInputElement;open():void;open_editors(group:graph_leaf["parent"]):void;close():void;dispose():void};
let current_picker: quick_open_binding | undefined;
export function get_workspace_quick_open() { return current_picker; }

/** VS Code 式 Ctrl+P 文件快速打开；按需读取目录，不读取文件正文。 */
export function create_workspace_quick_open(files: workspace_file_host) {
  const events = new AbortController();
  const style = acquire_workspace_style("typora-code-quick-open-style", css);
  const file_icon_style = acquire_workspace_file_icons();
  let disposed = false;
  const root = document.createElement("section");
  root.className = "workspace-quick-open";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "false");
  root.setAttribute("aria-label", "快速打开文件");
  const input_row = document.createElement("div");
  input_row.className = "workspace-quick-open-input-row";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "键入文件名或路径进行搜索";
  input.setAttribute("aria-label", "按文件名或路径搜索");
  input.setAttribute("role","combobox");input.setAttribute("aria-autocomplete","list");input.setAttribute("aria-controls","workspace-quick-open-list");
  input.autocomplete = "off";
  input.spellcheck = false;
  let use_regex=DEFAULT_SEARCH_REGEX,match_controller:AbortController|undefined;
  const regex_button=git_icon_button('regex','使用正则表达式',()=>{use_regex=!use_regex;regex_button.setAttribute('aria-pressed',String(use_regex));pending_open_query=undefined;rendered_query='\0';match_controller?.abort();render_generation++;ranking=false;void render();});
  regex_button.setAttribute('aria-pressed',String(use_regex));
  input_row.append(input,regex_button);
  const results = document.createElement("div");
  results.className = "workspace-quick-open-results";
  results.setAttribute("role", "listbox");results.id="workspace-quick-open-list";
  const status = document.createElement("div");
  status.className = "workspace-quick-open-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.append(input_row, status, results);
  document.body.append(root);
  const interaction=acquire_workspace_interaction(root);

  let editor_group:graph_leaf["parent"]|undefined;
  const editor_targets=new Map<string,graph_leaf>(),recent=new WeakMap<graph_leaf,number>();let activation=0;
  const read_editors=()=>{
    editor_targets.clear();const entries:quick_file[]=[];
    files.core.app.workspace.eachLeaves(leaf=>{
      if(leaf.parent!==editor_group||leaf.state.path.startsWith("typ://core.empty/"))return;
      const file=files.editor_state(leaf).file_path;
      const tab=workspace_leaf_tab(leaf),name=tab?.querySelector('.typ-file-basename')?.textContent;
      const relative=file?files.path_api.relative(files.context_root(),file):"";
      editor_targets.set(leaf.state.path,leaf);entries.push({file_path:leaf.state.path,relative_path:relative,name:file?files.path_api.basename(file):(name||decodeURIComponent(leaf.state.path.split('/').at(-1)||'未命名')),directory:file?files.path_api.dirname(relative).replace(/^\.$/u,""):""});
    });
    entries.sort((a,b)=>(recent.get(editor_targets.get(b.file_path)!)||0)-(recent.get(editor_targets.get(a.file_path)!)||0));
    return entries;
  };
  const query_text=()=>editor_group?input.value.replace(/^edt active(?:\s|$)/u,"").trim():input.value.trim();
  let catalogue: quick_file[] = [];
  let shown: quick_file[] = [];let shown_matches:quick_match[]=[];let visible_start=-1;let visible_end=-1;
  let selected_index = 0;
  let scan_generation = 0;
  let render_generation = 0; let render_timer = 0; let scanning = false; let unreadable = 0; let scan_root=""; let context_epoch=0; let rendered_query = "";
  let direct_query:string|undefined;let direct_file:quick_file|undefined;let direct_pending=false;let direct_error="";let direct_generation=0;
  let ranking=false;let ranking_query="";let rank_again=false;
  let pending_open_query: string | undefined;let opening=false;
  let previous_focus:workspace_focus_snapshot|undefined;let escape_layer:workspace_dismiss_layer|undefined;

  const close = (restore=true) => {
    if (root.hidden) return;
    match_controller?.abort();match_controller=undefined;
    const owned=escape_layer?.owns_focus();escape_layer?.dispose();escape_layer=undefined;
    direct_generation++;direct_query=undefined;direct_file=undefined;direct_pending=false;direct_error="";ranking=false;rank_again=false;
    scan_generation += 1;
    render_generation += 1;clearTimeout(render_timer);render_timer=0;scanning=false;
    pending_open_query=undefined;opening=false;
    root.hidden = true;input.setAttribute("aria-expanded","false");input.removeAttribute("aria-activedescendant");
    root.setAttribute("aria-modal", "false");
    results.replaceChildren();
    editor_group=undefined;editor_targets.clear();catalogue=[];
    shown = [];shown_matches=[];visible_start=-1;visible_end=-1;
    if(restore&&owned)previous_focus?.restore();
    previous_focus=undefined;
  };
  const paint_rows = (force=false) => {
    const start=Math.max(0,Math.floor(results.scrollTop/22)-4);
    const end=Math.min(shown.length,start+Math.ceil((results.clientHeight||window.innerHeight*.4)/22)+8);
    if(force||start!==visible_start||end!==visible_end){
      visible_start=start;visible_end=end;
      const before=document.createElement("div"),after=document.createElement("div");
      before.style.height=`${start*22}px`;after.style.height=`${(shown.length-end)*22}px`;
      before.setAttribute("role","presentation");after.setAttribute("role","presentation");
      results.replaceChildren(before,...shown.slice(start,end).map((file,offset)=>{
        const index=start+offset,row=document.createElement("button");row.type="button";row.className="workspace-quick-open-result";
        row.setAttribute("role","option");row.id=`workspace-quick-open-option-${index}`;row.tabIndex=-1;row.title=file.file_path;
        row.setAttribute("aria-posinset",String(index+1));row.setAttribute("aria-setsize",String(shown.length));
        row.append(workspace_file_icon(editor_targets.get(file.file_path)?files.editor_state(editor_targets.get(file.file_path)!).file_path||file.name:file.file_path));
        const name=document.createElement("span");name.className="workspace-quick-open-name";append_quick_highlights(name,file.name,shown_matches[index].score.labelMatch);
        const directory=document.createElement("span");directory.className="workspace-quick-open-path";append_quick_highlights(directory,file.directory,shown_matches[index].score.descriptionMatch);row.append(name,directory);
        if(editor_group){
          const close_action=document.createElement("span");close_action.className="workspace-quick-open-close";close_action.setAttribute("role","button");close_action.tabIndex=0;close_action.setAttribute("aria-label","关闭 "+file.name);close_action.append(git_icon("close"));
          const close_editor=async(event:Event)=>{event.preventDefault();event.stopPropagation();const leaf=editor_targets.get(file.file_path);if(!leaf||opening)return;opening=true;try{await files.close_leaf(leaf);if(!root.hidden)await render();}catch(error){status.textContent=String(error);status.classList.add("is-visible");}finally{opening=false;input.focus();}};
          close_action.onclick=event=>void close_editor(event);close_action.onkeydown=event=>{if(event.key==="Enter"||event.key===" ")void close_editor(event);};row.append(close_action);
        }
        row.onmousemove=()=>select(index,false);row.onclick=()=>{selected_index=index;void open_selected();};row.ondblclick=event=>event.preventDefault();return row;
      }),after);
    }
    input.removeAttribute("aria-activedescendant");
    for(const row of results.querySelectorAll<HTMLElement>('.workspace-quick-open-result')){
      const selected=Number(row.getAttribute('aria-posinset'))-1===selected_index;row.classList.toggle('is-selected',selected);row.setAttribute('aria-selected',String(selected));
      if(selected)input.setAttribute('aria-activedescendant',row.id);
    }
  };
  const select = (index:number,reveal=true) => {
    if(!shown.length)return;
    selected_index=(index+shown.length)%shown.length;
    if(reveal){const top=selected_index*22,bottom=top+22;if(top<results.scrollTop)results.scrollTop=top;else if(bottom>results.scrollTop+results.clientHeight)results.scrollTop=bottom-results.clientHeight;}
    paint_rows();
  };
  results.addEventListener('scroll',()=>paint_rows(),{signal:events.signal,passive:true});
  const resize_observer=new ResizeObserver(()=>{if(!root.hidden)paint_rows(true);});resize_observer.observe(results);
  const open_selected = async () => {
    if(opening)return;
    const query=query_text();
    if(query!==rendered_query||(!shown.length&&(scanning||direct_pending))){pending_open_query=query;return;}
    const target=shown[selected_index];if(!target)return;
    if(files.context_root()!==scan_root||workspace_context_epoch()!==context_epoch||workspace_context_switching()){close(false);return;}
    const opening_generation=scan_generation;opening=true;
    try {
      if(editor_group){const leaf=editor_targets.get(target.file_path);let exists=false;files.core.app.workspace.eachLeaves(item=>{if(item===leaf&&item.parent===editor_group)exists=true;});if(!leaf||!exists){await render();return;}files.core.app.workspace.activeLeaf=editor_group.toggleTab(leaf.state.path);close(false);}
      else {await files.open_file(target.file_path);if(opening_generation===scan_generation)close();}
    }
    catch(error){if(!root.hidden&&opening_generation===scan_generation){status.textContent=`无法打开文件：${String((error as Error)?.message||error)}`;status.classList.add("is-visible");}}
    finally{if(opening_generation===scan_generation)opening=false;}
  };
  const render = async () => {
    const query=query_text();
    // 扫描增量不取消同查询的分片计算；新输入仍立即使旧计算过期。
    if(ranking&&ranking_query===query){rank_again=true;return;}
    const generation=++render_generation;ranking=true;ranking_query=query;rank_again=false;
    try {
    const previous_path=query===rendered_query?shown[selected_index]?.file_path:undefined;
    if(query!==rendered_query){shown=[];results.replaceChildren();status.textContent="正在筛选文件…";status.classList.add("is-visible");}
    if(editor_group)catalogue=read_editors();
    let regex_mode=use_regex&&!!query;
    const ranked:quick_match[]=[];const matcher=create_quick_matcher(regex_mode?'':query);
    const order=editor_group&&!query?()=>0:regex_mode?(left:quick_match,right:quick_match)=>left.file.relative_path.localeCompare(right.file.relative_path):matcher.compare;
    // 已枚举候选先筛选；显式路径探测独立补充，不能因磁盘等待清空整个搜索。
    if(!editor_group&&direct_query!==query){
      direct_query=query;direct_file=undefined;direct_pending=false;direct_error="";
      const request=++direct_generation,requested_root=scan_root;
      if(/[\\/]/u.test(query)&&files.fs.promises.stat){
        direct_pending=true;
        void (async()=>{
          try{
            const requested=files.path_api.resolve(requested_root,query.replaceAll("\\","/"));
            const stat=await files.fs.promises.stat(requested);
            if(request!==direct_generation||disposed||root.hidden||query_text()!==query||files.context_root()!==requested_root||workspace_context_epoch()!==context_epoch||workspace_context_switching())return;
            if(stat.isFile()){
              const relative_path=files.path_api.relative(requested_root,requested).replaceAll("\\","/");
              direct_file={file_path:requested,relative_path,name:files.path_api.basename(requested),directory:files.path_api.dirname(relative_path).replace(/^\.$/u,"")};
            }
          }catch(error){
            if(request===direct_generation&&!['ENOENT','ENOTDIR'].includes(String((error as {code?:string})?.code)))direct_error=`路径核对失败：${String((error as Error)?.message||error)}`;
          }finally{
            if(request===direct_generation&&!disposed&&!root.hidden&&query_text()===query&&files.context_root()===requested_root&&workspace_context_epoch()===context_epoch&&!workspace_context_switching()){
              direct_pending=false;void render();
            }
          }
        })();
      }
    }
    const candidates=direct_file?(files.path_api.isAbsolute(query)?[direct_file]:[direct_file,...catalogue.filter(file=>file.file_path!==direct_file!.file_path)]):catalogue.slice();
    const literal_file=regex_mode?(direct_file||candidates.find(file=>file.relative_path===query.replaceAll('\\','/'))):undefined;
    if(literal_file)regex_mode=false;
    const regex_matches=new Map<number,search_path_match>();
    if(regex_mode){
      query_expression({query,regex:true});
      match_controller?.abort();const controller=new AbortController();match_controller=controller;
      const worker=create_search_matcher();
      try{
        for(let offset=0;offset<candidates.length;offset+=2048){
          const reply=await worker.match_paths(candidates.slice(offset,offset+2048).map(file=>file.relative_path||file.name),{query,regex:true},controller.signal);
          if(disposed||root.hidden||generation!==render_generation)return;
          for(const match of reply)regex_matches.set(offset+match.index,match);
        }
      }finally{worker.dispose();if(match_controller===controller)match_controller=undefined;}
    }
    let deadline=performance.now()+8;let total=0;
    // 完整保留候选；筛选在小时间片之间让出UI线程，DOM仅挂载可见行。
    for(let index=0;index<candidates.length;index++){
      if(index%256===0&&performance.now()>deadline){await new Promise<void>(resolve=>window.setTimeout(resolve,0));if(disposed||root.hidden||generation!==render_generation)return;deadline=performance.now()+8;}
      const file=candidates[index];
      if(literal_file&&file!==literal_file)continue;
      const found=regex_matches.get(index);if(regex_mode&&!found&&file!==direct_file)continue;
      const item=matcher.match(file);if(!item)continue;total++;
      if(found){const start=(file.relative_path||file.name).length-file.name.length;item.score.labelMatch=[{start:Math.max(0,found.start-start),end:Math.max(0,found.end-start)}];item.score.descriptionMatch=[{start:found.start,end:Math.min(found.end,start)}].filter(range=>range.end>range.start);}
      ranked.push(item);
    }
    if(disposed||root.hidden||generation!==render_generation)return;
    ranked.sort(order);shown=ranked.map(item=>item.file);rendered_query=query;
    selected_index=Math.max(0,shown.findIndex(file=>file.file_path===previous_path));
    shown_matches=ranked;visible_start=-1;visible_end=-1;
    if(!previous_path)results.scrollTop=0;
    paint_rows(true);
    status.textContent = (shown.length ? `${total} 个文件` : query ? `没有匹配的文件 · ${scan_root||"未打开文件夹"}` : `工作区中没有可打开的文件 · ${scan_root||"未打开文件夹"}`)+(scanning?` · 正在查找（已发现 ${catalogue.length} 个文件）`:"");
    if(direct_pending)status.textContent+=" · 正在核对文件路径…";
    if(direct_error)status.textContent+=` · ${direct_error}`;
    if(unreadable)status.textContent+=` · ${unreadable} 个目录无法读取，结果不完整`;
    status.classList.toggle("is-visible",!shown.length||scanning||direct_pending||!!direct_error||unreadable>0);
    if(!shown.length)input.removeAttribute("aria-activedescendant");
    select(selected_index);
    if(pending_open_query===query&&(shown.length||(!scanning&&!direct_pending))){pending_open_query=undefined;void open_selected();}
    }catch(error){
      if(!disposed&&!root.hidden&&generation===render_generation){shown=[];shown_matches=[];results.replaceChildren();input.removeAttribute('aria-activedescendant');pending_open_query=undefined;status.textContent=`搜索失败：${String((error as Error)?.message||error)}`;status.classList.add("is-visible");}
    }finally{
      if(generation===render_generation){ranking=false;if(rank_again&&!root.hidden&&!disposed){rank_again=false;schedule_render();}}
    }
  };
  const schedule_render=()=>{if(!render_timer)render_timer=window.setTimeout(()=>{render_timer=0;void render();},80);};
  const scan = async () => {
    const generation = ++scan_generation;
    catalogue = [];scanning=true;unreadable=0;
    status.textContent = "正在查找工作区文件…";
    const workspace_root = scan_root;
    const stack = workspace_root ? [workspace_root] : [];const pending=new Set<Promise<void>>();
    const current=()=>generation===scan_generation&&!root.hidden&&!disposed&&workspace_context_epoch()===context_epoch&&files.context_root()===workspace_root&&!workspace_context_switching();
    const read_directory=async(directory:string)=>{
      let entries: any[];
      try { entries = await files.fs.promises.readdir(directory, { withFileTypes: true }); }
      catch { if(current())unreadable++;return; }
      if (!current()) return;
      let deadline=performance.now()+8;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if(index%128===0&&performance.now()>deadline){schedule_render();await new Promise<void>(resolve=>window.setTimeout(resolve,0));if(!current())return;deadline=performance.now()+8;}
        const entry = entries[index];
        const file_path = files.path_api.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (![".git", "node_modules"].includes(entry.name)) stack.push(file_path);
        } else if (entry.isFile()) {
          const relative_path = files.path_api.relative(workspace_root, file_path).replaceAll("\\", "/");
          catalogue.push({file_path,relative_path,name:entry.name,directory:files.path_api.dirname(relative_path).replace(/^\.$/u, "")});
        }
      }
      if(current())schedule_render();
    };
    while(current()&&(stack.length||pending.size)){
      while(stack.length&&pending.size<4){const task=read_directory(stack.pop()!).finally(()=>pending.delete(task));pending.add(task);}
      if(pending.size)await Promise.race(pending);
    }
    if(current()){scanning=false;clearTimeout(render_timer);render_timer=0;void render();}
  };
  const open = (group?:graph_leaf["parent"]) => {
    if (disposed||workspace_context_switching()) return;
    if (!root.hidden)close(false);
    editor_group=group;
    scan_root=files.context_root();context_epoch=workspace_context_epoch();input.title=scan_root||"未打开文件夹";
    previous_focus=capture_workspace_focus();
    escape_layer=register_workspace_dismissal(()=>[root],reason=>{
      // 关闭活动文件会临时激活相邻编辑器，属于本次列表操作，不能因此关闭列表。
      if(reason==="focus-out"&&opening&&editor_group)return;
      close(reason==="escape");
    },{window_blur:true});
    root.hidden = false;input.setAttribute("aria-expanded","true");
    root.setAttribute("aria-modal", "true");
    input.value = group?"edt active ":"";
    input.setAttribute("aria-label",group?"当前组已打开的编辑器":"按文件名或路径搜索");
    catalogue = [];
    results.replaceChildren();
    input.focus();
    render();
    if(!group)void scan();
  };

  input.oninput = () => {
    match_controller?.abort();render_generation++;ranking=false;
    pending_open_query=undefined;
    const group=/^edt active(?:\s|$)/u.test(input.value)?files.core?.app.workspace.activeLeaf?.parent:undefined;
    if(Boolean(group)!==Boolean(editor_group)){scan_generation++;direct_generation++;scanning=false;direct_pending=false;direct_file=undefined;direct_query=undefined;editor_group=group;catalogue=[];if(!group)void scan();}
    void render();
  };
  input.onkeydown = event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); select(selected_index + (event.key === "ArrowDown" ? 1 : -1)); }
    else if(event.key==="PageDown"||event.key==="PageUp"){event.preventDefault();select(Math.max(0,Math.min(shown.length-1,selected_index+(event.key==="PageDown"?1:-1)*Math.max(1,Math.floor(results.clientHeight/22)))));}
    else if (event.key === "Enter") { event.preventDefault(); open_selected(); }
  };
  window.addEventListener("linux-note-workspace-context-changed", ()=>close(false), {signal: events.signal});
  const active_changed=()=>{const leaf=files.core?.app.workspace.activeLeaf;if(leaf)recent.set(leaf,++activation);};active_changed();
  const subscriptions=[files.core?.app.workspace.on?.("active-leaf:change",active_changed),files.core?.app.workspace.on?.("layout-changed",()=>{if(editor_group&&!root.hidden)void render();})];
  const binding:quick_open_binding = { root, input, open:()=>open(), open_editors:group=>open(group),close, dispose() { if (disposed) return; disposed = true; subscriptions.forEach(release=>release?.());events.abort();resize_observer.disconnect(); close(false); scan_generation += 1; root.remove(); style.remove(); file_icon_style.remove();interaction.remove(); if(current_picker===binding)current_picker=undefined; } };
  current_picker=binding;
  return binding;
}
