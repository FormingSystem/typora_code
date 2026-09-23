import {workspace_dialog,workspace_element as el,workspace_button as button} from './workspace_widgets';
import {active_remote_files} from './remote_workspace_files';
import {git_icon,git_icon_button} from './git_icons';
import {create_workspace_file_tree} from './workspace_file_tree';
import {acquire_workspace_style} from './workspace_styles';
import breadcrumb_css from './workspace_breadcrumbs.css';
import picker_css from './remote_workspace_picker.css';

type remote_picker_options={initial_path?:string;choose_local_folder?:()=>Promise<string|undefined>};
/** 浏览和选择是独立状态；只有确认才提交，切换工作区后旧选择失效。 */
export function choose_remote_resource(directory:boolean,save_path?:string,options:remote_picker_options={}):Promise<string|undefined>{
  const provider=active_remote_files();if(!provider)throw Error('当前没有SSH工作区');
  return new Promise(resolve=>{
    let result:string|undefined,disposed=false,epoch=0,checking=false;
    const styles=[acquire_workspace_style('typora-code-style:breadcrumbs',breadcrumb_css),acquire_workspace_style('typora-code-style:remote_picker',picker_css)];
    let current=save_path&&provider.owns(save_path)?provider.path_api.dirname(save_path):options.initial_path||provider.root||provider.local_path('/');
    let selected='',selected_directory=false;
    const dialog=workspace_dialog(save_path?'另存为远程文件':directory?'打开远程文件夹':'打开远程文件','取消',()=>{
      disposed=true;++epoch;file_tree.dispose();for(const style of styles)style.remove();window.removeEventListener('linux-note-workspace-context-changed',close_stale);resolve(result);
    },{focus_out:false,escape:()=>{if(path.hidden)return false;edit_path(false);return true;}});
    const close_stale=()=>dialog.close();window.addEventListener('linux-note-workspace-context-changed',close_stale);
    const valid=(generation=epoch)=>!disposed&&generation===epoch&&active_remote_files()===provider;
    const path=el('input'),status=el('p'),toolbar=el('div','workspace-resource-picker-address'),breadcrumbs=el('nav','workspace-breadcrumb-trail');
    const location=el('div','workspace-breadcrumbs workspace-resource-picker-location');location.append(breadcrumbs,path);path.hidden=true;
    const edit_path=(editing:boolean)=>{path.hidden=!editing;breadcrumbs.hidden=editing;edit_button.setAttribute('aria-pressed',String(editing));if(editing){path.value=provider.remote_path(current);path.focus();path.select();}else breadcrumbs.querySelector<HTMLButtonElement>('button:last-child')?.focus();};
    const edit_button=git_icon_button('edit','编辑完整路径 (Ctrl+L)',()=>edit_path(path.hidden));
    const filename=el('input');filename.setAttribute('aria-label','文件名');filename.value=save_path?provider.path_api.basename(save_path):'';
    path.setAttribute('aria-label','远程路径');breadcrumbs.setAttribute('aria-label','远程路径层级');status.setAttribute('role','status');
    const report=(error:unknown)=>{if(valid())status.textContent=String(error instanceof Error?error.message:error);};
    const select=(target:string,is_directory:boolean)=>{
      selected=target;selected_directory=is_directory;
      if(save_path&&!is_directory)filename.value=provider.path_api.basename(target);
      accept.disabled=checking||(!save_path&&(directory?!is_directory:is_directory));
    };
    const accept=button(save_path?'保存':'打开',()=>{void (async()=>{
      if(!valid()||checking)return;
      let target=selected;
      if(save_path){
        if(!filename.value||filename.value==='.'||filename.value==='..'||/[\/\\\0]/u.test(filename.value))throw Error('请输入单个有效文件名。');
        target=provider.local_path(provider.path_api.posix.join(provider.remote_path(selected?(selected_directory?selected:provider.path_api.dirname(selected)):current),filename.value));
      }
      if(!target||(!save_path&&directory!==selected_directory))return;
      const generation=epoch;checking=true;accept.disabled=true;
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
      const crumb=(label:string,value:string)=>{const control=button('',()=>void browse(provider.local_path(value)),'workspace-breadcrumb-segment');control.append(el('span','',label));control.title=value;if(value===remote)control.setAttribute('aria-current','location');breadcrumbs.append(control);};
      crumb('/','/');for(const part of segments){parent+='/'+part;breadcrumbs.append(git_icon('chevron-right'));crumb(part,parent);}
      breadcrumbs.scrollLeft=breadcrumbs.scrollWidth;
    };
    breadcrumbs.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey&&breadcrumbs.scrollWidth>breadcrumbs.clientWidth){event.preventDefault();event.stopPropagation();breadcrumbs.scrollLeft+=event.deltaX||event.deltaY;}},{passive:false});
    breadcrumbs.onkeydown=event=>{if(event.isComposing||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const items=[...breadcrumbs.querySelectorAll<HTMLButtonElement>('button')],index=items.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+(event.key==='ArrowLeft'?-1:1)));items[next]?.focus();};
    dialog.root.addEventListener('keydown',event=>{if(event.isComposing)return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='l'){event.preventDefault();event.stopPropagation();edit_path(true);} },true);
    const file_tree=create_workspace_file_tree({
      fs:provider.fs,path_api:provider.path_api,context_root:()=>current,
      open_file:()=>{},open_folder:()=>{},copy:()=>{},
      selection:{select,enter:async(target,is_directory)=>{if(is_directory)await browse(target);else{select(target,false);accept.click();}},label:target=>provider.remote_path(target)}
    });
    file_tree.tree.setAttribute('aria-label','远程目录内容');
    const browse=async(value:string,select_path='')=>{
      if(!valid())return;const generation=++epoch;selected='';accept.disabled=true;status.textContent='';
      current=value;path.value=provider.remote_path(value);paint_breadcrumbs();up_button.disabled=provider.remote_path(value)==='/';
      await file_tree.sync_root(true);if(!valid(generation)||!file_tree.ready())return;path.hidden=true;breadcrumbs.hidden=false;edit_button.setAttribute('aria-pressed','false');breadcrumbs.scrollLeft=breadcrumbs.scrollWidth;
      selected=directory?current:'';selected_directory=directory;accept.disabled=checking||(!save_path&&!selected);
      if(select_path){await file_tree.reveal(select_path);if(valid(generation)&&selected!==select_path)report(Error('所选文件不在当前目录。'));}
    };
    const up=()=>void browse(provider.local_path(provider.path_api.posix.dirname(provider.remote_path(current))));
    const up_button=git_icon_button('arrow-up','上一级',up),refresh_button=git_icon_button('refresh','刷新',()=>void file_tree.refresh());
    toolbar.classList.add('workspace-resource-picker-actions');toolbar.append(up_button,refresh_button,location,edit_button);
    file_tree.tree.addEventListener('keydown',event=>{if(!event.isComposing&&event.key==='Backspace'&&!event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopPropagation();up();}});
    path.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();const generation=++epoch;void (async()=>{
      const value=path.value.trim();selected='';accept.disabled=true;
      const remote=value.startsWith('/')?value:provider.path_api.posix.resolve(provider.remote_path(current),value),target=provider.local_path(remote);
      const stat=await provider.fs.promises.stat(target);if(!valid(generation))return;
      if(stat.isDirectory())await browse(target);else if(!directory&&stat.isFile())await browse(provider.path_api.dirname(target),target);else throw Error('请输入有效的远程目录。');
    })().catch(error=>{if(valid(generation))report(error);});}};
    {
      const modes=el('div','workspace-ssh-toolbar workspace-resource-picker-modes'),remote=button(directory?'远程文件夹':'远程文件',()=>{}),local=button('打开本地文件夹…',()=>{void(async()=>{
        if(checking||!valid())return;checking=true;local.disabled=true;const generation=epoch;
        try{const target=await options.choose_local_folder!();if(target&&valid(generation)){result=target;dialog.close();}}finally{checking=false;if(valid())local.disabled=false;}
      })().catch(report);});remote.setAttribute('aria-pressed','true');remote.classList.add('selected');remote.title='当前浏览 SSH: '+provider.connection.target;local.setAttribute('aria-pressed','false');modes.append(remote,...(directory&&!save_path&&options.choose_local_folder?[local]:[]),el('span','workspace-resource-picker-identity','SSH: '+provider.connection.target));dialog.content.append(modes);
    }
    dialog.content.classList.add('workspace-resource-picker-content');dialog.content.append(toolbar,status,file_tree.container);if(save_path)dialog.content.append(filename);void browse(current);
  });
}
