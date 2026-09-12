import { create_workspace_lifetime } from "./workspace_lifetime";

export type workspace_zoom_runtime = { ClientCommand?: Record<string, (...args: any[]) => unknown> };

// 菜单、命令面板和快捷键共享身份；比例及持久化只归宿主管理。
export const WORKSPACE_ZOOM_ACTIONS = [
  {id: "linux_note:zoom_in", label: "放大", native_command: "zoomIn", shortcut: "Ctrl+="},
  {id: "linux_note:zoom_out", label: "缩小", native_command: "zoomOut", shortcut: "Ctrl+-"},
  {id: "linux_note:zoom_reset", label: "实际大小", native_command: "resetZoom", shortcut: undefined},
] as const;

export function workspace_zoom_available(runtime: workspace_zoom_runtime, id: string): boolean {
  const action = WORKSPACE_ZOOM_ACTIONS.find(action => action.id === id);
  return Boolean(action && typeof runtime.ClientCommand?.[action.native_command] === "function");
}

export function workspace_zoom_shortcut(event: KeyboardEvent): string | undefined {
  if (event.isComposing || event.keyCode === 229 || event.altKey || event.getModifierState("AltGraph")
      || event.ctrlKey === event.metaKey) return;
  // Equal/Minus 包含 Shift 组合；小键盘不占用额外的 Shift 组合。
  if (event.code === "Equal" || ["+", "="].includes(event.key) && event.code !== "NumpadAdd"
      || event.code === "NumpadAdd" && !event.shiftKey) return "linux_note:zoom_in";
  if (event.code === "Minus" || event.key === "-" && event.code !== "NumpadSubtract"
      || event.code === "NumpadSubtract" && !event.shiftKey) return "linux_note:zoom_out";
}

export function bind_workspace_zoom_commands(
  app: {commands: {register(command: {id: string; title: string; scope: "global"; callback(): void}): unknown}},
  runtime: workspace_zoom_runtime,
) {
  const lifetime = create_workspace_lifetime();
  try {
    for (const action of WORKSPACE_ZOOM_ACTIONS) {
      if (!workspace_zoom_available(runtime, action.id)) continue;
      lifetime.add(app.commands.register({id: action.id, title: "视图：" + action.label, scope: "global", callback() {
        if (!lifetime.disposed && workspace_zoom_available(runtime, action.id)) runtime.ClientCommand![action.native_command]();
      }}));
    }
  } catch (error) { lifetime.dispose(); throw error; }
  return lifetime;
}
