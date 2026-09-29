import {is_composing_key,is_terminal_input,workspace_alt_modifier} from "./workspace_keyboard";
import { workspace_zoom_available, workspace_zoom_shortcut, type workspace_zoom_runtime } from "./workspace_zoom";
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
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.getModifierState("AltGraph");
}

function visible_modal(selector = '.reading-media-viewer, .modal.in, [role="dialog"][aria-modal="true"]', owned_dialog?:HTMLElement): boolean {
  const candidates = document.querySelectorAll<HTMLElement>(selector);
  return Array.from(candidates).some((candidate) => {
    if (candidate===owned_dialog || candidate.hidden || candidate.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(candidate);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

/** Window scaling prioritizes routing; other workspace key positions respect the input ownership of the editor/terminal. */
export function install_workspace_shortcuts(
  app: shortcut_app, runtime: workspace_zoom_runtime,
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
    if(is_composing_key(event)){reset_chord();return;}
    // First return the editor focus, then let existing keyboard shortcuts execute, to avoid actions falling to floating menus or background documents.
    if(primary_modifier(event)&&document.querySelector(".workspace-titlebar-popup"))window.dispatchEvent(new Event("workspace-titlebar-dismiss"));
    const zoom_command = workspace_zoom_shortcut(event);
    if (zoom_command && workspace_zoom_available(runtime, zoom_command) && !visible_modal(".reading-media-viewer")) {
      // Window ratio is a global operation: ordinary dialog boxes, code editors, and terminals do not intercept; local chart scaling takes priority.
      run(event, () => app.commands.run(zoom_command));
      return;
    }
    const picker=get_workspace_quick_open();
    const picker_shortcut=primary_modifier(event) && event.code === "KeyP";
    if (visible_modal(undefined,picker_shortcut?picker?.root:undefined)) { reset_chord(); return; }
    // These window commands skip the shell, regardless of the terminal's placement.
    if (picker_shortcut) {
      if(event.repeat && (!picker || picker.root.hidden))return;
      if(event.shiftKey)run(event,()=>{picker?.close();app.commands.run("command:open");});
      else if(picker)run(event,()=>picker.open());
      return;
    }
    if (is_terminal_input(event)) { reset_chord(); return; }
    if (event.repeat || ["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;

    const in_chord = chord_started > 0 && Date.now() - chord_started < 2000;
    if (in_chord) {
      const unmodified = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      const primary = workspace_alt_modifier(event) && !event.shiftKey;
      if (event.code === "KeyP" && unmodified) run(event, () => app.commands.run(COPY_ABSOLUTE_PATH));
      else if (event.code === "KeyW" && (unmodified||primary)) run(event, () => app.commands.run("linux_note:editor_close_all"));
      else if (event.code === "KeyU" && (unmodified||primary)) run(event, () => app.commands.run("linux_note:editor_close_saved"));
      else if (event.code === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) run(event, () => app.commands.run(event.shiftKey?"linux_note:editor_pin":"linux_note:editor_keep_open"));
      else if (event.code === "KeyO" && unmodified) run(event, () => app.commands.run("linux_note:editor_copy_window"));
      else if (event.code === "KeyO" && primary) run(event, () => app.commands.run("linux_note:open_folder"));
      else if (event.code === "KeyS" && (unmodified||primary)) run(event, () => app.commands.run("linux_note:save_all"));
      else if (event.code === "KeyF" && (unmodified||primary)) run(event, () => app.commands.run("linux_note:close_folder"));
      else if (event.code === "KeyC" && workspace_alt_modifier(event) && event.shiftKey) run(event, () => app.commands.run(COPY_RELATIVE_PATH));
      else if (event.code === "Backslash" && primary) run(event, () => app.commands.run("linux_note:editor_split_down"));
      else reset_chord();
      return;
    }


    if (!event.shiftKey && workspace_alt_modifier(event) && event.code === "KeyB") { run(event,()=>app.workspace.sidebar.toggle()); return; }

    if (primary_modifier(event)) {
      if(event.code==="KeyX"&&event.shiftKey){run(event,()=>app.commands.run("typora_code:community_plugins"));return;}
      if(event.code==="KeyR"&&!event.shiftKey){run(event,()=>app.commands.run("linux_note:open_recent"));return;}
      if(event.code === "KeyO" && !event.shiftKey && !(chord_started>0 && Date.now()-chord_started<2000)) { run(event,()=>app.commands.run("linux_note:open_file")); return; }
      if(event.code === "KeyS"&&event.shiftKey){run(event,()=>app.commands.run("linux_note:save_as"));return;}
      if(["KeyW","F4"].includes(event.code)&&!event.shiftKey&&!(chord_started>0&&Date.now()-chord_started<2000)){run(event,()=>app.commands.run("linux_note:close_editor"));return;}
      if(event.code === "KeyF" && event.shiftKey) { run(event,()=>app.commands.run("linux_note:search")); return; }
      if(!event.shiftKey && ["PageUp","PageDown"].includes(event.code)) {
        const parent=app.workspace.activeLeaf?.parent?.containerEl;
        // The same file can appear in multiple editing groups; tag identity must be determined by the current group and path together.
        const tabs=parent ? [...parent.querySelectorAll<HTMLElement>(".typ-workspace-tab-header .typ-tab")].filter(tab=>!tab.dataset.id?.startsWith("typ://core.empty/")) : [];
        const index=tabs.findIndex(tab=>tab.dataset.id===app.workspace.activeLeaf?.state.path);
        if(index>=0) {
          const target=tabs[(index+(event.code === "PageUp" ? -1 : 1)+tabs.length)%tabs.length];
          if(target)run(event,()=>target.click());
        }
        return;
      }
    }

    if (event.code === "KeyR" && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {run(event,()=>app.commands.run("linux_note:editor_reveal_system"));return;}
    if (event.code === "KeyC" && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
      run(event, () => app.commands.run(COPY_ABSOLUTE_PATH));
      return;
    }
    if (!workspace_alt_modifier(event) || event.shiftKey) { reset_chord(); return; }
    if (event.code === "KeyK") {
      event.preventDefault();
      event.stopImmediatePropagation();
      consumed.add(event.code);
      chord_started = Date.now();
      return;
    }
    if (event.code === "Backslash") {
      run(event, () => app.commands.run("linux_note:editor_split_right"));
      return;
    }
    reset_chord();
  };
  const keyup=(event:KeyboardEvent)=>{const handled=consumed.delete(event.code);if(handled&&!is_composing_key(event)){event.preventDefault();event.stopImmediatePropagation();}};
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
