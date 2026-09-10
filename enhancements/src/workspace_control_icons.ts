import control_css from "./workspace_control_icons.css";
import {acquire_workspace_style} from "./workspace_styles";
import {git_icon,type git_icon_name} from "./git_icons";

/** 仅适配调用方明确拥有的宿主控件槽，保留事件目标和卸载前原节点。 */
export function bind_workspace_control_icons(root:HTMLElement, slots:ReadonlyArray<readonly [string,git_icon_name]>) {
  const originals=new Map<HTMLElement,{nodes:Node[];marked:boolean}>();let disposed=false;
  const style=acquire_workspace_style("typora-code-style:workspace_control_icons",control_css,{"data-workspace-control-icons":"ready"});
  const refresh=()=>{if(disposed)return;for(const [selector,name]of slots)for(const node of root.querySelectorAll<HTMLElement>(selector)){
    if(!originals.has(node))originals.set(node,{nodes:[...node.childNodes],marked:node.classList.contains("workspace-official-icon-slot")});
    if(!node.classList.contains("workspace-official-icon-slot"))node.classList.add("workspace-official-icon-slot");
    if(node.childNodes.length!==1||node.firstElementChild?.getAttribute("data-git-icon")!==name)node.replaceChildren(git_icon(name));
  }};
  const observer=new MutationObserver(refresh);observer.observe(root,{childList:true,subtree:true});refresh();
  return {dispose(){if(disposed)return;disposed=true;observer.disconnect();for(const [node,original]of originals){node.replaceChildren(...original.nodes);if(!original.marked)node.classList.remove("workspace-official-icon-slot");}originals.clear();style.remove();}};
}
