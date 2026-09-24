import {read_network_settings} from './workspace_network_settings';
import {workspace_button,workspace_element} from './workspace_widgets';
import {acquire_workspace_interaction} from './workspace_interaction';
import {acquire_workspace_style} from './workspace_styles';
import {git_icon} from './git_icons';
import {create_community_plugin_settings} from './community_plugin_settings';
import css from './community_plugins.css';

/** 同一个工作台的公共ABI；兼容社区旧版ES5构造函数的 Parent.apply(this) 调用。 */
export function community_constructor(base:any,on_construct?:(value:any)=>void){
  const compatible=function(this:any,...args:any[]){const value=Reflect.construct(base,args,new.target||this.constructor);on_construct?.(value);return value;};
  compatible.prototype=base.prototype;Object.setPrototypeOf(compatible,base);return compatible;
}

/** 社区设置采用JSON持久化；隔离默认对象，并兼容旧插件修改同一引用后set。 */
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
  if(runtime[abi_key]&&runtime[abi_key].app!==core.app)throw Error('检测到另一个社区核心；请停用旧核心后重新打开。');
  const previous_abi=runtime[abi_key],abi={...core};
  let construction_scope:Set<any>|undefined;
  for(const name of ['Plugin','PluginSettings','I18n','Events','WorkspaceRibbon','Sidebar','StatisticHandler','StatisticContext','ExportProcessor','HtmlExportProcessor','CodeblockExportProcessor','Component','SettingTab','SettingItem','View','Modal','SidebarPanel','WorkspaceView','PostProcessor','HtmlPostProcessor','CodeblockPostProcessor','EditorSuggest','TextSuggest'])if(core[name])abi[name]=community_constructor(core[name],name==='Plugin'?value=>construction_scope?.add(value):undefined);
  if(core.PluginSettings)abi.PluginSettings=community_constructor(community_settings_class(core.PluginSettings));
  const fs=runtime.reqnode('fs'),path=runtime.reqnode('path'),url=runtime.reqnode('url');
  const asset_root=path.join(runtime._options.userDataPath,'typora_code');
  const api=runtime.reqnode(path.join(asset_root,'assets/plugins/community_plugin_service.cjs'));
  const network=runtime.reqnode(path.join(asset_root,'assets/update/workspace_update_service.cjs'));

  const abort=new AbortController();let disposed=false;
  const service=api.create_community_service({
    root:path.join(asset_root,'community'),acquire_lock:()=>network.acquire_update_lock(path.join(asset_root,'community')),host_version:runtime._options.appVersion,
    request:(address:string,options:any)=>network.download(address,{...options,signal:abort.signal,network:read_network_settings()}),
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
  let refresh_manager=()=>{};
  const settings=create_community_plugin_settings(()=>service.list(),()=>refresh_manager(),mode=>{open_manager();manager?.select(mode);});
  const create_manager=()=>{
    let alive=true,busy=false,mode=service.list().length?'installed':'catalog',catalog:any[]=[],catalog_loaded=false;
    const content=workspace_element('div','workspace-community-manager');
    const interaction=acquire_workspace_interaction(content);
    const explanation=workspace_element('p','','使用 typora-community-plugin 社区插件。安装后默认停用；插件拥有 Typora 进程权限，仅启用你信任的插件。已有工作台功能保持当前配置。');
    const toolbar=workspace_element('div','workspace-community-toolbar'),search=workspace_element('input'),message=workspace_element('p','workspace-community-message'),list=workspace_element('div','workspace-community-list');
    search.type='search';search.placeholder='搜索名称、描述或作者';search.setAttribute('aria-label','搜索插件');message.setAttribute('role','status');
    const run=async(action:()=>Promise<unknown>)=>{if(busy||!alive)return;busy=true;message.textContent='正在处理…';render();try{const result=await action();if(alive)message.textContent=typeof result==='string'?result:'操作完成。';}catch(error){if(alive)message.textContent=String((error as Error).message||error);}finally{busy=false;if(alive)render();}};
    const installed=workspace_button('已安装',()=>select('installed'));
    const load_catalog=()=>run(async()=>{catalog=await service.catalog();catalog_loaded=true;return `已加载 ${catalog.length} 个社区插件。`;});
    const select=(next:string)=>{mode=next;search.value='';message.textContent='';render();if(mode==='catalog'&&!catalog_loaded)void load_catalog();};
    const community=workspace_button('社区插件市场',()=>select('catalog'));
    const refresh=workspace_button('刷新目录',()=>void load_catalog());
    const picker=workspace_element('input');picker.type='file';picker.accept='.zip';picker.hidden=true;
    picker.onchange=()=>{const file=picker.files?.[0] as any;if(!file)return;const archive=file.path||runtime.reqnode('electron').webUtils?.getPathForFile(file);picker.value='';if(!archive){message.textContent='无法取得所选文件路径。';return;}void run(async()=>{const info=await service.install_archive(archive);mode='installed';search.value='';return `已安装 ${info.name}。${info.enabled?'已启用插件的更新在正常重启后生效。':'点击“信任并启用”后使用；提供配置的插件会显示“设置”。'}`;});};
    const local=workspace_button('安装本地ZIP…',()=>picker.click());
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
        const metadata=workspace_element('p','workspace-community-meta',`${info.author||'作者未提供'}${info.platforms?.length?' · '+info.platforms.map((platform:string)=>({win32:'Windows',darwin:'macOS',linux:'Linux'}[platform]||platform)).join(' / '):''}`);
        details.append(metadata);
        if(/^[\w.-]+\/[\w.-]+$/.test(info.repo||'')){
          const source=workspace_element('a','workspace-community-source','项目说明');source.href='https://github.com/'+info.repo;source.title=source.href;
          source.onclick=event=>{event.preventDefault();void runtime.reqnode('electron').shell.openExternal(source.href).catch((error:Error)=>{if(alive)message.textContent='打开项目说明失败：'+error.message;});};details.append(source);
        }
        const current=installed_rows.find((item:any)=>item.id===info.id),actions=workspace_element('div','workspace-community-actions');
        if(current){
          details.append(workspace_element('p','',current.error||`${current.version||''} · ${current.running?'已启用':current.enabled?'启用失败':'已停用'}${current.restart_required?' · 新版等待重启':''}`));
          actions.append(workspace_button(current.enabled?'停用':'信任并启用',()=>void run(async()=>{const enable=!current.enabled;await service.set_enabled(info.id,enable);return !enable?'已停用，插件注册的功能和设置已卸载。':`已启用 ${info.name}。${settings.has(info.id)?'点击“设置”配置此插件。':'此插件未提供设置页。'}`;})));
          const configure=workspace_button('设置',()=>settings.show(info.id));configure.dataset.unavailable=String(!settings.has(info.id));configure.title=settings.has(info.id)?'打开插件提供的设置页':current.running?'此插件未提供设置页':'启用插件后加载其设置页';actions.append(configure);
          actions.append(workspace_button('检查并更新',()=>void run(async()=>{const release=await service.latest(current);if(api.compare_version(release.version,current.version)<=0)return '已是最新版本。';await service.install_online(current);return current.running?'新版已安装，正常重启后生效。':'新版已安装。';})),workspace_button('卸载',()=>void run(async()=>{await service.uninstall(info.id);return '已卸载；个人设置和运行中窗口可能引用的包缓存保留。';})));
        }else {
          const install=workspace_button('安装',()=>void run(async()=>{const result=await service.install_online(info);mode='installed';search.value=info.id;return `已安装 ${result?.name||info.name}，默认停用。点击“信任并启用”后使用插件。`;}));
          if(info.platforms?.length&&!info.platforms.includes(runtime.reqnode('process').platform)){install.dataset.unavailable='true';install.title='此插件不支持当前系统';}
          actions.append(install);
        }
        for(const button of actions.querySelectorAll('button'))button.disabled=busy||button.dataset.unavailable==='true';
        row.append(details,actions);list.append(row);
      }
      if(!list.children.length){
        list.append(workspace_element('p','',busy?'正在加载…':needle?'没有匹配的插件。':mode==='catalog'?'社区目录尚未加载，请刷新目录重试。':'尚未安装社区插件。'));
        if(mode==='installed'&&!needle)list.append(workspace_button('浏览社区插件市场',()=>select('catalog')));
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
      super();this.addRibbonButton({id:'typora_code:community_plugins',title:'扩展 (Ctrl+Shift+X)',icon:git_icon('extensions'),group:'top'});
      const title=workspace_element('div','workspace-community-title','扩展');title.setAttribute('role','heading');title.setAttribute('aria-level','2');this.containerEl.append(title);
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
  const unregister=core.app.commands.register({id:'typora_code:community_plugins',title:'管理社区插件',scope:'global',callback:open_manager});
  const unregister_settings=core.app.commands.register({id:'typora_code:community_plugin_settings',title:'插件设置',scope:'global',callback:binding.open_settings});
  // 不等待第三方代码，不影响基础工作台ready；逐插件加载失败在管理页报告。
  let start_frame=requestAnimationFrame(()=>{start_frame=requestAnimationFrame(()=>{if(!disposed)void service.start().catch((error:Error)=>{console.error(error);if(!disposed)new core.Notice('社区插件加载失败：'+error.message);});});});
  return {dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(start_frame);abort.abort();unregister();unregister_settings();remove_panel();panel.onhide();manager?.dispose();settings.dispose();void service.dispose().catch(console.error);style.remove();if(core.app.community_plugins===binding)delete core.app.community_plugins;if(runtime[abi_key]===abi){if(previous_abi)runtime[abi_key]=previous_abi;else delete runtime[abi_key];}}};
}
