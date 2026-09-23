import { create_workspace_lifetime } from "./workspace_lifetime";
import {reading_wheel_root,wheel_zoom_direction} from "./workspace_wheel_zoom";
import {change_reading_geometry} from "./reading_reflow";

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
  let wheel_frame=0;
  let wheel_target:HTMLElement|undefined;
  let wheel_action="";
  lifetime.add(()=>{cancelAnimationFrame(wheel_frame);wheel_target=undefined;});
  lifetime.listen(document,"wheel",raw=>{
    const event=raw as WheelEvent,root=reading_wheel_root(event);if(!root)return;
    const id=wheel_zoom_direction(event)>0?"linux_note:zoom_in":"linux_note:zoom_out";
    if(!workspace_zoom_available(runtime,id))return;
    event.preventDefault();event.stopImmediatePropagation();wheel_target=root;wheel_action=id;
    if(wheel_frame)return;
    wheel_frame=requestAnimationFrame(()=>{
      wheel_frame=0;const target=wheel_target;wheel_target=undefined;
      if(lifetime.disposed||!target?.isConnected)return;
      let scroller=target.parentElement;
      while(scroller&&scroller!==document.body&&!/auto|scroll/.test(getComputedStyle(scroller).overflowY))scroller=scroller.parentElement;
      const action=WORKSPACE_ZOOM_ACTIONS.find(item=>item.id===wheel_action);
      if(!action||!workspace_zoom_available(runtime,wheel_action))return;
      const run=()=>runtime.ClientCommand![action.native_command]();
      if(scroller&&scroller!==document.body)change_reading_geometry(scroller,target,run);else run();
    });
  },{capture:true,passive:false});
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
