/** 固定行高列表仅持有可见行；数据、选择和目录展开状态由调用方持有。 */
export function create_workspace_virtual_list<T>(options: {
  root: HTMLElement; scroller: HTMLElement; items: readonly T[]; row_height: number;
  render(item: T, index: number): HTMLElement;
}) {
  const {root, scroller, row_height, render} = options;
  let items = options.items, frame = 0, disposed = false;
  const rows = new Map<number, HTMLElement>();
  root.style.position = "relative";
  const update = () => {
    frame = 0; if (disposed) return;
    root.style.height = items.length * row_height + "px";
    if (!root.getClientRects().length) return;
    const top = scroller.getBoundingClientRect().top - root.getBoundingClientRect().top;
    const first = Math.max(0, Math.floor(top / row_height) - 8);
    const last = Math.min(items.length, Math.ceil((top + scroller.clientHeight) / row_height) + 8);
    for (const [index, row] of rows) if ((index < first || index >= last) && !row.contains(document.activeElement)) { row.remove(); rows.delete(index); }
    for (let index = first; index < last; index++) if (!rows.has(index)) {
      const row = render(items[index], index);
      row.dataset.virtualIndex = String(index);
      Object.assign(row.style, {position: "absolute", top: index * row_height + "px", left: "0", right: "0", height: row_height + "px", boxSizing: "border-box", margin: "0"});
      rows.set(index, row); root.append(row);
    }
  };
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(update); };
  const keydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement, row = target.closest<HTMLElement>("[data-virtual-index]");
    if (!row || row.parentElement !== root || target !== row) return;
    const index = Number(row.dataset.virtualIndex);
    const next = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
    if (next < 0 || next >= items.length) return;
    event.preventDefault();
    const offset = root.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const y = offset + next * row_height;
    if (y < scroller.scrollTop) scroller.scrollTop = y;
    else if (y + row_height > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = y + row_height - scroller.clientHeight;
    update(); rows.get(next)?.focus({preventScroll: true}); schedule();
  };
  const resize = new ResizeObserver(schedule); resize.observe(scroller);
  scroller.addEventListener("scroll", schedule, {passive: true});
  scroller.addEventListener("toggle", schedule, true); root.addEventListener("keydown", keydown);
  schedule();
  return {
    refresh: schedule,
    set_items(next: readonly T[]) { items = next; for (const row of rows.values()) row.remove(); rows.clear(); schedule(); },
    dispose() { disposed = true; cancelAnimationFrame(frame); resize.disconnect(); scroller.removeEventListener("scroll", schedule); scroller.removeEventListener("toggle", schedule, true); root.removeEventListener("keydown", keydown); for (const row of rows.values()) row.remove(); rows.clear(); },
  };
}
