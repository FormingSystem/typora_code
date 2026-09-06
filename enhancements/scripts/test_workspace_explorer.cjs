// 独立资源管理器测试：临时文件树、真实鼠标和按需读取；不访问用户工作目录。
const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {build} = require('esbuild');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_explorer_'));
const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
for (const name of ['.hidden', 'folder', 'large', 'node_modules']) fs.mkdirSync(path.join(workspace, name));
fs.writeFileSync(path.join(workspace, '.hidden', '.secret.c'), 'int hidden = 1;');
fs.writeFileSync(path.join(workspace, '.env.local'), 'VALUE=yes');
fs.writeFileSync(path.join(workspace, 'Dockerfile.dev'), 'FROM scratch');
fs.writeFileSync(path.join(workspace, 'archive.tar.gz'), Buffer.from([0x1f, 0x8b, 8]));
fs.writeFileSync(path.join(workspace, 'odd.unrecognized'), 'unknown source');
fs.writeFileSync(path.join(workspace, 'README.zh-CN.md'), '# Original');
fs.writeFileSync(path.join(workspace, 'folder', 'nested.d.ts'), 'declare const value: string;');
for (let index=0; index<2000; index++) fs.writeFileSync(path.join(workspace, 'large', 'entry_'+String(index).padStart(4,'0')+'.c'),'int x;');
const original = fs.readFileSync(path.join(workspace,'README.zh-CN.md'));
app.setPath('userData',path.join(root,'user_data')); app.disableHardwareAcceleration();
let test_window;
const delay = ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate = source=>test_window.webContents.executeJavaScript(source);
const wait = async source=>{for(let index=0;index<160;index++){if(await evaluate(source))return;await delay(25);}throw new Error('Timed out: '+source);};
app.whenReady().then(async()=>{
  test_window=new BrowserWindow({show:false,width:950,height:700,webPreferences:{contextIsolation:false,nodeIntegration:true,backgroundThrottling:false,offscreen:true}});
  // Typora 1.14.9 window.css 的原生规则：自建工具条不能被裸 header 固定到整个窗口顶部。
  const native_header_css='header{height:28px;position:fixed;top:0;left:0;right:0;z-index:900;display:-webkit-flex;display:flex;transition:.2s;background-color:inherit;font-size:14px;line-height:initial}.native-window header{height:0}.paint-border header{border:1px solid rgba(115,115,115,.86);border-bottom:0}';
  const page=path.join(root,'test.html');fs.writeFileSync(page,'<!doctype html><meta charset="utf-8"><style>'+native_header_css+'html,body{margin:0;height:100%;font-family:Arial}#ribbon{width:44px;position:absolute;left:0;top:0}.typ-ribbon-item{height:36px;cursor:pointer}#typora-sidebar{position:absolute;left:44px;width:320px;top:32px;bottom:0}#sidebar-content{position:absolute;inset:0}#editor{margin-left:380px}</style><div id="ribbon"><div class="typ-ribbon-item" data-id="core.file-explorer">文件</div><div class="typ-ribbon-item" data-id="core.outline">大纲</div></div><div id="typora-sidebar"><div id="sidebar-content"></div></div><textarea id="editor">原始文档内容</textarea>');await test_window.loadFile(page);
  const bundle=await build({stdin:{contents:'export {bind_workspace_explorer} from "./src/workspace_explorer";export {prepare_workspace_rename} from "./src/workspace_rename";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'explorer_qa',write:false});await evaluate(bundle.outputFiles[0].text);
  await evaluate(String.raw`(()=>{
    window.root_path=${JSON.stringify(workspace)};window.reads=[];window.opened=[];window.copied=[];window.watchers=0;window.native_clicks=0;window.active_path='';
    const native_fs=require('fs');window.reqnode=name=>name==='fs'?{promises:{...native_fs.promises,readdir:async(...args)=>{reads.push(args[0]);return native_fs.promises.readdir(...args);}},watch:()=>{watchers++;return{close:()=>watchers--,on(){}};}}:require(name);
    const listeners=new Map();
    window.sidebar={panels:[],isShown:false,activePanel:undefined,addPanel(panel){this.panels.push(panel)},removePanel(panel){this.panels=this.panels.filter(candidate=>candidate!==panel)},switch(kind){if(this.activePanel instanceof kind)this.toggle();else{this.hide();this.activePanel=this.panels.find(panel=>panel instanceof kind);this.show()}},show(){this.isShown=true;document.querySelector('#typora-sidebar').style.display='block';this.activePanel?.show()},hide(){this.isShown=false;document.querySelector('#typora-sidebar').style.display='none';this.activePanel?.hide()},toggle(){this.isShown?this.hide():this.show()}};
    class native_sidebar {constructor(){this.containerEl=document.createElement('div');this.ribbonButton={id:'core.file-explorer'}}show(){document.querySelector('#typora-sidebar').classList.add('active-tab-files')}hide(){document.querySelector('#typora-sidebar').classList.remove('active-tab-files')}}
    const native_panel=new native_sidebar();sidebar.addPanel(native_panel);sidebar.activePanel=native_panel;
    class panel {show(){document.querySelector('#sidebar-content').append(this.containerEl);this.onshow()}hide(){this.containerEl.remove();this.onhide()}}
    window.core={SidebarPanel:panel,app:{workspace:{sidebar,ribbon:{activeButton(id){window.active_button=id}},on(event,callback){listeners.set(event,callback);return()=>listeners.delete(event)}}}};
    document.querySelector('[data-id="core.file-explorer"]').onclick=()=>{native_clicks++;sidebar.switch(native_sidebar)};
    window.instance=explorer_qa.bind_workspace_explorer(core,{context_root:()=>root_path,active_file:()=>active_path,open_file:(...args)=>opened.push(args),open_folder:()=>{},copy:text=>copied.push(text),rename:async(root,source,name)=>{const plan=await explorer_qa.prepare_workspace_rename({fs:native_fs,path_api:require('path')},root,source,name);await plan.apply();return plan.new_path;}});
    window.get_listeners=()=>listeners.size;
  })()`);
  assert.equal(await evaluate('reads.length'),0,'closed sidebar must not enumerate any directory');
  const click=async(selector,button='left')=>{const point=await evaluate(`(()=>{const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(box.left+Math.min(50,box.width/2)),y:Math.round(box.top+box.height/2)}})()`);for(const type of ['mouseMove','mouseDown','mouseUp']){test_window.webContents.sendInputEvent({type,...point,button,clickCount:1});await delay(25);}await delay(100);};
  const row=name=>'.workspace-explorer-row[data-path='+JSON.stringify(path.join(workspace,name))+']';
  await click('[data-id="core.file-explorer"]');await wait('document.querySelectorAll(".workspace-explorer-row").length===9');
  for(const native_window of [false,true]){
    await evaluate(`document.body.classList.toggle('native-window',${native_window})`);
    const bounds=await evaluate(`(()=>{const rect=selector=>{const box=document.querySelector(selector).getBoundingClientRect();return{left:box.left,top:box.top,right:box.right,bottom:box.bottom,height:box.height}};return{panel:rect('.linux-note-workspace-explorer'),toolbar:rect('.workspace-explorer-toolbar'),root:rect('.workspace-explorer-root'),tree:rect('.workspace-explorer-tree'),position:getComputedStyle(document.querySelector('.workspace-explorer-toolbar')).position}})()`);
    assert.equal(bounds.position,'static','explorer toolbar stays in panel flow under native header rules');
    assert.equal(bounds.toolbar.top,bounds.panel.top);assert.equal(bounds.toolbar.left,bounds.panel.left);assert.equal(bounds.toolbar.right,bounds.panel.right);
    assert(bounds.toolbar.height>=38);assert(bounds.root.top>=bounds.toolbar.bottom);assert(bounds.tree.top>=bounds.root.bottom);
  }
  assert.deepEqual(await evaluate('reads'),[workspace]);
  assert.equal(await evaluate('native_clicks'),0);assert.equal(await evaluate('active_button'),'core.file-explorer');
  const names=await evaluate('[...document.querySelectorAll(".workspace-explorer-name")].map(node=>node.textContent)');
  for(const name of ['.hidden','.env.local','node_modules','archive.tar.gz','odd.unrecognized','README.zh-CN.md'])assert(names.includes(name),name);
  assert.equal(await evaluate('document.querySelectorAll(".workspace-explorer-actions button svg").length'),4);
  assert(await evaluate('[...document.querySelectorAll(".workspace-explorer-icon")].every(icon=>icon.getBoundingClientRect().width===16&&icon.getBoundingClientRect().height===16)'));
  fs.writeFileSync(path.join(root,'explorer_all_files.png'),(await test_window.webContents.capturePage()).toPNG());
  assert(await evaluate('!!sidebar.activePanel.containerEl.isConnected'));
  await click(row('archive.tar.gz'));assert.equal((await evaluate('opened')).at(-1)[0],path.join(workspace,'archive.tar.gz'));
  await click(row('odd.unrecognized'));assert.equal((await evaluate('opened')).at(-1)[0],path.join(workspace,'odd.unrecognized'));
  await click(row('.hidden'));await wait('reads.length===2');assert.equal((await evaluate('reads')).at(-1),path.join(workspace,'.hidden'));
  await wait(`!!document.querySelector(${JSON.stringify(row(path.join('.hidden','.secret.c')))})`);
  await click(row(path.join('.hidden','.secret.c')));assert.equal((await evaluate('opened')).at(-1)[0],path.join(workspace,'.hidden','.secret.c'));
  await click(row('Dockerfile.dev'),'right');await wait('!!document.querySelector("[role=menu]")');
  await evaluate('[...document.querySelectorAll("[role=menu] button")].find(button=>button.textContent==="复制相对路径").click()');assert.equal((await evaluate('copied')).at(-1),'Dockerfile.dev');
  await click('[data-id="core.file-explorer"]');assert.equal(await evaluate('sidebar.isShown'),false);assert.equal(await evaluate('watchers'),0);
  await click('[data-id="core.file-explorer"]');await wait('watchers===2');
  await evaluate('document.querySelector("#typora-sidebar").classList.add("active-tab-outline")');await delay(30);assert.equal(await evaluate('document.querySelector("#typora-sidebar").classList.contains("active-tab-outline")'),false);
  await click(row('large'));await wait(`reads.includes(${JSON.stringify(path.join(workspace,'large'))})`);await delay(100);
  assert(await evaluate('document.querySelectorAll(".workspace-explorer-row").length<60'),'large directory DOM is bounded');
  await evaluate(`active_path=${JSON.stringify(path.join(workspace,'large','entry_1999.c'))};document.querySelector('#editor').focus();instance.reveal(active_path)`);await wait(`!!document.querySelector(${JSON.stringify(row(path.join('large','entry_1999.c')))})`);
  assert.equal(await evaluate('document.activeElement.id'),'editor','automatic tree reveal cannot steal editor focus');
  await click(row(path.join('large','entry_1999.c')));assert.equal((await evaluate('opened')).at(-1)[0],path.join(workspace,'large','entry_1999.c'));
  assert.equal(await evaluate('reads.some(file=>file.endsWith("node_modules"))'),false,'unexpanded directory remains unread');
  fs.writeFileSync(path.join(workspace,'new_file.py'),'print(1)');await evaluate('instance.refresh()');await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'new_file.py'))})`);await wait(`!!document.querySelector(${JSON.stringify(row('new_file.py'))})`);
  fs.writeFileSync(path.join(root,'explorer.png'),(await test_window.webContents.capturePage()).toPNG());
  const key=async keyCode=>{for(const type of ['keyDown','keyUp'])test_window.webContents.sendInputEvent({type,keyCode});await delay(50)};
  await click(row('new_file.py'));await key('F2');await wait('!!document.querySelector(".workspace-explorer-rename")');
  assert.deepEqual(await evaluate('(()=>{const input=document.querySelector(".workspace-explorer-rename");return [input.value,input.selectionStart,input.selectionEnd,document.activeElement===input]})()'),['new_file.py',0,8,true]);
  await evaluate('document.querySelector(".workspace-explorer-rename").value="renamed_file.py"');await key('Enter');await wait(`!!document.querySelector(${JSON.stringify(row('renamed_file.py'))})`);assert(!fs.existsSync(path.join(workspace,'new_file.py')));assert.equal(fs.readFileSync(path.join(workspace,'renamed_file.py'),'utf8'),'print(1)');
  await key('F2');await wait('!!document.querySelector(".workspace-explorer-rename")');await evaluate('document.querySelector(".workspace-explorer-rename").value="Dockerfile.dev"');await key('Enter');await wait('!!document.querySelector(".workspace-explorer-rename[aria-invalid=true]")');assert.equal(fs.readFileSync(path.join(workspace,'Dockerfile.dev'),'utf8'),'FROM scratch');assert(fs.existsSync(path.join(workspace,'renamed_file.py')));await key('Escape');assert.equal(await evaluate('document.querySelector(".workspace-explorer-rename")'),null);
  const name_selector=row('renamed_file.py')+' .workspace-explorer-name';
  const double_point=await evaluate(`(()=>{const box=document.querySelector(${JSON.stringify(name_selector)}).getBoundingClientRect();return{x:Math.round(box.left+10),y:Math.round(box.top+box.height/2)}})()`);
  for(const clickCount of [1,2])for(const type of ['mouseMove','mouseDown','mouseUp']){test_window.webContents.sendInputEvent({type,...double_point,button:'left',clickCount});await delay(25)}
  await wait('!!document.querySelector(".workspace-explorer-rename")');await evaluate('document.querySelector(".workspace-explorer-rename").value="second_name.py"');await key('Enter');await wait(`!!document.querySelector(${JSON.stringify(row('second_name.py'))})`);assert(fs.existsSync(path.join(workspace,'second_name.py')));
  await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'folder'))})`);await wait(`!!document.querySelector(${JSON.stringify(row('folder'))})`);await click(row('folder'),'right');await evaluate('[...document.querySelectorAll("[role=menu] button")].find(button=>button.textContent==="重命名（F2）").click()');await wait('!!document.querySelector(".workspace-explorer-rename")');await evaluate('document.querySelector(".workspace-explorer-rename").value="renamed_folder"');await key('Enter');await wait(`!!document.querySelector(${JSON.stringify(row('renamed_folder'))})`);assert.equal(fs.readFileSync(path.join(workspace,'renamed_folder','nested.d.ts'),'utf8'),'declare const value: string;');
  fs.writeFileSync(path.join(root,'explorer_rename.png'),(await test_window.webContents.capturePage()).toPNG());
  const before_dispose=await evaluate('({watchers,listeners:get_listeners(),rows:document.querySelectorAll(".workspace-explorer-row").length,reads})');
  await evaluate('instance.dispose()');assert.equal(await evaluate('watchers'),0);assert.equal(await evaluate('get_listeners()'),0);assert.equal(await evaluate('document.querySelector(".linux-note-workspace-explorer")'),null);
  await click('[data-id="core.file-explorer"]');assert.equal(await evaluate('native_clicks'),1,'dispose restores native button handling');
  assert(fs.readFileSync(path.join(workspace,'README.zh-CN.md')).equals(original));
  console.log(JSON.stringify({status:'PASS',checks:['native header rules preserve explorer toolbar bounds and tree flow in both window modes','closed sidebar reads no directories','all files including dot names, hidden directories and binary extensions visible','official SVG icons render at 16px without a font dependency','native files button selects and toggles custom panel without duplicate ribbon','only clicked directories enumerated','file click forwards binary and unknown names to opener','context menu copies correct relative path','hide closes watchers and show restores expanded watches','native late outline class cannot cover explorer','2000-file directory renders bounded visible rows','reveal opens ancestors and scrolls to file without stealing editor focus','manual refresh discovers new files','F2 selects basename and Enter renames on disk','existing target is rejected and Escape cancels without writes','real double-click on selected name starts inline rename','context-menu folder rename preserves descendants','dispose cleans observers, watchers and event subscriptions','native file button restored after dispose','source Markdown remains byte-identical'],before_dispose,evidence:root},null,2));test_window.destroy();app.exit(0);
}).catch(async error=>{console.error(error);if(test_window){fs.writeFileSync(path.join(root,'failure.html'),await evaluate('document.body.outerHTML'));fs.writeFileSync(path.join(root,'failure.png'),(await test_window.webContents.capturePage()).toPNG());console.error(root);console.error(await evaluate('({focus:document.activeElement?.outerHTML,status:document.querySelector(".workspace-explorer-status")?.textContent})'));}test_window?.destroy();app.exit(1)});
