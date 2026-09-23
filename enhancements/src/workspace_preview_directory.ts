import type {workspace_file_host} from './workspace_files';
import {workspace_element as el,workspace_button} from './workspace_widgets';
import {acquire_workspace_file_icons,workspace_file_icon} from './workspace_file_icons';
import {git_icon} from './git_icons';
import {create_workspace_virtual_list} from './workspace_virtual_list';

export type preview_directory_position={scroll_top:number;focused_name?:string};

/** 只呈现已读取的一层子项；路径和导航仍由预览控制器管理。 */
export function create_preview_directory(files:workspace_file_host,path:string,entries:any[],open:(path:string)=>void){
  const container=el('section','workspace-preview-directory'),heading=el('div','workspace-preview-directory-path',files.path_api.basename(path)||path),scroller=el('div','workspace-preview-directory-scroll'),list=el('div');
  const icons=acquire_workspace_file_icons();let focused_name:string|undefined,focus_frame=0;
  heading.title=path;scroller.tabIndex=0;scroller.setAttribute('aria-label','目录内容');container.dataset.directoryPath=path;container.append(heading,scroller);scroller.append(list);
  const items=entries.map(entry=>({name:String(entry.name),directory:Boolean(entry.isDirectory())})).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name,undefined,{numeric:true}));
  list.style.height=items.length*26+'px';
  const virtual=create_workspace_virtual_list({root:list,scroller,items,row_height:26,render:item=>{
    const file_path=files.path_api.join(path,item.name),row=workspace_button('',()=>{focused_name=item.name;open(file_path);},'workspace-preview-directory-entry');
    row.dataset.entryName=item.name;row.title=item.name;row.setAttribute('aria-label',item.name+(item.directory?'，目录':''));
    row.append(item.directory?git_icon('chevron-right'):workspace_file_icon(file_path),el('span','workspace-preview-directory-name',item.name));
    row.onfocus=()=>{focused_name=item.name;};return row;
  }});
  if(!items.length)scroller.append(el('p','workspace-lookup-preview-message','此目录为空。'));
  return {container,capture_position:():preview_directory_position=>({scroll_top:scroller.scrollTop,focused_name}),restore_position(position:preview_directory_position){scroller.scrollTop=position.scroll_top;focused_name=position.focused_name;virtual.refresh();},focus(){cancelAnimationFrame(focus_frame);focus_frame=requestAnimationFrame(()=>{const rows=[...list.querySelectorAll<HTMLButtonElement>('[data-entry-name]')],row=rows.find(node=>node.dataset.entryName===focused_name)||rows[0];(row||scroller).focus({preventScroll:true});});},dispose(){cancelAnimationFrame(focus_frame);virtual.dispose();icons.remove();container.remove();}};
}
