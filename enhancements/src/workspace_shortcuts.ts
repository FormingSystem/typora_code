import { COPY_ABSOLUTE_PATH, COPY_RELATIVE_PATH } from "./file_paths";
import type { workspace_file_host } from "./workspace_files";

export const CLOSE_ALL_WORKSPACE_TABS = "linux_note:close_all_workspace_tabs";

type shortcut_app = {
  commands: { run(id: string, args?: unknown[]): void };
  workspace: {
    sidebar: { toggle(): void };
    activeFile: string;
    activeLeaf: { state: { path?: string } } | null;
  };
};

type shortcut_runtime = {
  ClientCommand?: Record<string, (...args: unknown[]) => unknown>;
};

export type workspace_shortcuts_binding = { dispose(): void };

let active_binding: workspace_shortcuts_binding | undefined;

function primary_modifier(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey;
}

function visible_modal(): boolean {
  const candidates = document.querySelectorAll<HTMLElement>('.linux-note-mermaid-viewer, .modal.in, [role="dialog"][aria-modal="true"]');
  return Array.from(candidates).some((candidate) => {
    if (candidate.hidden || candidate.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(candidate);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

/** 集中实现 VS Code 工作区键位，避免标题栏菜单和全局捕获器各维护一套 chord。 */
export function install_workspace_shortcuts(
  app: shortcut_app,
  runtime: shortcut_runtime,
  get_file_host: () => Pick<workspace_file_host, "save_all"> | undefined = () => undefined,
): workspace_shortcuts_binding {
  if (active_binding) return active_binding;
  let chord_started = 0;
  const reset_chord = () => { chord_started = 0; };
  const run = (event: KeyboardEvent, action: () => void) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    reset_chord();
    action();
  };
  const keydown = (event: KeyboardEvent) => {
    if (visible_modal() || event.isComposing) { reset_chord(); return; }
    if (event.target instanceof Element && event.target.closest(".linux-note-terminal, .git-graph-document")
        && !event.target.closest(".linux-note-source-file")) { reset_chord(); return; }
    if (event.repeat || ["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;

    if (primary_modifier(event) && !event.shiftKey && event.code === "KeyB") {
      run(event, () => app.workspace.sidebar.toggle());
      return;
    }

    const in_chord = chord_started > 0 && Date.now() - chord_started < 2000;
    if (in_chord) {
      const unmodified = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      const primary = primary_modifier(event) && !event.shiftKey;
      if (event.code === "KeyP" && unmodified) run(event, () => app.commands.run(COPY_ABSOLUTE_PATH));
      else if (event.code === "KeyC" && primary_modifier(event) && event.shiftKey) run(event, () => app.commands.run(COPY_RELATIVE_PATH));
      else if (event.code === "KeyO" && primary) run(event, () => { runtime.ClientCommand?.openFolder?.(); });
      else if (event.code === "KeyS" && unmodified) run(event, () => {
        const files = get_file_host();
        if (files) void files.save_all();
        else runtime.ClientCommand?.saveAll?.();
      });
      else if (event.code === "KeyW" && unmodified) run(event, () => app.commands.run(CLOSE_ALL_WORKSPACE_TABS));
      else if (event.code === "Backslash" && primary) run(event, () => app.commands.run("core.workspace:split-down", [app.workspace.activeLeaf?.state.path ?? app.workspace.activeFile]));
      else reset_chord();
      return;
    }

    if (event.code === "KeyC" && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
      run(event, () => app.commands.run(COPY_ABSOLUTE_PATH));
      return;
    }
    if (!primary_modifier(event) || event.shiftKey) { reset_chord(); return; }
    if (event.code === "KeyK") {
      event.preventDefault();
      event.stopImmediatePropagation();
      chord_started = Date.now();
      return;
    }
    if (event.code === "Backslash") {
      run(event, () => app.commands.run("core.workspace:split-right", [app.workspace.activeLeaf?.state.path ?? app.workspace.activeFile]));
      return;
    }
    reset_chord();
  };
  window.addEventListener("keydown", keydown, true);
  window.addEventListener("blur", reset_chord);
  const binding: workspace_shortcuts_binding = { dispose() {
    if (active_binding !== binding) return;
    window.removeEventListener("keydown", keydown, true);
    window.removeEventListener("blur", reset_chord);
    reset_chord();
    active_binding = undefined;
  } };
  active_binding = binding;
  return binding;
}
