// 同一分界线同时支持鼠标、触控和键盘；比例由调用方按仓库保存。
export function create_workspace_sash(options: {
  label: string; area: HTMLElement; vertical(): boolean; ratio(): number;
  change(value: number): void; save(): void; reset?: number;
}): HTMLElement {
  const sash = document.createElement("div"); sash.className = "linux-note-workspace-sash"; sash.tabIndex = 0;
  sash.setAttribute("role", "separator"); sash.setAttribute("aria-label", options.label);
  sash.setAttribute("aria-valuemin", "15"); sash.setAttribute("aria-valuemax", "85");
  const apply = (value: number) => { const ratio = Math.max(.15, Math.min(.85, value)); options.change(ratio); sash.setAttribute("aria-valuenow", String(Math.round(ratio * 100))); };
  const sync = () => { sash.dataset.axis = options.vertical() ? "x" : "y"; sash.setAttribute("aria-orientation", options.vertical() ? "vertical" : "horizontal"); sash.setAttribute("aria-valuenow", String(Math.round(options.ratio() * 100))); };
  sash.onpointerdown = event => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); sync(); sash.focus({ preventScroll: true }); sash.setPointerCapture(event.pointerId);
    sash.classList.add("dragging"); const bounds = options.area.getBoundingClientRect(); const vertical = options.vertical();
    const finish = () => { sash.onpointermove = null; sash.classList.remove("dragging"); options.save(); };
    sash.onpointermove = move => { move.preventDefault(); apply(vertical ? (move.clientX - bounds.left) / bounds.width : (move.clientY - bounds.top) / bounds.height); };
    sash.onpointerup = finish; sash.onpointercancel = finish; sash.onlostpointercapture = finish;
  };
  sash.ondblclick = event => { event.preventDefault(); apply(options.reset ?? .5); options.save(); };
  sash.onkeydown = event => {
    const backwards = options.vertical() ? "ArrowLeft" : "ArrowUp"; const forwards = options.vertical() ? "ArrowRight" : "ArrowDown";
    if (![backwards, forwards, "Home"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); apply(event.key === "Home" ? options.reset ?? .5 : options.ratio() + (event.key === backwards ? -.02 : .02)); options.save();
  };
  sash.onfocus = sync; sash.onpointerenter = sync; sync(); return sash;
}
