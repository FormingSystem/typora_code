/** 宿主的实际阅读区域：使用 client 边界，扣除覆盖正文的可见原生底栏。 */
export function reading_viewport_bounds(owner: HTMLElement): { top: number; bottom: number; left: number; right: number } {
  const rect = owner.getBoundingClientRect();
  const view = owner.ownerDocument.defaultView;
  const client_left = rect.left + owner.clientLeft;
  const client_top = rect.top + owner.clientTop;
  const left = Math.max(0, client_left);
  const top = Math.max(0, client_top);
  const right = Math.min(rect.right, client_left + owner.clientWidth, view?.innerWidth ?? rect.right);
  let bottom = Math.min(rect.bottom, client_top + owner.clientHeight, view?.innerHeight ?? rect.bottom);
  for (const footer of owner.ownerDocument.querySelectorAll<HTMLElement>("footer.ty-footer")) {
    const footer_rect = footer.getBoundingClientRect();
    if (!footer.isConnected || footer_rect.width <= 0 || footer_rect.height <= 0
      || footer_rect.right <= left || footer_rect.left >= right || footer_rect.bottom <= top || footer_rect.top >= bottom) continue;
    let visible = true;
    for (let element: HTMLElement | null = footer; element; element = element.parentElement) {
      const style = view?.getComputedStyle(element);
      if (style && (style.display === "none" || (element === footer && style.visibility !== "visible") || Number(style.opacity) === 0)) {
        visible = false;
        break;
      }
    }
    if (visible) bottom = Math.max(top, footer_rect.top);
  }
  return { top, bottom, left, right };
}
