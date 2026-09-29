import {workspace_text} from "./workspace_i18n";
import {workspace_dialog,workspace_element as el,workspace_button as button} from './workspace_widgets';
import {active_remote_files} from './remote_workspace_files';
import {git_icon,git_icon_button} from './git_icons';
import {create_workspace_file_tree} from './workspace_file_tree';
import {acquire_workspace_style} from './workspace_styles';
import {register_workspace_dismissal,type workspace_dismiss_layer} from './workspace_focus';
import {search_workspace_paths} from './workspace_path_search';
import breadcrumb_css from './workspace_breadcrumbs.css';
import picker_css from './remote_workspace_picker.css';

type remote_picker_options={initial_path?:string;choose_local_folder?:()=>Promise<string|undefined>};
/** Browsing and selection are independent states; only submit upon confirmation, previous selection becomes invalid after switching workspaces. */
export function choose_remote_resource(directory:boolean,save_path?:string,options:remote_picker_options={}):Promise<string|undefined>{
  const provider=active_remote_files();if(!provider)throw Error(workspace_text("remote_workspace_picker_there_is_no_ssh_workspace_currently"));
  return new Promise(resolve=>{
    let result:string|undefined,disposed=false,epoch=0,checking=false;
    let edit_layer:workspace_dismiss_layer|undefined,address_request=0,search:AbortController|undefined;
    const cancel_address=()=>{address_request++;search?.abort();search=undefined;};
    const styles=[acquire_workspace_style('typora-code-style:breadcrumbs',breadcrumb_css),acquire_workspace_style('typora-code-style:remote_picker',picker_css)];
    let current=save_path&&provider.owns(save_path)?provider.path_api.dirname(save_path):options.initial_path||provider.root||provider.local_path('/');
    let selected='',selected_directory=false;
    const dialog=workspace_dialog(save_path?workspace_text("remote_workspace_picker_save_as_remote_file"):directory?workspace_text("remote_workspace_picker_open_remote_folder"):workspace_text("remote_workspace_picker_open_remote_file"),workspace_text("language_service_settings_view_cancel"),()=>{
      disposed=true;++epoch;cancel_address();edit_layer?.dispose();file_tree.dispose();for(const style of styles)style.remove();window.removeEventListener('linux-note-workspace-context-changed',close_stale);resolve(result);
    },{focus_out:false});
    const close_stale=()=>dialog.close();window.addEventListener('linux-note-workspace-context-changed',close_stale);
    const valid=(generation=epoch)=>!disposed&&generation===epoch&&active_remote_files()===provider;
    const path=el('input'),status=el('p'),toolbar=el('div','workspace-resource-picker-address'),breadcrumbs=el('nav','workspace-breadcrumb-trail');
    const location=el('div','workspace-breadcrumbs workspace-resource-picker-location');location.append(breadcrumbs,path);path.hidden=true;
    const edit_path=(editing:boolean,restore_focus=false)=>{
      edit_layer?.dispose();edit_layer=undefined;if(search)status.textContent='';cancel_address();
      path.hidden=!editing;breadcrumbs.hidden=editing;edit_button.hidden=editing;submit_button.hidden=!editing;
      edit_button.setAttribute('aria-pressed',String(editing));
      if(editing){
        path.value=provider.remote_path(current);
        edit_layer=register_workspace_dismissal(()=>[location,submit_button],reason=>edit_path(false,reason==='escape'));
        path.focus();path.select();
      }else{path.value=provider.remote_path(current);accept.disabled=checking||(!save_path&&(!selected||directory!==selected_directory));if(restore_focus)breadcrumbs.querySelector<HTMLButtonElement>('button:last-child')?.focus();}
    };
    const edit_button=git_icon_button('edit',workspace_text("remote_workspace_picker_edit_full_path_ctrl_l"),()=>edit_path(path.hidden));
    const submit_button=git_icon_button('search',workspace_text("remote_workspace_picker_jump_path_or_search_regular_expression_enter"),()=>void submit_path());submit_button.hidden=true;
    location.addEventListener('click',event=>{if(path.hidden&&!(event.target as Element).closest('button:not([aria-current])'))edit_path(true);});
    const filename=el('input');filename.setAttribute('aria-label',workspace_text("remote_workspace_picker_file_name"));filename.value=save_path?provider.path_api.basename(save_path):'';
    path.setAttribute('aria-label',workspace_text("remote_workspace_picker_remote_path"));path.placeholder=workspace_text("remote_workspace_picker_enter_path_or_regular_expression");path.title=workspace_text("remote_workspace_picker_existing_path_directly_jumps_otherwise_search_current_direct");breadcrumbs.setAttribute('aria-label',workspace_text("remote_workspace_picker_remote_path_hierarchy"));status.setAttribute('role','status');
    const report=(error:unknown)=>{if(valid())status.textContent=String(error instanceof Error?error.message:error);};
    const select=(target:string,is_directory:boolean)=>{
      selected=target;selected_directory=is_directory;
      if(save_path&&!is_directory)filename.value=provider.path_api.basename(target);
      accept.disabled=checking||(!save_path&&(directory?!is_directory:is_directory));
    };
    const accept=button(save_path?workspace_text("remote_ssh_directory_save"):workspace_text("remote_workspace_picker_open"),()=>{void (async()=>{
      if(!valid()||checking)return;
      let target=selected;
      if(save_path){
        if(!filename.value||filename.value==='.'||filename.value==='..'||/[\/\\\0]/u.test(filename.value))throw Error(workspace_text("remote_workspace_picker_please_enter_a_single_valid_file_name"));
        target=provider.local_path(provider.path_api.posix.join(provider.remote_path(selected?(selected_directory?selected:provider.path_api.dirname(selected)):current),filename.value));
      }
      if(!target||(!save_path&&directory!==selected_directory))return;
      const generation=epoch;checking=true;accept.disabled=true;
      try{
        if(save_path){
          let exists=false;try{const stat=await provider.fs.promises.lstat(target);if(!stat.isFile()||stat.isSymbolicLink())throw Error(workspace_text("remote_workspace_picker_the_target_is_not_a_coverable_ordinary_file"));exists=true;}catch(error){if((error as any).code!=='ENOENT')throw error;}
          if(!valid(generation))return;
          if(exists&&target!==save_path){
            const confirmed=await new Promise<boolean>(resolve=>{let value=false;const confirm=workspace_dialog(workspace_text("remote_workspace_picker_replace_remote_file"),workspace_text("language_service_settings_view_cancel"),()=>resolve(value));confirm.content.append(el('p','',provider.remote_path(target)+workspace_text("remote_workspace_picker_already_exists_replacing_will_overwrite_the_file_content")));confirm.footer.prepend(button(workspace_text("remote_workspace_picker_replace"),()=>{value=true;confirm.close();}));});
            if(!confirmed||!valid(generation))return;
          }
        }else{
          const stat=await provider.fs.promises.stat(target);
          if(directory?!stat.isDirectory():!stat.isFile())throw Error(directory?workspace_text("remote_workspace_picker_the_selected_item_is_not_a_folder"):workspace_text("remote_workspace_picker_the_selected_item_is_not_a_file"));
        }
        if(!valid(generation))return;result=target;dialog.close();
      }finally{checking=false;if(valid())accept.disabled=!selected||(!save_path&&directory!==selected_directory);}
    })().catch(report);});accept.disabled=true;dialog.footer.prepend(accept);
    const paint_breadcrumbs=()=>{
      breadcrumbs.replaceChildren();const remote=provider.remote_path(current),segments=remote.split('/').filter(Boolean);let parent='';
      const crumb=(label:string,value:string)=>{const control=button('',()=>{if(value!==remote)void browse(provider.local_path(value));},'workspace-breadcrumb-segment');control.append(el('span','',label));control.title=value;if(value===remote)control.setAttribute('aria-current','location');breadcrumbs.append(control);};
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
    file_tree.tree.setAttribute('aria-label',workspace_text("remote_workspace_picker_remote_directory_contents"));
    const browse=async(value:string,select_path='')=>{
      if(!valid())return;cancel_address();const generation=++epoch,address_generation=address_request;selected='';accept.disabled=true;status.textContent='';
      current=value;path.value=provider.remote_path(value);paint_breadcrumbs();up_button.disabled=provider.remote_path(value)==='/';
      await file_tree.sync_root(true);if(!valid(generation)||address_generation!==address_request||!file_tree.ready())return;edit_path(false);breadcrumbs.scrollLeft=breadcrumbs.scrollWidth;
      selected=directory?current:'';selected_directory=directory;accept.disabled=checking||(!save_path&&!selected);
      if(select_path){await file_tree.reveal(select_path);if(valid(generation)&&selected!==select_path)report(Error(workspace_text("remote_workspace_picker_the_selected_file_is_not_in_the_current_directory")));}
    };
    const up=()=>void browse(provider.local_path(provider.path_api.posix.dirname(provider.remote_path(current))));
    const up_button=git_icon_button('arrow-up',workspace_text("remote_workspace_picker_parent_directory"),up),refresh_button=git_icon_button('refresh',workspace_text("remote_workspace_picker_refresh"),()=>void browse(current));
    toolbar.classList.add('workspace-resource-picker-actions');toolbar.append(up_button,refresh_button,location,edit_button,submit_button);
    file_tree.tree.addEventListener('keydown',event=>{if(!event.isComposing&&event.key==='Backspace'&&!event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopPropagation();up();}});
    async function submit_path(){
      const value=path.value.trim();if(!value||!valid())return;
      cancel_address();const request=address_request,generation=epoch,controller=new AbortController();search=controller;
      const active=()=>valid(generation)&&request===address_request&&!controller.signal.aborted;
      accept.disabled=true;status.textContent=workspace_text("remote_workspace_picker_checking_path");
      try{
        const remote=value.startsWith('/')?value:provider.path_api.posix.resolve(provider.remote_path(current),value);
        let stat:any;
        try{stat=await provider.stat_remote(remote);}catch(error){if(!['ENOENT','ENOTDIR'].includes((error as any).code))throw error;}
        if(!active())return;
        if(stat){const target=provider.local_path(remote);if(stat.isDirectory())await browse(target);else if(stat.isFile())await browse(provider.path_api.dirname(target),target);else throw Error(workspace_text("remote_workspace_picker_the_target_is_not_a_file_or_directory"));return;}
        let scope=current,query=value;
        if(value.startsWith('/')){
          let prefix=value.lastIndexOf('/');
          while(prefix>=0){
            const base=value.slice(0,prefix)||'/';let parent:any;
            try{parent=await provider.stat_remote(base);}catch(error){if(!['ENOENT','ENOTDIR'].includes((error as any).code))throw error;}
            if(!active())return;
            if(parent?.isDirectory()){scope=provider.local_path(base);query=value.slice(prefix+1);break;}
            prefix=value.lastIndexOf('/',prefix-1);
          }
        }
        status.textContent=workspace_text("remote_workspace_picker_searching")+provider.remote_path(scope)+workspace_text("remote_workspace_picker_regular_expression");
        const reply=await search_workspace_paths({fs:provider.fs,path_api:provider.path_api,root:scope,query,signal:controller.signal});if(!active())return;
        current=scope;paint_breadcrumbs();up_button.disabled=provider.remote_path(current)==='/';selected='';accept.disabled=true;
        file_tree.show_results(reply.results);edit_path(false);
        status.textContent=workspace_text("remote_workspace_picker_matches", {value_0: String(reply.results.length), value_1: String(query)})+(reply.unreadable?workspace_text("remote_workspace_picker_directories_cannot_be_read_results_are_incomplete", {value_0: String(reply.unreadable)}):'')+workspace_text("remote_workspace_picker_refresh_to_return_to_directory");
      }catch(error){if(active()){report(error);accept.disabled=checking||(!save_path&&(!selected||directory!==selected_directory));}}
    }
    path.oninput=()=>{cancel_address();status.textContent='';};
    path.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();event.stopPropagation();void submit_path();}};
    {
      const modes=el('div','workspace-ssh-toolbar workspace-resource-picker-modes'),remote=button(directory?workspace_text("remote_workspace_picker_remote_folder"):workspace_text("remote_workspace_picker_remote_file"),()=>{}),local=button(workspace_text("remote_workspace_picker_open_local_folder"),()=>{void(async()=>{
        if(checking||!valid())return;checking=true;local.disabled=true;const generation=epoch;
        try{const target=await options.choose_local_folder!();if(target&&valid(generation)){result=target;dialog.close();}}finally{checking=false;if(valid())local.disabled=false;}
      })().catch(report);});remote.setAttribute('aria-pressed','true');remote.classList.add('selected');remote.title=workspace_text("remote_workspace_picker_current_browsing_ssh")+provider.connection.target;local.setAttribute('aria-pressed','false');modes.append(remote,...(directory&&!save_path&&options.choose_local_folder?[local]:[]),el('span','workspace-resource-picker-identity','SSH: '+provider.connection.target));dialog.content.append(modes);
    }
    dialog.content.classList.add('workspace-resource-picker-content');dialog.content.append(toolbar,status,file_tree.container);if(save_path)dialog.content.append(filename);void browse(current);
  });
}
