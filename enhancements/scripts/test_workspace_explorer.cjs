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
  const bundle=await build({stdin:{contents:'export {bind_workspace_explorer} from "./src/workspace_explorer";export {prepare_workspace_rename} from "./src/workspace_rename";export * from "./src/workspace_file_operations";export {create_workspace_file_clipboard} from "./src/workspace_file_clipboard";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'explorer_qa',write:false});await evaluate(bundle.outputFiles[0].text);
  await evaluate(String.raw`(()=>{
    window.root_path=${JSON.stringify(workspace)};window.reads=[];window.opened=[];window.copied=[];window.watchers=0;window.native_clicks=0;window.active_path='';
    const native_fs=require('fs');window.double_click_queries=[];window.reqnode=name=>name==='fs'?{promises:{...native_fs.promises,readdir:async(...args)=>{reads.push(args[0]);if(args[0]===window.slow_directory)await new Promise(resolve=>window.slow_release=resolve);return native_fs.promises.readdir(...args);}},watch:()=>{watchers++;return{close:()=>watchers--,on(){}};}}:name==='child_process'?{execFileSync:(file,args,options)=>{double_click_queries.push({file,args,options});return 'DoubleClickSpeed    REG_SZ    700';}}:require(name);
    const listeners=new Map();
    window.sidebar={panels:[],isShown:false,activePanel:undefined,addPanel(panel){this.panels.push(panel)},removePanel(panel){this.panels=this.panels.filter(candidate=>candidate!==panel)},switch(kind){if(this.activePanel instanceof kind)this.toggle();else{this.hide();this.activePanel=this.panels.find(panel=>panel instanceof kind);this.show()}},show(){this.isShown=true;document.querySelector('#typora-sidebar').style.display='block';this.activePanel?.show()},hide(){this.isShown=false;document.querySelector('#typora-sidebar').style.display='none';this.activePanel?.hide()},toggle(){this.isShown?this.hide():this.show()}};
    class native_sidebar {constructor(){this.containerEl=document.createElement('div');this.ribbonButton={id:'core.file-explorer'}}show(){document.querySelector('#typora-sidebar').classList.add('active-tab-files')}hide(){document.querySelector('#typora-sidebar').classList.remove('active-tab-files')}}
    const native_panel=new native_sidebar();sidebar.addPanel(native_panel);sidebar.activePanel=native_panel;
    class panel {show(){document.querySelector('#sidebar-content').append(this.containerEl);this.onshow()}hide(){this.containerEl.remove();this.onhide()}}
    window.core={SidebarPanel:panel,app:{workspace:{sidebar,ribbon:{activeButton(id){window.active_button=id}},on(event,callback){listeners.set(event,callback);return()=>listeners.delete(event)}}}};
    document.querySelector('[data-id="core.file-explorer"]').onclick=()=>{native_clicks++;sidebar.switch(native_sidebar)};
    window.clipboard_snapshot={paths:[],version:'0',move_requested:false};window.clipboard_serial=0;
    window.file_clipboard=explorer_qa.create_workspace_file_clipboard({read:async()=>clipboard_snapshot,write:async paths=>(clipboard_snapshot={paths,version:String(++clipboard_serial),move_requested:false}),clear:async version=>{if(clipboard_snapshot.version!==version)return false;clipboard_snapshot={paths:[],version:String(++clipboard_serial),move_requested:false};return true;},dispose(){}},{validate:(root,paths)=>explorer_qa.validate_workspace_entries({fs:native_fs,path_api:require('path')},root,paths),transfer:(root,paths,target,move,external)=>explorer_qa.transfer_workspace_entries({fs:native_fs,path_api:require('path')},root,paths,target,move?async(_root,source,target)=>{await native_fs.promises.rename(source,target);return target}:undefined,external)});
    window.instance=explorer_qa.bind_workspace_explorer(core,{compact_folders:false,context_root:()=>root_path,active_file:()=>active_path,open_file:(...args)=>opened.push(args),open_folder:()=>{},copy:text=>copied.push(text),create:(root,parent,name,directory)=>explorer_qa.create_workspace_entry({fs:native_fs,path_api:require('path')},root,parent,name,directory),file_clipboard,confirm_delete:()=>window.confirm_delete!==false,trash:(root,paths)=>explorer_qa.trash_workspace_entries({fs:native_fs,path_api:require('path')},root,paths,async file=>{const recycle=require('path').join(require('path').dirname(root),'recycle');await native_fs.promises.mkdir(recycle,{recursive:true});await native_fs.promises.rename(file,require('path').join(recycle,require('path').basename(file)))}),rename:async(root,source,name)=>{const plan=await explorer_qa.prepare_workspace_rename({fs:native_fs,path_api:require('path')},root,source,name);await plan.apply();return plan.new_path;}});
    window.get_listeners=()=>listeners.size;
  })()`);

  assert.equal(await evaluate('reads.length'),0,'closed sidebar must not enumerate any directory');
  const click=async(selector,button='left')=>{const point=await evaluate(`(()=>{const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(box.left+Math.min(50,box.width/2)),y:Math.round(box.top+box.height/2)}})()`);for(const type of ['mouseMove','mouseDown','mouseUp']){test_window.webContents.sendInputEvent({type,...point,button,clickCount:1});await delay(25);}await delay(100);};
  const row=name=>'.workspace-explorer-row[data-path='+JSON.stringify(path.join(workspace,name))+']';
  const click_open=async selector=>{const before=await evaluate('opened.length');await click(selector);await wait('opened.length>'+before);};
  await click('[data-id="core.file-explorer"]');await wait('document.querySelectorAll(".workspace-explorer-row").length===9');
  assert(await evaluate('document.querySelector(".workspace-explorer-status").hidden&&document.querySelector(".workspace-explorer-status").getBoundingClientRect().height===0'),'default Explorer status has no reserved space');
  const assert_row_visible=async selector=>assert(await evaluate(`(()=>{const row=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(),tree=document.querySelector('.workspace-explorer-tree').getBoundingClientRect();return row.top>=tree.top-1&&row.bottom<=tree.bottom+1})()`),'operation messages keep the selected or edited row fully visible');
  // 真实 window.css 和 core ribbon.scss 都为已隐藏的原生 tabs 遗留顶部占位。
  const inset_css=await test_window.webContents.insertCSS('.sidebar-content{top:64px}.native-window .sidebar-content{top:54px}.typ-ribbon--enable.typora-node .sidebar-content{top:18px}body{--typ-workspace-top:0}body.unibody-window{--typ-workspace-top:35px}.fixture-editor-root{position:absolute;top:var(--typ-workspace-top);left:400px}.fixture-editor-tab{height:35px}');
  const activity_css=await test_window.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../src/workspace_activity.css'),'utf8'));
  await evaluate(`document.querySelector('#sidebar-content').classList.add('sidebar-content');document.body.classList.add('typ-ribbon--enable','typora-node');window.fixture_editor=document.createElement('div');fixture_editor.className='fixture-editor-root';fixture_editor.innerHTML='<div class="fixture-editor-tab"></div>';document.body.append(fixture_editor);void 0`);
  for(const [mode,top]of [['native-window',0],['unibody-window',35]]){
    await evaluate(`document.body.classList.remove('native-window','unibody-window');document.body.classList.add(${JSON.stringify(mode)});void 0`);
    const inset=await evaluate(`({toolbar:document.querySelector('.workspace-explorer-toolbar').getBoundingClientRect().top,tab:document.querySelector('.fixture-editor-tab').getBoundingClientRect().top,content:document.querySelector('#sidebar-content').getBoundingClientRect().top})`);
    assert.deepEqual(inset,{toolbar:top,tab:top,content:top},mode+': sidebar title and editor tab begin below exactly one shared titlebar inset');
  }
  await evaluate(`document.body.classList.remove('native-window','unibody-window','typ-ribbon--enable','typora-node');document.querySelector('#sidebar-content').classList.remove('sidebar-content');fixture_editor.remove();void 0`);
  await test_window.webContents.removeInsertedCSS(activity_css);await test_window.webContents.removeInsertedCSS(inset_css);
  const row_geometry=await evaluate(`(()=>{const rows=[...document.querySelectorAll('.workspace-explorer-row')];return rows.map(row=>({top:row.getBoundingClientRect().top,height:row.getBoundingClientRect().height}))})()`);
  assert(row_geometry.every((row,index)=>row.height===26 && (!index || row.top-row_geometry[index-1].top===26)), 'virtual row positions and CSS height share 26px without gaps or overlaps');
  for(const native_window of [false,true]){
    await evaluate(`document.body.classList.toggle('native-window',${native_window})`);
    const bounds=await evaluate(`(()=>{const rect=selector=>{const box=document.querySelector(selector).getBoundingClientRect();return{left:box.left,top:box.top,right:box.right,bottom:box.bottom,height:box.height}};return{panel:rect('.linux-note-workspace-explorer'),toolbar:rect('.workspace-explorer-toolbar'),root:rect('.workspace-explorer-root'),tree:rect('.workspace-explorer-tree'),position:getComputedStyle(document.querySelector('.workspace-explorer-toolbar')).position}})()`);
    assert.equal(bounds.position,'static','explorer toolbar stays in panel flow under native header rules');
    assert.equal(bounds.toolbar.top,bounds.panel.top);assert.equal(bounds.toolbar.left,bounds.panel.left);assert.equal(bounds.toolbar.right,bounds.panel.right);
    assert.equal(bounds.toolbar.height,38);assert(bounds.root.top>=bounds.toolbar.bottom);assert(bounds.tree.top>=bounds.root.bottom);
  }
  assert.deepEqual(await evaluate('reads'),[workspace]);
  assert.equal(await evaluate('native_clicks'),0);assert.equal(await evaluate('active_button'),'core.file-explorer');
  const names=await evaluate('[...document.querySelectorAll(".workspace-explorer-name")].map(node=>node.textContent)');
  for(const name of ['.hidden','.env.local','node_modules','archive.tar.gz','odd.unrecognized','README.zh-CN.md'])assert(names.includes(name),name);
  assert(await evaluate('[...document.querySelectorAll(".workspace-explorer-row[aria-expanded]")].every(row=>!row.querySelector(".workspace-file-theme-icon")&&!row.querySelector("[data-git-icon=folder],[data-git-icon=folder-opened]")&&row.querySelector(".workspace-explorer-chevron svg"))'),'Seti folder rows show only their native chevron without a folder glyph');
  assert(await evaluate('document.querySelectorAll(".workspace-explorer-row .workspace-file-theme-icon").length>0'),'file rows load actual Seti file icons');
  assert.equal(await evaluate('document.querySelectorAll(".workspace-explorer-actions button svg").length'),6);
  assert(await evaluate('[...document.querySelectorAll(".workspace-explorer-icon")].every(icon=>icon.getBoundingClientRect().width===16&&icon.getBoundingClientRect().height===16)'));
  fs.writeFileSync(path.join(root,'explorer_all_files.png'),(await test_window.webContents.capturePage()).toPNG());
  assert(await evaluate('!!sidebar.activePanel.containerEl.isConnected'));
  await click_open(row('archive.tar.gz'));assert.equal((await evaluate('opened')).at(-1)[0],path.join(workspace,'archive.tar.gz'));
  await click_open(row('odd.unrecognized'));assert.equal((await evaluate('opened')).at(-1)[0],path.join(workspace,'odd.unrecognized'));
  await click(row('.hidden'));await wait('reads.length===2');assert.equal((await evaluate('reads')).at(-1),path.join(workspace,'.hidden'));
  await wait(`!!document.querySelector(${JSON.stringify(row(path.join('.hidden','.secret.c')))})`);
  const indentation=await evaluate(`(()=>{const parent=document.querySelector(${JSON.stringify(row('.hidden'))}),child=document.querySelector(${JSON.stringify(row(path.join('.hidden','.secret.c')))});return {step:child.querySelector('.workspace-file-theme-icon').getBoundingClientRect().left-parent.querySelector('.workspace-explorer-chevron svg').getBoundingClientRect().left,root:parent.querySelector('.workspace-explorer-chevron svg').getBoundingClientRect().left-document.querySelector('.workspace-explorer-tree').getBoundingClientRect().left,slot:getComputedStyle(child.querySelector('.workspace-explorer-chevron')).display,icon:child.querySelector('.workspace-file-theme-icon').getBoundingClientRect().width};})()`);
  assert.deepEqual(indentation,{step:8,root:3,slot:'none',icon:16},'Seti leaf removes empty twistie and each tree level uses the upstream 8px indent');
  await click_open(row(path.join('.hidden','.secret.c')));assert.equal((await evaluate('opened')).at(-1)[0],path.join(workspace,'.hidden','.secret.c'));
  await click(row('Dockerfile.dev'),'right');await wait('!!document.querySelector("[role=menu]")');
  await evaluate('[...document.querySelectorAll("[role=menu] button")].find(button=>(button.querySelector(".git-menu-label")?.textContent||button.textContent)==="复制相对路径").click()');assert.equal((await evaluate('copied')).at(-1),'Dockerfile.dev');
  await click('[data-id="core.file-explorer"]');assert.equal(await evaluate('sidebar.isShown'),false);assert.equal(await evaluate('watchers'),0);
  await click('[data-id="core.file-explorer"]');await wait('watchers===2');
  await evaluate('document.querySelector("#typora-sidebar").classList.add("active-tab-outline")');await delay(30);assert.equal(await evaluate('document.querySelector("#typora-sidebar").classList.contains("active-tab-outline")'),false);
  await click(row('large'));await wait(`reads.includes(${JSON.stringify(path.join(workspace,'large'))})`);await delay(100);
  assert(await evaluate('document.querySelectorAll(".workspace-explorer-row").length<60'),'large directory DOM is bounded');
  await evaluate(`active_path=${JSON.stringify(path.join(workspace,'large','entry_1999.c'))};document.querySelector('#editor').focus();instance.reveal(active_path)`);await wait(`!!document.querySelector(${JSON.stringify(row(path.join('large','entry_1999.c')))})`);
  assert.equal(await evaluate('document.activeElement.id'),'editor','automatic tree reveal cannot steal editor focus');
  await click_open(row(path.join('large','entry_1999.c')));assert.equal((await evaluate('opened')).at(-1)[0],path.join(workspace,'large','entry_1999.c'));
  assert.equal(await evaluate('reads.some(file=>file.endsWith("node_modules"))'),false,'unexpanded directory remains unread');
  fs.writeFileSync(path.join(workspace,'new_file.py'),'print(1)');await evaluate('instance.refresh()');await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'new_file.py'))})`);await wait(`!!document.querySelector(${JSON.stringify(row('new_file.py'))})`);
  fs.writeFileSync(path.join(root,'explorer.png'),(await test_window.webContents.capturePage()).toPNG());
  const key=async keyCode=>{for(const type of ['keyDown','keyUp'])test_window.webContents.sendInputEvent({type,keyCode});await delay(50)};
  await click(row('new_file.py'));await key('F2');await wait('!!document.querySelector(".workspace-explorer-rename")');
  assert.deepEqual(await evaluate('(()=>{const input=document.querySelector(".workspace-explorer-rename");return [input.value,input.selectionStart,input.selectionEnd,document.activeElement===input]})()'),['new_file.py',0,8,true]);
  await evaluate('document.querySelector(".workspace-explorer-rename").value="renamed_file.py"');await key('Enter');await wait(`!!document.querySelector(${JSON.stringify(row('renamed_file.py'))})`);assert(!fs.existsSync(path.join(workspace,'new_file.py')));assert.equal(fs.readFileSync(path.join(workspace,'renamed_file.py'),'utf8'),'print(1)');
  await key('F2');await wait('!!document.querySelector(".workspace-explorer-rename")');await evaluate('document.querySelector(".workspace-explorer-rename").value="Dockerfile.dev"');await key('Enter');await wait('!!document.querySelector(".workspace-explorer-rename[aria-invalid=true]")');await assert_row_visible('.workspace-explorer-rename');assert.equal(fs.readFileSync(path.join(workspace,'Dockerfile.dev'),'utf8'),'FROM scratch');assert(fs.existsSync(path.join(workspace,'renamed_file.py')));await key('Escape');assert.equal(await evaluate('document.querySelector(".workspace-explorer-rename")'),null);
  await assert_row_visible(row('renamed_file.py'));
  const double_open_count=await evaluate('opened.length');
  await click(row('renamed_file.py'));assert.equal(await evaluate('opened.length'),double_open_count+1,'single click opens immediately');assert.equal((await evaluate('opened')).at(-1)[1].preview,false);
  const double_click=async selector=>{
    const point=await evaluate(`(()=>{const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(box.left+Math.min(50,box.width/2)),y:Math.round(box.top+box.height/2)}})()`);
    for(const count of [1,2]){for(const type of ['mouseMove','mouseDown','mouseUp']){test_window.webContents.sendInputEvent({type,...point,button:'left',clickCount:count});await delay(20)}await delay(30)}
    await delay(80);
  };
  await double_click(row('renamed_file.py'));await wait('!!document.querySelector(".workspace-explorer-rename")');
  assert.equal(await evaluate('document.querySelector(".workspace-explorer-rename").value'),'renamed_file.py');
  assert.equal(await evaluate('opened.length'),double_open_count+2,'double-click does not dispatch a duplicate file open');
  await key('Escape');assert(fs.existsSync(path.join(workspace,'renamed_file.py')));
  await click(row('Dockerfile.dev'));const unselected_opens=await evaluate('opened.length');
  await double_click(row('renamed_file.py'));assert.equal(await evaluate('document.querySelector(".workspace-explorer-rename")'),null,'first double-click of an unselected item opens only');assert.equal(await evaluate('opened.length'),unselected_opens+1);
  await evaluate(`document.querySelector('.workspace-explorer-tree').focus()`);await key('Enter');assert.equal((await evaluate('opened')).at(-1)[1].preview,false);
  await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'folder'))})`);await wait(`!!document.querySelector(${JSON.stringify(row('folder'))})`);await click(row('folder'),'right');await evaluate('[...document.querySelectorAll("[role=menu] button")].find(button=>(button.querySelector(".git-menu-label")?.textContent||button.textContent)==="重命名").click()');await wait('!!document.querySelector(".workspace-explorer-rename")');await evaluate('document.querySelector(".workspace-explorer-rename").value="renamed_folder"');await key('Enter');await wait(`!!document.querySelector(${JSON.stringify(row('renamed_folder'))})`);assert.equal(fs.readFileSync(path.join(workspace,'renamed_folder','nested.d.ts'),'utf8'),'declare const value: string;');
  const command = async key => { await evaluate(`document.querySelector('.workspace-explorer-tree').focus();document.querySelector('.workspace-explorer-tree').dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},ctrlKey:true,bubbles:true}))`); await delay(100); };
  const root_menu = async title => { await evaluate(`document.querySelector('.workspace-explorer-tree').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));[...document.querySelectorAll('[role=menu] button')].find(button=>(button.querySelector(".git-menu-label")?.textContent||button.textContent)===${JSON.stringify(title)}).click()`); await delay(100); };
  await root_menu('新建文件…');await wait('!!document.querySelector(".workspace-explorer-rename")');await evaluate('document.querySelector(".workspace-explorer-rename").value="created.txt"');await key('Enter');await wait(`!!document.querySelector(${JSON.stringify(row('created.txt'))})`);assert(fs.existsSync(path.join(workspace,'created.txt')));
  await root_menu('新建文件夹…');await wait('!!document.querySelector(".workspace-explorer-rename")');await evaluate('document.querySelector(".workspace-explorer-rename").value="created_folder"');await key('Enter');await wait(`!!document.querySelector(${JSON.stringify(row('created_folder'))})`);assert(fs.statSync(path.join(workspace,'created_folder')).isDirectory());
  await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'created.txt'))})`);await command('c');
  await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'created_folder'))})`);await command('v');await wait(`!!document.querySelector(${JSON.stringify(row(path.join('created_folder','created.txt')))})`);assert(fs.existsSync(path.join(workspace,'created.txt')));assert(fs.existsSync(path.join(workspace,'created_folder','created.txt')));
  await command('x');await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'folder_missing'))})`);await root_menu('粘贴');await delay(100);assert(fs.existsSync(path.join(workspace,'created_folder','created.txt')),'collision paste preserves cut source');
  await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'renamed_file.py'))})`);await command('x');await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'created_folder'))})`);await command('v');await wait(`!!document.querySelector(${JSON.stringify(row(path.join('created_folder','renamed_file.py')))})`);assert(!fs.existsSync(path.join(workspace,'renamed_file.py')));
  await key('Delete');await wait('!!document.querySelector("[role=dialog]")');await key('Escape');assert(fs.existsSync(path.join(workspace,'created_folder','renamed_file.py')),'cancel delete writes nothing');
  await evaluate(`document.querySelector('.workspace-explorer-tree').focus()`);await key('Delete');await wait('!!document.querySelector("[role=dialog]")');await evaluate('[...document.querySelectorAll("[role=dialog] button")].find(button=>(button.querySelector(".git-menu-label")?.textContent||button.textContent)==="移到回收站").click()');await wait(`!document.querySelector(${JSON.stringify(row(path.join('created_folder','renamed_file.py')))})`);assert(fs.existsSync(path.join(root,'recycle','renamed_file.py')));
  fs.writeFileSync(path.join(workspace,'no_confirm.txt'),'keep recycle bytes');
  await evaluate(`window.confirm_delete=false;instance.refresh()`);await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'no_confirm.txt'))})`);
  await key('Delete');await wait(`!require('fs').existsSync(${JSON.stringify(path.join(workspace,'no_confirm.txt'))})`);
  assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'),0,'native no-warning setting executes immediately');
  assert.equal(fs.readFileSync(path.join(root,'recycle','no_confirm.txt'),'utf8'),'keep recycle bytes');await evaluate('window.confirm_delete=true');
  const external_file=path.join(root,'外部 file.bin');fs.writeFileSync(external_file,Buffer.from([0,128,255]));
  await evaluate(`clipboard_snapshot={paths:[${JSON.stringify(external_file)}],version:'external',move_requested:true};instance.reveal(root_path)`);await root_menu('粘贴');
  await wait(`require('fs').existsSync(${JSON.stringify(path.join(workspace,'外部 file.bin'))})`);assert.deepEqual(fs.readFileSync(path.join(workspace,'外部 file.bin')),Buffer.from([0,128,255]));assert(fs.existsSync(external_file));
  await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'外部 file.bin'))})`);await command('x');assert(await evaluate('Boolean(document.querySelector(".workspace-explorer-row.is-cut"))'));
  await evaluate(`clipboard_snapshot={paths:[],version:'text',move_requested:false};window.dispatchEvent(new Event('focus'))`);await wait('!document.querySelector(".workspace-explorer-row.is-cut")');
  const before_editor_clipboard=await evaluate('clipboard_snapshot.version');await evaluate(`document.querySelector('#editor').focus();document.querySelector('#editor').dispatchEvent(new KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true}))`);assert.equal(await evaluate('clipboard_snapshot.version'),before_editor_clipboard,'editor text shortcut is not captured by Explorer');
  assert(await evaluate('!document.querySelector(".workspace-explorer-outline")&&!Object.hasOwn(instance,"outline_container")'), 'Explorer exposes no duplicate Outline section or obsolete slot');
  fs.writeFileSync(path.join(root,'explorer_rename.png'),(await test_window.webContents.capturePage()).toPNG());
  // 人为延迟真实 readdir，检查用户等待时也能操作；恢复后继续读取真实文件系统。
  const slow_folder=path.join(workspace,'slow_folder');fs.mkdirSync(slow_folder);fs.writeFileSync(path.join(slow_folder,'child.md'),'# Slow child');
  await evaluate('instance.refresh()');await evaluate(`instance.reveal(${JSON.stringify(slow_folder)})`);await wait(`!!document.querySelector(${JSON.stringify(row('slow_folder'))})`);
  await evaluate(`window.slow_directory=${JSON.stringify(slow_folder)};window.slow_release=undefined;window.stable_row=document.querySelector(${JSON.stringify(row('slow_folder'))});window.stable_name=stable_row.querySelector('.workspace-explorer-name')`);
  await click(row('slow_folder'));await wait('!!window.slow_release');
  assert(await evaluate('stable_row.isConnected&&stable_name.isConnected&&stable_row.getAttribute("aria-expanded")==="true"&&stable_row.getAttribute("aria-busy")==="true"'));
  await click(row('slow_folder'));assert(await evaluate('stable_row.getAttribute("aria-expanded")==="false"'),'collapse responds while the same directory read is pending');
  const reads_before_release=await evaluate(`reads.filter(value=>value===${JSON.stringify(slow_folder)}).length`);
  await click(row('slow_folder'));assert(await evaluate('stable_row.getAttribute("aria-expanded")==="true"'));
  assert.equal(await evaluate(`reads.filter(value=>value===${JSON.stringify(slow_folder)}).length`),reads_before_release,'reopen shares the in-flight read');
  await click(row('slow_folder'));await evaluate('slow_directory="";slow_release();');await wait('stable_row.getAttribute("aria-busy")==="false"');
  assert(await evaluate(`stable_row===document.querySelector(${JSON.stringify(row('slow_folder'))})&&stable_name===stable_row.querySelector('.workspace-explorer-name')&&!document.querySelector(${JSON.stringify(row('slow_folder/child.md'))})`),'late data keeps the collapsed state and original hit target');
  const reads_cached=await evaluate('reads.length');
  await click(row('slow_folder'));await wait(`!!document.querySelector(${JSON.stringify(row('slow_folder/child.md'))})`);assert.equal(await evaluate('reads.length'),reads_cached,'cached expansion does not read again');
  // 连续点击使用真实 Chromium clickCount，旧的 count=1 夹具不能发现第二击被吞掉。
  const rapid_clicks=async(selector,counts)=>{
    await evaluate(`window.click_feedback=[];(()=>{const row=document.querySelector(${JSON.stringify(selector)}),signal=(window.click_audit=new AbortController()).signal;let before,started;
      row.addEventListener('click',()=>{before=row.getAttribute('aria-expanded');started=performance.now()},{capture:true,signal});
      row.addEventListener('click',event=>{
        if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
        const count=event.detail;
        requestAnimationFrame(()=>window.click_feedback.push({count,before,after:row.getAttribute('aria-expanded'),milliseconds:performance.now()-started,renaming:!!document.querySelector('.workspace-explorer-rename')}));
      },{signal});
    })()`);
    for(const count of counts){
      const point=await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(b.left+b.width-5),y:Math.round(b.top+b.height/2)}})()`);
      for(const type of ['mouseMove','mouseDown','mouseUp'])test_window.webContents.sendInputEvent({type,...point,button:'left',clickCount:count});
      await wait('click_feedback.length==='+counts.indexOf(count)+'+1');
      const feedback=(await evaluate('click_feedback')).at(-1);
      assert.equal(feedback.count,count);assert.notEqual(feedback.after,feedback.before,'every folder click changes expansion by its next rendered frame, including double-click sequence '+count);assert.equal(feedback.renaming,false,'folder clicks never rename');
    }
    const feedback=await evaluate('click_feedback');await evaluate('click_audit.abort()');return feedback;
  };
  await double_click(row('slow_folder'));
  assert.equal(await evaluate('!!document.querySelector(".workspace-explorer-rename")'),false,'selected folder double-click never renames');
  assert(await evaluate(`document.querySelector(${JSON.stringify(row('slow_folder'))}).getAttribute('aria-expanded')==='true'`),'two folder clicks toggle twice without a double-click rollback');
  const folder_click_feedback=await rapid_clicks(row('slow_folder'),[1,2,3,4,5,6]);
  await key('F2');await wait('!!document.querySelector(".workspace-explorer-rename")');
  assert.deepEqual(await evaluate('(()=>{const input=document.querySelector(".workspace-explorer-rename");return[input.value,input.selectionStart,input.selectionEnd]})()'),['slow_folder',0,11]);await key('Escape');
  assert(await evaluate(`document.querySelector(${JSON.stringify(row('slow_folder'))}).getAttribute('aria-expanded')==='true'`),'F2 and cancellation preserve expansion');
  await key('Up');assert.equal(await evaluate('stable_row.getAttribute("aria-selected")'),'false');
  await double_click(row('slow_folder'));assert.equal(await evaluate('!!document.querySelector(".workspace-explorer-rename")'),false,'unselected folder double-click never renames');
  await evaluate(`window.slow_directory=${JSON.stringify(slow_folder)};window.slow_release=undefined;void instance.refresh()`);await wait('!!window.slow_release');
  folder_click_feedback.push(...await rapid_clicks(row('slow_folder'),[1,2,3,4,5]));
  const pending_reads=await evaluate(`reads.filter(value=>value===${JSON.stringify(slow_folder)}).length`);
  assert.equal(pending_reads,reads_before_release+1,'forced refresh and rapid reopen still share a single pending read');
  await evaluate('slow_directory="";slow_release()');await wait('stable_row.getAttribute("aria-busy")==="false"');
  assert(await evaluate(`!document.querySelector(${JSON.stringify(row('slow_folder/child.md'))})`),'late refresh does not undo the final rapid collapse');
  await click(row('slow_folder'));await wait(`!!document.querySelector(${JSON.stringify(row('slow_folder/child.md'))})`);
  await evaluate(`window.stable_row=document.querySelector(${JSON.stringify(row('slow_folder'))});window.stable_name=stable_row.querySelector('.workspace-explorer-name');instance.refresh()`);await delay(70);
  assert(await evaluate(`stable_row===document.querySelector(${JSON.stringify(row('slow_folder'))})&&stable_name===stable_row.querySelector('.workspace-explorer-name')`),'refresh keeps unchanged visible row and label identities');
  const point_blank=await evaluate('(()=>{const b=stable_row.getBoundingClientRect();return{x:Math.round(b.right-5),y:Math.round(b.top+b.height/2)}})()');
  for(const type of ['mouseMove','mouseDown','mouseUp'])test_window.webContents.sendInputEvent({type,...point_blank,button:'left',clickCount:1});await delay(60);
  assert.equal(await evaluate('stable_row.getAttribute("aria-expanded")'),'false','right-side empty area toggles the folder');
  for(const type of ['mouseDown','mouseUp'])test_window.webContents.sendInputEvent({type,...point_blank,button:'left',clickCount:1,modifiers:['control']});await delay(60);
  assert.equal(await evaluate('stable_row.getAttribute("aria-expanded")'),'false','multi-select never toggles');
  // 通过宿主实际颜色触发生产主题观察链，不注入选中色或直接改主题判定属性。
  // 隐藏离屏窗口仍执行浏览器真实焦点伪类，和其他交互目标使用相同的焦点模拟。
  test_window.webContents.debugger.attach();await test_window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  const body_theme_before=await evaluate('document.body.getAttribute("style")');
  const apply_theme=async theme=>{
    await evaluate(`document.body.style.backgroundColor='${theme==='dark'?'#252526':'#ffffff'}';document.body.style.color='${theme==='dark'?'#ddd':'#333'}';document.body.style.setProperty('--text-color','${theme==='dark'?'#ddd':'#333'}');document.body.style.setProperty('--side-bar-bg-color','${theme==='dark'?'#252526':'#f8f8f8'}');void 0`);
    await wait(`document.documentElement.dataset.workspaceFileIconTheme===${JSON.stringify(theme)}`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  };
  await evaluate(`instance.reveal(${JSON.stringify(path.join(workspace,'large','entry_0000.c'))})`);
  await evaluate(`instance.reveal(${JSON.stringify(slow_folder)})`);await delay(80);
  await evaluate(`window.theme_row=document.querySelector(${JSON.stringify(row('slow_folder'))});window.theme_name=theme_row.querySelector('.workspace-explorer-name');window.theme_tree=document.querySelector('.workspace-explorer-tree');window.theme_scroll=theme_tree.scrollTop;window.theme_selection=[...document.querySelectorAll('.workspace-explorer-row[aria-selected="true"]')].map(node=>node.dataset.path);window.theme_expanded=theme_row.getAttribute('aria-expanded');window.theme_editor_value=document.querySelector('#editor').value;void 0`);
  assert(await evaluate('theme_scroll>0'),'theme switching exercises a selected row at a nonzero scroll position');
  const luminance=rgb=>rgb.map(value=>{const srgb=value/255;return srgb<=.04045?srgb/12.92:((srgb+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const contrast=(foreground,background)=>{const levels=[luminance(foreground),luminance(background)].sort((left,right)=>right-left);return(levels[0]+.05)/(levels[1]+.05);};
  const theme_selection_metrics=[];
  const sample_selection=async(theme,state,cycle)=>{
    const sample=await evaluate(`(()=>{
      const target=document.querySelector(${JSON.stringify(row('slow_folder'))}),name=target.querySelector('.workspace-explorer-name'),arrow=target.querySelector('.workspace-explorer-chevron svg');
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');
      const pixel=()=>Array.from(context.getImageData(0,0,1,1).data).slice(0,3);
      context.fillStyle='#fff';context.fillRect(0,0,1,1);const chain=[];for(let node=target;node;node=node.parentElement)chain.unshift(node);
      for(const node of chain){context.fillStyle=getComputedStyle(node).backgroundColor;context.fillRect(0,0,1,1);}const background=pixel();
      const foreground=node=>{context.fillStyle='rgb('+background.join(',')+')';context.fillRect(0,0,1,1);context.fillStyle=getComputedStyle(node).color;context.fillRect(0,0,1,1);return pixel();};
      return{theme:document.documentElement.dataset.workspaceFileIconTheme,background,background_css:getComputedStyle(target).backgroundColor,text:foreground(name),arrow:foreground(arrow),hover:target.matches(':hover'),tree_focused:document.activeElement===theme_tree,focus_visible:theme_tree.matches(':focus-visible'),height:target.getBoundingClientRect().height,arrow_width:arrow.getBoundingClientRect().width,arrow_height:arrow.getBoundingClientRect().height,row_identity:target===theme_row,name_identity:name===theme_name,selection:[...document.querySelectorAll('.workspace-explorer-row[aria-selected="true"]')].map(node=>node.dataset.path),scroll:theme_tree.scrollTop,original_scroll:theme_scroll,expanded:target.getAttribute('aria-expanded'),original_expanded:theme_expanded,editor_unchanged:document.querySelector('#editor').value===theme_editor_value};
    })()`);
    sample.cycle=cycle;sample.state=state;sample.expected_theme=theme;sample.text_contrast=contrast(sample.text,sample.background);sample.arrow_contrast=contrast(sample.arrow,sample.background);theme_selection_metrics.push(sample);
    fs.writeFileSync(path.join(root,'explorer_selection_metrics.json'),JSON.stringify(theme_selection_metrics,null,2));
    fs.writeFileSync(path.join(root,'explorer_selection_'+cycle+'_'+theme+'_'+state+'.png'),(await test_window.webContents.capturePage()).toPNG());
  };
  for(const [cycle,theme]of [[0,'light'],[1,'dark'],[2,'light']]){
    test_window.webContents.sendInputEvent({type:'mouseMove',x:900,y:600});
    await evaluate('document.querySelector("#editor").focus({preventScroll:true});void 0');
    await apply_theme(theme);await sample_selection(theme,'idle',cycle);
    const point=await evaluate('(()=>{const box=theme_row.getBoundingClientRect();return{x:Math.round(box.right-5),y:Math.round(box.top+box.height/2)}})()');
    test_window.webContents.sendInputEvent({type:'mouseMove',...point});await delay(60);await sample_selection(theme,'hover',cycle);
    test_window.webContents.sendInputEvent({type:'mouseMove',x:900,y:600});
    for(const type of ['keyDown','keyUp'])test_window.webContents.sendInputEvent({type,keyCode:'Tab',modifiers:['shift']});
    await wait('document.activeElement===theme_tree');await delay(60);await sample_selection(theme,'keyboard',cycle);
    assert(fs.readFileSync(path.join(workspace,'README.zh-CN.md')).equals(original),'theme switch does not write the source Markdown');
  }
  // 完整采样后断言，失败时也保留日夜与各交互状态截图。
  const expected_selection=await evaluate('theme_selection');
  const night_idle=theme_selection_metrics.find(sample=>sample.theme==='dark'&&sample.state==='idle');
  assert(night_idle&&night_idle.text_contrast>=4.5,'Night selected row without hover must retain readable text; actual '+night_idle?.text_contrast.toFixed(2));
  for(const sample of theme_selection_metrics){
    const description=sample.expected_theme+'/'+sample.state+'/cycle'+sample.cycle;
    assert.equal(sample.theme,sample.expected_theme,description+' uses production theme observation');
    assert(sample.row_identity&&sample.name_identity,description+' preserves the selected row and name nodes');
    assert.deepEqual(sample.selection,expected_selection,description+' preserves selection identity');
    assert.equal(sample.scroll,sample.original_scroll,description+' preserves the nonzero tree scroll');
    assert.equal(sample.expanded,sample.original_expanded,description+' preserves folder expansion');
    assert.equal(sample.height,26,description+' preserves 26px row geometry');
    assert(sample.arrow_width>0&&sample.arrow_height>0&&sample.editor_unchanged,description+' retains the visible arrow and source editor value');
    assert.equal(sample.hover,sample.state==='hover',description+' tests the requested hover state');
    assert.equal(sample.tree_focused,sample.state==='keyboard',description+' tests the requested focus owner');
    if(sample.state==='keyboard')assert(sample.focus_visible,description+' receives keyboard focus with visible browser focus state');
    assert(sample.text_contrast>=4.5,description+' text contrast is at least 4.5:1; actual '+sample.text_contrast.toFixed(2));
    assert(sample.arrow_contrast>=3,description+' arrow contrast is at least 3:1; actual '+sample.arrow_contrast.toFixed(2));
    assert.equal(sample.background_css,sample.tree_focused?(sample.theme==='dark'?'rgba(255, 255, 255, 0.133)':'rgba(0, 0, 0, 0.145)'):(sample.theme==='dark'?'rgb(44, 45, 46)':'rgba(218, 218, 218, 0.6)'),description+' uses the fixed VS Code focused/inactive selection background');
    assert.deepEqual(sample.text,sample.theme==='dark'?[237,237,237]:[32,32,32],description+' uses the fixed selected foreground');
    if(sample.theme==='dark')assert(Math.max(...sample.background)<80,description+' never paints a bright selection over Night');
  }
  // 窄栏和真实页面缩放仍使用同一生产主题链，行尾仍是同一个展开目标。
  for(const [theme,zoom,width]of [['light',1,320],['dark',1.25,220]]){
    test_window.webContents.setZoomFactor(zoom);
    await apply_theme(theme);await evaluate(`document.querySelector('#typora-sidebar').style.width='${width}px';instance.reveal(${JSON.stringify(slow_folder)})`);await delay(100);
    for(let step=0;step<2;step++){
      const target=await evaluate(`(()=>{const row=document.querySelector(${JSON.stringify(row('slow_folder'))}),b=row.getBoundingClientRect();return{x:b.right-3,y:b.top+b.height/2,open:row.getAttribute('aria-expanded')==='true',hit:row.contains(document.elementFromPoint(b.right-3,b.top+b.height/2))}})()`);
      assert(target.hit,theme+' scaled folder row is reachable');
      for(const type of ['mouseMove','mouseDown','mouseUp'])test_window.webContents.sendInputEvent({type,x:Math.round(target.x*zoom),y:Math.round(target.y*zoom),button:'left',clickCount:1});await delay(80);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(row('slow_folder'))}).getAttribute('aria-expanded')==='true'`),!target.open);
    }
    fs.writeFileSync(path.join(root,'explorer_hit_'+theme+'.png'),(await test_window.webContents.capturePage()).toPNG());
  }
  test_window.webContents.setZoomFactor(1);await evaluate(`if(${JSON.stringify(body_theme_before)}===null)document.body.removeAttribute('style');else document.body.setAttribute('style',${JSON.stringify(body_theme_before)});document.querySelector('#typora-sidebar').style.width='320px';void 0`);await wait('document.documentElement.dataset.workspaceFileIconTheme==="light"');
  await evaluate('instance.reveal(root_path)');
  const before_dispose=await evaluate('({watchers,listeners:get_listeners(),rows:document.querySelectorAll(".workspace-explorer-row").length,reads})');
  await evaluate('instance.dispose()');assert.equal(await evaluate('watchers'),0);assert.equal(await evaluate('get_listeners()'),0);assert.equal(await evaluate('document.querySelector(".linux-note-workspace-explorer")'),null);
  await click('[data-id="core.file-explorer"]');assert.equal(await evaluate('native_clicks'),1,'dispose restores native button handling');
  assert(fs.readFileSync(path.join(workspace,'README.zh-CN.md')).equals(original));
  console.log(JSON.stringify({status:'PASS',checks:['native header rules preserve explorer toolbar bounds and tree flow in both window modes','closed sidebar reads no directories','all files including dot names, hidden directories and binary extensions visible','official SVG icons render at 16px without a font dependency','native files button selects and toggles custom panel without duplicate ribbon','only clicked directories enumerated','file click forwards binary and unknown names to opener','context menu copies correct relative path','hide closes watchers and show restores expanded watches','native late outline class cannot cover explorer','2000-file directory renders bounded visible rows','reveal opens ancestors and scrolls to file without stealing editor focus','manual refresh discovers new files','F2 selects basename and Enter renames on disk','existing target is rejected and Escape cancels without writes','selected file double-click renames; selected and unselected folders never rename on double-click','rapid folder clicks including counts 2-6 update by the next rendered frame; pending reads are shared and never reopen a collapsed folder','refresh preserves row and label identity','right-side whitespace toggles and modifier selection stays independent','day-night-day production theme observation preserves selected row contrast, identity, 26px geometry, scroll and source content across idle, hover and keyboard focus','light and dark 220/320px rows remain clickable at 100/125% page zoom','single click opens immediately','context-menu folder rename preserves descendants','dispose cleans observers, watchers and event subscriptions','native file button restored after dispose','source Markdown remains byte-identical','inline create file and folder','clipboard copy and move through keyboard','external binary paste preserves source','clipboard replacement refreshes cut markers','editor text shortcuts remain independent','collision paste preserves source','delete cancel and recycle callback','Explorer has no duplicate Outline section or obsolete slot'],folder_click_feedback,theme_selection_metrics,before_dispose,evidence:root},null,2));test_window.destroy();app.exit(0);
}).catch(async error=>{console.error(error);if(test_window){fs.writeFileSync(path.join(root,'failure.html'),await evaluate('document.body.outerHTML'));fs.writeFileSync(path.join(root,'failure.png'),(await test_window.webContents.capturePage()).toPNG());console.error(root);console.error(await evaluate('({focus:document.activeElement?.outerHTML,status:document.querySelector(".workspace-explorer-status")?.textContent})'));}test_window?.destroy();app.exit(1)});
