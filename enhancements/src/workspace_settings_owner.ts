import type {graph_core} from './git_graph_host';

/** 保留原始页面的DOM归属，只把显示矩形托管到设置右侧。 */
function bind_owner_geometry(anchor:HTMLElement,surface:HTMLElement){
  const properties=['position','inset','left','top','right','bottom','width','height','z-index','display','box-sizing'];
  const previous=properties.map(name=>[name,surface.style.getPropertyValue(name),surface.style.getPropertyPriority(name)]);
  const original=surface.getAttribute('data-workspace-settings-surface');
  const sync=()=>{
    const box=anchor.getBoundingClientRect();
    const values:Record<string,string>={position:'fixed',inset:'auto',left:box.left+'px',top:box.top+'px',right:'auto',bottom:'auto',width:box.width+'px',height:box.height+'px','z-index':'110001',display:'block','box-sizing':'border-box'};
    for(const [name,value]of Object.entries(values))surface.style.setProperty(name,value,'important');
  };
  surface.setAttribute('data-workspace-settings-surface','true');
  const observer=new ResizeObserver(sync);observer.observe(anchor);window.addEventListener('resize',sync);sync();
  return()=>{observer.disconnect();window.removeEventListener('resize',sync);for(const [name,value,priority]of previous){if(value)surface.style.setProperty(name,value,priority);else surface.style.removeProperty(name);}if(original===null)surface.removeAttribute('data-workspace-settings-surface');else surface.setAttribute('data-workspace-settings-surface',original);};
}

export function mount_settings_owner(core:graph_core,owner:'native'|'community',anchor:HTMLElement,on_return:()=>void,on_navigate:()=>void){
  if(owner==='community'){
    const bridge=(core.app as any).community_plugins;
    if(!bridge?.mount_settings)throw Error('社区插件设置尚未就绪。');
    const surface=document.createElement('div');surface.dataset.workspaceInteraction='none';document.body.append(surface);
    const release_geometry=bind_owner_geometry(anchor,surface);
    let release_page:()=>void;
    try{release_page=bridge.mount_settings(surface,on_navigate);}catch(error){release_geometry();surface.remove();throw error;}
    return{surface,dispose(){release_page();release_geometry();surface.remove();}};
  }
  const runtime=window as any,panel=document.getElementById('uni-preference-panel'),menu=runtime.File?.megaMenu;
  if(!panel||!runtime.ClientCommand?.showPreferencePanel||!menu?.closePreferencePanel)throw Error('当前宿主原生偏好接口不可用。');
  runtime.ClientCommand.showPreferencePanel();
  const release_geometry=bind_owner_geometry(anchor,panel);
  const observer=new MutationObserver(()=>{if(!document.body.classList.contains('show-preference-panel'))on_return();});
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  return{surface:panel,dispose(){observer.disconnect();try{if(document.body.classList.contains('show-preference-panel'))menu.closePreferencePanel();}finally{release_geometry();}}};
}
