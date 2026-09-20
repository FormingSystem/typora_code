import {workspace_button,workspace_dialog,workspace_element} from './workspace_widgets';
import {acquire_workspace_interaction} from './workspace_interaction';
import {acquire_workspace_style} from './workspace_styles';
import css from './community_plugins.css';

/** 同一个工作台的公共ABI；兼容社区旧版ES5构造函数的 Parent.apply(this) 调用。 */
export function community_constructor(base:any,on_construct?:(value:any)=>void){
  const compatible=function(this:any,...args:any[]){const value=Reflect.construct(base,args,new.target||this.constructor);on_construct?.(value);return value;};
  compatible.prototype=base.prototype;Object.setPrototypeOf(compatible,base);return compatible;
}

export function bind_community_plugins(){
  const runtime=window as any,core=runtime[Symbol.for('typora-code:workspace')];
  if(!core?.app||!runtime.reqnode)return {dispose(){}};
  const abi_key=Symbol.for('typora-plugin-core@v2');
  if(runtime[abi_key]&&runtime[abi_key].app!==core.app)throw Error('检测到另一个社区核心；请停用旧核心后重新打开。');
  const previous_abi=runtime[abi_key],abi={...core};
  let construction_scope:Set<any>|undefined;
  for(const name of ['Plugin','PluginSettings','I18n','Events','WorkspaceRibbon','Sidebar','StatisticHandler','StatisticContext','ExportProcessor','HtmlExportProcessor','CodeblockExportProcessor','Component','SettingTab','SettingItem','View','Modal','SidebarPanel','WorkspaceView','PostProcessor','HtmlPostProcessor','CodeblockPostProcessor','EditorSuggest','TextSuggest'])if(core[name])abi[name]=community_constructor(core[name],name==='Plugin'?value=>construction_scope?.add(value):undefined);
  const fs=runtime.reqnode('fs'),path=runtime.reqnode('path'),url=runtime.reqnode('url');
  const asset_root=path.join(runtime._options.userDataPath,'typora_code');
  const api=runtime.reqnode(path.join(asset_root,'assets/plugins/community_plugin_service.cjs'));
  const network=runtime.reqnode(path.join(asset_root,'assets/update/workspace_update_service.cjs'));
  const tabs=new Map<string,Set<any>>(),dialogs=new Set<ReturnType<typeof workspace_dialog>>();
  const abort=new AbortController();let disposed=false;
  const service=api.create_community_service({
    root:path.join(asset_root,'community'),acquire_lock:()=>network.acquire_update_lock(path.join(asset_root,'community')),host_version:runtime._options.appVersion,
    request:(address:string,options:any)=>network.download(address,{...options,signal:abort.signal}),
    extract:(archive:string,destination:string)=>network.execute(network.powershell(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(asset_root,'assets/update/workspace_update_archive.ps1'),'-archive',archive,'-destination',destination,'-package_kind','plugin'],{timeout:60000}),
    async load_plugin(manifest:any){
      const entry=url.pathToFileURL(path.join(manifest.dir,'main.js'));entry.searchParams.set('v',manifest.revision);
      const module=await import(entry.href);
      if(disposed)throw Error('插件服务已经关闭。');
      if(typeof module.default!=='function')throw Error('插件没有导出可用的默认构造函数。');
      let instance:any;const created=new Set<any>();construction_scope=created;
      try {instance=new module.default(core.app,manifest);}
      catch(error){for(const value of created)await value.unload();throw error;}
      finally{construction_scope=undefined;}
      if(!(instance instanceof core.Plugin))throw Error('插件未继承社区v2 Plugin API。');
      try{if(fs.existsSync(path.join(manifest.dir,'styles.css')))instance.registerCss('styles.css');await instance.load();return instance;}
      catch(error){await instance.unload();throw error;}
    },
    unload_plugin:(instance:any)=>instance.unload(),
  });
  const style=acquire_workspace_style('typora-code-style:community_plugins',css);
  runtime[abi_key]=abi;
  const show_settings=(id:string)=>{
    const registered=[...(tabs.get(id)||[])];if(!registered.length)return;
    let release:()=>void=()=>{};
    const dialog=workspace_dialog('插件设置', '关闭',()=>{for(const tab of registered){tab.hide();tab.containerEl.remove();}release();dialogs.delete(dialog);});
    dialog.content.classList.add('workspace-community-settings');release=acquire_workspace_interaction(dialog.content).remove;
    dialogs.add(dialog);
    for(const tab of registered){dialog.content.append(workspace_element('h4','',tab.name||id),tab.containerEl);tab.show();}
  };
  let manager:ReturnType<typeof workspace_dialog>|undefined;
  const open_manager=()=>{
    if(manager){manager.root.querySelector<HTMLElement>('button')?.focus();return;}
    let alive=true,busy=false,mode='installed',catalog:any[]=[];
    const dialog=workspace_dialog('社区插件','关闭',()=>{alive=false;unsubscribe();dialogs.delete(dialog);manager=undefined;});manager=dialog;dialogs.add(dialog);
    dialog.content.classList.add('workspace-community-manager');
    const explanation=workspace_element('p','','插件拥有Typora进程权限。安装后默认停用，仅启用你信任的插件；工作台更新与Typora官方更新分别管理。');
    const toolbar=workspace_element('div','workspace-community-toolbar'),search=workspace_element('input'),message=workspace_element('p','workspace-community-message'),list=workspace_element('div','workspace-community-list');
    search.type='search';search.placeholder='搜索插件';search.setAttribute('aria-label','搜索插件');
    const run=async(action:()=>Promise<unknown>)=>{if(busy||!alive)return;busy=true;message.textContent='正在处理…';render();try{const result=await action();if(alive)message.textContent=typeof result==='string'?result:'操作完成。已运行插件的新版在正常重启后生效。';}catch(error){if(alive)message.textContent=String((error as Error).message||error);}finally{busy=false;if(alive)render();}};
    const installed=workspace_button('已安装',()=>{mode='installed';render();});
    const community=workspace_button('社区目录',()=>void run(async()=>{catalog=await service.catalog();mode='catalog';}));
    const picker=workspace_element('input');picker.type='file';picker.accept='.zip';picker.hidden=true;
    picker.onchange=()=>{const file=picker.files?.[0] as any;if(!file)return;const archive=file.path||runtime.reqnode('electron').webUtils?.getPathForFile(file);picker.value='';if(!archive){message.textContent='无法取得所选文件路径。';return;}void run(()=>service.install_archive(archive));};
    const local=workspace_button('安装本地ZIP…',()=>picker.click());
    toolbar.append(installed,community,local,search,picker);dialog.content.append(explanation,toolbar,message,list);
    const render=()=>{
      if(!alive)return;for(const node of [installed,community,local])node.disabled=busy;
      installed.setAttribute('aria-pressed',String(mode==='installed'));community.setAttribute('aria-pressed',String(mode==='catalog'));
      list.replaceChildren();let rows:any[]=[];
      try{rows=mode==='installed'?service.list():catalog;}catch(error){message.textContent=String((error as Error).message);return;}
      const installed_rows=service.list(),needle=search.value.trim().toLocaleLowerCase();
      for(const info of rows.filter(row=>(row.name+' '+row.id+' '+(row.description||'')).toLocaleLowerCase().includes(needle))){
        const row=workspace_element('section','workspace-community-row'),details=workspace_element('div');
        details.append(workspace_element('strong','',info.name),workspace_element('p','',info.description||info.id));
        const current=installed_rows.find((item:any)=>item.id===info.id),actions=workspace_element('div','workspace-community-actions');
        if(current){
          details.append(workspace_element('p','',current.error||`${current.version||''} · ${current.running?'已启用':current.enabled?'启用失败':'已停用'}${current.restart_required?' · 新版等待重启':''}`));
          actions.append(workspace_button(current.enabled?'停用':'信任并启用',()=>void run(()=>service.set_enabled(info.id,!current.enabled))));
          if(tabs.get(info.id)?.size)actions.append(workspace_button('设置',()=>show_settings(info.id)));
          actions.append(workspace_button('检查并更新',()=>void run(async()=>{const release=await service.latest(current);if(api.compare_version(release.version,current.version)<=0)return '已是最新版本。';await service.install_online(current);})),workspace_button('卸载',()=>void run(async()=>{await service.uninstall(info.id);return '已卸载；个人设置和运行中窗口可能引用的包缓存保留。';})));
        }else actions.append(workspace_button('安装',()=>void run(()=>service.install_online(info))));
        for(const button of actions.querySelectorAll('button'))button.disabled=busy;
        row.append(details,actions);list.append(row);
      }
      if(!list.children.length)list.append(workspace_element('p','','没有匹配的插件。'));
    };
    const unsubscribe=service.subscribe(render);search.oninput=render;render();
  };
  const binding={service,open_manager,register_setting_tab(id:string,tab:any){
    let registered=tabs.get(id);if(!registered){registered=new Set();tabs.set(id,registered);}registered.add(tab);tab.load();
    return()=>{tab.hide();tab.unload();tab.containerEl.remove();registered!.delete(tab);if(!registered!.size)tabs.delete(id);};
  }};
  core.app.community_plugins=binding;
  const unregister=core.app.commands.register({id:'typora_code:community_plugins',title:'管理社区插件',scope:'global',callback:open_manager});
  // 不等待第三方代码，不影响基础工作台ready；逐插件加载失败在管理页报告。
  let start_frame=requestAnimationFrame(()=>{start_frame=requestAnimationFrame(()=>{if(!disposed)void service.start().catch((error:Error)=>{console.error(error);if(!disposed)new core.Notice('社区插件加载失败：'+error.message);});});});
  return {dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(start_frame);abort.abort();unregister();for(const dialog of [...dialogs])dialog.close(false);void service.dispose().catch(console.error);style.remove();if(core.app.community_plugins===binding)delete core.app.community_plugins;if(runtime[abi_key]===abi){if(previous_abi)runtime[abi_key]=previous_abi;else delete runtime[abi_key];}}};
}
