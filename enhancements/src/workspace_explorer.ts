import {create_workspace_file_tree,type workspace_file_tree_options} from './workspace_file_tree';
type sidebar_panel = {containerEl: HTMLElement; ribbonButton?: {id: string}; show(): void; hide(): void};
export type workspace_explorer_core = {
  SidebarPanel: new () => sidebar_panel;
  app: {workspace: {
    sidebar: {activePanel?: sidebar_panel; panels: sidebar_panel[]; isShown: boolean; addPanel(panel: sidebar_panel): unknown; removePanel(panel: sidebar_panel): void; switch(panel: new () => sidebar_panel): void; show(): void; hide(): void; toggle(): void};
    ribbon: {activeButton(id: string): void};
    on(event: string, callback: (...args: unknown[]) => void): unknown;
  }};
};
export type workspace_explorer_options=workspace_file_tree_options;
const EXPLORER_ID="linux_note:file_explorer";
/** 原生侧栏适配只管理展示和宿主事件，文件树交互由共享组件拥有。 */
export function bind_workspace_explorer(core:workspace_explorer_core,options:workspace_explorer_options){
  const view=create_workspace_file_tree(options),{container,refresh,reveal}=view,sidebar=core.app.workspace.sidebar;
  let visible=false,disposed=false,refresh_frame=0;const detachers:(()=>void)[]=[];
  const run=view.run;
  const clear_native_tabs=()=>{
    const native_sidebar=document.querySelector('#typora-sidebar'),classes=['active-tab-files','active-tab-outline','ty-show-search'];
    if(visible&&native_sidebar&&classes.some(name=>native_sidebar.classList.contains(name)))native_sidebar.classList.remove(...classes);
  };
  const native_observer=new MutationObserver(clear_native_tabs);
  class explorer_sidebar extends core.SidebarPanel{
    containerEl=container;
    onshow(){visible=true;clear_native_tabs();core.app.workspace.ribbon.activeButton('core.file-explorer');const native_sidebar=document.querySelector('#typora-sidebar');if(native_sidebar)native_observer.observe(native_sidebar,{attributes:true,attributeFilter:['class']});run(async()=>{await view.set_visible(true);await reveal();});}
    onhide(){visible=false;native_observer.disconnect();void view.set_visible(false);}
  }
  const panel=new explorer_sidebar();sidebar.addPanel(panel);panel.ribbonButton={id:EXPLORER_ID};
  function show(toggle=false){if(sidebar.activePanel!==panel)sidebar.switch(explorer_sidebar);else if(toggle)sidebar.toggle();else sidebar.show();}
  const activity_click=(event:MouseEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.typ-ribbon-item[data-id="core.file-explorer"]'))return;event.preventDefault();event.stopImmediatePropagation();show(true);};
  document.addEventListener('click',activity_click,true);
  const active_change=()=>{if(!visible||disposed||refresh_frame)return;refresh_frame=requestAnimationFrame(()=>{refresh_frame=0;run(()=>reveal());});};
  for(const event of ['active-leaf:change','file:open']){const detach=core.app.workspace.on(event,active_change);if(typeof detach==='function')detachers.push(detach as ()=>void);}
  const window_focus=()=>{run(()=>options.file_clipboard?.refresh());if(visible)run(()=>refresh());};window.addEventListener('focus',window_focus);
  function dispose(){if(disposed)return;disposed=true;visible=false;native_observer.disconnect();if(refresh_frame)cancelAnimationFrame(refresh_frame);document.removeEventListener('click',activity_click,true);window.removeEventListener('focus',window_focus);window.removeEventListener('pagehide',dispose);for(const detach of detachers)detach();view.dispose();if(sidebar.activePanel===panel){sidebar.hide();sidebar.activePanel=sidebar.panels.find(candidate=>candidate.ribbonButton?.id==='core.file-explorer');}panel.ribbonButton=undefined;sidebar.removePanel(panel);document.documentElement.removeAttribute('data-linux-note-workspace-explorer');}
  window.addEventListener('pagehide',dispose);document.documentElement.setAttribute('data-linux-note-workspace-explorer','ready');
  if(sidebar.isShown&&(sidebar.activePanel?.ribbonButton?.id==='core.file-explorer'||document.querySelector('#typora-sidebar')?.classList.contains('active-tab-files')))show();
  return {container,refresh,reveal,show,dispose};
}
