const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_terminal_panel_'));app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();
let win;const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=async source=>{const result=await win.webContents.executeJavaScript('(async()=>{try{return {value:await (0,eval)('+JSON.stringify(source)+')}}catch(error){return {error:error.stack}}})()');if(result.error)throw new Error(result.error);return result.value;};
const wait=async source=>{for(let index=0;index<120;index++){if(await evaluate(source))return;await delay(50);}throw new Error('Timed out: '+source);};
const open_profiles=async()=>{await evaluate('document.querySelector(".terminal-panel-actions button[title=选择终端配置]").click();void 0');await wait('Boolean(document.querySelector("[data-action=terminal_profile_cmd]"))');};
const click_menu=async title=>{await evaluate('[...document.querySelectorAll(".git-graph-menu button")].find(node=>node.querySelector(".git-menu-label")?.textContent==='+JSON.stringify(title)+').click();void 0');};
const open_settings=async()=>{await evaluate('commands.get("linux_note:terminal_settings").callback();void 0');await wait('Boolean(document.querySelector("[data-setting=profile]"))');};
const dialog_action=async title=>{await evaluate('[...document.querySelectorAll(".git-graph-dialog-footer button")].find(node=>node.textContent==='+JSON.stringify(title)+').click();void 0');};
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  const html=path.join(root,'fixture.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:#fff;color:#333}.typ-workspace-root{position:absolute;left:220px;right:0;top:35px;bottom:24px}.ty-footer{position:absolute;bottom:0;left:220px;height:24px;width:980px}</style><main class="typ-workspace-root">UNSAVED_DOCUMENT</main><footer class="ty-footer">status</footer>');await win.loadFile(html);
  const pty_mock=`export function start_terminal_pty(runtime,request,callbacks){return new Promise((resolve,reject)=>{const record={request,callbacks,killed:0,writes:[],sizes:[],proxy:{pid:4000+window.pty_starts.length,write(data){record.writes.push(data)},resize(cols,rows){record.sizes.push([cols,rows])},acknowledge(){},kill(){record.killed++}},ready(){resolve(record.proxy)}};window.pty_starts.push(record);runtime.signal.addEventListener('abort',()=>{record.killed++;reject(new Error('aborted'))},{once:true});});}`;
  // 探测边界可控；使用真实设置、菜单、会话和显示代码，避免依赖测试机装了哪些 Shell。
  const discovery_mock=`export function create_terminal_profile_service(){
    const record={values:[],pending:undefined,scans:0,disposed:false,complete:undefined};
    const refresh=()=>{if(record.pending)return record.pending;record.scans++;record.pending=new Promise(resolve=>{record.complete=values=>{record.values=structuredClone(values);record.pending=undefined;resolve(structuredClone(record.values));};});return record.pending;};
    window.profile_scans.push(record);refresh();
    return {warnings:()=>[],profiles:()=>structuredClone(record.values),ready:()=>record.pending||Promise.resolve(structuredClone(record.values)),refresh,dispose(){record.disposed=true;}};
  }`;
  const bundle=await build({stdin:{contents:'export {bind_terminal_workspace} from "./src/terminal_workspace";export {read_terminal_state} from "./src/terminal_state";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'panel_api',loader:{'.css':'text'},write:false,plugins:[{name:'terminal-fixture',setup(build){
    build.onLoad({filter:/terminal_pty_client\.ts$/},()=>({contents:pty_mock,loader:'js'}));
    build.onLoad({filter:/terminal_profile_detection\.ts$/},()=>({contents:discovery_mock,loader:'js'}));
  }}]});await evaluate(bundle.outputFiles[0].text);
  const profiles=[
    {id:'cmd',title:'Command Prompt',executable:path.join(root,'cmd.exe'),args:[]},
    {id:'pwsh',title:'PowerShell',executable:path.join(root,'PowerShell','pwsh.exe'),args:['-NoLogo']},
    {id:'git_bash',title:'Git Bash',executable:path.join(root,'Git','bin','bash.exe'),args:['--login','-i']},
  ];
  const custom={id:'project_shell',title:'项目 Shell',executable:path.join(root,'custom_shell.exe'),args:['argument with spaces','plain'],env:{PANEL_FIXTURE:'custom'}};
  const wsl={id:'wsl:Ubuntu',title:'Ubuntu (WSL)',executable:path.join(root,'wsl.exe'),args:['--distribution','Ubuntu'],wsl:true};
  await evaluate(`window.pty_starts=[];window.profile_scans=[];window.commands=new Map();window.factories=new Map();window.leaves=[];window.reqnode=require;window._options={userDataPath:${JSON.stringify(root)}};
    localStorage.setItem('linux-note-terminal:v1:',JSON.stringify({profiles:[${JSON.stringify(custom)}]}));
    window.parent_group={appendChild(leaf){leaves.push(leaf);document.querySelector('.typ-workspace-root').append(leaf.view.containerEl);leaf.view.onOpen()},toggleTab(uri){const leaf=leaves.find(item=>item.state.path===uri);leaf.view.onOpen();return leaf},removeTab(uri){const index=leaves.findIndex(item=>item.state.path===uri);if(index>=0){const leaf=leaves.splice(index,1)[0];leaf.view.onClose();leaf.view.containerEl.remove();core.app.workspace.activeLeaf=original_leaf;}}};
    window.original_leaf={state:{path:'draft.md'},parent:parent_group};
    window.core={WorkspaceView:class{constructor(leaf){this.leaf=leaf}},app:{viewManager:{registerView(id,factory){factories.set(id,factory);return()=>factories.delete(id)}},commands:{register(command){commands.set(command.id,command);return()=>commands.delete(command.id)},run(id){commands.get(id)?.callback()}},workspace:{activeLeaf:original_leaf,eachLeaves(callback){leaves.forEach(callback)},createLeaf({type,state}){const leaf={state,parent:parent_group};leaf.view=factories.get(type)(leaf);return leaf},on(){return()=>{}},ribbon:{addButton(){return()=>{}}}}}};
    window.host={core,fs:require('node:fs'),path_api:require('node:path'),process_api:process,copy:async text=>window.copied=text,context_path:()=>${JSON.stringify(root)},workspace_path:()=>${JSON.stringify(root)},runner:()=>({run:async()=>${JSON.stringify(root)}})};
    window.binding=panel_api.bind_terminal_workspace(host);window.pending_open=binding.open(${JSON.stringify(root)},'cmd');void 0;`);
  assert(await evaluate('profile_scans.length===1&&profile_scans[0].scans===1&&pty_starts.length===0'));
  await evaluate('commands.get("linux_note:terminal_settings").callback();void 0');
  assert(await evaluate('Boolean(document.querySelector("[role=dialog]"))&&!document.querySelector(".terminal-settings-form")'));
  await dialog_action('关闭');
  await evaluate(`profile_scans[0].complete(${JSON.stringify(profiles)});void 0`);
  await evaluate('(async()=>{window.first=await pending_open;return Boolean(first)})()');
  await wait('pty_starts.length===1&&document.querySelector(".typora-terminal-panel").getBoundingClientRect().height>200');
  assert(await evaluate('!document.querySelector("[role=dialog]")&&profile_scans[0].scans===1'));
  assert.equal(await evaluate('pty_starts[0].request.executable'),profiles[0].executable);
  assert(await evaluate('core.app.workspace.activeLeaf===original_leaf&&document.querySelector(".terminal-tabs").hidden'));
  assert(await evaluate('Math.abs(document.querySelector(".typ-workspace-root").getBoundingClientRect().bottom-document.querySelector(".typora-terminal-panel").getBoundingClientRect().top)<2'));
  await evaluate('pty_starts[0].ready();void 0');await wait('first.session.state==="running"');
  await evaluate('pty_starts[0].callbacks.data("KEEP_OUTPUT\\r\\n");void 0');await delay(100);
  assert(await evaluate('panel_api.read_terminal_state(core.app).active_id===first.session.id&&panel_api.read_terminal_state(core.app).panel_visible'),'menu state reads coordinator session and panel');
  await evaluate('binding.toggle();void 0');assert(await evaluate('!panel_api.read_terminal_state(core.app).panel_visible'),'menu state follows external hide');assert(await evaluate('document.querySelector(".typora-terminal-panel").hidden&&pty_starts[0].killed===0'));
  await evaluate('binding.toggle();commands.get("linux_note:terminal_split").callback();void 0');await wait('pty_starts.length===2');
  assert(await evaluate('!document.querySelector(".terminal-tabs").hidden&&document.querySelectorAll(".terminal-split-group:not([hidden])>.linux-note-terminal").length===2'));
  await evaluate('pty_starts[1].ready();void 0');await delay(100);
  await evaluate('commands.get("linux_note:terminal_move_editor").callback();void 0');await wait('leaves.length===1');assert(await evaluate('pty_starts.every(item=>item.killed===0)'));
  await evaluate('commands.get("linux_note:terminal_move_panel").callback();void 0');await wait('leaves.length===0');assert(await evaluate('pty_starts.length===2&&pty_starts.every(item=>item.killed===0)'));
  await open_settings();
  const before=await evaluate('localStorage.getItem("linux-note-terminal:v1:")');
  await evaluate('document.querySelector("[data-setting=font_size]").value="101";void 0');await dialog_action('应用');
  assert(await evaluate('Boolean(document.querySelector(".terminal-settings-error").textContent)'));assert.equal(await evaluate('localStorage.getItem("linux-note-terminal:v1:")'),before);
  await evaluate('document.querySelector("[data-setting=font_size]").value="18";void 0');await dialog_action('应用');await wait('!document.querySelector("[role=dialog]")');assert.equal(await evaluate('first.surface.term.options.fontSize'),18);
  await evaluate('commands.get("linux_note:terminal_restart").callback();void 0');await wait('pty_starts.length===3');
  await evaluate('commands.get("linux_note:terminal_restart").callback();void 0');await wait('pty_starts.length===4');assert(await evaluate('pty_starts[1].killed===1&&pty_starts[2].killed===1'));
  await evaluate('pty_starts[2].ready();pty_starts[3].ready();void 0');await delay(100);
  const button_box=await evaluate('(()=>{const b=document.querySelector(".terminal-panel-actions button").getBoundingClientRect();return {w:b.width,h:b.height}})()');assert.deepEqual(button_box,{w:22,h:22});

  // 新建菜单、默认配置与实际启动共用发现结果；不存在的静态候选不能冒充可用 Shell。
  await open_profiles();
  const menu_profiles=await evaluate('[...document.querySelectorAll(".git-graph-menu [data-action^=terminal_profile_]")].map(node=>({id:node.dataset.action.slice("terminal_profile_".length),title:node.querySelector(".git-menu-label").textContent}))');
  assert.deepEqual(menu_profiles,[...profiles,custom].map(({id,title})=>({id,title})));
  assert(!JSON.stringify(menu_profiles).includes('需已安装'));assert(!JSON.stringify(menu_profiles).includes('需在 PATH'));
  await click_menu('Git Bash');await wait('pty_starts.length===5');
  assert.deepEqual(await evaluate('({executable:pty_starts[4].request.executable,args:pty_starts[4].request.args})'),{executable:profiles[2].executable,args:profiles[2].args});
  await evaluate('pty_starts[4].ready();void 0');
  await open_profiles();await click_menu('选择默认配置…');await wait('Boolean(document.querySelector("[data-setting=profile]"))');
  assert.deepEqual(await evaluate('[...document.querySelector("[data-setting=profile]").options].filter(item=>item.value).map(item=>({id:item.value,title:item.textContent}))'),menu_profiles);
  assert.equal(await evaluate('profile_scans[0].scans'),1);
  await evaluate('document.querySelector("[data-setting=profile]").value="git_bash";void 0');await dialog_action('应用');
  await evaluate('commands.get("linux_note:terminal").callback();void 0');await wait('pty_starts.length===6');
  assert.equal(await evaluate('pty_starts[5].request.executable'),profiles[2].executable);await evaluate('pty_starts[5].ready();void 0');
  await open_profiles();await click_menu('项目 Shell');await wait('pty_starts.length===7');
  assert.deepEqual(await evaluate('({executable:pty_starts[6].request.executable,args:pty_starts[6].request.args,env:pty_starts[6].request.options.env.PANEL_FIXTURE})'),{executable:custom.executable,args:custom.args,env:'custom'});await evaluate('pty_starts[6].ready();void 0');

  const kept_processes=await evaluate('pty_starts.map(item=>item.killed)');
  await open_profiles();await click_menu('重新检测终端');
  assert(await evaluate('profile_scans[0].scans===2&&Boolean(profile_scans[0].pending)&&pty_starts.length===7'));
  await evaluate(`profile_scans[0].complete(${JSON.stringify([...profiles,wsl])});void 0`);
  await wait('[...document.querySelectorAll(".git-graph-menu [data-action]")].some(node=>node.dataset.action==="terminal_profile_wsl:Ubuntu")');
  assert.deepEqual(await evaluate('pty_starts.map(item=>item.killed)'),kept_processes);
  await click_menu('Ubuntu (WSL)');await wait('pty_starts.length===8');
  assert.deepEqual(await evaluate('({executable:pty_starts[7].request.executable,args:pty_starts[7].request.args})'),{executable:wsl.executable,args:[...wsl.args,'--cd',root]});await evaluate('pty_starts[7].ready();void 0');
  await open_settings();assert(await evaluate('[...document.querySelector("[data-setting=profile]").options].some(item=>item.value==="wsl:Ubuntu")'));await dialog_action('关闭');

  // 菜单关闭后迟到的扫描不再弹出；失效默认仍显示原选择，不能偷偷改为自动模式。
  await open_profiles();await click_menu('重新检测终端');assert.equal(await evaluate('profile_scans[0].scans'),3);
  await evaluate('document.querySelector(".git-graph-menu").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));void 0');
  await evaluate(`profile_scans[0].complete(${JSON.stringify([profiles[0],profiles[1],wsl])});void 0`);await delay(50);
  assert(await evaluate('!document.querySelector(".git-graph-menu")'));
  await evaluate('(async()=>{window.missing_default=await binding.open('+JSON.stringify(root)+');return missing_default===undefined})()');
  assert(await evaluate('missing_default===undefined&&pty_starts.length===8&&document.querySelector("[role=dialog]").textContent.includes("git_bash")'));
  await dialog_action('关闭');await open_settings();
  assert(await evaluate('document.querySelector("[data-setting=profile]").value==="git_bash"&&document.querySelector("[data-setting=profile]").selectedOptions[0].textContent.includes("不可用")'));
  await evaluate('document.querySelector("[data-setting=font_size]").value="19";void 0');await dialog_action('应用');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("linux-note-terminal:v1:")).profile'),'git_bash');
  assert.equal(await evaluate('first.surface.term.options.fontSize'),19);
  fs.writeFileSync(path.join(root,'terminal_panel.png'),(await win.webContents.capturePage()).toPNG());

  // 设置自身刷新也共享扫描；关闭表单不会被完成回调重新挂回 DOM。
  await open_settings();await evaluate('[...document.querySelectorAll(".terminal-settings-form button")].find(node=>node.textContent==="重新检测终端").click();void 0');
  assert.equal(await evaluate('profile_scans[0].scans'),4);await dialog_action('关闭');
  await evaluate(`profile_scans[0].complete(${JSON.stringify([...profiles,wsl])});void 0`);await delay(50);
  assert(await evaluate('!document.querySelector("[role=dialog]")&&pty_starts.length===8'));

  // 探测期间仍允许用户选择；新结果不得恢复开始扫描时的旧选择。
  await open_settings();await evaluate('[...document.querySelectorAll(".terminal-settings-form button")].find(node=>node.textContent==="重新检测终端").click();document.querySelector("[data-setting=profile]").value="cmd";void 0');
  await evaluate(`profile_scans[0].complete(${JSON.stringify([...profiles,wsl])});void 0`);await delay(50);
  assert.equal(await evaluate('document.querySelector("[data-setting=profile]").value'),'cmd');await dialog_action('应用');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("linux-note-terminal:v1:")).profile'),'cmd');

  // 卸载时，菜单、设置、新建三个等待者不得在同一迟到结果后恢复 UI 或创建 PTY。
  await open_profiles();await click_menu('重新检测终端');
  await evaluate('commands.get("linux_note:terminal_settings").callback();window.pending_after_dispose=binding.open('+JSON.stringify(root)+',"cmd");void 0');
  assert(await evaluate('Boolean(document.querySelector(".git-graph-menu"))&&Boolean(document.querySelector("[role=dialog]"))&&profile_scans[0].scans===6'));
  await evaluate('binding.dispose();binding.dispose();void 0');
  await evaluate(`profile_scans[0].complete(${JSON.stringify(profiles)});void 0`);
  assert(await evaluate('(async()=>await pending_after_dispose===undefined)()'));await delay(50);
  assert(await evaluate('profile_scans[0].disposed&&pty_starts.length===8&&commands.size===0&&factories.size===0&&!document.querySelector(".typora-terminal-panel,.git-graph-menu,.git-graph-dialog-shade")&&document.querySelector(".typ-workspace-root").style.bottom===""&&pty_starts.every(item=>item.killed===1)'));
  assert(await evaluate('panel_api.read_terminal_state(core.app)===undefined'),'dispose releases menu state');
  console.log(JSON.stringify({status:'PASS',checks:['panel reserves editor space without changing active document','hidden panel keeps process','split session group and list','panel/editor moves preserve PTY','invalid config does not write','valid appearance updates existing session','rapid restart cancels pending launch','compact action geometry','initial async scan gates startup and respects closed settings','detected and custom profiles agree across menu/settings/launch','refresh adds WSL without stopping existing PTY','removed default is retained and cannot silently launch another shell','closed menu and settings reject late results','refresh preserves selections changed while detection is pending','cleanup cancels pending UI and restores root and every process'],evidence:root}));
}).catch(async error=>{console.error(error);process.exitCode=1;if(win){fs.writeFileSync(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());await evaluate('window.binding?.dispose()');}}).finally(()=>{win?.destroy();app.exit(process.exitCode||0)});
