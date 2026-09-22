import type {graph_core} from './git_graph_host';
import type {workspace_file_host} from './workspace_files';
import {create_link_preview} from './workspace_link_preview';
import {bind_workspace_link_selection} from './workspace_link_selection';
import {read_workspace_editor_settings,observe_workspace_editor_settings} from './workspace_editor_settings';

/** 链接选择属于阅读工作台，搜索面板只管理自己的查询和命中预览。 */
export function bind_workspace_link_dock(core:graph_core,files:workspace_file_host){
  const sidebar=document.getElementById('typora-sidebar'),preview=create_link_preview(files);
  const dock=document.createElement('section');dock.className='workspace-link-dock';dock.setAttribute('aria-label','链接预览');dock.hidden=true;dock.append(preview.container);sidebar?.append(dock);
  const close=()=>{dock.hidden=true;sidebar?.classList.remove('has-workspace-link-preview');preview.clear();selection.reset();};
  const selection=bind_workspace_link_selection(core,files,()=>read_workspace_editor_settings().link_preview_enabled,request=>{
    if(!sidebar)return;dock.hidden=false;sidebar.classList.add('has-workspace-link-preview');core.app.workspace.sidebar.show();void preview.show(request);
  });
  const settings=observe_workspace_editor_settings(()=>{if(!read_workspace_editor_settings().link_preview_enabled)close();else selection.refresh();});
  window.addEventListener('linux-note-workspace-context-changed',close);
  return {dispose(){settings();window.removeEventListener('linux-note-workspace-context-changed',close);selection.dispose();preview.dispose();dock.remove();sidebar?.classList.remove('has-workspace-link-preview');}};
}
