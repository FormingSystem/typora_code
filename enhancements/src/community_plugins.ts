import {load_workspace_service} from "./workspace_service_loader";
import {workspace_text} from "./workspace_i18n";
import {read_network_settings} from './workspace_network_settings';
import {workspace_button,workspace_element} from './workspace_widgets';
import {acquire_workspace_interaction} from './workspace_interaction';
import {acquire_workspace_style} from './workspace_styles';
import {git_icon} from './git_icons';
import {create_community_plugin_settings} from './community_plugin_settings';
import css from './community_plugins.css';

/** Public ABI in the same workbench; compatible with the old ES5 constructor of the community version's Parent.apply(this). */
export function community_constructor(base:any,on_construct?:(value:any)=>void){
  const compatible=function(this:any,...args:any[]){const value=Reflect.construct(base,args,new.target||this.constructor);on_construct?.(value);return value;};
  compatible.prototype=base.prototype;Object.setPrototypeOf(compatible,base);return compatible;
}

/** Community settings use JSON persistence; isolate the default object and be compatible with old plugin modifications to the same reference after set. */
export function community_settings_class(base:any){
  return class extends base {
    setDefault(value:any){super.setDefault(JSON.parse(JSON.stringify(value)));}
    set(key:any,value:any){super.set(key,value&&typeof value==='object'&&this.get(key)===value?JSON.parse(JSON.stringify(value)):value);}
  };
}

