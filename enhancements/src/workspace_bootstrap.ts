import { COPY_ABSOLUTE_PATH, COPY_RELATIVE_PATH } from "./file_paths";

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

/** 使用固定版本的社区核心，不执行上游安装器或 env.json 指定的核心加载入口。 */
export async function initialize_workspace(): Promise<void> {
  const runtime = window as unknown as { reqnode?: unknown; _options?: { userDataPath?: string } };
  if (!runtime.reqnode || !runtime._options?.userDataPath) return;
  document.documentElement.setAttribute("data-linux-note-workspace", "loading");
  if (!get_workspace_app()) {
    (window as unknown as Record<symbol, unknown>)[Symbol.for(`${WORKSPACE_NAMESPACE}:env`)] = { debug: false };
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = `typora://app/userData/plugins/${WORKSPACE_VERSION}/core.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Typora workspace core could not load; rerun the configuration installer."));
      document.head.append(script);
    });
  }
  const app = get_workspace_app();
  if (!app || app.coreVersion !== WORKSPACE_VERSION) throw new Error("Unexpected Typora workspace core version.");
  const started = Date.now();
  const wait_ready = async (ready: () => boolean) => {
    while (!ready()) {
      if (Date.now() - started > 15000) throw new Error("Typora workspace initialization timed out.");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  await wait_ready(() => Boolean(app.settings));
  if (!(app.settings.get("internalPlugin.enabledPlugins") as Record<string, unknown>)?.["internal.workspace"]) {
    app.settings.set(["internalPlugin.enabledPlugins", "internal.workspace"], true);
  }
  for (const [key, value] of Object.entries({ openLinkInCurrentWin: true, useAutoSwap: true, hideExtensionInFileTab: false })) {
    if (app.settings.get(key) !== value) app.settings.set(key, value);
  }
  await wait_ready(() => Boolean(app.workspace?.rootSplit?.containerEl?.isConnected));

  // 默认一组多标签；Ctrl+\ 复制当前文档到右侧组，Ctrl+K、Ctrl+\ 向下拆分。
  let chord_started = 0;
  window.addEventListener("keydown", (event) => {
    if (document.querySelector('.linux-note-mermaid-viewer, .modal.in, [role="dialog"][aria-modal="true"]')
        || event.isComposing) { chord_started = 0; return; }
    if (event.target instanceof Element && event.target.closest(".linux-note-terminal, .git-graph-document")) { chord_started = 0; return; }
    if (event.repeat || ["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
    const in_chord = chord_started > 0 && Date.now() - chord_started < 2000;
    const absolute = in_chord && event.code === "KeyP" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
    const relative = in_chord && event.code === "KeyC" && event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
    const windows_absolute = event.code === "KeyC" && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey;
    if (absolute || relative || windows_absolute) {
      event.preventDefault();
      event.stopImmediatePropagation();
      chord_started = 0;
      app.commands.run(relative ? COPY_RELATIVE_PATH : COPY_ABSOLUTE_PATH);
      return;
    }
    if (!event.ctrlKey || event.altKey || event.metaKey) { chord_started = 0; return; }
    if (event.code === "KeyK" && !event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      chord_started = Date.now();
      return;
    }
    if (event.code !== "Backslash" || event.shiftKey) { chord_started = 0; return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    const down = in_chord;
    chord_started = 0;
    app.commands.run(down ? "core.workspace:split-down" : "core.workspace:split-right", [app.workspace.activeLeaf?.state.path ?? app.workspace.activeFile]);
  }, true);
  window.addEventListener("blur", () => { chord_started = 0; });
  document.documentElement.setAttribute("data-linux-note-workspace", "ready");
}
