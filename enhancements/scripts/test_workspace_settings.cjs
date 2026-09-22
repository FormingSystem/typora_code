const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'typora-settings-')));app.disableHardwareAcceleration();
let win;
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:900,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,offscreen:true}});
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<style>html,body{height:100%;margin:0;--bg-color:white;--text-color:black}#group{height:100%}</style><div id=group></div>'));
 const ev=source=>win.webContents.executeJavaScript(source);
 const built=await require('esbuild').build({stdin:{contents:`export {bind_workspace_settings_view} from './src/workspace_settings_view';export {bind_workspace_settings_sections} from './src/workspace_settings_sections';export * from './src/workspace_settings_registry';export * from './src/workspace_editor_settings';export * from './src/remote_ssh_settings';`,resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'qa',loader:{'.css':'text'}});await ev(built.outputFiles[0].text);
 const checks=await ev(`(async()=>{
  const checks=[],assert=(v,m)=>{if(!v)throw Error(m);checks.push(m)},values=new Map(),factories=new Map(),commands=new Map(),leaves=[];
  window.reqnode=require;window.current_root='C:/fixture/one';window.native_calls=0;window.ClientCommand={showPreferencePanel(){native_calls++}};
  const settings={get:k=>values.get(k),set_and_save(k,v){if(window.fail_save)throw Error('磁盘不可写');values.set(k,v);}};
  const group={containerEl:document.querySelector('#group'),appendChild(leaf){leaves.push(leaf);this.containerEl.replaceChildren(leaf.view.containerEl);leaf.view.onOpen();},toggleTab(uri){const leaf=leaves.find(v=>v.state.path===uri);this.containerEl.replaceChildren(leaf.view.containerEl);leaf.view.onOpen();return leaf;}};
  const core={WorkspaceView:class{constructor(leaf){this.leaf=leaf}},app:{settings,commands:{register(c){commands.set(c.id,c.callback);return()=>commands.delete(c.id)},run(id){commands.get(id)?.()}},viewManager:{registerView(id,factory){factories.set(id,factory);return()=>factories.delete(id)}},workspace:{activeLeaf:{parent:group,state:{path:'local.md'}},eachLeaves(fn){leaves.forEach(fn)},createLeaf(data){const leaf={...data,parent:group};leaf.view=factories.get(data.type)(leaf);return leaf;}}}};
  window[Symbol.for('typora-code:workspace')]=core;
  const sections=qa.bind_workspace_settings_sections({context_root:()=>current_root}),binding=qa.bind_workspace_settings_view(core);binding.show();
  const setting=(key)=>document.querySelector('[data-setting="'+key+'"]'),change=(key,value)=>{const input=setting(key);assert(input,'存在设置 '+key);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new Event('change'));};
  assert(document.querySelector('.workspace-settings-modal[role=dialog]'),'设置为独立浮动窗口');binding.show();assert(document.querySelectorAll('.workspace-settings-modal').length===1&&leaves.length===0,'重复打开复用窗口，不改动原编辑组');
  change('editor.enable_preview',false);assert(!qa.read_workspace_editor_settings().enable_preview,'修改保存至原所有者');
  setting('editor.enable_preview').closest('.workspace-setting-row').querySelector('button').click();assert(qa.read_workspace_editor_settings().enable_preview,'单项恢复默认');
  window.fail_save=true;change('editor.enable_preview',false);assert(qa.read_workspace_editor_settings().enable_preview&&document.querySelector('.workspace-settings-status').textContent.includes('磁盘'),'保存失败保持配置');window.fail_save=false;
  change('ssh.connect_timeout','0');assert(qa.read_remote_ssh_settings().connect_timeout===15,'SSH无效配置拒绝');
  change('ssh.connect_timeout','25');assert(qa.read_remote_ssh_settings().connect_timeout===25,'SSH配置真实持久化');
  window.current_root='C:/fixture/two';change('outline.compile_commands_dir','build');assert(!values.get('source_outline'),'旧工作区表单不得写新工作区');
  const search=document.querySelector('.workspace-settings>input');search.value='connect_timeout';search.dispatchEvent(new Event('input'));assert(document.querySelectorAll('.workspace-setting-row').length===1,'按配置键搜索');search.value='';search.dispatchEvent(new Event('input'));
  document.querySelector('[data-settings-owner=native]').click();assert(native_calls===1,'原生层调用宿主接口');
  let plugins=0;commands.set('typora_code:community_plugin_settings',()=>plugins++);document.querySelector('[data-settings-owner=community]').click();assert(plugins===1,'社区层保留原SettingTab入口');
  assert(!document.querySelector('[data-settings-layer]'),'无三页重复入口');window.dispatchEvent(new KeyboardEvent('keydown',{key:',',ctrlKey:true,bubbles:true,cancelable:true}));assert(document.querySelectorAll('.workspace-settings-modal').length===1,'Ctrl+,复用唯一设置窗口');const theme=document.createElement('style');theme.textContent='h2{color:blue;font-size:40px;border-bottom:1px solid}';document.head.append(theme);assert(getComputedStyle(document.querySelector('.workspace-settings-body h2')).fontSize==='26px'&&getComputedStyle(document.querySelector('.workspace-settings-body h2')).color==='rgb(0, 0, 0)','设置标题不受Markdown主题污染');
  for(let i=0;i<100;i++){const release=qa.register_workspace_settings({id:'test',title:'动态',scope:()=> '用户',defaults:{enabled:true},fields:[{key:'enabled',title:'动态开关'}],read:()=>({enabled:true}),write(){}});assert(qa.workspace_settings_sections().some(s=>s.id==='test'),'注册 '+i);release();}
  assert(!qa.workspace_settings_sections().some(s=>s.id==='test'),'注销清理');
  change('editor.wrap_tabs',true);change('editor.link_preview_enabled',false);change('editor.enable_preview',false);assert(qa.read_workspace_editor_settings().wrap_tabs&&!qa.read_workspace_editor_settings().link_preview_enabled,'编辑器设置独立保存');
  const modal=document.querySelector('.workspace-settings-modal'),maximize=modal.querySelector('[data-settings-maximize]');maximize.click();assert(modal.classList.contains('is-maximized'),'设置最大化');maximize.click();assert(!modal.classList.contains('is-maximized'),'设置还原');
  for(const width of [300,600]){modal.querySelector('.git-graph-dialog').style.width=width+'px';const content=document.querySelector('.workspace-settings');assert(content.scrollWidth<=Math.max(400,width)+1,'窄设置窗口无横向溢出 '+width+' '+content.scrollWidth+' '+content.clientWidth+' '+modal.querySelector('.git-graph-dialog').clientWidth);}
  modal.querySelector('.workspace-dialog-close').click();assert(!document.querySelector('.workspace-settings-modal'),'右上关闭释放窗口');binding.show();

  binding.dispose();sections.dispose();assert(qa.workspace_settings_sections().length===0&&factories.size===0,'全部释放');return checks;
 })()`);
 assert(checks.length>110);console.log(JSON.stringify({status:'PASS',assertions:checks.length,checks}));win.destroy();app.quit();
}).catch(error=>{console.error(error);win?.destroy();app.exit(1)});
