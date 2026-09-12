import {acquire_workspace_footer_layout} from "./workspace_footer_layout";
import {acquire_workspace_style} from "./workspace_styles";
import {bind_workspace_control_icons} from "./workspace_control_icons";
import {install_workspace_document_margin} from "./workspace_document_margin";
import {bind_workspace_footer_popups} from "./workspace_footer_popups";
import workspace_footer_css from "./workspace_footer.css";

type footer_binding = { dispose(): void };
const footer_bindings = new WeakMap<HTMLElement, footer_binding>();

/** 移动原生节点，保留 Typora 绑定在容器和菜单上的委托事件。 */
export function install_workspace_footer(): footer_binding | undefined {
  const actions = document.querySelector<HTMLElement>("#ty-sidebar-footer");
  const footer = document.querySelector<HTMLElement>("footer.ty-footer");
  const sidebar = document.querySelector<HTMLElement>("#typora-sidebar");
  if (!actions || !footer || !sidebar || !actions.parentNode) return;
  const existing = footer_bindings.get(actions); if (existing) return existing;
  const original_parent = actions.parentNode, original_next = actions.nextSibling;
  const original_aria = footer.getAttribute("aria-hidden");
  const original_role = actions.getAttribute("role"), original_label = actions.getAttribute("aria-label");
  const mirrored_classes = ["active-tab-files", "active-tab-outline", "use-file-list-style", "use-file-tree-style"];
  const original_classes = new Map(mirrored_classes.map(name => [name, actions.classList.contains(name)]));
  const style = acquire_workspace_style("typora-code-style:workspace_footer", workspace_footer_css, {"data-workspace-footer-style":"ready"});
  const layout=acquire_workspace_footer_layout();
  const roles=new Map<HTMLElement,string[]>();
  for(const [selector,role]of[
    ["#ty-sidebar-footer,#ty-sidebar-footer>div,#sidebar-menu-btn","group"],
    ["#footer-word-count,#footer-spell-check,#toggle-sourceview-btn,#sidebar-new-file-btn,#switch-file-list-btn,#sidebar-menu-btn>.sidebar-footer-item","control"],
    ["#footer-word-count-label,#footer-spell-check-label,.ty-word-count-expand","text"],
  ])for(const node of document.querySelectorAll<HTMLElement>(selector)){
    const name="workspace-footer-"+role;
    if(!node.classList.contains(name)){node.classList.add(name);roles.set(node,[...(roles.get(node)||[]),name]);}
  }
  actions.setAttribute("role", "group"); actions.setAttribute("aria-label", "文件操作");
  footer.removeAttribute("aria-hidden"); footer.dataset.workspaceFooter = "ready";
  sidebar.dataset.workspaceFooter = "moved";
  // 字数和拼写检查仍在最右侧；整个文件操作组插在它们前面。
  footer.insertBefore(actions, footer.querySelector(":scope > .footer-item-right"));
  const document_margin=install_workspace_document_margin(footer);
  const popups=bind_workspace_footer_popups(footer,actions,sidebar);
  const control_icons=bind_workspace_control_icons(footer,[
    ["#sidebar-new-file-btn>.ty-icon","new-file"],
    ["#sidebar-menu-btn>.sidebar-footer-item .footer-btn>.ty-icon","more"],
    ["#switch-file-list-btn .switch-file-list-btn-to-list>.ty-icon","list-flat"],
    ["#switch-file-list-btn .switch-file-list-btn-to-tree>.ty-icon","list-tree"],
    ["#toggle-sourceview-btn","edit-code"],
    ["#close-sidebar-menu-btn","close"],
    ["#ty-group-by-folder-btn","list-tree"],
    ["#ty-sort-by-natural-btn","list-flat"],
    ["#ty-sort-by-name-btn","case-sensitive"],
    ["#ty-sort-by-date-btn","history"],
    ["#ty-sort-by-create-btn","new-file"]
  ]);
  const update_context = () => {
    for (const name of mirrored_classes) actions.classList.toggle(name, sidebar.classList.contains(name));
  };
  update_context();
  // 只观察侧栏状态；不观察移入的节点，避免 class 镜像产生自触发循环。
  const observer = new MutationObserver(update_context);
  observer.observe(sidebar, { attributes: true, attributeFilter: ["class"] });
  let disposed = false;
  const binding: footer_binding = { dispose() {
    if (disposed) return; disposed = true; observer.disconnect();popups.dispose();control_icons.dispose();document_margin.dispose();
    original_parent.insertBefore(actions, original_next?.parentNode === original_parent ? original_next : null);
    for (const [name, present] of original_classes) actions.classList.toggle(name, present);
    if (original_role === null) actions.removeAttribute("role"); else actions.setAttribute("role", original_role);
    if (original_label === null) actions.removeAttribute("aria-label"); else actions.setAttribute("aria-label", original_label);
    if (original_aria === null) footer.removeAttribute("aria-hidden"); else footer.setAttribute("aria-hidden", original_aria);
    delete footer.dataset.workspaceFooter; delete sidebar.dataset.workspaceFooter;
    for(const [node,names]of roles)node.classList.remove(...names);roles.clear();layout.remove();
    style.remove(); footer_bindings.delete(actions);
  } };
  footer_bindings.set(actions, binding); return binding;
}
