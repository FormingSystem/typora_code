import {acquire_workspace_style} from "./workspace_styles";
import {git_icon,git_icon_button} from "./git_icons";
import { create_workspace_lifetime } from "./workspace_lifetime";
import node_release from "../node_runtime.json";
import { start_terminal_pty, type terminal_pty } from "./terminal_pty_client";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import xterm_css from "@xterm/xterm/css/xterm.css";
import terminal_css from "./terminal_workspace.css";
import { terminal_profiles, terminal_environment, administrator_launch } from "./terminal_runtime";
import { workspace_button as button, workspace_element as el, workspace_option as option, workspace_dialog, workspace_menu } from "./workspace_widgets";
import type { graph_host, graph_leaf } from "./git_graph_host";
import { terminal_theme, observe_terminal_theme } from "./terminal_theme";

const TERMINAL_TYPE = "linux_note.terminal";
const TERMINAL_SETTINGS_KEY = "linux-note-terminal:v1:";
type terminal_settings = { profile: string; font_size: number; scrollback: number; location: string };
const defaults: terminal_settings = { profile: "", font_size: 14, scrollback: 10000, location: "down" };

export function bind_terminal_workspace(host: graph_host) {
  const lifetime = create_workspace_lifetime();
  const events = new AbortController(); lifetime.add(() => events.abort());
  const create_dialog = (title: string) => { const dialog = workspace_dialog(title); lifetime.add(dialog.close); return dialog; };
  const core = host.core; const runtime = window as unknown as { reqnode(name: string): any; _options: { userDataPath: string } };
  const style = acquire_workspace_style("typora-code-style:terminal_workspace", xterm_css + "\n" + terminal_css, {"data-workspace-terminal-style":"ready"});
  const profiles = terminal_profiles(host.process_api, host.path_api);
  const sessions = new Map<graph_leaf, terminal_view>(); let serial = 0; let last_leaf: graph_leaf | undefined;
  const stop_theme = observe_terminal_theme(theme => { for (const view of sessions.values()) if (view.term) view.term.options.theme = theme; });
  const load_settings = (): terminal_settings => {
    try { const value = JSON.parse(localStorage.getItem(TERMINAL_SETTINGS_KEY) || "{}"); return {
      profile: profiles.some(item => item.id === value.profile) ? value.profile : "",
      font_size: Number.isInteger(value.font_size) && value.font_size >= 9 && value.font_size <= 32 ? value.font_size : defaults.font_size,
      scrollback: Number.isInteger(value.scrollback) && value.scrollback >= 100 && value.scrollback <= 100000 ? value.scrollback : defaults.scrollback,
      location: ["active", "right", "down"].includes(value.location) ? value.location : defaults.location,
    }; } catch { return { ...defaults }; }
  };
  const fail = (error: unknown) => { if (lifetime.disposed) return; const dialog = create_dialog("终端"); dialog.content.textContent = String(error); };
  const admin = (root: string) => {
    if (lifetime.disposed) return;
    try { const launch = administrator_launch(root, host.process_api, host.path_api);
      runtime.reqnode("child_process").execFile(launch.executable, launch.args, { cwd: root, windowsHide: true, shell: false }, (error: Error | null) => { if (error) fail("管理员终端未启动（UAC 可能已取消）：" + error.message); });
    } catch (error) { fail(error); }
  };
  const settings_dialog = () => {
    if (lifetime.disposed) return;
    const settings = load_settings(); const dialog = create_dialog("终端设置"); const form = el("div", "git-graph-settings-form");
    const profile = el("select"); for (const item of profiles) profile.append(option(item.id, item.title)); profile.value = settings.profile || profiles[0].id;
    const font = el("input"); font.type = "number"; font.min = "9"; font.max = "32"; font.value = String(settings.font_size);
    const scrollback = el("input"); scrollback.type = "number"; scrollback.min = "100"; scrollback.max = "100000"; scrollback.value = String(settings.scrollback);
    const location = el("select"); for (const [id, title] of [["down", "下方编辑组"], ["right", "右侧编辑组"], ["active", "当前组新标签"]]) location.append(option(id, title)); location.value = settings.location;
    for (const [title, input] of [["默认 Shell", profile], ["字体大小", font], ["保留滚动行数", scrollback], ["新终端位置", location]] as const) { const label = el("label", "", title); label.append(input); form.append(label); }
    dialog.content.append(form); const error = el("p"); dialog.content.append(error);
    dialog.footer.prepend(button("应用", () => {
      if (![...form.querySelectorAll<HTMLInputElement>("input")].every(input => input.checkValidity())) { error.textContent = "请填写允许范围内的整数。"; return; }
      localStorage.setItem(TERMINAL_SETTINGS_KEY, JSON.stringify({ profile: profile.value, font_size: Number(font.value), scrollback: Number(scrollback.value), location: location.value }));
      for (const view of sessions.values()) { if (view.term) { view.term.options.fontSize = Number(font.value); view.term.options.scrollback = Number(scrollback.value); view.resize(); } } dialog.close();
    }));
  };
  const open = (root: string, program = "", group = load_settings().location) => {
    if (lifetime.disposed) return;
    const profile_id = profiles.find(item => item.id === (program || load_settings().profile))?.id || (program ? "shell" : profiles[0].id);
    const uri = `typ://${TERMINAL_TYPE}/${encodeURIComponent(JSON.stringify({ root, program }))}/${Date.now()}-${++serial}/Terminal ${serial} (${profile_id})`;
    if (group !== "active") core.app.commands.run(group === "right" ? "core.workspace:split-right" : "core.workspace:split-down", [uri]);
    else { const parent = core.app.workspace.activeLeaf?.parent; if (!parent) return; const leaf = core.app.workspace.createLeaf({ type: TERMINAL_TYPE, state: { path: uri, git_cwd: root } }); parent.appendChild(leaf); core.app.workspace.activeLeaf = leaf; }
  };
  class terminal_view extends core.WorkspaceView {
    containerEl = el("section", "linux-note-terminal"); icon = "fa-terminal";
    viewport = el("div", "linux-note-terminal-viewport"); status = el("div", "linux-note-terminal-status");
    term?: Terminal; fit?: FitAddon; search?: SearchAddon; pty?: terminal_pty; starting = false; generation = 0; observer?: ResizeObserver;
    frame = 0; close_timer = 0; startup?: AbortController;
    root = ""; program = ""; active = false; disposed = false; pending_bytes = 0;
    constructor(leaf: graph_leaf) {
      super(leaf); sessions.set(leaf, this);
      try { const value = JSON.parse(decodeURIComponent(leaf.state.path.split("/")[3])); this.root = value.root; this.program = value.program; } catch { this.root = host.context_path(); }
      leaf.state.git_cwd = this.root; this.containerEl.dataset.cwd = this.root;
      this.containerEl.setAttribute("aria-label", "仓库命令终端"); this.status.setAttribute("role", "status");
      const toolbar = el("div", "linux-note-terminal-toolbar"); const title = el("span", "linux-note-terminal-title", "终端 · " + host.path_api.basename(this.root)); title.title = this.root;
      const select = el("select"); select.setAttribute("aria-label", "新终端 Shell"); for (const item of profiles) select.append(option(item.id, item.title)); select.value = load_settings().profile || profiles[0].id;
      toolbar.append(title, select, git_icon_button("add", "新建终端", () => open(this.root, select.value, "active")), button("左右拆分", () => open(this.root, select.value, "right")), button("查找", () => this.find()), button("清屏", () => this.term?.clear()), button("终止", () => this.stop()), button("设置", settings_dialog));
      this.containerEl.append(toolbar, this.viewport, this.status);
      this.containerEl.onpointerdown = () => { core.app.workspace.activeLeaf = this.leaf; last_leaf = this.leaf; };
      this.containerEl.oncontextmenu = event => lifetime.add(workspace_menu(event, [
        { id: "terminal_copy", title: "复制选中文本", disabled: !this.term?.hasSelection(), action: () => void host.copy(this.term?.getSelection() || "") },
        { id: "terminal_paste", title: "粘贴", action: () => void this.paste() },
        { id: "terminal_select_all", title: "全选", action: () => this.term?.selectAll() },
        { id: "terminal_clear", title: "清屏", action: () => this.term?.clear() },
        { id: "terminal_find", title: "查找", action: () => this.find() },
        { title: "新终端", separator: true, action: () => open(this.root, select.value, "active") },
        { title: "向右拆分终端", action: () => open(this.root, select.value, "right") },
        { title: "向下拆分终端", action: () => open(this.root, select.value, "down") },
        { id: "terminal_admin", title: "以管理员身份打开仓库终端（UAC）", disabled: host.process_api.platform !== "win32", action: () => admin(this.root) },
        { title: "复制仓库根路径", action: () => void host.copy(this.root) },
        { title: "重启当前 Shell", separator: true, action: () => { this.stop(); this.start(); } },
        { title: "终止当前 Shell", disabled: !this.pty, action: () => this.stop() },
        { title: "终端设置", separator: true, action: settings_dialog },
      ]));
      // 在终端内保留 Shell 快捷键，不让 Typora 的正文编辑命令接管按键。
      this.viewport.addEventListener("keydown", event => event.stopPropagation());
    }
    onOpen() {
      if (this.disposed || lifetime.disposed) return;
      this.active = true; last_leaf = this.leaf;
      if (!this.term) {
        const settings = load_settings();
        this.term = new Terminal({ cursorBlink: true, fontFamily: "Consolas, 'Cascadia Mono', monospace", fontSize: settings.font_size, scrollback: settings.scrollback, allowProposedApi: false, theme: terminal_theme() });
        this.fit = new FitAddon(); this.search = new SearchAddon(); this.term.loadAddon(this.fit); this.term.loadAddon(this.search); this.term.open(this.viewport);
        this.term.onData(data => { if (this.pty) try { this.pty.write(data); } catch (error) { this.status.textContent = String(error); } });
        this.term.attachCustomKeyEventHandler(event => {
          if ((event.ctrlKey || event.metaKey) && event.shiftKey && ["c", "v", "f"].includes(event.key.toLowerCase())) {
            if (event.type === "keydown") { event.preventDefault(); if (event.key.toLowerCase() === "c") void host.copy(this.term!.getSelection()); else if (event.key.toLowerCase() === "v") void this.paste(); else this.find(); } return false;
          } return true;
        });
        this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.viewport); this.start();
      }
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => { this.frame = 0; if (!this.disposed && !lifetime.disposed) { this.resize(); this.term?.focus(); } });
    }
    async start() {
      if (this.disposed || lifetime.disposed || this.starting) return;
      this.starting = true; const generation = ++this.generation; this.startup = new AbortController();
      try {
        if (host.process_api.platform !== "win32") throw new Error("集成终端运行包当前支持 Windows x64/ARM64；此平台尚未提供原生终端运行包。");
        if (typeof this.root !== "string" || !host.path_api.isAbsolute(this.root) || !host.fs.statSync(this.root).isDirectory()) throw new Error("终端工作目录不存在。");
        if (host.process_api.platform === "win32" && Number(runtime.reqnode("os").release().split(".")[2]) < 18309) throw new Error("集成终端需要 Windows 10 1903 或更新版本的 ConPTY。");
        const settings = load_settings(); const profile = profiles.find(item => item.id === (this.program || settings.profile)) || (!this.program ? profiles[0] : { executable: this.program, args: [], title: this.program });
        const broker = host.path_api.join(runtime._options.userDataPath, "linux_note_enhancements", "terminal_runtime", "1.1.0", "terminal_broker.cjs");
        this.resize(); this.containerEl.dataset.state = "starting"; this.status.textContent = "正在启动 " + profile.title + "…";
        const pty = await start_terminal_pty({ signal: this.startup.signal, child_process: runtime.reqnode("child_process"), process_api: host.process_api, broker, executable: host.path_api.join(runtime._options.userDataPath, "linux_note_enhancements", "terminal_runtime", "node", node_release.version, "node.exe") },
          { executable: profile.executable, args: profile.args, options: { name: "xterm-256color", cols: this.term!.cols, rows: this.term!.rows, cwd: this.root, env: terminal_environment(host.process_api.env), useConpty: true, useConptyDll: false } }, {
            data: data => { if (!this.disposed && generation === this.generation) this.term!.write(data, () => this.pty?.acknowledge(data.length)); },
            exit: code => { if (generation !== this.generation) return; this.pty = undefined; this.containerEl.dataset.state = "exited"; this.status.textContent = `Shell 已退出（${code}）· ${this.root}`; },
            error: message => { if (generation === this.generation) { this.containerEl.dataset.state = "error"; this.status.textContent = message; } },
          });
        if (this.disposed || generation !== this.generation) { pty.kill(); return; }
        this.pty = pty; this.containerEl.dataset.pid = String(pty.pid); this.containerEl.dataset.state = "running";
        this.status.textContent = profile.title + " · " + this.root;

      } catch (error) { if (this.disposed || lifetime.disposed || generation !== this.generation) return; this.containerEl.dataset.state = "error"; this.status.textContent = "启动失败：" + String(error); } finally { this.starting = false; }
    }
    resize() {
      if (!this.active || !this.viewport.clientWidth || !this.viewport.clientHeight) return;
      try {
        const selection=this.term?.getSelectionPosition();const columns=this.term?.cols||0;
        this.fit?.fit();
        // xterm 调整行列会清空选择；同一会话跨布局移动时保留已有选择区间。
        if(selection&&this.term&&!this.term.hasSelection())this.term.select(selection.start.x,selection.start.y,(selection.end.y-selection.start.y)*columns+selection.end.x-selection.start.x);
        if (this.pty && this.term) this.pty.resize(this.term.cols, this.term.rows);
      } catch { /* 隐藏、关闭或尺寸尚未稳定时等待下次布局。 */ }
    }
    async paste() {
      try { const text = await navigator.clipboard.readText(); if (this.disposed || lifetime.disposed || !this.pty) return;
        if (/[\r\n]/u.test(text)) { const dialog = create_dialog("粘贴多行命令"); dialog.content.append(el("pre", "", text)); dialog.footer.prepend(button("粘贴到终端", () => { this.term?.paste(text); dialog.close(); this.term?.focus(); })); }
        else { this.term?.paste(text); this.term?.focus(); }
      } catch (error) { fail("读取剪贴板失败，可使用键盘粘贴：" + String(error)); }
    }
    find() { if (this.disposed || lifetime.disposed) return; const dialog = create_dialog("查找终端输出"); const input = el("input"); input.setAttribute("aria-label", "查找终端输出"); dialog.content.append(input);
      const search = (backwards = false) => { if (input.value) (backwards ? this.search?.findPrevious(input.value) : this.search?.findNext(input.value)); };
      input.onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); search(event.shiftKey); } }; dialog.footer.prepend(button("下一个", () => search()), button("上一个", () => search(true))); input.focus(); }
    stop() { this.generation++; this.startup?.abort(); this.startup = undefined; const pty = this.pty; this.pty = undefined; if (pty) try { pty.kill(); } catch { /* 进程可能刚退出。 */ } this.containerEl.dataset.state = "exited"; this.status.textContent = "Shell 已终止 · " + this.root; }
    dispose() { if (this.disposed) return; this.disposed = true; this.active = false; this.stop(); cancelAnimationFrame(this.frame); window.clearTimeout(this.close_timer); this.observer?.disconnect(); this.term?.dispose(); this.term = undefined; this.fit = undefined; this.search = undefined; this.containerEl.remove(); sessions.delete(this.leaf); }
    onClose() { this.active = false; window.clearTimeout(this.close_timer); this.close_timer = window.setTimeout(() => { if (this.disposed || lifetime.disposed) return; let exists = false; core.app.workspace.eachLeaves(leaf => { if (leaf === this.leaf) exists = true; }); if (!exists) this.dispose(); }, 0); }
  }
  lifetime.add(core.app.viewManager.registerView(TERMINAL_TYPE, leaf => new terminal_view(leaf)));
  const resolve_root = async (path?: string) => {
    let cwd = path || host.context_path(); if (!host.fs.statSync(cwd).isDirectory()) cwd = host.path_api.dirname(cwd);
    const settings = { git_path: "git" } as Parameters<graph_host["runner"]>[0]; const runner = host.runner(settings);
    try { return (await runner.run(cwd, ["rev-parse", "--show-toplevel"])).trim(); } catch { return cwd; }
  };
  const launch = (admin_mode = false, path?: string) => { void resolve_root(path).then(root => admin_mode ? admin(root) : open(root)).catch(fail); };
  window.addEventListener("linux-note-open-terminal", ((event:CustomEvent<{path:string;admin?:boolean}>)=>launch(Boolean(event.detail.admin),event.detail.path)) as EventListener, {signal: events.signal});
  lifetime.add(core.app.commands.register({ id: "linux_note:terminal", title: "终端：在仓库根目录新建终端", scope: "global", callback: () => launch() }));
  lifetime.add(core.app.commands.register({ id: "linux_note:terminal_admin", title: "终端：以管理员身份打开仓库根目录（UAC）", scope: "global", callback: () => launch(true) }));
  lifetime.add(core.app.commands.register({ id: "linux_note:terminal_settings", title: "终端：设置", scope: "global", callback: settings_dialog }));
  lifetime.add(core.app.workspace.ribbon.addButton({ id: "linux_note:terminal", title: "仓库终端（Ctrl+`）", group: "bottom", icon: git_icon("terminal"), onclick: () => launch() }));
  lifetime.add(core.app.workspace.on("file-menu", ({ menu, path }) => {
    menu.containerEl.querySelectorAll("[data-terminal-launch]").forEach((node: Element) => node.remove());
    for (const [title, admin_mode] of [["在所属仓库根目录打开集成终端", false], ["以管理员身份打开仓库终端（UAC）", true]] as const) {
      if (admin_mode && host.process_api.platform !== "win32") continue;
      const item = el("li"); item.setAttribute("data-terminal-launch", "true"); item.append(el("a", "", title));
      for (const name of ["pointerdown", "mousedown", "mouseup"]) item.addEventListener(name, event => { event.preventDefault(); event.stopImmediatePropagation(); });
      item.onclick = event => { event.preventDefault(); event.stopImmediatePropagation(); menu.containerEl.style.display = "none"; launch(admin_mode, path); }; menu.containerEl.append(item);
    }
  }));
  window.addEventListener("keydown", event => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.code !== "Backquote" || event.isComposing || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.shiftKey && last_leaf && sessions.has(last_leaf)) { core.app.workspace.activeLeaf = last_leaf.parent.toggleTab(last_leaf.state.path); sessions.get(last_leaf)?.term?.focus(); } else launch();
  }, {capture:true, signal:events.signal});
  lifetime.add(stop_theme);
  lifetime.add(() => {
    for (const [leaf, view] of [...sessions]) {
      view.dispose();
      try { leaf.parent?.removeTab?.(leaf.state.path); } catch (error) { console.error("[Typora Code terminal cleanup]", error); }
    }
    last_leaf = undefined; style.remove();
    document.querySelectorAll("[data-terminal-launch]").forEach(node => node.remove());
    document.documentElement.removeAttribute("data-linux-note-terminal-theme");
    document.documentElement.removeAttribute("data-linux-note-terminal");
  });
  window.addEventListener("unload", lifetime.dispose, {once:true, signal:events.signal});
  document.documentElement.setAttribute("data-linux-note-terminal-theme", "ready");
  document.documentElement.setAttribute("data-linux-note-terminal", "ready");
  return { open, admin, dispose: lifetime.dispose };
}
