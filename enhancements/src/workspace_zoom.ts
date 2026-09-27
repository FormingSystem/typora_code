import {is_composing_key} from "./workspace_keyboard";
import {bind_content_zoom,change_content_font,prepare_content_zoom} from "./workspace_content_zoom";
import { create_workspace_lifetime } from "./workspace_lifetime";
import {reading_wheel_root,wheel_zoom_direction} from "./workspace_wheel_zoom";

export type workspace_zoom_runtime = { ClientCommand?: Record<string, (...args: any[]) => unknown>; reqnode?:(name:string)=>any };

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
  if (!event.ctrlKey || event.altKey || event.metaKey || event.getModifierState("AltGraph") || is_composing_key(event)) return;
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
  const content=bind_content_zoom(runtime);lifetime.own(content);
  let wheel_frame=0;
  let wheel_target:HTMLElement|undefined;
  let wheel_action="";
  lifetime.add(()=>{cancelAnimationFrame(wheel_frame);wheel_target=undefined;});
  lifetime.listen(document,"wheel",raw=>{
    const event=raw as WheelEvent,root=reading_wheel_root(event);if(!root)return;
    const id=wheel_zoom_direction(event)>0?"linux_note:zoom_in":"linux_note:zoom_out";
    event.preventDefault();event.stopImmediatePropagation();wheel_target=root;wheel_action=id;
    if(wheel_frame)return;
    wheel_frame=requestAnimationFrame(()=>{
      wheel_frame=0;const target=wheel_target;wheel_target=undefined;
      if(lifetime.disposed||!target?.isConnected)return;
      change_content_font("editor",wheel_action==="linux_note:zoom_in"?1:-1);
    });
  },{capture:true,passive:false});
  try {
    for (const action of WORKSPACE_ZOOM_ACTIONS) {
      if (!workspace_zoom_available(runtime, action.id)) continue;
      lifetime.add(app.commands.register({id: action.id, title: "视图：" + action.label, scope: "global", callback() {
        if (!lifetime.disposed && workspace_zoom_available(runtime, action.id)) {prepare_content_zoom();runtime.ClientCommand![action.native_command]();content.sync();}
      }}));
    }
  } catch (error) { lifetime.dispose(); throw error; }
  return lifetime;
}
