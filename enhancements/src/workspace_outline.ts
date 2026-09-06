import outline_css from "./workspace_outline.css";

export type workspace_outline_host = {
  sidebar?: HTMLElement;
  outline?: {hideSearch?(): void; clearSearch?(): void; isSearchShown?(): boolean};
};

/** 大纲只负责标题导航；原生共用过滤框不能残留到其他工作区面板。 */
export function install_workspace_outline(host: workspace_outline_host) {
  const sidebar = host.sidebar || document.querySelector<HTMLElement>("#typora-sidebar");
  if (!sidebar) return;
  const style = document.createElement("style");
  style.setAttribute("data-workspace-outline-style", "ready");
  style.textContent = outline_css;
  document.head.append(style);
  document.documentElement.setAttribute("data-linux-note-workspace-outline", "ready");
  let clearing = false;
  const refresh = () => {
    if (clearing) return;
    const filtering = sidebar.classList.contains("ty-show-outline-filter") || sidebar.classList.contains("ty-on-outline-filter") || host.outline?.isSearchShown?.();
    if (!filtering) return;
    clearing = true;
    try {
      // hideSearch 归还原生状态；clearSearch 同时清空旧高亮和被筛掉的标题。
      host.outline?.hideSearch?.();
      host.outline?.clearSearch?.();
      sidebar.classList.remove("ty-show-outline-filter", "ty-on-outline-filter");
      const input = sidebar.querySelector<HTMLInputElement>("#file-library-search-input");
      if (input) { input.value = ""; input.style.removeProperty("width"); }
      const close = sidebar.querySelector<HTMLElement>("#close-outline-filter-btn");
      if (close) close.style.display = "none";
    } finally { clearing = false; }
  };
  const observer = new MutationObserver(refresh);
  observer.observe(sidebar, {attributes: true, attributeFilter: ["class"]});
  refresh();
  return {refresh, dispose: () => {observer.disconnect();style.remove();document.documentElement.removeAttribute("data-linux-note-workspace-outline");}};
}
