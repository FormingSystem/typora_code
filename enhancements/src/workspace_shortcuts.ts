import { get_workspace_quick_open } from "./workspace_quick_open";
import { COPY_ABSOLUTE_PATH, COPY_RELATIVE_PATH } from "./file_paths";

type shortcut_app = {
  commands: { run(id: string, args?: unknown[]): void };
  workspace: {
    sidebar: { toggle(): void };
    activeFile: string;
    activeLeaf: { state: { path?: string }; parent?: {containerEl?: HTMLElement} } | null;
  };
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

/** 文件快速打开及既有工作区键位；编辑器/终端专用按键保持各自所有权。 */
export function install_workspace_shortcuts(
  app: shortcut_app,
): workspace_shortcuts_binding {
  if (active_binding) return active_binding;
  let chord_started = 0;
  const consumed = new Set<string>();
  const reset_chord = () => { chord_started = 0; };
  const run = (event: KeyboardEvent, action: () => void) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    consumed.add(event.code);
    reset_chord();
    action();
  };
  const keydown = (event: KeyboardEvent) => {
    // 先归还编辑焦点，再让既有快捷键执行，避免动作落到浮动菜单或后台文档。
    if(primary_modifier(event)&&document.querySelector(".workspace-titlebar-popup"))window.dispatchEvent(new Event("workspace-titlebar-dismiss"));
    const active_picker=get_workspace_quick_open();
    if(!event.isComposing && active_picker && !active_picker.root.hidden && primary_modifier(event) && event.code === "KeyP") {
      run(event,()=>{if(event.shiftKey){active_picker.close();app.commands.run("command:open");}else active_picker.open();});return;
    }
    if (visible_modal() || event.isComposing) { reset_chord(); return; }
    if (event.target instanceof Element && event.target.closest(".linux-note-terminal")
        && !event.target.closest(".linux-note-source-file")) { reset_chord(); return; }
    if (event.repeat || ["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;

    if (primary_modifier(event)) {
      if (event.code === "KeyP") {
        if (event.shiftKey) run(event, () => app.commands.run("command:open"));
        else { const picker=get_workspace_quick_open(); if(picker)run(event,()=>picker.open()); }
        return;
      }
      if(event.code === "KeyO" && !event.shiftKey && !(chord_started>0 && Date.now()-chord_started<2000)) { run(event,()=>app.commands.run("linux_note:open_file")); return; }
      if(event.code === "KeyS"&&event.shiftKey){run(event,()=>app.commands.run("linux_note:save_as"));return;}
      if(["KeyW","F4"].includes(event.code)&&!event.shiftKey){run(event,()=>app.commands.run("linux_note:close_editor"));return;}
      if(event.code === "KeyF" && event.shiftKey) { run(event,()=>app.commands.run("linux_note:search")); return; }
      if(!event.shiftKey && event.code === "KeyB") { run(event,()=>app.workspace.sidebar.toggle()); return; }
      if(!event.shiftKey && ["PageUp","PageDown"].includes(event.code)) {
        const parent=app.workspace.activeLeaf?.parent?.containerEl;
        // 同一文件可在多个编辑组出现；标签身份必须由当前组与路径共同决定。
        const tabs=parent ? [...parent.querySelectorAll<HTMLElement>(".typ-workspace-tab-header .typ-tab")].filter(tab=>!tab.dataset.id?.startsWith("typ://core.empty/")) : [];
        const index=tabs.findIndex(tab=>tab.dataset.id===app.workspace.activeLeaf?.state.path);
        if(index>=0) {
          const target=tabs[(index+(event.code === "PageUp" ? -1 : 1)+tabs.length)%tabs.length];
          if(target)run(event,()=>target.click());
        }
        return;
      }
    }

    const in_chord = chord_started > 0 && Date.now() - chord_started < 2000;
    if (in_chord) {
      const unmodified = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      const primary = primary_modifier(event) && !event.shiftKey;
      if (event.code === "KeyP" && unmodified) run(event, () => app.commands.run(COPY_ABSOLUTE_PATH));
      else if (event.code === "KeyO" && primary) run(event, () => app.commands.run("linux_note:open_folder"));
      else if (event.code === "KeyS" && (unmodified||primary)) run(event, () => app.commands.run("linux_note:save_all"));
      else if (event.code === "KeyF" && (unmodified||primary)) run(event, () => app.commands.run("linux_note:close_folder"));
      else if (event.code === "KeyC" && primary_modifier(event) && event.shiftKey) run(event, () => app.commands.run(COPY_RELATIVE_PATH));
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
      consumed.add(event.code);
      chord_started = Date.now();
      return;
    }
    if (event.code === "Backslash") {
      run(event, () => app.commands.run("core.workspace:split-right", [app.workspace.activeLeaf?.state.path ?? app.workspace.activeFile]));
      return;
    }
    reset_chord();
  };
  const keyup=(event:KeyboardEvent)=>{if(consumed.delete(event.code)){event.preventDefault();event.stopImmediatePropagation();}};
  const blur=()=>{reset_chord();consumed.clear();};
  window.addEventListener("keydown", keydown, true);
  window.addEventListener("keyup", keyup, true);
  window.addEventListener("blur", blur);
  const binding: workspace_shortcuts_binding = { dispose() {
    if (active_binding !== binding) return;
    window.removeEventListener("keydown", keydown, true);
    window.removeEventListener("keyup", keyup, true);
    consumed.clear();
    window.removeEventListener("blur", blur);
    reset_chord();
    active_binding = undefined;
  } };
  active_binding = binding;
  return binding;
}
