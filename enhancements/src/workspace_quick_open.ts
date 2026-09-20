import {capture_workspace_focus,register_workspace_dismissal,type workspace_focus_snapshot,type workspace_dismiss_layer} from "./workspace_focus";
import css from "./workspace_quick_open.css";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_file_icons, workspace_file_icon} from "./workspace_file_icons";
import type { workspace_file_host } from "./workspace_files";

import {create_quick_matcher,append_quick_highlights,type quick_file,type quick_match} from "./workspace_quick_open_matcher";
import {acquire_workspace_interaction} from "./workspace_interaction";
import {workspace_context_epoch,workspace_context_switching} from "./workspace_context";
type quick_open_binding = {root:HTMLElement;input:HTMLInputElement;open():void;close():void;dispose():void};
const MAX_QUICK_RESULTS=512;
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
  input_row.append(input);
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

  let catalogue: quick_file[] = [];
  let shown: quick_file[] = [];let shown_matches:quick_match[]=[];let visible_start=-1;let visible_end=-1;
  let selected_index = 0;
  let scan_generation = 0;
  let render_generation = 0; let render_timer = 0; let scanning = false; let unreadable = 0; let scan_root=""; let context_epoch=0; let rendered_query = "";
  let pending_open_query: string | undefined;let opening=false;
  let previous_focus:workspace_focus_snapshot|undefined;let escape_layer:workspace_dismiss_layer|undefined;

  const close = (restore=true) => {
    if (root.hidden) return;
    const owned=escape_layer?.owns_focus();escape_layer?.dispose();escape_layer=undefined;
    scan_generation += 1;
    render_generation += 1;clearTimeout(render_timer);render_timer=0;scanning=false;
    pending_open_query=undefined;opening=false;
    root.hidden = true;input.setAttribute("aria-expanded","false");input.removeAttribute("aria-activedescendant");
    root.setAttribute("aria-modal", "false");
    results.replaceChildren();
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
        row.append(workspace_file_icon(file.file_path));
        const name=document.createElement("span");name.className="workspace-quick-open-name";append_quick_highlights(name,file.name,shown_matches[index].score.labelMatch);
        const directory=document.createElement("span");directory.className="workspace-quick-open-path";append_quick_highlights(directory,file.directory,shown_matches[index].score.descriptionMatch);row.append(name,directory);
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
    const query=input.value.trim();
    if(query!==rendered_query){pending_open_query=query;return;}
    const target=shown[selected_index];if(!target)return;
    if(files.context_root()!==scan_root||workspace_context_epoch()!==context_epoch||workspace_context_switching()){close(false);return;}
    const opening_generation=scan_generation;opening=true;
    try {await files.open_file(target.file_path);if(opening_generation===scan_generation)close();}
    catch(error){if(!root.hidden&&opening_generation===scan_generation){status.textContent=`无法打开文件：${String((error as Error)?.message||error)}`;status.classList.add("is-visible");}}
    finally{if(opening_generation===scan_generation)opening=false;}
  };
  const render = async () => {
    const generation=++render_generation;const query = input.value.trim();
    const previous_path=query===rendered_query?shown[selected_index]?.file_path:undefined;
    if(query!==rendered_query){shown=[];results.replaceChildren();status.textContent="正在筛选文件…";}
    const ranked:quick_match[]=[];const matcher=create_quick_matcher(query);
    const order=matcher.compare;
    let candidates=catalogue;
    // VS Code 同时直接探测显式路径，允许打开默认排除目录中的已知文件。
    if(/[\\/]/u.test(query)&&files.fs.promises.stat){
      const requested=files.path_api.resolve(scan_root,query.replaceAll("\\","/"));
      try{if((await files.fs.promises.stat(requested)).isFile()){
        const relative_path=files.path_api.relative(scan_root,requested).replaceAll("\\","/");
        const direct={file_path:requested,relative_path,name:files.path_api.basename(requested),directory:files.path_api.dirname(relative_path).replace(/^\.$/u,"")};
        candidates=files.path_api.isAbsolute(query)?[direct]:[direct,...catalogue.filter(file=>file.file_path!==requested)];
      }}catch{/* 不存在的显式路径继续模糊匹配；读取错误由枚举报告。 */}
      if(disposed||root.hidden||generation!==render_generation)return;
    }
    let deadline=performance.now()+8;let total=0;
    // 只维护前512项，不为每次按键排序整个工程；长目录在小时间片之间让出UI线程。
    for(let index=0;index<candidates.length;index++){
      if(index%256===0&&performance.now()>deadline){await new Promise<void>(resolve=>window.setTimeout(resolve,0));if(disposed||root.hidden||generation!==render_generation)return;deadline=performance.now()+8;}
      const file=candidates[index],item=matcher.match(file);if(!item)continue;total++;
      if(ranked.length===MAX_QUICK_RESULTS&&order(item,ranked[MAX_QUICK_RESULTS-1])>=0)continue;
      let low=0,high=ranked.length;while(low<high){const middle=(low+high)>>>1;if(order(item,ranked[middle])<0)high=middle;else low=middle+1;}ranked.splice(low,0,item);if(ranked.length>MAX_QUICK_RESULTS)ranked.pop();
    }
    if(disposed||root.hidden||generation!==render_generation)return;
    shown=ranked.map(item=>item.file);rendered_query=query;
    selected_index=Math.max(0,shown.findIndex(file=>file.file_path===previous_path));
    shown_matches=ranked;visible_start=-1;visible_end=-1;
    if(!previous_path)results.scrollTop=0;
    paint_rows(true);
    status.textContent = (shown.length ? `${total} 个文件${total>MAX_QUICK_RESULTS?" · 显示前512项":""}` : query ? `没有匹配的文件 · ${scan_root||"未打开文件夹"}` : `工作区中没有可打开的文件 · ${scan_root||"未打开文件夹"}`)+(scanning?` · 正在查找（已发现 ${catalogue.length} 个文件）`:"");
    if(unreadable)status.textContent+=` · ${unreadable} 个目录无法读取，结果不完整`;
    status.classList.toggle("is-visible",!shown.length||unreadable>0);
    if(!shown.length)input.removeAttribute("aria-activedescendant");
    select(selected_index);
    if(pending_open_query===query){pending_open_query=undefined;open_selected();}
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
  const open = () => {
    if (disposed||workspace_context_switching()) return;
    if (!root.hidden) { pending_open_query=undefined;input.value = "";render(); input.focus(); return; }
    scan_root=files.context_root();context_epoch=workspace_context_epoch();input.title=scan_root||"未打开文件夹";
    previous_focus=capture_workspace_focus();
    escape_layer=register_workspace_dismissal(()=>[root],reason=>close(reason==="escape"),{window_blur:true});
    root.hidden = false;input.setAttribute("aria-expanded","true");
    root.setAttribute("aria-modal", "true");
    input.value = "";
    catalogue = [];
    results.replaceChildren();
    input.focus();
    render();
    void scan();
  };

  input.oninput = () => {pending_open_query=undefined;void render();};
  input.onkeydown = event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); select(selected_index + (event.key === "ArrowDown" ? 1 : -1)); }
    else if(event.key==="PageDown"||event.key==="PageUp"){event.preventDefault();select(Math.max(0,Math.min(shown.length-1,selected_index+(event.key==="PageDown"?1:-1)*Math.max(1,Math.floor(results.clientHeight/22)))));}
    else if (event.key === "Enter") { event.preventDefault(); open_selected(); }
  };
  window.addEventListener("linux-note-workspace-context-changed", ()=>close(false), {signal: events.signal});
  const binding:quick_open_binding = { root, input, open, close, dispose() { if (disposed) return; disposed = true; events.abort();resize_observer.disconnect(); close(false); scan_generation += 1; root.remove(); style.remove(); file_icon_style.remove();interaction.remove(); if(current_picker===binding)current_picker=undefined; } };
  current_picker=binding;
  return binding;
}
