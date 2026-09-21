import type {reading_location} from "./reading_history";

/** 编辑器只提供自身位置；历史与快捷键仍由阅读导航统一管理。 */
export type navigation_editor_port = {
  capture(): reading_location | null;
  restore(location: reading_location, signal: AbortSignal): Promise<boolean>;
};
let source_port: navigation_editor_port | undefined;
const listeners = new Set<(explicit: boolean) => void>();
export function register_navigation_editor(port: navigation_editor_port): () => void {
  source_port = port;
  return () => { if (source_port === port) source_port = undefined; };
}
export function navigation_editor(): navigation_editor_port | undefined { return source_port; }
export function notify_navigation_selection(explicit = false): void { for (const listener of listeners) listener(explicit); }
export function observe_navigation_selection(listener: (explicit: boolean) => void): () => void {
  listeners.add(listener); return () => listeners.delete(listener);
}
