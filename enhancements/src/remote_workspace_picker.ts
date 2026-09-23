import {workspace_dialog,workspace_element as el,workspace_button as button} from './workspace_widgets';
import {active_remote_files} from './remote_workspace_files';
import {git_icon} from './git_icons';
import {workspace_file_icon} from './workspace_file_icons';

type remote_picker_options={initial_path?:string;choose_local_folder?:()=>Promise<string|undefined>};
/** 浏览和选择是独立状态；只有确认才提交，切换工作区后旧选择失效。 */
export function choose_remote_resource(directory:boolean,save_path?:string,options:remote_picker_options={}):Promise<string|undefined>{
  const provider=active_remote_files();if(!provider)throw Error('当前没有SSH工作区');
  return new Promise(resolve=>{
    let result:string|undefined,disposed=false,epoch=0,checking=false;
    let current=save_path&&provider.owns(save_path)?provider.path_api.dirname(save_path):options.initial_path||provider.root||provider.local_path('/');
    let selected='',selected_directory=false;
    const dialog=workspace_dialog(save_path?'另存为远程文件':directory?'打开远程文件夹':'打开远程文件','取消',()=>{
      disposed=true;++epoch;window.removeEventListener('linux-note-workspace-context-changed',close_stale);resolve(result);
    },{focus_out:false});
    const close_stale=()=>dialog.close();window.addEventListener('linux-note-workspace-context-changed',close_stale);
    const valid=(generation=epoch)=>!disposed&&generation===epoch&&active_remote_files()===provider;
    const path=el('input'),status=el('p'),list=el('div','workspace-ssh-list'),toolbar=el('div','workspace-ssh-toolbar'),breadcrumbs=el('nav','workspace-ssh-toolbar');
    const filename=el('input');filename.setAttribute('aria-label','文件名');filename.value=save_path?provider.path_api.basename(save_path):'';
    path.setAttribute('aria-label','远程路径');breadcrumbs.setAttribute('aria-label','远程路径层级');status.setAttribute('role','status');list.setAttribute('role','listbox');list.setAttribute('aria-label','远程目录内容');
    const report=(error:unknown)=>{if(valid())status.textContent=String(error instanceof Error?error.message:error);};
    const select=(target:string,is_directory:boolean,row?:HTMLButtonElement)=>{
      selected=target;selected_directory=is_directory;
      for(const item of list.querySelectorAll('[role=option]')){item.setAttribute('aria-selected',String(item===row));item.classList.toggle('selected',item===row);}
      if(save_path&&!is_directory)filename.value=provider.path_api.basename(target);
      accept.disabled=checking||(!save_path&&(directory?!is_directory:is_directory));
    };
    const accept=button(save_path?'保存':'打开',()=>{void (async()=>{
      if(!valid()||checking)return;
      if(save_path){
        if(!filename.value||filename.value==='.'||filename.value==='..'||/[\/\\\0]/u.test(filename.value))throw Error('请输入单个有效文件名。');
        selected=provider.local_path(provider.path_api.posix.join(provider.remote_path(current),filename.value));
      }
      if(!selected||(!save_path&&directory!==selected_directory))return;
      const target=selected,generation=epoch;checking=true;accept.disabled=true;
      try{
        if(save_path){
          let exists=false;try{const stat=await provider.fs.promises.lstat(target);if(!stat.isFile()||stat.isSymbolicLink())throw Error('目标不是可覆盖的普通文件。');exists=true;}catch(error){if((error as any).code!=='ENOENT')throw error;}
          if(!valid(generation))return;
          if(exists&&target!==save_path){
            const confirmed=await new Promise<boolean>(resolve=>{let value=false;const confirm=workspace_dialog('替换远程文件','取消',()=>resolve(value));confirm.content.append(el('p','',provider.remote_path(target)+' 已存在。替换将覆盖该文件内容。'));confirm.footer.prepend(button('替换',()=>{value=true;confirm.close();}));});
            if(!confirmed||!valid(generation))return;
          }
        }else{
          const stat=await provider.fs.promises.stat(target);
          if(directory?!stat.isDirectory():!stat.isFile())throw Error(directory?'所选项目不是文件夹。':'所选项目不是文件。');
        }
        if(!valid(generation))return;result=target;dialog.close();
      }finally{checking=false;if(valid())accept.disabled=!selected||(!save_path&&directory!==selected_directory);}
    })().catch(report);});accept.disabled=true;dialog.footer.prepend(accept);
    const paint_breadcrumbs=()=>{
      breadcrumbs.replaceChildren();const remote=provider.remote_path(current),segments=remote.split('/').filter(Boolean);let parent='';
      const crumb=(label:string,value:string)=>{const control=button(label,()=>void browse(provider.local_path(value)));control.title=value;breadcrumbs.append(control);};
      crumb('/','/');for(const part of segments){parent+='/'+part;breadcrumbs.append(git_icon('chevron-right'));crumb(part,parent);}
    };
    const browse=async(value:string,select_path='')=>{
      if(!valid())return;const generation=++epoch;selected='';accept.disabled=true;status.textContent='正在读取远程目录…';list.setAttribute('aria-busy','true');list.replaceChildren();
      try{
        const entries=await provider.fs.promises.readdir(value,{withFileTypes:true});if(!valid(generation))return;
        current=value;path.value=provider.remote_path(value);paint_breadcrumbs();selected=directory?current:'';selected_directory=directory;accept.disabled=checking||(!save_path&&!selected);
        const visible=entries.filter((entry:any)=>!directory||entry.isDirectory()).sort((a:any,b:any)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name));let shown=0;
        const more=button('显示更多',()=>append_batch());
        const append_batch=()=>{if(!valid(generation))return;more.remove();const fragment=document.createDocumentFragment(),end=Math.min(shown+200,visible.length);
          for(;shown<end;shown++){
            const entry=visible[shown],target=provider.path_api.join(current,entry.name),is_directory=entry.isDirectory();
            const row=button('',()=>select(target,is_directory,row),'workspace-ssh-row');row.setAttribute('role','option');row.setAttribute('aria-label',entry.name);row.setAttribute('aria-selected','false');row.title=provider.remote_path(target);
            row.append(is_directory?git_icon('chevron-right'):workspace_file_icon(entry.name),el('span','',entry.name));
            const enter=()=>{if(is_directory)void browse(target);else{select(target,false,row);accept.click();}};
            row.ondblclick=enter;row.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();enter();}};fragment.append(row);
          }
          list.append(fragment);if(shown<visible.length)list.append(more);
        };append_batch();
        if(select_path){while(shown<visible.length&&!Array.from(list.querySelectorAll<HTMLButtonElement>('[role=option]')).some(row=>row.title===provider.remote_path(select_path)))append_batch();const row=Array.from(list.querySelectorAll<HTMLButtonElement>('[role=option]')).find(row=>row.title===provider.remote_path(select_path));if(row){row.click();row.focus();}else throw Error('所选文件不在当前目录。');}
        status.textContent=visible.length?'': '此目录为空';
      }catch(error){if(valid(generation))report(error);}
      finally{if(valid(generation))list.removeAttribute('aria-busy');}
    };
    const up=()=>void browse(provider.local_path(provider.path_api.posix.dirname(provider.remote_path(current))));
    toolbar.append(button('上一级',up),button('刷新',()=>void browse(current)));
    list.onkeydown=event=>{
      if(event.isComposing)return;
      if(event.key==='Backspace'){event.preventDefault();up();return;}
      if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      event.preventDefault();const rows=Array.from(list.querySelectorAll<HTMLButtonElement>('[role=option]'));if(!rows.length)return;
      const index=rows.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)));
      rows[next].click();rows[next].focus();
    };
    path.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();void (async()=>{
      const value=path.value.trim(),generation=++epoch;selected='';accept.disabled=true;
      const remote=value.startsWith('/')?value:provider.path_api.posix.resolve(provider.remote_path(current),value),target=provider.local_path(remote);
      const stat=await provider.fs.promises.stat(target);if(!valid(generation))return;
      if(stat.isDirectory())await browse(target);else if(!directory&&stat.isFile())await browse(provider.path_api.dirname(target),target);else throw Error('请输入有效的远程目录。');
    })().catch(report);}};
    if(directory&&!save_path&&options.choose_local_folder){
      const modes=el('div','workspace-ssh-toolbar'),remote=button('远程文件夹',()=>{}),local=button('打开本地文件夹…',()=>{void(async()=>{
        if(checking||!valid())return;checking=true;local.disabled=true;const generation=epoch;
        try{const target=await options.choose_local_folder!();if(target&&valid(generation)){result=target;dialog.close();}}finally{checking=false;if(valid())local.disabled=false;}
      })().catch(report);});remote.setAttribute('aria-pressed','true');modes.append(remote,local);dialog.content.append(modes);
    }
    dialog.content.append(path,breadcrumbs,toolbar,status,list);if(save_path)dialog.content.append(filename);void browse(current);path.focus();
  });
}
