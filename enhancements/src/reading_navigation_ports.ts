import type {reading_location} from "./reading_history";

/** 编辑器只提供自身位置；历史与快捷键仍由阅读导航统一管理。 */
export type navigation_editor_port = {
  capture(): reading_location | null;
  restore(location: reading_location, signal: AbortSignal): Promise<boolean>;
};
const ports=new Map<NonNullable<reading_location['kind']>,navigation_editor_port>();
const listeners = new Set<(explicit: boolean) => void>();
export function register_navigation_editor(port: navigation_editor_port,kind:NonNullable<reading_location['kind']>='source'): () => void {
  ports.set(kind,port);
  return () => { if (ports.get(kind)===port) ports.delete(kind); };
}
const editor_port:navigation_editor_port={
  capture(){for(const port of ports.values()){const location=port.capture();if(location)return location;}return null;},
  async restore(location,signal){return location.kind?await ports.get(location.kind)?.restore(location,signal)??false:false;}
};
export function navigation_editor(): navigation_editor_port { return editor_port; }
export function notify_navigation_selection(explicit = false): void { for (const listener of listeners) listener(explicit); }
export function observe_navigation_selection(listener: (explicit: boolean) => void): () => void {
  listeners.add(listener); return () => listeners.delete(listener);
}