export function bind_community_plugins(){
  const runtime=window as any,core=runtime[Symbol.for('typora-code:workspace')];
  if(!core?.app||!runtime.reqnode)return {dispose(){}};
  const abi_key=Symbol.for('typora-plugin-core@v2');
  if(runtime[abi_key]&&runtime[abi_key].app!==core.app)throw Error(workspace_text("community_plugins_a_different_community_core_has_been_detected_please_disable"));
  const previous_abi=runtime[abi_key],abi={...core};
  let construction_scope:Set<any>|undefined;
  for(const name of ['Plugin','PluginSettings','I18n','Events','WorkspaceRibbon','Sidebar','StatisticHandler','StatisticContext','ExportProcessor','HtmlExportProcessor','CodeblockExportProcessor','Component','SettingTab','SettingItem','View','Modal','SidebarPanel','WorkspaceView','PostProcessor','HtmlPostProcessor','CodeblockPostProcessor','EditorSuggest','TextSuggest'])if(core[name])abi[name]=community_constructor(core[name],name==='Plugin'?value=>construction_scope?.add(value):undefined);
  if(core.PluginSettings)abi.PluginSettings=community_constructor(community_settings_class(core.PluginSettings));
  const fs=runtime.reqnode('fs'),path=runtime.reqnode('path'),url=runtime.reqnode('url');
  const asset_root=path.join(runtime._options.userDataPath,'typora_code');
  const api=load_workspace_service(runtime.reqnode, path.join(asset_root,'assets/plugins/community_plugin_service.cjs'));
  const network=load_workspace_service(runtime.reqnode, path.join(asset_root,'assets/update/workspace_update_service.cjs'));

  const abort=new AbortController();let disposed=false;
  const service=api.create_community_service({
    root:path.join(asset_root,'community'),acquire_lock:()=>network.acquire_update_lock(path.join(asset_root,'community')),host_version:runtime._options.appVersion,
    request:(address:string,options:any)=>network.download(address,{...options,signal:abort.signal,network:read_network_settings()}),
    extract:(archive:string,destination:string)=>network.execute(network.powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(asset_root,'assets/update/workspace_update_archive.ps1'),'-archive',archive,'-destination',destination,'-package_kind','plugin'],{timeout:60000}),
    async load_plugin(manifest:any){
      const entry=url.pathToFileURL(path.join(manifest.dir,'main.js'));entry.searchParams.set('v',manifest.revision);
      const module=await import(entry.href);
      if(disposed)throw Error(workspace_text("community_plugins_the_plugin_service_has_been_closed"));
      if(typeof module.default!=='function')throw Error(workspace_text("community_plugins_the_plugin_does_not_export_an_available_default_constructor"));
      let instance:any;const created=new Set<any>();construction_scope=created;
      try {instance=new module.default(core.app,manifest);}
      catch(error){for(const value of created)await value.unload();throw error;}
      finally{construction_scope=undefined;}
      if(!(instance instanceof core.Plugin))throw Error(workspace_text("community_plugins_the_plugin_does_not_inherit_the_community_v2_plugin_api"));
      try{if(fs.existsSync(path.join(manifest.dir,'styles.css')))instance.registerCss('styles.css');await instance.load();return instance;}
      catch(error){await instance.unload();throw error;}
    },
    unload_plugin:(instance:any)=>instance.unload(),
  });
  const style=acquire_workspace_style('typora-code-style:community_plugins',css);
  runtime[abi_key]=abi;
  let refresh_manager=()=>{};
  const settings=create_community_plugin_settings(()=>service.list(),()=>refresh_manager(),mode=>{open_manager();manager?.select(mode);});
  const create_manager=()=>{
    let alive=true,busy=false,mode=service.list().length?'installed':'catalog',catalog:any[]=[],catalog_loaded=false;
    const content=workspace_element('div','workspace-community-manager');
    const interaction=acquire_workspace_interaction(content);
    const explanation=workspace_element('p','',workspace_text("community_plugins_use_the_typora_community_plugin_community_plugin_after_insta"));
    const toolbar=workspace_element('div','workspace-community-toolbar'),search=workspace_element('input'),message=workspace_element('p','workspace-community-message'),list=workspace_element('div','workspace-community-list');
    search.type='search';search.placeholder=workspace_text("community_plugins_search_by_name_description_or_author");search.setAttribute('aria-label',workspace_text("community_plugins_search_for_plugins"));message.setAttribute('role','status');
    const run=async(action:()=>Promise<unknown>)=>{if(busy||!alive)return;busy=true;message.textContent=workspace_text("community_plugins_processing");render();try{const result=await action();if(alive)message.textContent=typeof result==='string'?result:workspace_text("community_plugins_operation_completed");}catch(error){if(alive)message.textContent=String((error as Error).message||error);}finally{busy=false;if(alive)render();}};
    const installed=workspace_button(workspace_text("community_plugins_installed"),()=>select('installed'));
    const load_catalog=()=>run(async()=>{catalog=await service.catalog();catalog_loaded=true;return workspace_text("community_plugins_loaded_community_plugins", {value_0: String(catalog.length)});});
    const select=(next:string)=>{mode=next;search.value='';message.textContent='';render();if(mode==='catalog'&&!catalog_loaded)void load_catalog();};
    const community=workspace_button(workspace_text("community_plugins_community_plugin_market"),()=>select('catalog'));
    const refresh=workspace_button(workspace_text("community_plugins_refresh_directory"),()=>void load_catalog());
    const picker=workspace_element('input');picker.type='file';picker.accept='.zip';picker.hidden=true;
    picker.onchange=()=>{const file=picker.files?.[0] as any;if(!file)return;const archive=file.path||runtime.reqnode('electron').webUtils?.getPathForFile(file);picker.value='';if(!archive){message.textContent=workspace_text("community_plugins_unable_to_obtain_the_selected_file_path");return;}void run(async()=>{const info=await service.install_archive(archive);mode='installed';search.value='';return workspace_text("community_plugins_installed_199eab99", {value_0: String(info.name), value_1: String(info.enabled?workspace_text("community_plugins_updates_for_enabled_plugins_will_take_effect_after_a_normal"):workspace_text("community_plugins_use_it_after_clicking_trust_and_enable_plugins_that_provide"))});});};
    const local=workspace_button(workspace_text("community_plugins_install_local_zip"),()=>picker.click());
    toolbar.append(installed,community,refresh,local,picker);content.append(search,toolbar,message,list,explanation);
    const render=()=>{
      if(!alive)return;for(const node of [installed,community,refresh,local])node.disabled=busy;
      refresh.hidden=mode!=='catalog';content.setAttribute('aria-busy',String(busy));
      installed.setAttribute('aria-pressed',String(mode==='installed'));community.setAttribute('aria-pressed',String(mode==='catalog'));
      list.replaceChildren();let rows:any[]=[];
      try{rows=mode==='installed'?service.list():catalog;}catch(error){message.textContent=String((error as Error).message);return;}
      const installed_rows=service.list(),needle=search.value.trim().toLocaleLowerCase();
      for(const info of rows.filter(row=>(row.name+' '+row.id+' '+(row.description||'')+' '+(row.author||'')).toLocaleLowerCase().includes(needle))){
        const row=workspace_element('section','workspace-community-row'),details=workspace_element('div');
        details.append(workspace_element('strong','',info.name),workspace_element('p','workspace-community-description',info.description||info.id));
        const metadata=workspace_element('p','workspace-community-meta',`${info.author||workspace_text("community_plugins_author_not_provided")}${info.platforms?.length?' · '+info.platforms.map((platform:string)=>({win32:'Windows',darwin:'macOS',linux:'Linux'}[platform]||platform)).join(' / '):''}`);
        details.append(metadata);
        if(/^[\w.-]+\/[\w.-]+$/.test(info.repo||'')){
          const source=workspace_element('a','workspace-community-source',workspace_text("community_plugins_project_description"));source.href='https://github.com/'+info.repo;source.title=source.href;
          source.onclick=event=>{event.preventDefault();void runtime.reqnode('electron').shell.openExternal(source.href).catch((error:Error)=>{if(alive)message.textContent=workspace_text("community_plugins_failed_to_open_project_description")+error.message;});};details.append(source);
        }
        const current=installed_rows.find((item:any)=>item.id===info.id),actions=workspace_element('div','workspace-community-actions');
        if(current){
          details.append(workspace_element('p','',current.error||`${current.version||''} · ${current.running?workspace_text("community_plugins_enabled"):current.enabled?workspace_text("community_plugins_enable_failed"):workspace_text("community_plugins_disabled")}${current.restart_required?workspace_text("community_plugins_new_version_waiting_for_restart"):''}`));
          actions.append(workspace_button(current.enabled?workspace_text("community_plugins_disable"):workspace_text("community_plugins_trust_and_enable"),()=>void run(async()=>{const enable=!current.enabled;await service.set_enabled(info.id,enable);return !enable?workspace_text("community_plugins_disabled_plugin_registration_features_and_settings_have_been"):workspace_text("community_plugins_enabled_0c5db2a0", {value_0: String(info.name), value_1: String(settings.has(info.id)?workspace_text("community_plugins_click_settings_to_configure_this_plugin"):workspace_text("community_plugin_settings_this_plugin_does_not_provide_a_settings_page"))});})));
          const configure=workspace_button(workspace_text("community_plugins_settings"),()=>settings.show(info.id));configure.dataset.unavailable=String(!settings.has(info.id));configure.title=settings.has(info.id)?workspace_text("community_plugins_open_the_settings_page_provided_by_the_plugin"):current.running?workspace_text("community_plugins_the_plugin_does_not_provide_a_settings_page"):workspace_text("community_plugins_load_the_plugin_s_settings_page_after_enabling_the_plugin");actions.append(configure);
          actions.append(workspace_button(workspace_text("community_plugins_check_and_update"),()=>void run(async()=>{const release=await service.latest(current);if(api.compare_version(release.version,current.version)<=0)return workspace_text("community_plugins_it_is_already_the_latest_version");await service.install_online(current);return current.running?workspace_text("community_plugins_new_version_has_been_installed_normal_restart_will_take_effe"):workspace_text("community_plugins_new_version_has_been_installed");})),workspace_button(workspace_text("community_plugins_uninstall"),()=>void run(async()=>{await service.uninstall(info.id);return workspace_text("community_plugins_uninstalled_personal_settings_and_running_windows_may_refere");})));
        }else {
          const install=workspace_button(workspace_text("community_plugins_install"),()=>void run(async()=>{const result=await service.install_online(info);mode='installed';search.value=info.id;return workspace_text("community_plugins_installed_default_disabled_click_trust_and_enable_to_use_the", {value_0: String(result?.name||info.name)});}));
          if(info.platforms?.length&&!info.platforms.includes(runtime.reqnode('process').platform)){install.dataset.unavailable='true';install.title=workspace_text("community_plugins_this_plugin_is_not_supported_on_the_current_system");}
          actions.append(install);
        }
        for(const button of actions.querySelectorAll('button'))button.disabled=busy||button.dataset.unavailable==='true';
        row.append(details,actions);list.append(row);
      }
      if(!list.children.length){
        list.append(workspace_element('p','',busy?workspace_text("community_plugins_loading"):needle?workspace_text("community_plugins_no_matching_plugin_found"):mode==='catalog'?workspace_text("community_plugins_the_community_directory_has_not_been_loaded_yet_please_refre"):workspace_text("community_plugins_the_community_plugin_has_not_been_installed_yet")));
        if(mode==='installed'&&!needle)list.append(workspace_button(workspace_text("community_plugin_settings_browse_the_community_plugin_market"),()=>select('catalog')));
      }
    };
    const unsubscribe=service.subscribe(()=>{render();settings.refresh();});search.oninput=render;refresh_manager=()=>{render();settings.refresh();};render();if(mode==='catalog')void load_catalog();
    return {content,select,focus:()=>search.focus(),dispose(){alive=false;unsubscribe();interaction.remove();content.remove();refresh_manager=()=>{};}};
  };
  let manager:ReturnType<typeof create_manager>|undefined;
  class community_sidebar extends core.SidebarPanel {
    containerEl=workspace_element('section','workspace-community-sidebar');
    visible=false;
    native_observer=new MutationObserver(()=>this.clear_native_tabs());
    constructor(){
      super();this.addRibbonButton({id:'typora_code:community_plugins',title:workspace_text("community_plugins_extension_ctrl_shift_x"),icon:git_icon('extensions'),group:'top'});
      const title=workspace_element('div','workspace-community-title',workspace_text("community_plugins_extension"));title.setAttribute('role','heading');title.setAttribute('aria-level','2');this.containerEl.append(title);
    }
    clear_native_tabs(){
      const native=document.querySelector('#typora-sidebar');
      const classes=['active-tab-files','active-tab-outline','ty-show-search'];
      if(this.visible&&native&&classes.some(name=>native.classList.contains(name)))native.classList.remove(...classes);
    }
    onshow(){
      this.visible=true;this.clear_native_tabs();
      const native=document.querySelector('#typora-sidebar');if(native)this.native_observer.observe(native,{attributes:true,attributeFilter:['class']});
      if(!manager){manager=create_manager();this.containerEl.append(manager.content);}
    }
    onhide(){this.visible=false;this.native_observer.disconnect();}
  }
  const sidebar=core.app.workspace.sidebar,panel=new community_sidebar();
  const remove_panel=sidebar.addPanel(panel);
  const open_manager=()=>{
    if(disposed)return;
    if(sidebar.activePanel===panel)sidebar.show();else sidebar.switch(community_sidebar);
    manager?.focus();
  };
  const binding={service,open_manager,open_settings:()=>settings.open(),register_setting_tab:settings.register,mount_settings:settings.mount};
  core.app.community_plugins=binding;
  const unregister=core.app.commands.register({id:'typora_code:community_plugins',title:workspace_text("community_plugins_manage_community_plugins"),scope:'global',callback:open_manager});
  const unregister_settings=core.app.commands.register({id:'typora_code:community_plugin_settings',title:workspace_text("community_plugins_plugin_settings"),scope:'global',callback:binding.open_settings});
  // Do not wait for third-party code, which does not affect the basic workbench ready; load failures are reported on the management page one by one.
  let start_frame=requestAnimationFrame(()=>{start_frame=requestAnimationFrame(()=>{if(!disposed)void service.start().catch((error:Error)=>{console.error(error);if(!disposed)new core.Notice(workspace_text("community_plugins_community_plugin_load_failed")+error.message);});});});
  return {dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(start_frame);abort.abort();unregister();unregister_settings();remove_panel();panel.onhide();manager?.dispose();settings.dispose();void service.dispose().catch(console.error);style.remove();if(core.app.community_plugins===binding)delete core.app.community_plugins;if(runtime[abi_key]===abi){if(previous_abi)runtime[abi_key]=previous_abi;else delete runtime[abi_key];}}};
}
