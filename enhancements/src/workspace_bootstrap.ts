import { install_workspace_shortcuts } from "./workspace_shortcuts";
import { get_workspace_files } from "./workspace_files";
import { create_workspace_lifetime } from "./workspace_lifetime";

const WORKSPACE_VERSION = "2.10.15";
const WORKSPACE_NAMESPACE = "typora-plugin-core@v2";

export type workspace_view = {
  containerEl: HTMLElement;
  leaf: workspace_leaf;
  isEditor(): boolean;
  onOpen(): void;
  getState(): Record<string, unknown>;
  setState(state: Record<string, unknown>): void;
};
export type workspace_leaf = {
  state: { path: string; [key: string]: unknown };
  containerEl: HTMLElement;
  view: workspace_view;
  parent: { activeLeaf: workspace_leaf; toggleTab(path: string): workspace_leaf };
};
type workspace_app = {
  coreVersion: string;
  settings: { get(key: string): unknown; set(key: string | string[], value: unknown): void };
  commands: {
    run(id: string, args?: unknown[]): void;
    register(command: { id: string; title: string; scope: "global"; callback: () => void }): unknown;
  };
  openFile(path: string): unknown;
  workspace: {
    sidebar: { isShown: boolean; toggle(): void; activePanel?: {ribbonButton?: {id: string}; containerEl?: HTMLElement}; panels: {ribbonButton?: {id: string}; containerEl?: HTMLElement}[] };
    activeFile: string;
    activeLeaf: workspace_leaf | null;
    activeEditor: { openFile(file: string | { pathname: string; hash?: string }): void };
    rootSplit: { containerEl: HTMLElement; on(event: string, callback: (leaf: workspace_leaf) => void): unknown };
    eachLeaves(callback: (leaf: workspace_leaf) => void): void;
    on(event: "file-menu", callback: (context: { menu: { containerEl: HTMLElement }; path: string }) => void): unknown;
    on(event: string, callback: (path: string) => void): unknown;
  };
};

export function get_workspace_app(): workspace_app | undefined {
  return (window as unknown as Record<symbol, { app?: workspace_app }>)[Symbol.for(WORKSPACE_NAMESPACE)]?.app;
}

/** 社区核心只能由官方 loader 启动；本插件不维护第二条核心加载路径。 */
export async function initialize_workspace(signal?: AbortSignal) {
  const lifetime = create_workspace_lifetime();
  const runtime = window as unknown as { reqnode?: unknown; _options?: { userDataPath?: string }; ClientCommand?: Record<string, (...args: unknown[]) => unknown> };
  if (!runtime.reqnode || !runtime._options?.userDataPath) return lifetime;
  document.documentElement.setAttribute("data-linux-note-workspace", "loading");
  const app = get_workspace_app();
  if (!app) throw new Error("Typora Community Plugin core is unavailable; rerun the configuration installer.");
  if (app.coreVersion !== WORKSPACE_VERSION) throw new Error("Unexpected Typora Community Plugin core version.");
  const started = Date.now();
  const wait_ready = async (ready: () => boolean) => {
    while (!ready()) {
      signal?.throwIfAborted();
      if (Date.now() - started > 15000) throw new Error("Typora workspace initialization timed out.");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    signal?.throwIfAborted();
  };
  await wait_ready(() => Boolean(app.settings));
  if (!(app.settings.get("internalPlugin.enabledPlugins") as Record<string, unknown>)?.["internal.workspace"]) {
    app.settings.set(["internalPlugin.enabledPlugins", "internal.workspace"], true);
  }
  for (const [key, value] of Object.entries({ openLinkInCurrentWin: true, useAutoSwap: true, hideExtensionInFileTab: false })) {
    if (app.settings.get(key) !== value) app.settings.set(key, value);
  }
  await wait_ready(() => Boolean(app.workspace?.rootSplit?.containerEl?.isConnected));

  // 核心启动时尚未设置 activePanel，原生侧栏却可能已显示文件或大纲。
  // 点击前按实际面板校正状态，再由核心 switch 执行同项收起、异项切换。
  const reconcile_sidebar = (event: MouseEvent) => {
    const item = event.target instanceof Element ? event.target.closest<HTMLElement>(".typ-ribbon-item[data-id]") : null;
    if (!item || !["core.file-explorer", "core.outline", "linux_note:source_control"].includes(item.dataset.id || "")) return;
    const sidebar = app.workspace.sidebar; if (!sidebar.isShown) return;
    const active_id = sidebar.activePanel?.ribbonButton?.id;
    // 原生延迟大纲刷新仍可能补回 class；已挂载的插件面板才是此时真正的当前面板。
    if (active_id && !["core.file-explorer", "core.outline"].includes(active_id) && sidebar.activePanel?.containerEl?.isConnected) return;
    const host_sidebar = document.querySelector("#typora-sidebar");
    const current_id = host_sidebar?.classList.contains("active-tab-files") ? "core.file-explorer"
      : host_sidebar?.classList.contains("active-tab-outline") ? "core.outline" : sidebar.activePanel?.ribbonButton?.id;
    const current = sidebar.panels.find(panel => panel.ribbonButton?.id === current_id);
    if (current) sidebar.activePanel = current;
  };
  lifetime.listen(document, "click", reconcile_sidebar as EventListener, true);

  lifetime.own(install_workspace_shortcuts(app, runtime, get_workspace_files));
  lifetime.add(() => document.documentElement.removeAttribute("data-linux-note-workspace"));
  document.documentElement.setAttribute("data-linux-note-workspace", "ready");
  return lifetime;
}
