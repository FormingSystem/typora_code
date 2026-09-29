/** A plugin activation owns resources; release in reverse order, single resource failure does not block other cleanups. */
export function create_workspace_lifetime() {
  const cleanups: (() => void)[] = [];
  let disposed = false;
  const add = (cleanup: unknown) => {
    if (typeof cleanup !== "function") return;
    if (disposed) cleanup(); else cleanups.push(cleanup as () => void);
  };
  const own = <T extends {dispose(): void} | (() => void) | undefined>(binding: T): T => {
    if (typeof binding === "function") add(binding);
    else if (binding) add(() => binding.dispose());
    return binding;
  };
  const listen = (target: EventTarget, event: string, callback: EventListener, options?: boolean | AddEventListenerOptions) => {
    target.addEventListener(event, callback, options);
    add(() => target.removeEventListener(event, callback, options));
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { cleanup(); } catch (error) { console.error("[Typora Code cleanup]", error); }
    }
  };
  return {add, own, listen, dispose, get disposed() { return disposed; }};
}
