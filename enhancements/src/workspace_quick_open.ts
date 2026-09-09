import { git_icon } from "./git_icons";
import type { workspace_file_host } from "./workspace_files";

type quick_file = { file_path: string; relative_path: string; name: string; action?: () => void; detail?: string };

function fuzzy_score(query: string, candidate: string): number {
  const needle = query.trim().toLocaleLowerCase();
  const haystack = candidate.toLocaleLowerCase();
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
  let previous_focus: HTMLElement | null = null;

  const close = () => {
    if (root.hidden) return;
    scan_generation += 1;
    root.hidden = true;
    root.setAttribute("aria-modal", "false");
    results.replaceChildren();
    shown = [];
    if (previous_focus?.isConnected) previous_focus.focus({ preventScroll: true });
    previous_focus = null;
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
    const target = shown[selected_index];
    if (!target) return;
    close();
    if (target.action) target.action(); else void files.open_file(target.file_path);
  };
  const render = () => {
    const query = input.value.trim();
    const registry = files.core.app.commands as typeof files.core.app.commands & { commandMap?: Record<string, { id: string; title: string; hotkey?: string; showInCommandPanel?: boolean }> };
    if (query.startsWith(">")) {
      // 读取社区核心 CommandManager 的公开表，包含继承默认标题与用户快捷键的实时命令对象。
      shown = Object.values(registry.commandMap || {}).filter(item => item.showInCommandPanel !== false)
        .map(item => ({ item, score: Math.max(fuzzy_score(query.slice(1), item.title), fuzzy_score(query.slice(1), item.id)) }))
        .filter(item => item.score >= 0).sort((a, b) => b.score - a.score).slice(0, 100)
        .map(({item}) => ({ file_path: item.id, relative_path: "", name: item.title, detail: item.hotkey || "", action: () => registry.run(item.id) }));
    } else if (query.startsWith(":")) {
      const location = /^:(\d+)(?::(\d+))?$/u.exec(query);
      const file_path = files.current_file();
      shown = location && file_path ? [{ file_path, relative_path: "", name: `转到行 ${location[1]}，列 ${location[2] || 1}`, detail: files.path_api.basename(file_path), action: () => void files.open_file(file_path, {line: Math.max(1, Number(location[1])), column: Math.max(1, Number(location[2] || 1)), source: files.source_editor_active?.()}) }] : [];
    } else if (query.startsWith("@")) shown = [];
    else shown = catalogue.map(file => ({ file, score: Math.max(fuzzy_score(query, file.name), fuzzy_score(query, file.relative_path)) }))
      .filter(item => item.score >= 0)
      .sort((left, right) => right.score - left.score || left.file.relative_path.localeCompare(right.file.relative_path, "zh-CN", { numeric: true }))
      .slice(0, 100).map(item => item.file);
    selected_index = 0;
    results.replaceChildren(...shown.map((file, index) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "workspace-quick-open-result";
      row.setAttribute("role", "option");
      row.title = file.file_path;
      row.append(git_icon(query.startsWith(">") ? "terminal" : "file"));
      const name = document.createElement("span"); name.className = "workspace-quick-open-name"; name.textContent = file.name;
      const directory = document.createElement("span"); directory.className = "workspace-quick-open-path"; directory.textContent = file.detail ?? files.path_api.dirname(file.relative_path).replace(/^\.$/u, "");
      row.append(name, directory);
      row.onmousemove = () => select(index);
      row.onclick = () => { selected_index = index; open_selected(); };
      row.ondblclick = event => event.preventDefault();
      return row;
    }));
    status.textContent = query.startsWith("@") ? "当前工作区未提供统一符号查询，请使用大纲导航" : query.startsWith(":") ? (shown.length ? "按 Enter 转到指定位置" : "输入 :行号 或 :行号:列号，并先打开文档") : query.startsWith(">") ? (shown.length ? `${shown.length} 个命令` : "没有匹配的命令") : shown.length ? `${shown.length}${catalogue.length > shown.length ? "+" : ""} 个文件` : query ? "没有匹配的文件" : "工作区中没有可打开的文件";
    select(0);
  };
  const scan = async () => {
    const generation = ++scan_generation;
    catalogue = [];
    status.textContent = "正在查找工作区文件…";
    const workspace_root = files.context_root();
    const stack = workspace_root ? [workspace_root] : [];
    while (stack.length && catalogue.length < 50000) {
      const directory = stack.pop()!;
      let entries: any[];
      try { entries = await files.fs.promises.readdir(directory, { withFileTypes: true }); }
      catch { continue; }
      if (generation !== scan_generation || root.hidden) return;
      entries.sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        const file_path = files.path_api.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (![".git", "node_modules"].includes(entry.name)) stack.push(file_path);
        } else if (entry.isFile()) {
          const relative_path = files.path_api.relative(workspace_root, file_path).replaceAll("\\", "/");
          catalogue.push({ file_path, relative_path, name: entry.name });
        }
      }
      if (catalogue.length % 500 === 0) await new Promise<void>(resolve => window.setTimeout(resolve, 0));
    }
    if (generation === scan_generation && !root.hidden) render();
  };
  const open = (prefix = "") => {
    if (disposed) return;
    if (!root.hidden) { input.value = prefix; render(); input.focus(); return; }
    previous_focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.hidden = false;
    root.setAttribute("aria-modal", "true");
    input.value = prefix;
    catalogue = [];
    results.replaceChildren();
    input.focus();
    render();
    void scan();
  };

  input.oninput = render;
  input.onkeydown = event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); select(selected_index + (event.key === "ArrowDown" ? 1 : -1)); }
    else if (event.key === "Enter") { event.preventDefault(); open_selected(); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
  };
  root.onmousedown = event => { if (event.target === root) close(); };
  document.addEventListener("pointerdown", event => { if (!root.hidden && !root.contains(event.target as Node)) close(); }, {capture: true, signal: events.signal});
  window.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || !["KeyP", "KeyG"].includes(event.code) || event.isComposing || (event.code === "KeyG" && event.shiftKey)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const prefix = event.code === "KeyG" ? ":" : event.shiftKey ? ">" : "";
    if (root.hidden || prefix) open(prefix); else close();
  }, {capture: true, signal: events.signal});
  window.addEventListener("blur", close, {signal: events.signal});
  return { root, input, open, close, dispose() { if (disposed) return; disposed = true; events.abort(); close(); scan_generation += 1; root.remove(); } };
}
