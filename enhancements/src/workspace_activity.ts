import {acquire_workspace_style} from "./workspace_styles";
import activity_css from "./workspace_activity.css";
import chrome_css from "./workspace_chrome.css";
import { git_icon } from "./git_icons";
import {start_pointer_drag,create_drop_marker,type pointer_drag_session,type pointer_drag_state} from "../vendor/workspace_core/src/ui/components/pointer-drag";

export type workspace_activity_options = {
  ribbon: HTMLElement;
  item_ids: readonly string[];
  read_state(): { active_id: string | null; sidebar_visible: boolean };
  storage_key?: string;
};

/** 活动栏只负责呈现和排序；当前面板身份由工作区统一提供。 */
export function install_workspace_activity(options: workspace_activity_options): {
  refresh(): void; move(id: string, direction: -1 | 1): void; dispose(): void;
} {
  const ribbon = options.ribbon;
  const allowed = new Set(options.item_ids);
  // 核心按注册时序可能先插入搜索；仅没有用户排序的项采用定稿的文件／搜索／大纲／Git 顺序。
  const default_order = ["core.file-explorer", "core.search", "core.outline", "linux_note:source_control"].filter(id => allowed.has(id));
  const storage_key = options.storage_key || "linux-note:workspace:activity-order:v1";
  const style = acquire_workspace_style("typora-code-style:workspace_activity", activity_css, {"data-workspace-activity-style":"ready"});
  const chrome_style = acquire_workspace_style("typora-code-style:workspace_chrome", chrome_css);
  const reduced_motion = matchMedia("(prefers-reduced-motion: reduce)");
  const originals = new Map<HTMLElement, {draggable: string | null; role: string | null; tabindex: string | null; label: string | null; nodes: Node[]}>();
  const animations = new Map<HTMLElement, Animation>();
  let stored_order: string[] = [];
  try { const value: unknown = JSON.parse(localStorage.getItem(storage_key) || "[]"); if (Array.isArray(value)) stored_order = [...new Set(value.filter((id): id is string => typeof id === "string" && allowed.has(id)))]; } catch { /* 损坏的本地排序不影响活动栏。 */ }
  let disposed = false; let scheduled = 0; let suppress_click_until = 0;
  let drag: {item: HTMLElement; order: string[]; session?: pointer_drag_session} | undefined;
  const marker=create_drop_marker(document);
  let menu: HTMLElement | undefined; let menu_owner: HTMLElement | undefined;
  const top_group = () => ribbon.querySelector<HTMLElement>(":scope > .group.top");
  const items = () => [...(top_group()?.children || [])].filter((item): item is HTMLElement => item instanceof HTMLElement && item.matches(".typ-ribbon-item[data-id]") && allowed.has(item.dataset.id || ""));
  const order = () => items().map(item => item.dataset.id!);
  const item_at = (target: EventTarget | null) => {
    const item = target instanceof Element ? target.closest<HTMLElement>(".typ-ribbon-item[data-id]") : null;
    return item && item.parentElement === top_group() && allowed.has(item.dataset.id || "") ? item : null;
  };
  const cancel_animations = () => { for (const animation of animations.values()) animation.cancel(); animations.clear(); };
  const reorder = (wanted: string[], animate: boolean) => {
    const existing = items(); const by_id = new Map(existing.map(item => [item.dataset.id!, item]));
    const ids = [...new Set([...wanted, ...existing.map(item => item.dataset.id!)])].filter(id => by_id.has(id));
    if (existing.every((item, index) => item.dataset.id === ids[index])) return;
    const before = new Map(existing.map(item => [item, item.getBoundingClientRect().top])); cancel_animations();
    // 用原位置占位，只交换功能项所在的槽位，其他按钮保持在原来的位置。
    const slots = existing.map(item => { const slot = document.createComment("activity-slot"); item.before(slot); return slot; });
    slots.forEach((slot, index) => { slot.before(by_id.get(ids[index])!); slot.remove(); });
    if (animate && !reduced_motion.matches) for (const item of existing) {
      const delta = before.get(item)! - item.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;
      const animation = item.animate([{transform: `translateY(${delta}px)`}, {transform: "translateY(0)"}], {duration: 180, easing: "cubic-bezier(.2, 0, 0, 1)"});
      animations.set(item, animation); animation.onfinish = () => { if (animations.get(item) === animation) animations.delete(item); };
    }
  };
  const persist = () => { stored_order = order(); try { localStorage.setItem(storage_key, JSON.stringify(stored_order)); } catch { /* 当前窗口的排序仍然有效。 */ } };
  const refresh = () => {
    if (disposed) return;
    const state = options.read_state();
    for (const item of items()) {
      if (!originals.has(item)) {
        originals.set(item, {draggable: item.getAttribute("draggable"), role: item.getAttribute("role"), tabindex: item.getAttribute("tabindex"), label: item.getAttribute("aria-label"), nodes: [...item.childNodes]});
        // 大纲保留原生 fa-list 目录图标和原节点，按用户定稿不再替换。
        const icon_names = {"core.file-explorer":"files", "core.search":"search", "linux_note:source_control":"source-control"} as const;
        const icon_name = icon_names[item.dataset.id as keyof typeof icon_names];
        if (icon_name) item.replaceChildren(git_icon(icon_name));
        item.classList.add("workspace-activity-item"); item.draggable = false; item.setAttribute("role", "button"); item.tabIndex = 0;
      }
      if (item.title && item.getAttribute("aria-label") !== item.title) item.setAttribute("aria-label", item.title);
      const active = state.sidebar_visible && state.active_id === item.dataset.id;
      if (item.dataset.activityActive !== String(active)) item.dataset.activityActive = String(active);
      if (item.getAttribute("aria-pressed") !== String(active)) item.setAttribute("aria-pressed", String(active));
      if (item.classList.contains("active") !== active) item.classList.toggle("active", active);
    }
    if (!drag) reorder([...stored_order, ...default_order], false);
    if (ribbon.dataset.workspaceActivity !== "ready") ribbon.dataset.workspaceActivity = "ready";
  };
  const schedule = () => { if (!disposed && !scheduled) scheduled = requestAnimationFrame(() => { scheduled = 0; refresh(); }); };
  const close_menu = (restore_focus = false) => {
    menu?.remove(); menu = undefined;
    if (restore_focus && menu_owner?.isConnected) menu_owner.focus({preventScroll: true});
    menu_owner = undefined;
  };
  const move = (id: string, direction: -1 | 1) => {
    const ids = order(); const index = ids.indexOf(id); const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]]; reorder(ids, true); persist();
  };
  const show_menu = (item: HTMLElement, x: number, y: number) => {
    close_menu(); menu_owner = item; menu = document.createElement("div"); menu.className = "workspace-activity-menu"; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "活动栏顺序");
    const ids = order(); const index = ids.indexOf(item.dataset.id!);
    for (const [direction, title] of [[-1, "向上移动"], [1, "向下移动"]] as const) {
      const button = document.createElement("button"); button.type = "button"; button.setAttribute("role", "menuitem"); button.dataset.activityMove = direction < 0 ? "up" : "down";
      button.disabled = index + direction < 0 || index + direction >= ids.length; button.append(git_icon("chevron-right"), document.createTextNode(title));
      button.onclick = () => { move(item.dataset.id!, direction); close_menu(true); }; menu.append(button);
    }
    menu.addEventListener("mousedown", event => { event.preventDefault(); event.stopPropagation(); });
    menu.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close_menu(true); return; }
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); const buttons = [...menu!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    });
    document.body.append(menu); const bounds = menu.getBoundingClientRect(); menu.style.left = Math.max(4, Math.min(x, innerWidth - bounds.width - 4)) + "px"; menu.style.top = Math.max(4, Math.min(y, innerHeight - bounds.height - 4)) + "px";
    const opened_menu = menu;
    // 右键的宿主获焦发生在同一鼠标事件尾部，下一帧再把焦点交给菜单。
    requestAnimationFrame(() => { if (menu === opened_menu) opened_menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); });
  };
  const on_context_menu = (event: MouseEvent) => {
    const item = item_at(event.target); if (!item) return;
    event.preventDefault(); event.stopImmediatePropagation(); const box = item.getBoundingClientRect(); show_menu(item, event.clientX || box.right, event.clientY || box.top);
  };
  const on_pointer_down = (event: PointerEvent) => {
    if (menu && !menu.contains(event.target as Node)) close_menu();
    if (event.button !== 0 || !event.isPrimary) return;
    const item = item_at(event.target); if (!item) return;
    drag?.session?.cancel('replaced'); cancel_animations(); item.focus({preventScroll:true});
    const transaction:{item:HTMLElement;order:string[];session?:pointer_drag_session}={item,order:order()};drag=transaction;
    let pending_order=transaction.order,last_target:HTMLElement|undefined,last_before=true;
    const update_target=(state:pointer_drag_state)=>{
        const group=top_group();if(!group)return;
        const bounds=group.getBoundingClientRect();
        if(state.client_x<bounds.left||state.client_x>bounds.right||state.client_y<bounds.top||state.client_y>bounds.bottom){marker.hide();transaction.session?.set_drop_effect('none');return;}
        transaction.session?.set_drop_effect('move');
        const other=items().filter(node=>node!==item);
        const target=other.find(node=>state.client_y<node.getBoundingClientRect().bottom)||other[other.length-1];
        if(!target){marker.hide();return;}
        const box=target.getBoundingClientRect(),position=(state.client_y-box.top)/box.height;
        // 固定 VS Code compositeBarActions.ts: 40%/60% 保留中央滞回带，避免落点线抖动。
        const before=position<=.4?true:position>=.6?false:last_target===target?last_before:position<=.5;
        last_target=target;last_before=before;
        const index=other.indexOf(target)+(before?0:1);pending_order=other.map(node=>node.dataset.id!);pending_order.splice(index,0,item.dataset.id!);
        marker.show({left:bounds.left,top:before?box.top:box.bottom-2,width:bounds.width,height:2});
    };
    transaction.session=start_pointer_drag(event,{
      source:item,
      on_start(){item.classList.add("workspace-activity-dragging");ribbon.dataset.activityDragging="true";},
      on_move:update_target,
      on_drop(state){
        update_target(state);
        const bounds=top_group()?.getBoundingClientRect();
        if(bounds&&state.client_x>=bounds.left&&state.client_x<=bounds.right&&state.client_y>=bounds.top&&state.client_y<=bounds.bottom){reorder(pending_order,true);persist();}
      },
      on_cancel(){reorder(transaction.order,true);},
      on_end(started){
        if(started)suppress_click_until=performance.now()+400;
        item.classList.remove("workspace-activity-dragging");marker.hide();delete ribbon.dataset.activityDragging;if(drag===transaction)drag=undefined;schedule();
      }
    });
  };
  // 核心的 mousedown 不能再启动第二次排序；click 仍由核心切换面板。
  const on_mouse_down = (event: MouseEvent) => { const item = item_at(event.target); if (item && event.button === 0) { event.preventDefault(); event.stopImmediatePropagation(); item.focus({preventScroll: true}); } };
  const on_cancel = () => { drag?.session?.cancel(); close_menu(); };
  const on_click = (event: MouseEvent) => {
    if (!item_at(event.target)) return;
    if (performance.now() < suppress_click_until) { suppress_click_until = 0; event.preventDefault(); event.stopImmediatePropagation(); } else schedule();
  };
  const on_key_down = (event: KeyboardEvent) => {
    const item = item_at(event.target); if (!item || event.target !== item) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); event.stopImmediatePropagation(); const box = item.getBoundingClientRect(); show_menu(item, box.right, box.top); }
    else if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); move(item.dataset.id!, event.key === "ArrowUp" ? -1 : 1); }
    else if (!event.ctrlKey && !event.metaKey && !event.altKey && ["Enter", " "].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); item.click(); }
    else if (!event.ctrlKey && !event.metaKey && !event.altKey && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation(); const visible = items().filter(node => node.getBoundingClientRect().height > 0); const index = visible.indexOf(item);
      visible[event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 : (index + (event.key === "ArrowDown" ? 1 : visible.length - 1)) % visible.length]?.focus();
    }
  };
  const on_motion_change = () => { if (reduced_motion.matches) cancel_animations(); };
  const observer = new MutationObserver(schedule); observer.observe(ribbon, {subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "title", "hidden"]});
  observer.observe(document.body, {attributes: true, attributeFilter: ["class"]}); const sidebar = document.querySelector("#typora-sidebar"); if (sidebar) observer.observe(sidebar, {attributes: true, attributeFilter: ["class", "style", "hidden"]});
  ribbon.addEventListener("mousedown", on_mouse_down, true); ribbon.addEventListener("contextmenu", on_context_menu, true); ribbon.addEventListener("click", on_click, true);
  document.addEventListener("pointerdown", on_pointer_down, true); document.addEventListener("keydown", on_key_down, true);
  window.addEventListener("blur", on_cancel); reduced_motion.addEventListener("change", on_motion_change); refresh();
  return {refresh, move, dispose() {
    disposed = true; drag?.session?.cancel("dispose"); marker.dispose(); close_menu(); observer.disconnect(); if (scheduled) cancelAnimationFrame(scheduled); cancel_animations(); style.remove(); chrome_style.remove(); delete ribbon.dataset.workspaceActivity;
    ribbon.removeEventListener("mousedown", on_mouse_down, true); ribbon.removeEventListener("contextmenu", on_context_menu, true); ribbon.removeEventListener("click", on_click, true);
    document.removeEventListener("pointerdown", on_pointer_down, true); document.removeEventListener("keydown", on_key_down, true);
    window.removeEventListener("blur", on_cancel); reduced_motion.removeEventListener("change", on_motion_change);
    for (const [item, original] of originals) { item.replaceChildren(...original.nodes); item.classList.remove("workspace-activity-item", "workspace-activity-dragging"); delete item.dataset.activityActive; item.removeAttribute("aria-pressed"); for (const [name, value] of [["draggable", original.draggable], ["role", original.role], ["tabindex", original.tabindex], ["aria-label", original.label]] as const) if (value === null) item.removeAttribute(name); else item.setAttribute(name, value); }
  }};
}
