import {create_workspace_lifetime} from "./workspace_lifetime";
import {create_workspace_popup_refresh} from "./workspace_popup_refresh";
import {acquire_workspace_style} from "./workspace_styles";
import {native_document_active} from "./workspace_view_state";
import {reading_viewport_bounds} from "./reading_viewport";
import type {workspace_file_host} from "./workspace_files";
import css from "./workspace_native_toolbar.css";

/** 原生工具栏仍由宿主开关；只将其浮动位置限制在活动Markdown的阅读区域。 */
export function bind_workspace_native_toolbar(files:workspace_file_host,runtime:{File?:any}){
  const lifetime=create_workspace_lifetime();
  const style=acquire_workspace_style("typora-code-style:workspace_native_toolbar",css);lifetime.add(style.remove);
  let toolbar:HTMLElement|undefined,toolbar_height=0;
  const set=(name:string,value:string)=>{if(toolbar?.style.getPropertyValue(name)!==value)toolbar?.style.setProperty(name,value);};
  const layout=()=>{
    if(lifetime.disposed)return;
    const node=runtime.File?.editor?.toolbar?.dom;
    if(node instanceof HTMLElement&&node!==toolbar){
      toolbar=node;
      const attributes=["data-workspace-native-toolbar","data-workspace-toolbar-suspended"].map(name=>[name,node.getAttribute(name)] as const);
      const properties=["--workspace-toolbar-left","--workspace-toolbar-top","--workspace-toolbar-width"].map(name=>[name,node.style.getPropertyValue(name)] as const);
      lifetime.add(()=>{for(const [name,value] of attributes){if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);}for(const[name,value]of properties){if(value)node.style.setProperty(name,value);else node.style.removeProperty(name);}});
      node.dataset.workspaceNativeToolbar="ready";refresh.observe_size(node);refresh.observe_mutations(node,{attributes:true,attributeFilter:["style","class"]});
    }
    if(!toolbar)return;
    const active=native_document_active(files,runtime),leaf=files.core.app.workspace.activeLeaf;
    const owner=leaf?.containerEl;
    const bounds=owner?.isConnected?reading_viewport_bounds(owner):undefined;
    const root=document.querySelector<HTMLElement>(".typ-workspace-root")?.getBoundingClientRect();
    // 终端面板占用根节点下方空间，原生content的过渡矩形可能迟一帧跟进。
    const bottom=bounds?Math.min(bounds.bottom,root?.bottom??bounds.bottom):0;
    const suspended=String(!active||!bounds||bottom-bounds.top<toolbar_height+16);
    if(toolbar.dataset.workspaceToolbarSuspended!==suspended)toolbar.dataset.workspaceToolbarSuspended=suspended;
    if(suspended==="true"||!bounds||!toolbar.getClientRects().length||getComputedStyle(toolbar).display==="none")return;
    set("--workspace-toolbar-width",Math.max(0,bounds.right-bounds.left-16)+"px");
    const rect=toolbar.getBoundingClientRect();toolbar_height=rect.height;
    if(bottom-bounds.top<toolbar_height+16){toolbar.dataset.workspaceToolbarSuspended="true";return;}
    set("--workspace-toolbar-left",Math.max(bounds.left+8,(bounds.left+bounds.right-rect.width)/2)+"px");
    set("--workspace-toolbar-top",Math.max(bounds.top,bottom-rect.height-8)+"px");
  };
  const refresh=create_workspace_popup_refresh(layout),schedule=refresh.schedule;
  const root=document.querySelector(".typ-workspace-root");if(root)refresh.observe_size(root);
  for(const node of[document.body,document.documentElement])refresh.observe_mutations(node,{attributes:true,attributeFilter:["style","class"],...(node===document.body?{childList:true}:{})});
  lifetime.add(files.core.app.workspace.on("active-leaf:change",schedule));
  lifetime.listen(window,"resize",schedule);lifetime.listen(document,"transitionend",schedule,true);
  lifetime.add(refresh.dispose);
  schedule();return {dispose:lifetime.dispose};
}
