import {create_workspace_lifetime} from "./workspace_lifetime";
import {create_workspace_popup_refresh} from "./workspace_popup_refresh";

/** 原生事件与菜单节点不迁移；只把底栏浮层统一锚定到当前入口与窗口视口。 */
export function bind_workspace_footer_popups(footer:HTMLElement, actions:HTMLElement, sidebar:HTMLElement) {
  const lifetime=create_workspace_lifetime();
  const definitions=[
    {selector:"#sidebar-files-menu",anchors:["#sidebar-menu-btn"]},
    {selector:"#footer-word-count-info",anchors:["#footer-word-count"]},
    {selector:"#spell-check-panel",anchors:["#footer-spell-check"]}
  ];
  const properties=["--workspace-popup-left","--workspace-popup-top","--workspace-popup-max-height"];
  const entries=definitions.flatMap(definition=>{
    const menu=document.querySelector<HTMLElement>(definition.selector);
    if(!menu)return [];
    const attribute=menu.getAttribute("data-workspace-footer-popup");
    const previous=properties.map(name=>[name,menu.style.getPropertyValue(name),menu.style.getPropertyPriority(name)]);
    menu.setAttribute("data-workspace-footer-popup","ready");
    lifetime.add(()=>{
      if(attribute===null)menu.removeAttribute("data-workspace-footer-popup");else menu.setAttribute("data-workspace-footer-popup",attribute);
      for(const [name,value,priority] of previous){if(value)menu.style.setProperty(name,value,priority);else menu.style.removeProperty(name);}
    });
    return [{menu,anchors:definition.anchors}];
  });
  const initial_layer=footer.getAttribute("data-workspace-footer-popup-open");
  lifetime.add(()=>{if(initial_layer===null)footer.removeAttribute("data-workspace-footer-popup-open");else footer.setAttribute("data-workspace-footer-popup-open",initial_layer);});
  const visible=(node:HTMLElement|null)=>Boolean(node?.isConnected&&node.getClientRects().length&&getComputedStyle(node).display!=="none"&&getComputedStyle(node).visibility!=="hidden");
  const set_property=(node:HTMLElement,name:string,value:string)=>{if(node.style.getPropertyValue(name)!==value)node.style.setProperty(name,value);};
  const layout=()=>{
    if(lifetime.disposed)return;
    const footer_visible=visible(footer),footer_bounds=footer.getBoundingClientRect();
    const titlebar=document.querySelector<HTMLElement>("#top-titlebar");
    const viewport_top=visible(titlebar)?Math.max(4,titlebar!.getBoundingClientRect().bottom+4):4;
    let nested_open=false;
    for(const {menu,anchors} of entries){
      if(!footer_visible||!visible(menu))continue;
      const anchor=anchors.map(selector=>footer.querySelector<HTMLElement>(selector)).find(node=>visible(node))||footer;
      const anchor_bounds=anchor.getBoundingClientRect();
      const bottom=Math.min(innerHeight-4,footer_bounds.top-3,anchor_bounds.top-3);
      set_property(menu,"--workspace-popup-max-height",Math.max(0,Math.min(innerHeight*0.65,bottom-viewport_top))+"px");
      const bounds=menu.getBoundingClientRect();
      const left=Math.max(4,Math.min(anchor_bounds.right-bounds.width,innerWidth-bounds.width-4));
      const top=Math.max(viewport_top,bottom-bounds.height);
      // 忽略小于布局子像素的舍入；无几何变化的宿主通知不重新写坐标。
      if(Math.abs(bounds.left-left)>1/32||Math.abs(bounds.top-top)>1/32){
        // 从零坐标直接测包含块原点；不把CSS序列化/子像素舍入误差反馈到下一帧。
        set_property(menu,"--workspace-popup-left","0px");set_property(menu,"--workspace-popup-top","0px");
        const origin=menu.getBoundingClientRect();
        set_property(menu,"--workspace-popup-left",left-origin.left+"px");
        set_property(menu,"--workspace-popup-top",top-origin.top+"px");
      }
      nested_open=nested_open||footer.contains(menu);
    }
    if(nested_open){if(footer.getAttribute("data-workspace-footer-popup-open")!=="true")footer.setAttribute("data-workspace-footer-popup-open","true");}else footer.removeAttribute("data-workspace-footer-popup-open");
  };
  const refresh=create_workspace_popup_refresh(layout),schedule=refresh.schedule;
  for(const node of [footer,actions,document.querySelector(".typ-workspace-root"),...entries.flatMap(entry=>[entry.menu,...entry.anchors.map(selector=>footer.querySelector(selector))])])if(node)refresh.observe_size(node);
  for(const node of [sidebar,actions,footer,document.body,document.documentElement,document.querySelector(".typ-workspace-root")])if(node)refresh.observe_mutations(node,{attributes:true,attributeFilter:["class","style","hidden"]});
  for(const {menu} of entries)refresh.observe_mutations(menu,{attributes:true,attributeFilter:["class","style","hidden"],childList:true,characterData:true,subtree:true});
  lifetime.listen(window,"resize",schedule);lifetime.listen(document,"transitionend",schedule,true);
  lifetime.add(refresh.dispose);
  schedule();return {dispose:lifetime.dispose};
}
