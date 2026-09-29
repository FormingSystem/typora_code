/** Host's actual reading area: uses client boundary, subtracts the visible native status bar covering the document content. */
export function reading_viewport_bounds(owner: HTMLElement): { top: number; bottom: number; left: number; right: number } {
  const rect = owner.getBoundingClientRect();
  const view = owner.ownerDocument.defaultView;
  const client_left = rect.left + owner.clientLeft;
  const client_top = rect.top + owner.clientTop;
  const left = Math.max(0, client_left);
  let top = Math.max(0, client_top);
  const right = Math.min(rect.right, client_left + owner.clientWidth, view?.innerWidth ?? rect.right);
  let bottom = Math.min(rect.bottom, client_top + owner.clientHeight, view?.innerHeight ?? rect.bottom);
  // Only calculates top navigation that intersects with this reading area; adjacent groups or flowing bars already outside the area are not deducted repeatedly.
  for (const header of owner.ownerDocument.querySelectorAll<HTMLElement>(".workspace-tab-strip,.workspace-breadcrumbs")) {
    const box = header.getBoundingClientRect(), style = view?.getComputedStyle(header);
    if (!header.isConnected || header.hidden || box.width <= 0 || box.height <= 0 || style?.visibility === "hidden"
      || style?.display === "none" || Number(style?.opacity) === 0 || box.right <= left || box.left >= right
      || box.top > top + 1 || box.bottom <= top || box.bottom >= bottom) continue;
    top = box.bottom;
  }
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
