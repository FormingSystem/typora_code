/** VS Code 645f29c：停止交互500ms后，滑块在800ms内淡出。 */
export const SCROLLBAR_HIDE_MS = 500;
export const SCROLLBAR_REVEAL_MS = 100;
export const SCROLLBAR_FADE_MS = 800;

export type scrollbar_visibility_port = {
  animate(visible: boolean, duration: number, finished: () => void): () => void;
  schedule(callback: () => void, delay: number): () => void;
  hidden(): void;
};

/** 仅拥有显隐；滚动和拖动仍完全交给宿主。 */
export function create_scrollbar_visibility(port: scrollbar_visibility_port) {
  let hovered = false, dragging = false, disposed = false, visible = false, generation = 0;
  let cancel_timer: (() => void) | undefined, cancel_animation: (() => void) | undefined;
  const stop_timer = () => { cancel_timer?.(); cancel_timer = undefined; };
  const reveal = () => {
    stop_timer();
    if (visible || disposed) return;
    visible = true; generation++;
    cancel_animation?.();
    cancel_animation = port.animate(true, SCROLLBAR_REVEAL_MS, () => {});
  };
  const defer_hide = () => {
    stop_timer();
    if (disposed || hovered || dragging) return;
    cancel_timer = port.schedule(() => {
      cancel_timer = undefined;
      if (disposed || hovered || dragging) return;
      visible = false;
      const current = ++generation;
      cancel_animation?.();
      cancel_animation = port.animate(false, SCROLLBAR_FADE_MS, () => {
        if (!disposed && generation === current) port.hidden();
      });
    }, SCROLLBAR_HIDE_MS);
  };
  return {
    hover(value: boolean) { if (disposed || hovered === value) return; hovered = value; value ? reveal() : defer_hide(); },
    drag(value: boolean) { if (disposed || dragging === value) return; dragging = value; value ? reveal() : defer_hide(); },
    pulse() { if (disposed) return; reveal(); defer_hide(); },
    dispose() { if (disposed) return; disposed = true; generation++; stop_timer(); cancel_animation?.(); cancel_animation = undefined; },
  };
}
