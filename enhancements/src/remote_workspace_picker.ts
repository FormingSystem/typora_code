import {workspace_dialog,workspace_element as el,workspace_button as button} from './workspace_widgets';
import {active_remote_files} from './remote_workspace_files';
import {git_icon} from './git_icons';
import {workspace_file_icon} from './workspace_file_icons';

/** 远端选择器与文件菜单共用入口；取消只丢弃选择，不切换工作区。 */
export function choose_remote_resource(directory:boolean,save_path?:string):Promise<string|undefined>{
  const provider=active_remote_files();if(!provider)throw Error('当前没有SSH工作区');
  return new Promise(resolve=>{
    let result:string|undefined,disposed=false,epoch=0,current=save_path&&provider.owns(save_path)?provider.path_api.dirname(save_path):provider.root||provider.local_path('/'),selected='';
    const dialog=workspace_dialog(save_path?'另存为远程文件':directory?'打开远程文件夹':'打开远程文件','取消',()=>{disposed=true;++epoch;resolve(result);});
    const path=el('input'),status=el('p'),list=el('div','workspace-ssh-list'),toolbar=el('div','workspace-ssh-toolbar');
    const filename=el('input');filename.setAttribute('aria-label','文件名');filename.value=save_path?provider.path_api.basename(save_path):'';
    path.setAttribute('aria-label','远程路径');status.setAttribute('role','status');list.setAttribute('role','list');
    let checking=false;
    const accept=button(save_path?'保存':'打开',()=>{void (async()=>{
      if(disposed||checking)return;
      if(save_path){
        if(!filename.value||filename.value==='.'||filename.value==='..'||/[\/\\\0]/u.test(filename.value)){status.textContent='请输入单个有效文件名。';return;}
        selected=provider.local_path(provider.path_api.posix.join(provider.remote_path(current),filename.value));
      }
      if(!selected)return;const target=selected,generation=epoch;checking=true;accept.disabled=true;
      try{
        if(save_path){
          let exists=false;try{const stat=await provider.fs.promises.lstat(target);if(!stat.isFile()||stat.isSymbolicLink())throw Error('目标不是可覆盖的普通文件。');exists=true;}catch(error){if((error as any).code!=='ENOENT')throw error;}
          if(disposed||generation!==epoch)return;
          if(exists&&target!==save_path){
            const confirmed=await new Promise<boolean>(resolve=>{let value=false;const confirm=workspace_dialog('替换远程文件','取消',()=>resolve(value));confirm.content.append(el('p','',provider.remote_path(target)+' 已存在。替换将覆盖该文件内容。'));confirm.footer.prepend(button('替换',()=>{value=true;confirm.close();}));});
            if(!confirmed||disposed||generation!==epoch)return;
          }
        }
        result=target;dialog.close();
      }finally{checking=false;if(!disposed)accept.disabled=false;}
    })().catch(error=>{if(!disposed)status.textContent=String((error as Error).message);});});accept.disabled=true;dialog.footer.prepend(accept);
    const browse=async(value:string)=>{
      const generation=++epoch;selected='';accept.disabled=true;status.textContent='正在读取远程目录…';list.replaceChildren();
      try{
        const entries=await provider.fs.promises.readdir(value,{withFileTypes:true});if(disposed||generation!==epoch)return;
        current=value;path.value=provider.remote_path(value);selected=directory?current:'';accept.disabled=!save_path&&!selected;
        const visible=entries.filter((entry:any)=>!directory||entry.isDirectory());let shown=0;
        const more=button('显示更多',()=>append_batch());
        const append_batch=()=>{if(disposed||generation!==epoch)return;more.remove();const fragment=document.createDocumentFragment(),end=Math.min(shown+200,visible.length);
        for(;shown<end;shown++){const entry=visible[shown];
          const target=provider.path_api.join(current,entry.name),row=button('',()=>{if(entry.isDirectory())void browse(target);else{selected=target;if(save_path)filename.value=entry.name;accept.disabled=false;for(const item of list.children)item.classList.toggle('active',item===row);}},'workspace-ssh-row');
          row.append(entry.isDirectory()?git_icon('chevron-right'):workspace_file_icon(entry.name),el('span','',entry.name));
          if(!entry.isDirectory()&&!save_path)row.ondblclick=()=>{selected=target;result=selected;dialog.close();};fragment.append(row);
        }
        list.append(fragment);if(shown<visible.length)list.append(more);};append_batch();status.textContent=visible.length?'': '此目录为空';
      }catch(error){if(!disposed&&generation===epoch)status.textContent=String((error as Error).message);}
    };
    toolbar.append(button('上一级',()=>void browse(current===provider.cache_root?current:provider.path_api.dirname(current))),button('刷新',()=>void browse(current)));
    path.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();try{void browse(provider.local_path(path.value));}catch(error){status.textContent=String((error as Error).message);}}};
    dialog.content.append(path,toolbar,status,list);if(save_path)dialog.content.append(filename);void browse(current);
  });
}
