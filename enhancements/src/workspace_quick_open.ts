import {capture_workspace_focus,register_workspace_dismissal,type workspace_focus_snapshot,type workspace_dismiss_layer} from "./workspace_focus";
import css from "./workspace_quick_open.css";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_file_icons, workspace_file_icon} from "./workspace_file_icons";
import type { workspace_file_host } from "./workspace_files";

type quick_file = { file_path: string; relative_path: string; name: string; lower_name: string; lower_path: string };
const quick_path_order = new Intl.Collator("zh-CN", {numeric: true});
type quick_open_binding = {root:HTMLElement;input:HTMLInputElement;open():void;close():void;dispose():void};
let current_picker: quick_open_binding | undefined;
export function get_workspace_quick_open() { return current_picker; }

function fuzzy_score(query: string, candidate: string): number {
  const needle = query;
  const haystack = candidate;
  if (!needle) return 1;
  const exact = haystack.indexOf(needle);
  if (exact >= 0) return 10000 - exact * 10 - candidate.length;
  let score = 0, position = -1, streak = 0;
  for (const character of needle) {
    const next = haystack.indexOf(character, position + 1);
    if (next < 0) return -1;
    streak = next === position + 1 ? streak + 1 : 0;
    score += 30 + streak * 12 - next;
    position = next;
  }
  return score - candidate.length;
}

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
  input.placeholder = "键入文件名进行搜索";
  input.setAttribute("aria-label", "按文件名搜索");
  input.autocomplete = "off";
  input.spellcheck = false;
  input_row.append(input);
  const results = document.createElement("div");
  results.className = "workspace-quick-open-results";
  results.setAttribute("role", "listbox");
  const status = document.createElement("div");
  status.className = "workspace-quick-open-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.append(input_row, status, results);
  document.body.append(root);

  let catalogue: quick_file[] = [];
  let shown: quick_file[] = [];
  let selected_index = 0;
  let scan_generation = 0;
  let render_generation = 0; let render_timer = 0; let scanning = false; let limited = false; let rendered_query = "";
  let pending_open_query: string | undefined;
  let previous_focus:workspace_focus_snapshot|undefined;let escape_layer:workspace_dismiss_layer|undefined;

  const close = (restore=true) => {
    if (root.hidden) return;
    const owned=escape_layer?.owns_focus();escape_layer?.dispose();escape_layer=undefined;
    scan_generation += 1;
    render_generation += 1;clearTimeout(render_timer);render_timer=0;scanning=false;
    pending_open_query=undefined;
    root.hidden = true;
    root.setAttribute("aria-modal", "false");
    results.replaceChildren();
    shown = [];
    if(restore&&owned)previous_focus?.restore();
    previous_focus=undefined;
  };
  const select = (index: number) => {
    const rows = [...results.querySelectorAll<HTMLButtonElement>(".workspace-quick-open-result")];
    if (!rows.length) return;
    selected_index = (index + rows.length) % rows.length;
    rows.forEach((row, row_index) => {
      const selected = row_index === selected_index;
      row.classList.toggle("is-selected", selected);
      row.setAttribute("aria-selected", String(selected));
      if (selected) row.scrollIntoView({ block: "nearest" });
    });
  };
  const open_selected = () => {
    const query=input.value.trim().toLocaleLowerCase();
    if(query!==rendered_query){pending_open_query=query;return;}
    const target = shown[selected_index];
    if (!target) return;
    close();
    void files.open_file(target.file_path);
  };
  const render = async () => {
    const generation=++render_generation;const query = input.value.trim().toLocaleLowerCase();
    const previous_path=query===rendered_query?shown[selected_index]?.file_path:undefined;
    if(query!==rendered_query){shown=[];results.replaceChildren();status.textContent="正在筛选文件…";}
    const ranked:{file:quick_file;score:number}[]=[];
    const order=(left:{file:quick_file;score:number},right:{file:quick_file;score:number})=>right.score-left.score||quick_path_order.compare(left.file.relative_path,right.file.relative_path);
    let deadline=performance.now()+8;let total=0;
    // 只维护前100项，不为每次按键排序整个工程；长目录在小时间片之间让出UI线程。
    for(let index=0;index<catalogue.length;index++){
      if(index%256===0&&performance.now()>deadline){await new Promise<void>(resolve=>window.setTimeout(resolve,0));if(disposed||root.hidden||generation!==render_generation)return;deadline=performance.now()+8;}
      const file=catalogue[index],score=Math.max(fuzzy_score(query,file.lower_name),fuzzy_score(query,file.lower_path));if(score<0)continue;total++;
      const item={file,score};if(ranked.length===100&&order(item,ranked[99])>=0)continue;
      let low=0,high=ranked.length;while(low<high){const middle=(low+high)>>>1;if(order(item,ranked[middle])<0)high=middle;else low=middle+1;}ranked.splice(low,0,item);if(ranked.length>100)ranked.pop();
    }
    if(disposed||root.hidden||generation!==render_generation)return;
    shown=ranked.map(item=>item.file);rendered_query=query;
    selected_index=Math.max(0,shown.findIndex(file=>file.file_path===previous_path));
    results.replaceChildren(...shown.map((file, index) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "workspace-quick-open-result";
      row.setAttribute("role", "option");
      row.title = file.file_path;
      row.append(workspace_file_icon(file.file_path));
      const name = document.createElement("span"); name.className = "workspace-quick-open-name"; name.textContent = file.name;
      const directory = document.createElement("span"); directory.className = "workspace-quick-open-path"; directory.textContent = files.path_api.dirname(file.relative_path).replace(/^\.$/u, "");
      row.append(name, directory);
      row.onmousemove = () => select(index);
      row.onclick = () => { selected_index = index; open_selected(); };
      row.ondblclick = event => event.preventDefault();
      return row;
    }));
    status.textContent = (shown.length ? `${total} 个文件${total>100?" · 显示前100项":""}` : query ? "没有匹配的文件" : "工作区中没有可打开的文件")+(scanning?` · 正在查找（已发现 ${catalogue.length} 个文件）`:limited?" · 文件扫描已达到50000项上限":"");
    select(selected_index);
    if(pending_open_query===query){pending_open_query=undefined;open_selected();}
  };
  const schedule_render=()=>{if(!render_timer)render_timer=window.setTimeout(()=>{render_timer=0;void render();},80);};
  const scan = async () => {
    const generation = ++scan_generation;
    catalogue = [];scanning=true;limited=false;
    status.textContent = "正在查找工作区文件…";
    const workspace_root = files.context_root();
    const stack = workspace_root ? [workspace_root] : [];const pending=new Set<Promise<void>>();
    const current=()=>generation===scan_generation&&!root.hidden&&!disposed;
    const read_directory=async(directory:string)=>{
      let entries: any[];
      try { entries = await files.fs.promises.readdir(directory, { withFileTypes: true }); }
      catch { return; }
      if (!current()) return;
      let deadline=performance.now()+8;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        if(catalogue.length>=50000){limited=true;break;}
        if(index%128===0&&performance.now()>deadline){schedule_render();await new Promise<void>(resolve=>window.setTimeout(resolve,0));if(!current())return;deadline=performance.now()+8;}
        const entry = entries[index];
        const file_path = files.path_api.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (![".git", "node_modules"].includes(entry.name)) stack.push(file_path);
        } else if (entry.isFile()) {
          const relative_path = files.path_api.relative(workspace_root, file_path).replaceAll("\\", "/");
          catalogue.push({ file_path, relative_path, name: entry.name,lower_name:entry.name.toLocaleLowerCase(),lower_path:relative_path.toLocaleLowerCase() });
        }
      }
      if(current())schedule_render();
    };
    while(current()&&(stack.length||pending.size)&&!limited){
      while(stack.length&&pending.size<4&&!limited){const task=read_directory(stack.pop()!).finally(()=>pending.delete(task));pending.add(task);}
      if(pending.size)await Promise.race(pending);
    }
    if(current()){scanning=false;clearTimeout(render_timer);render_timer=0;void render();}
  };
  const open = () => {
    if (disposed) return;
    if (!root.hidden) { pending_open_query=undefined;input.value = "";render(); input.focus(); return; }
    previous_focus=capture_workspace_focus();
    escape_layer=register_workspace_dismissal(()=>[root],reason=>close(reason==="escape"),{window_blur:true});
    root.hidden = false;
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
    else if (event.key === "Enter") { event.preventDefault(); open_selected(); }
  };
  window.addEventListener("linux-note-workspace-context-changed", ()=>close(false), {signal: events.signal});
  const binding:quick_open_binding = { root, input, open, close, dispose() { if (disposed) return; disposed = true; events.abort(); close(false); scan_generation += 1; root.remove(); style.remove(); file_icon_style.remove(); if(current_picker===binding)current_picker=undefined; } };
  current_picker=binding;
  return binding;
}
