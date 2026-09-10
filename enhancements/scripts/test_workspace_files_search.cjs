// 临时仓库中验证全文件源码预览与文件搜索：真实 Monaco、真实鼠标、不安装 Typora。
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {build}=require('esbuild');
const {editor_plugins}=require('./editor_bundle.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_files_search_'));
const workspace=path.join(root,'workspace');fs.mkdirSync(workspace);execFileSync('git',['init','--quiet',workspace]);
execFileSync('git',['-C',workspace,'config','core.autocrlf','false']);
for(const directory of ['src','.hidden','ignored'])fs.mkdirSync(path.join(workspace,directory));
const documents={
  'alpha.md':'# Original\nneedle Alpha\nNEEDLE beta\nneedles plural\n',
  'src/sample.test.ts':'const needle = 1;\nfunction unrelated() {}\n',
  '.hidden/hidden.py':'needle\n',
  'ignored/generated.log':'needle ignored\n',
  '.gitignore':'ignored/\n',
  'odd.unrecognized':'ordinary text\n',
  'src/board.yml':'board:\n  name: uyup_rpi_a\n  vendor: uyup\n',
  'Dockerfile.dev':'FROM scratch\n',
  'module.d.ts':'declare const result: string;\n',
  'script':'#!/usr/bin/env python3\nprint("hello")\n',
  'src/space name [draft] #100%.test.ts':'export const exact_path = 1;\n',
  'src/reading notes #1 [draft].md':'# Complex path\n',
  'long.c':Array.from({length:700},(_,index)=>'int value_'+index+' = '+index+';').join('\n'),
};
for(const [name,text]of Object.entries(documents))fs.writeFileSync(path.join(workspace,name),text);
// 真实区分干净文件、工作区更改与未跟踪文件，验证搜索范围不会把状态标签当装饰。
fs.writeFileSync(path.join(workspace,'alpha.md'),'# Original\nneedle Alpha\n');
execFileSync('git',['-C',workspace,'add','--','.gitignore','src/sample.test.ts','alpha.md']);
execFileSync('git',['-C',workspace,'-c','user.name=Typora_Test','-c','user.email=typora@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=.git/unused_hooks','commit','--quiet','-m','Search fixture baseline']);
fs.writeFileSync(path.join(workspace,'alpha.md'),documents['alpha.md']);
fs.writeFileSync(path.join(workspace,'data.tar.gz'),Buffer.from([0x1f,0x8b,8,0]));
app.setPath('userData',path.join(root,'user_data'));app.disableHardwareAcceleration();
let test_window;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=source=>test_window.webContents.executeJavaScript(source);
const wait=async source=>{for(let index=0;index<240;index++){if(await evaluate(source))return;await delay(25);}throw new Error('Timed out: '+source)};
app.whenReady().then(async()=>{
  test_window=new BrowserWindow({show:false,width:1280,height:850,webPreferences:{contextIsolation:false,nodeIntegration:true,backgroundThrottling:false,offscreen:true}});
  const filename=path.join(root,'test.html');fs.writeFileSync(filename,'<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden;color:#24292f;background:white;font-family:Arial}#sidebar-content{position:absolute;left:36px;top:0;bottom:0;width:320px}#editor-group{position:absolute;left:356px;right:0;top:0;bottom:28px}footer.ty-footer{position:absolute;left:356px;right:0;bottom:0;height:28px;background:#eee}.typ-ribbon-item{width:35px;height:35px;position:absolute;left:0;top:0;cursor:pointer}.leaf{height:100%;width:100%}</style><div class="typ-ribbon-item" data-id="core.search">搜索</div><div id="typora-sidebar"><div id="sidebar-content"></div></div><div id="editor-group"></div><footer class="ty-footer"><div id="footer-word-count" class="footer-item-right">100 words</div></footer>');await test_window.loadFile(filename);
  const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export {bind_reading_navigation} from "./src/reading_navigation";export {bind_workspace_files,get_workspace_files} from "./src/workspace_files";export {bind_workspace_search} from "./src/workspace_search";export {create_workspace_quick_open} from "./src/workspace_quick_open";export {workspace_file_icon} from "./src/workspace_file_icons";export {FILE_LANGUAGE_RULES} from "./src/file_language";export * as monaco from "monaco-editor/editor/editor.api";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'files_qa',write:false});await evaluate(bundle.outputFiles[0].text);
  await evaluate(String.raw`(()=>{
    document.body.classList.add('show-footer');document.querySelector('#sidebar-content').innerHTML='<div id="file-library-search"><input id="file-library-search-input" placeholder="查找"><button id="close-outline-filter-btn">x</button></div>';
    const native_style=document.createElement('style');native_style.textContent='#file-library-search{display:block;height:50px}textarea:focus,input:focus{outline:2px solid orange;box-shadow:0 0 0 2px orange}';document.head.append(native_style);
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(style);
    window.workspace_path=${JSON.stringify(workspace)};window.native_opens=[];window.native_library_calls=[];window.shell_calls=[];window.copied=[];window.leaves=[];window.factories=new Map();window.commands=new Map();window.listeners=new Map();window.extra_ribbon=[];
    const native_worker=window.Worker;window.worker_queries=[];window.Worker=class extends native_worker{postMessage(message,...args){if(message?.options?.regex)worker_queries.push(message.options.query);return super.postMessage(message,...args)}};
    window.reqnode=name=>name==='electron'?{shell:{openPath:file=>shell_calls.push(file),showItemInFolder:file=>shell_calls.push(file)},clipboard:{writeText:text=>copied.push(text)}}:require(name);
    window.File={getMountFolder:()=>workspace_path,bundle:{filePath:workspace_path+'/alpha.md'},changeCounter:{isDocumentEdited:()=>false},editor:{library:{openFile:function(file,...args){native_opens.push(file);native_library_calls.push({file,args,context:this===File.editor.library});return 'library-native-result'}}}};
    window.sidebar={panels:[],activePanel:undefined,isShown:false,addPanel(panel){this.panels.push(panel);if(panel.ribbonButton)extra_ribbon.push(panel.ribbonButton)},switch(kind){if(this.activePanel instanceof kind)this.toggle();else{this.hide();this.activePanel=this.panels.find(panel=>panel instanceof kind);this.show()}},show(){this.isShown=true;this.activePanel?.show()},hide(){this.isShown=false;this.activePanel?.hide()},toggle(){this.isShown?this.hide():this.show()}};
    class panel {show(){document.querySelector('#sidebar-content').append(this.containerEl);this.onshow()}hide(){this.containerEl.remove();this.onhide()}}
    class view {constructor(leaf){this.leaf=leaf;this.containerEl=document.createElement('div')}onOpen(){}onClose(){}}
    window.parent_group={appendChild(leaf){leaves.push(leaf)},toggleTab(uri){return leaves.find(leaf=>leaf.state.path===uri)}};
    const native_leaf={state:{path:workspace_path+'/alpha.md'},parent:parent_group,view:{containerEl:document.createElement('div'),onOpen(){},onClose(){}},containerEl:document.createElement('div')};leaves.push(native_leaf);let active=native_leaf;
    const workspace_api={sidebar,activeFile:workspace_path+'/alpha.md',get activeLeaf(){return active},set activeLeaf(leaf){active?.view.onClose?.();active=leaf;const group=document.querySelector('#editor-group');group.replaceChildren(leaf.view.containerEl);leaf.view.onOpen();listeners.get('active-leaf:change')?.forEach(callback=>callback(leaf))},eachLeaves(callback){leaves.forEach(callback)},createLeaf(descriptor){const leaf={...descriptor,parent:parent_group,containerEl:document.createElement('div')};leaf.view=factories.get(descriptor.type)(leaf);return leaf},on(event,callback){if(!listeners.has(event))listeners.set(event,[]);listeners.get(event).push(callback);return()=>listeners.set(event,listeners.get(event).filter(item=>item!==callback))}};
    window.core={SidebarPanel:panel,WorkspaceView:view,app:{openFile:function(file){native_opens.push(file);return 'core-native-result'},workspace:workspace_api,viewManager:{registerView:(name,factory)=>factories.set(name,factory)},commands:{register:command=>commands.set(command.id,command),run:id=>commands.get(id)?.callback()}}};
    window.native_core_open=core.app.openFile;window.native_library_open=File.editor.library.openFile;
    window.files=files_qa.bind_workspace_files(core);window.routed_core_open=core.app.openFile;window.routed_library_open=File.editor.library.openFile;window.files_style_count=document.querySelectorAll('style').length;window.files_again=files_qa.bind_workspace_files(core);window.files_style_count_after_repeat=document.querySelectorAll('style').length;window.open_calls=[];const open=files.open_file;files.open_file=async(...args)=>{open_calls.push(args);if(args[0].endsWith('.md')){native_opens.push(args[0]);return;}return open(...args)};window.search=files_qa.bind_workspace_search(core,files);window.active_editor=()=>core.app.workspace.activeLeaf.view.editor?.focused_editor();
  })()`);
  const open=async name=>{await evaluate(`files.open_file(${JSON.stringify(path.join(workspace,name))})`);await wait('!!active_editor()');await delay(80)};
  const click=async(selector,button='left',fraction=.5)=>{const point=await evaluate(`(()=>{const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(box.left+box.width/2),y:Math.round(box.top+box.height*${fraction})}})()`);for(const type of ['mouseMove','mouseDown','mouseUp']){test_window.webContents.sendInputEvent({type,...point,button,clickCount:1});await delay(25)}await delay(100)};
  assert.deepEqual(await evaluate('({host:files===files_again,core:core.app.openFile===routed_core_open,library:File.editor.library.openFile===routed_library_open,styles:files_style_count_after_repeat===files_style_count})'),{host:true,core:true,library:true,styles:true},'repeated binding reuses one host and one pair of routes');
  await evaluate('window.picker_files={...files,fs:{...files.fs,promises:{...files.fs.promises}}};window.picker=files_qa.create_workspace_quick_open(picker_files);picker.open();void 0');
  await wait('document.querySelectorAll(".workspace-quick-open-result").length>10');
  await evaluate('document.fonts.ready.then(()=>true)');
  assert(await evaluate(`([...document.querySelectorAll('.workspace-quick-open-result')].every(row=>{const icon=row.querySelector('.workspace-file-theme-icon'),expected=files_qa.workspace_file_icon(row.title);return icon&&icon.dataset.fileIconPath===row.title&&icon.textContent===expected.textContent&&icon.dataset.vscodeFileIcon===expected.dataset.vscodeFileIcon&&getComputedStyle(icon).fontFamily==='typora-code-seti'&&icon.getBoundingClientRect().width===16}))`),'quick-open results reuse Explorer associations for compound suffixes, YAML and unknown files');
  const alternate_workspace=path.join(root,'alternate_workspace');fs.mkdirSync(alternate_workspace);fs.writeFileSync(path.join(alternate_workspace,'other.md'),'# Other workspace\n');
  await evaluate(`workspace_path=${JSON.stringify(alternate_workspace)};window.dispatchEvent(new Event('linux-note-workspace-context-changed'));void 0`);
  assert(await evaluate('picker.root.hidden&&!document.querySelector(".workspace-quick-open-result")'),'changing the mounted folder closes old quick-open results');
  await evaluate('picker.open();void 0');await wait('document.querySelectorAll(".workspace-quick-open-result").length===1');
  assert.equal(await evaluate('document.querySelector(".workspace-quick-open-result").title'),path.join(alternate_workspace,'other.md'));
  await evaluate(`picker.close();workspace_path=${JSON.stringify(workspace)};window.release_old_catalogue=null;picker_files.fs.promises.readdir=async(...args)=>{const entries=await files.fs.promises.readdir(...args);if(args[0]===${JSON.stringify(workspace)})await new Promise(resolve=>release_old_catalogue=resolve);return entries};picker.open();void 0`);
  await wait('!!release_old_catalogue');
  await evaluate(`workspace_path=${JSON.stringify(alternate_workspace)};window.dispatchEvent(new Event('linux-note-workspace-context-changed'));picker.open();void 0`);
  await wait('document.querySelectorAll(".workspace-quick-open-result").length===1');
  await evaluate('release_old_catalogue();void 0');await delay(50);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".workspace-quick-open-result")].map(row=>row.title)'),[path.join(alternate_workspace,'other.md')],'late catalogue from the old folder cannot replace the new root results');
  await evaluate(`picker.dispose();workspace_path=${JSON.stringify(workspace)};void 0`);
  assert(await evaluate('!!document.getElementById("typora-code-style:workspace_file_icons")'),'disposing quick-open preserves the search view icon lease');
  const yaml_file=path.join(workspace,'src','board.yml');
  await open('src/board.yml');
  assert.equal(await evaluate('active_editor().getModel().getLanguageId()'),'yaml','YML must use registered YAML source editor');
  await evaluate(`File.editor.library.openFile(${JSON.stringify(yaml_file)})`);
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.file_path'),yaml_file,'native library API routes YML into the source editor');
  const yaml_uri=require('node:url').pathToFileURL(yaml_file).href;
  await evaluate(`core.app.openFile(${JSON.stringify(yaml_uri)})`);
  await wait(`core.app.workspace.activeLeaf.view?.file_path===${JSON.stringify(yaml_file)}`);
  await evaluate(`File.editor.library.openFile('board.yml')`);
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.file_path'),yaml_file,'relative library API uses the current document parent, not the mounted root');
  await evaluate(`active_editor().pushUndoStop();active_editor().executeEdits('fixture',[{range:active_editor().getModel().getFullModelRange(),text:${JSON.stringify('board:\n  name: unsaved\n')}}]);active_editor().pushUndoStop();void 0`);
  const route_before=await evaluate('({path:core.app.workspace.activeLeaf.view.file_path,uri:core.app.workspace.activeLeaf.state.path,draft:active_editor().getValue(),native:native_opens.length,count:leaves.length})');
  const index_before=fs.readFileSync(path.join(workspace,'.git','index'));
  const yaml_before=fs.readFileSync(yaml_file);
  assert.equal(await evaluate(`core.app.openFile('missing.md').then(()=>null,error=>error.code==='ENOENT'?error.path:null)`),path.join(workspace,'src','missing.md'),'Markdown relative routes resolve beside the current document before native navigation');
  assert.deepEqual(await evaluate('({path:core.app.workspace.activeLeaf.view.file_path,uri:core.app.workspace.activeLeaf.state.path,draft:active_editor().getValue(),native:native_opens.length,count:leaves.length})'),route_before,'missing Markdown is rejected before clearing a dirty source or changing tab identity');
  assert.equal(await evaluate(`(()=>{try{File.editor.library.openFile('missing.md',()=>{});return null}catch(error){return error.code==='ENOENT'?error.path:null}})()`),path.join(workspace,'src','missing.md'),'callback entry also rejects missing Markdown before native mutation');
  assert.equal(await evaluate('native_opens.length'),route_before.native);
  assert.deepEqual(fs.readFileSync(path.join(workspace,'.git','index')),index_before);
  assert.deepEqual(fs.readFileSync(yaml_file),yaml_before,'failed route never saves the current draft');
  await evaluate(`active_editor().trigger('fixture','undo',null);void 0`);
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.dirty()'),false,'fixture undo restores the original clean buffer');
  const complex_source=path.join(workspace,'src','space name [draft] #100%.test.ts');
  await evaluate(`core.app.openFile(${JSON.stringify(complex_source)})`);await wait(`core.app.workspace.activeLeaf.view?.file_path===${JSON.stringify(complex_source)}`);
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.file_path'),complex_source,'application route preserves spaces, brackets, hash and percent characters');
  const complex_leaf_count=await evaluate('leaves.length');
  await evaluate(`core.app.openFile(${JSON.stringify('space name [draft] #100%.test.ts')})`);await delay(80);
  assert.equal(await evaluate('core.app.workspace.activeLeaf.view.file_path'),complex_source,'relative application routes resolve from the active document directory');
  assert.equal(await evaluate('leaves.length'),complex_leaf_count,'relative and absolute routes reuse one source view identity');
  await evaluate(`files.open_file(${JSON.stringify(complex_source.toUpperCase())})`);await delay(80);
  assert.equal(await evaluate('leaves.length'),complex_leaf_count,'Windows case-equivalent paths reuse one source view');
  assert.equal(await evaluate('decodeURIComponent(core.app.workspace.activeLeaf.state.path.slice("typ://linux_note.source_file/".length))'),complex_source,'source view URI round-trips the exact complex path');
  const complex_markdown=path.join(workspace,'src','reading notes #1 [draft].md');
  assert.equal(await evaluate(`File.editor.library.openFile(${JSON.stringify(complex_markdown)},'callback-marker')`),'library-native-result');
  assert.deepEqual(await evaluate('native_library_calls.at(-1)'),{file:complex_markdown,args:['callback-marker'],context:true},'Markdown route delegates the exact complex path, arguments and receiver');
  for(const target of ['reading notes #1 [draft].md',require('node:url').pathToFileURL(complex_markdown).href,'<'+require('node:url').pathToFileURL(complex_markdown).href+'>']) {
    assert.equal(await evaluate(`File.editor.library.openFile(${JSON.stringify(target)},'callback-marker',true)`),'library-native-result');
    assert.deepEqual(await evaluate('native_library_calls.at(-1)'),{file:complex_markdown,args:['callback-marker',true],context:true},'validated absolute Markdown path is exactly the native path for relative and file-URL inputs');
  }
  await evaluate(`window.callback_count=0;window.callback_receiver={};window.callback_args=[];window.callback_this=null;window.saved_callback=function(...args){callback_count++;callback_this=this;callback_args=args;return 73;};window.original_bundle_path=File.bundle.filePath;void 0`);
  assert.equal(await evaluate(`File.editor.library.openFile(${JSON.stringify(complex_markdown+'#Heading')},saved_callback,true)`),'library-native-result');
  assert.equal(await evaluate('native_library_calls.at(-1).file'),complex_markdown,'hash is never part of the native filesystem argument');
  assert(await evaluate('native_library_calls.at(-1).context&&native_library_calls.at(-1).args[1]===true'));
  assert.equal(await evaluate(`native_library_calls.at(-1).args[0].call(callback_receiver,'native-result',42)`),73,'wrapped native callback preserves return value');
  assert(await evaluate('callback_this===callback_receiver'),'wrapped callback retains native receiver');
  assert.deepEqual(await evaluate('({calls:callback_count,args:callback_args})'),{calls:1,args:['native-result',42]});
  const unsupported_count=await evaluate('native_opens.length');
  for(const target of ['https://example.invalid/a.md','mailto:someone@example.invalid','<https://example.invalid/a.md>']) {
    assert(await evaluate(`core.app.openFile(${JSON.stringify(target)}).then(()=>false,()=>true)`));
  }
  assert.equal(await evaluate('native_opens.length'),unsupported_count,'unsupported protocols never reach the native open handler');
  await evaluate(`files.open_file(${JSON.stringify(path.join(workspace,'alpha.md'))})`);assert.equal((await evaluate('native_opens')).at(-1),path.join(workspace,'alpha.md'));
  await open('odd.unrecognized');assert.equal(await evaluate('active_editor().getModel().getLanguageId()'),'plaintext');
  const geometry=await evaluate('(()=>{const body=document.querySelector(".workspace-file-body").getBoundingClientRect(),editor=document.querySelector(".workspace-file-body .monaco-editor").getBoundingClientRect();return{body:body.width,editor:editor.width,height:editor.height,editors:document.querySelectorAll(".workspace-file-body .monaco-editor").length,readonly:active_editor().getRawOptions().readOnly}})()');
  assert.equal(geometry.editors,1);assert(Math.abs(geometry.editor-geometry.body)<2);assert(geometry.height>650);assert.equal(geometry.readonly,false);
  const missing=await evaluate('[...new Set(files_qa.FILE_LANGUAGE_RULES.map(rule=>rule.language))].filter(id=>!files_qa.monaco.languages.getLanguages().some(language=>language.id===id))');assert.deepEqual(missing,[],'every mapped language must be registered in Monaco');
  for(const [name,language]of [['Dockerfile.dev','dockerfile'],['module.d.ts','typescript'],['script','python']]){await open(name);assert.equal(await evaluate('active_editor().getModel().getLanguageId()'),language,name)}
  await open('long.c');
  assert.equal(await evaluate('document.querySelectorAll(".linux-note-editor-status").length'),1);assert.equal(await evaluate('document.querySelectorAll(".linux-note-source-file .workspace-editor-status-controls").length'),0);
  assert(await evaluate('document.querySelector(".linux-note-editor-status").firstChild===core.app.workspace.activeLeaf.view.status_controls'));
  await evaluate('leaves.find(leaf=>leaf.view.file_path?.endsWith("module.d.ts")).view.editor.focused_editor().setPosition({lineNumber:1,column:12})');await delay(60);
  assert.equal(await evaluate('document.querySelector(".linux-note-editor-status [aria-label=语言模式]").textContent'),'c');
  await click('.linux-note-editor-status [aria-label="语言模式"]');await wait('!!document.querySelector("[aria-label=文件语言模式]")');
  await evaluate('document.querySelector("[aria-label=文件语言模式]").value="cpp";[...document.querySelectorAll(".git-graph-dialog-footer button")].find(button=>button.textContent==="应用").click()');
  assert.equal(await evaluate('active_editor().getModel().getLanguageId()'),'cpp');assert(await evaluate('active_editor().hasTextFocus()'),'applying language returns keyboard focus to the active source editor');assert.equal(await evaluate('leaves.find(leaf=>leaf.view.file_path?.endsWith("module.d.ts")).view.editor.models[0].getLanguageId()'),'typescript');
  await click('.linux-note-editor-status [aria-label="语言模式"]');await evaluate('document.querySelector("[aria-label=文件语言模式]").value="c";[...document.querySelectorAll(".git-graph-dialog-footer button")].find(button=>button.textContent==="应用").click()');
  for(const [label,select_label,next,original] of [['保存编码','文件保存编码','utf-16be','utf-8'],['行尾序列','文件行尾序列','CRLF','LF']]){
    await click('.linux-note-editor-status [aria-label='+JSON.stringify(label)+']');await evaluate(`document.querySelector('[aria-label=${JSON.stringify(select_label)}]').value=${JSON.stringify(next)};[...document.querySelectorAll('.git-graph-dialog-footer button')].find(button=>button.textContent==='应用').click()`);assert(await evaluate('core.app.workspace.activeLeaf.view.dirty()'));
    await click('.linux-note-editor-status [aria-label='+JSON.stringify(label)+']');await evaluate(`document.querySelector('[aria-label=${JSON.stringify(select_label)}]').value=${JSON.stringify(original)};[...document.querySelectorAll('.git-graph-dialog-footer button')].find(button=>button.textContent==='应用').click()`);
  }
  assert(!await evaluate('core.app.workspace.activeLeaf.view.dirty()'));assert.equal(fs.readFileSync(path.join(workspace,'long.c'),'utf8'),documents['long.c']);
  assert(await evaluate('active_editor().hasTextFocus()'),'applying file format returns keyboard focus to the active source editor');
  await evaluate('window.status_save_calls=0;window.status_save_view=core.app.workspace.activeLeaf.view;window.status_original_save=status_save_view.save;status_save_view.save=async()=>{status_save_calls++;return true};status_save_view.encoding_button.focus();void 0');
  for(const type of ['keyDown','keyUp'])test_window.webContents.sendInputEvent({type,keyCode:'s',modifiers:['control']});await wait('status_save_calls===1');await evaluate('status_save_view.save=status_original_save;active_editor().focus();void 0');
  await wait('!!document.querySelector(".workspace-file-body .minimap canvas")');const before=await evaluate('active_editor().getScrollTop()');await click('.workspace-file-body .minimap','left',.8);const after=await evaluate('active_editor().getScrollTop()');assert(after>before+5000);assert(await evaluate('active_editor().getVisibleRanges().some(range=>range.startLineNumber>400)'));
  await evaluate(`files.open_file(${JSON.stringify(path.join(workspace,'data.tar.gz'))})`);await wait('document.querySelector(".workspace-file-notice")?.textContent.includes("二进制")');assert.equal(await evaluate('shell_calls.length'),0,'binary preview does not automatically launch external apps');
  await click('[data-id="core.search"]');assert.equal(await evaluate('extra_ribbon.length'),0,'search reuses existing activity button');
  const layout=await evaluate('(()=>{const panel=document.querySelector(".linux-note-workspace-search"),parent=panel.parentElement,query=panel.querySelector("textarea"),box=query.parentElement,style=getComputedStyle(query);return{native:getComputedStyle(document.querySelector("#file-library-search")).display,offset:panel.getBoundingClientRect().top-parent.getBoundingClientRect().top,heading_buttons:panel.querySelectorAll(".workspace-search-heading button").length,replace_hidden:panel.querySelector(".workspace-search-replace").hidden,query_height:box.getBoundingClientRect().height,outline:style.outlineWidth,shadow:style.boxShadow,toggle_boxes:[...panel.querySelectorAll(".workspace-search-query-box button")].every(button=>{const r=button.getBoundingClientRect(),b=button.parentElement.closest(".workspace-search-query-box").getBoundingClientRect();return r.width===0||(r.top>=b.top&&r.bottom<=b.bottom&&r.left>=b.left&&r.right<=b.right)})}})()');
  assert.equal(layout.native,'none');assert.equal(layout.offset,0);assert.equal(layout.heading_buttons,5);assert(layout.replace_hidden);assert(layout.query_height<=28);assert.equal(layout.outline,'0px');assert.equal(layout.shadow,'none');assert(layout.toggle_boxes);
  await click('[data-id="core.search"]');assert.equal(await evaluate('getComputedStyle(document.querySelector("#file-library-search")).display'),'block','native shared search display rules restore when custom panel detaches');await click('[data-id="core.search"]');
  const set_input=async(label,value)=>evaluate(`(()=>{const input=document.querySelector('[aria-label=${JSON.stringify(label)}]');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const search_for=async(value,count)=>{await set_input('搜索内容',value);await wait(`document.querySelectorAll('.workspace-search-match').length===${count} && !document.querySelector('[aria-label="停止搜索"]')`);await delay(50)};
  await search_for('needle',5);
  assert.equal(await evaluate('document.querySelectorAll(".workspace-search-file>summary>.workspace-file-theme-icon").length'),3);
  assert(await evaluate(`([...document.querySelectorAll('.workspace-search-file')].every(group=>{const icon=group.querySelector('summary>.workspace-file-theme-icon'),expected=files_qa.workspace_file_icon(group.dataset.path);return icon.dataset.fileIconPath===group.dataset.path&&icon.textContent===expected.textContent&&icon.dataset.vscodeFileIcon===expected.dataset.vscodeFileIcon&&icon.style.getPropertyValue('--workspace-file-icon-light')===expected.style.getPropertyValue('--workspace-file-icon-light')&&icon.style.getPropertyValue('--workspace-file-icon-dark')===expected.style.getPropertyValue('--workspace-file-icon-dark')&&icon.getBoundingClientRect().width===16}))`),'search rows reuse the same Explorer glyphs and light/dark colors');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".workspace-search-line")).display'),'none','line numbers remain in accessible labels and tooltips without a separate visual column');
  assert.equal(await evaluate('[...document.querySelectorAll(".workspace-search-file")].find(group=>group.dataset.path.endsWith("alpha.md")).querySelector(".workspace-search-git-status").textContent'),'M');
  assert.equal(await evaluate('[...document.querySelectorAll(".workspace-search-file")].find(group=>group.dataset.path.endsWith("sample.test.ts")).querySelector(".workspace-search-git-status")'),null,'clean tracked files have no invented Git status');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".workspace-search-open-editor")).color'),'rgb(0, 106, 177)');
  await click('[aria-label="仅搜索源代码管理中的更改文件"]');await wait('document.querySelectorAll(".workspace-search-match").length===4 && !document.querySelector("[aria-label=停止搜索]")');
  assert.equal(await evaluate('[...document.querySelectorAll(".workspace-search-file")].some(group=>group.dataset.path.endsWith("sample.test.ts"))'),false,'changed scope excludes clean tracked source');
  await click('[aria-label="仅搜索已打开的编辑器"]');await wait('document.querySelectorAll(".workspace-search-match").length===3 && !document.querySelector("[aria-label=停止搜索]")');
  assert.equal(await evaluate('document.querySelector("[aria-label=仅搜索源代码管理中的更改文件]").getAttribute("aria-pressed")'),'false','open-editor and changed-file scopes are mutually exclusive');
  await click('[aria-label="仅搜索已打开的编辑器"]');await wait('document.querySelectorAll(".workspace-search-match").length===5 && !document.querySelector("[aria-label=停止搜索]")');
  execFileSync('git',['-C',workspace,'add','--','.hidden/hidden.py']);await click('[aria-label="仅搜索源代码管理中的更改文件"]');await wait('document.querySelectorAll(".workspace-search-match").length===4 && !document.querySelector("[aria-label=停止搜索]")');
  assert.equal(await evaluate('[...document.querySelectorAll(".workspace-search-file")].find(group=>group.dataset.path.endsWith("hidden.py")).querySelector(".workspace-search-git-status").textContent'),'A','staged additions remain in changed scope and use disk contents');
  await click('[aria-label="仅搜索源代码管理中的更改文件"]');await wait('document.querySelectorAll(".workspace-search-match").length===5 && !document.querySelector("[aria-label=停止搜索]")');
  const group_point=await evaluate('(()=>{const box=document.querySelector(".workspace-search-file>summary").getBoundingClientRect();return{x:Math.round(box.left+40),y:Math.round(box.top+12)}})()');test_window.webContents.sendInputEvent({type:'mouseMove',...group_point});await delay(80);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".workspace-search-file-count")).visibility'),'hidden');assert.equal(await evaluate('getComputedStyle(document.querySelector(".workspace-search-remove")).opacity'),'1');
  fs.writeFileSync(path.join(root,'search_hover_remove.png'),(await test_window.webContents.capturePage()).toPNG());
  await click('.workspace-search-file .workspace-search-remove');assert.equal(await evaluate('document.querySelectorAll(".workspace-search-file").length'),2,'hover remove action removes the file without toggling its disclosure');
  await click('[aria-label="刷新搜索"]');await wait('document.querySelectorAll(".workspace-search-match").length===5 && !document.querySelector("[aria-label=停止搜索]")');
  await click('.workspace-search-open-editor');await wait('!!document.querySelector(".workspace-search-editor-results")');assert.equal(await evaluate('document.querySelectorAll(".workspace-search-editor-results .workspace-search-match").length'),5);assert(await evaluate('document.querySelector(".linux-note-editor-status").hidden'),'tool editor hides stale source status');assert.equal(await evaluate('document.querySelectorAll(".linux-note-workspace-search .workspace-search-match").length'),5,'opening search editor preserves sidebar result rows');
  await click('[aria-label="显示／隐藏搜索详细信息"]');assert.equal(await evaluate('getComputedStyle(document.querySelector(".workspace-search-details")).display'),'none');await click('[aria-label="显示／隐藏搜索详细信息"]');
  fs.writeFileSync(path.join(root,'search_compact_layout.png'),(await test_window.webContents.capturePage()).toPNG());
  await open('long.c');
  const initial=await evaluate('[...document.querySelectorAll(".workspace-search-file")].map(group=>({file:group.dataset.path,path:group.querySelector(".workspace-search-file-path").textContent,matches:[...group.querySelectorAll(".workspace-search-match")].map(row=>({line:row.querySelector(".workspace-search-line").textContent,mark:row.querySelector("mark").textContent}))}))');
  assert.equal(initial.length,3);assert(initial.some(file=>file.path==='src'));assert(initial.some(file=>file.path==='.hidden'));assert(initial.find(file=>file.file.endsWith('alpha.md')).matches.some(match=>match.line==='3'&&match.mark==='NEEDLE'));
  const match_selector='.workspace-search-file[data-path='+JSON.stringify(path.join(workspace,'alpha.md'))+'] .workspace-search-match:nth-of-type(2)';
  const calls_before_preview=await evaluate('open_calls.length');await click(match_selector);await wait('document.querySelector(".workspace-lookup-preview-body").dataset.previewPath?.endsWith("alpha.md")');assert.equal(await evaluate('open_calls.length'),calls_before_preview);assert.equal(await evaluate('active_editor().getModel().getLanguageId()'),'c');
  await evaluate(`document.querySelector(${JSON.stringify(match_selector)}).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await wait('open_calls.length>'+calls_before_preview);assert.deepEqual(await evaluate('open_calls.at(-1)[1]'),{line:3,column:1,end_line:3,end_column:7,source:false,expected_text:'NEEDLE'});
  const source_match='.workspace-search-file[data-path='+JSON.stringify(path.join(workspace,'src/sample.test.ts'))+'] .workspace-search-match';await click(source_match);await evaluate(`document.querySelector(${JSON.stringify(source_match)}).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await wait('active_editor()?.getModel().getLanguageId()==="typescript"');const selection=await evaluate('(()=>{const editor=active_editor(),range=editor.getSelection();return{line:range.startLineNumber,column:range.startColumn,end:range.endColumn,text:editor.getModel().getValueInRange(range)}})()');assert.deepEqual(selection,{line:1,column:7,end:13,text:'needle'});assert.equal(await evaluate('getComputedStyle(document.querySelector(".workspace-file-body .git-diff-toolbar")).display'),'none');assert.equal(await evaluate('getComputedStyle(document.querySelector(".workspace-file-body .git-diff-labels")).display'),'none');
  await click('[aria-label="区分大小写"]');await wait('document.querySelectorAll(".workspace-search-match").length===4');await click('[aria-label="全字匹配"]');await wait('document.querySelectorAll(".workspace-search-match").length===3');
  await click('[aria-label="使用正则表达式"]');await search_for('needle\\s+(Alpha|beta)',1);assert.equal(await evaluate('document.querySelector(".workspace-search-preview mark").textContent'),'needle Alpha');
  assert((await evaluate('worker_queries')).includes('needle\\s+(Alpha|beta)'), 'regular expression matching executes in a real browser Worker');
  // 新查询还在防抖等待期内时立即点替换，不能使用刚才完整但已过期的搜索结果。
  await click('.workspace-search-replace-toggle');await set_input('替换','SHOULD_NOT_APPLY');await set_input('搜索内容','[');await click('[aria-label="全部替换（先预览）"]');
  assert.equal(await evaluate('document.querySelector(".git-graph-dialog-shade")'),null,'new query invalidates the prior replacement snapshot immediately');
  await wait('document.querySelector(".workspace-search-status").textContent.includes("正则表达式无效")');await click('[aria-label="全部替换（先预览）"]');
  assert.equal(await evaluate('document.querySelector(".git-graph-dialog-shade")'),null,'invalid regex cannot replace using a previous result');
  for(const [name,text]of Object.entries(documents))assert.equal(fs.readFileSync(path.join(workspace,name),'utf8'),text,name+' remains unchanged after stale-result attempt');
  await click('.workspace-search-replace-toggle');
  await click('[aria-label="使用正则表达式"]');await click('[aria-label="区分大小写"]');await click('[aria-label="全字匹配"]');await set_input('包含的文件','**/*.md');await search_for('needle',3);assert.equal(await evaluate('document.querySelectorAll(".workspace-search-file").length'),1);
  await set_input('排除的文件','alpha.md');await wait('document.querySelectorAll(".workspace-search-match").length===0');await set_input('排除的文件','');await wait('document.querySelectorAll(".workspace-search-match").length===3');
  await click('[aria-label="展开替换"]');await set_input('替换','found');await click('[aria-label="全部替换（先预览）"]');await wait('!!document.querySelector(".workspace-search-replace-preview .monaco-diff-editor")');
  assert.equal(fs.readFileSync(path.join(workspace,'alpha.md'),'utf8'),documents['alpha.md'],'opening replacement preview is read-only');
  const preview_models=await evaluate('files_qa.monaco.editor.getModels().filter(model=>model.uri.path.includes("alpha.md")).map(model=>model.getValue())');assert(preview_models.some(text=>text.includes('found Alpha')));assert(preview_models.some(text=>text.includes('needle Alpha')));
  fs.writeFileSync(path.join(root,'search_replace_preview.png'),(await test_window.webContents.capturePage()).toPNG());
  await evaluate('[...document.querySelectorAll(".git-graph-dialog-footer button")].find(button=>button.textContent==="确认替换").click()');await wait('!document.querySelector(".git-graph-dialog-shade")');await wait('document.querySelectorAll(".workspace-search-match").length===0');assert.equal(fs.readFileSync(path.join(workspace,'alpha.md'),'utf8'),'# Original\nfound Alpha\nfound beta\nfounds plural\n');
  for(const [name,text]of Object.entries(documents))if(name!=='alpha.md')assert.equal(fs.readFileSync(path.join(workspace,name),'utf8'),text,name);
  // 重建同一临时样本，验证从界面移除文件后，替换范围与可见结果一致。
  fs.writeFileSync(path.join(workspace,'alpha.md'),documents['alpha.md']);await set_input('包含的文件','');await search_for('needle',5);
  const removed_path=path.join(workspace,'src','sample.test.ts');
  await click('.workspace-search-file[data-path='+JSON.stringify(removed_path)+'] > summary','right');await wait('!!document.querySelector(".git-graph-menu")');
  await evaluate('[...document.querySelectorAll(".git-graph-menu button")].find(button=>button.textContent==="从结果中移除").click()');
  assert.equal(await evaluate('document.querySelectorAll(".workspace-search-file").length'),2);assert.equal(await evaluate('document.querySelectorAll(".workspace-search-match").length'),4);
  assert.equal(await evaluate('document.querySelector(".workspace-search-counts").textContent'),'在 2 个文件中找到 4 个结果');
  await set_input('替换','visible');await click('[aria-label="全部替换（先预览）"]');await wait('!!document.querySelector(".workspace-search-replace-preview .monaco-diff-editor")');
  const visible_plan=await evaluate('[...document.querySelectorAll("[aria-label=预览替换文件] option")].map(option=>option.value)');
  assert.deepEqual(visible_plan.sort(),[path.join(workspace,'.hidden','hidden.py'),path.join(workspace,'alpha.md')].sort(),'replacement preview must contain only remaining visible files');
  for(const [name,text]of Object.entries(documents))assert.equal(fs.readFileSync(path.join(workspace,name),'utf8'),text,name+' remains unchanged until confirmation');
  fs.writeFileSync(path.join(root,'visible_result_replace_preview.png'),(await test_window.webContents.capturePage()).toPNG());
  await evaluate('[...document.querySelectorAll(".git-graph-dialog-footer button")].find(button=>button.textContent==="确认替换").click()');await wait('!document.querySelector(".git-graph-dialog-shade")');await wait('document.querySelectorAll(".workspace-search-match").length===1');
  assert.equal(fs.readFileSync(removed_path,'utf8'),documents['src/sample.test.ts'],'removed file must remain byte-identical after batch replacement');
  assert.equal(fs.readFileSync(path.join(workspace,'.hidden','hidden.py'),'utf8'),'visible\n');
  assert.equal(fs.readFileSync(path.join(workspace,'alpha.md'),'utf8'),'# Original\nvisible Alpha\nvisible beta\nvisibles plural\n');
  for(const [name,text]of Object.entries(documents))if(!['alpha.md','.hidden/hidden.py'].includes(name))assert.equal(fs.readFileSync(path.join(workspace,name),'utf8'),text,name);
  const guarded_contents=Object.fromEntries(Object.keys(documents).map(name=>[name,fs.readFileSync(path.join(workspace,name))]));
  // 使用真实引擎的小结果上限，不生成 5000 个无关 DOM 节点来触发相同边界。
  await evaluate('sidebar.activePanel.options.max_results=1');await search_for('needle',1);await wait('document.querySelector(".workspace-search-status").textContent.includes("已达到结果上限")');
  await click('[aria-label="全部替换（先预览）"]');await wait('!!document.querySelector(".git-graph-dialog-shade")');
  assert.equal(await evaluate('[...document.querySelectorAll(".git-graph-dialog-footer button")].some(button=>button.textContent==="确认替换")'),false,'limited search must not gain bulk replacement permission through visible match IDs');
  assert(await evaluate('/未完成|上限|取消/.test(document.querySelector(".git-graph-dialog-content").textContent)'),'limited-result rejection is explained in Chinese');
  await evaluate('[...document.querySelectorAll(".git-graph-dialog-footer button")].find(button=>button.textContent==="关闭").click()');
  await evaluate('(()=>{delete sidebar.activePanel.options.max_results;const input=document.querySelector("[aria-label=搜索内容]");input.value="needle";input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));input.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));})()');
  await wait('document.querySelector(".workspace-search-status").textContent.includes("已停止")');await click('[aria-label="全部替换（先预览）"]');await wait('!!document.querySelector(".git-graph-dialog-shade")');
  assert.equal(await evaluate('[...document.querySelectorAll(".git-graph-dialog-footer button")].some(button=>button.textContent==="确认替换")'),false,'cancelled search must refuse bulk replacement');
  assert(await evaluate('/未完成|上限|取消/.test(document.querySelector(".git-graph-dialog-content").textContent)'),'cancelled-result rejection is explained in Chinese');
  await evaluate('[...document.querySelectorAll(".git-graph-dialog-footer button")].find(button=>button.textContent==="关闭").click()');
  for(const [name,bytes]of Object.entries(guarded_contents))assert(fs.readFileSync(path.join(workspace,name)).equals(bytes),name+' stays byte-identical after limited and cancelled replacement attempts');
  assert.equal(await evaluate('shell_calls.length'),0);
  await evaluate('search.dispose();void 0');
  const dispose_error=await evaluate('(()=>{try{files.dispose();return ""}catch(error){return error?.stack||String(error)}})()');assert.equal(dispose_error,'');
  await evaluate('files.dispose();void 0');
  assert(!await evaluate('!!document.getElementById("typora-code-style:workspace_file_icons")'),'quick-open and search release their final shared icon lease');
  const dispose_state=await evaluate('({core:core.app.openFile===native_core_open,library:File.editor.library.openFile===native_library_open,host:files_qa.get_workspace_files()===files,marker:document.documentElement.hasAttribute("data-linux-note-workspace-files"),source_marker:document.documentElement.hasAttribute("data-linux-note-source-editing")})');
  assert.deepEqual(dispose_state,{core:true,library:true,host:false,marker:false,source_marker:false},'dispose restores routes and removes the released file host and markers');
  assert.equal(await evaluate(`core.app.openFile(${JSON.stringify(complex_source)})`),'core-native-result');
  assert.equal(await evaluate(`File.editor.library.openFile(${JSON.stringify(complex_markdown)},'after-dispose')`),'library-native-result');
  const rebound_state=await evaluate('(()=>{const styles=document.querySelectorAll("style").length;window.rebound=files_qa.bind_workspace_files(core);return{same:rebound===files,idempotent:files_qa.bind_workspace_files(core)===rebound,core:core.app.openFile!==native_core_open,library:File.editor.library.openFile!==native_library_open,styles:document.querySelectorAll("style").length===styles+1}})()');
  assert.deepEqual(rebound_state,{same:false,idempotent:true,core:true,library:true,styles:true},'rebind creates a fresh host with one routing layer and no leaked UI bindings');
  await evaluate('rebound.dispose();rebound.dispose();void 0');
  assert.deepEqual(await evaluate('({core:core.app.openFile===native_core_open,library:File.editor.library.openFile===native_library_open})'),{core:true,library:true},'rebound host restores the exact original functions');
  assert.deepEqual(await evaluate('native_library_calls.at(-1)'),{file:complex_markdown,args:['after-dispose'],context:true},'restored native route still receives the exact complex path');
  // 真正的阅读导航处理 hash；文件适配器只向原生 openFile 传已 stat 的绝对文件。
  await evaluate(`window.hash_content=document.createElement('content');hash_content.style.cssText='display:block;position:fixed;inset:0;height:300px;overflow:auto';hash_content.className='mod-active';hash_content.innerHTML='<div id="write"><h1>Heading</h1><p>Retained text</p></div>';document.body.append(hash_content);window.hash_leaf=leaves[0];hash_leaf.state.path=${JSON.stringify(complex_markdown)};hash_leaf.containerEl=hash_content;hash_leaf.view.containerEl=hash_content.firstElementChild;hash_leaf.view.isEditor=()=>true;hash_leaf.parent.activeLeaf=hash_leaf;core.app.workspace.activeLeaf=hash_leaf;hash_content.append(hash_leaf.view.containerEl);core.app.workspace.activeEditor={openFile(){}};core.app.workspace.rootSplit={on:()=>()=>{}};window[Symbol.for('typora-code:workspace')]=core;File.bundle.filePath=${JSON.stringify(complex_markdown)};window.hash_opens=[];File.editor.tryOpenUrl=hash=>hash_opens.push(hash);File.editor.selection={buildUndo:()=>null};File.editor.sourceView={inSourceMode:false};window.dispose_hash_navigation=files_qa.bind_reading_navigation();window.hash_files=files_qa.bind_workspace_files(core);void 0`);
  await evaluate(`File.editor.library.openFile(${JSON.stringify(complex_markdown+'#Heading')},saved_callback,true);void 0`);
  assert.equal(await evaluate('native_library_calls.at(-1).file'),complex_markdown);
  await evaluate(`native_library_calls.at(-1).args[0].call(callback_receiver,'loaded');void 0`);await wait('hash_opens.length===1');
  assert.deepEqual(await evaluate('hash_opens'),['#Heading'],'successful native completion reuses actual reading navigation for the separate anchor');
  await delay(240);await evaluate(`hash_files.dispose();dispose_hash_navigation();hash_content.remove();void 0`);


  console.log(JSON.stringify({status:'PASS',checks:['workspace file routing binds idempotently without wrapper nesting','complex file paths survive application and native-library routing','dispose restores original open functions and supports a clean rebind','Markdown dispatches to the native host instead of creating a source editor','unknown file opens one full-width editable source editor','all mapped languages registered in real Monaco','compound suffix, Dockerfile prefix and shebang reach correct model language','real minimap click jumps into long source document','binary file stays visible with explanation and no external execution','search reuses native activity entry','native shared search hides only while custom panel is attached','search header includes view options and replacement starts collapsed','scope and matching controls stay inside 26px input frames','native orange focus outlines cannot create a second input border','changed-file scope includes real modifications and staged additions but excludes clean files','changed-file and open-editor scopes are mutually exclusive','groups show real Git status and standard file icons','hover replaces count with functional remove action','results open in a full editor while preserving the sidebar','pattern details can collapse and expand','results group files with path, accessible line number and highlighted literal text','single click previews below the result list without switching editor; double click opens the exact Markdown or source location','case sensitive, whole word and regex toggles change results','regex matching runs in real isolated Worker','new invalid query immediately invalidates old replacement results without writing files','invalid regex reports Chinese error','include and exclude globs change file scope','replacement preview renders before and after without modifying files','explicit confirmation applies only previewed file','removing a result file excludes it from preview and actual replacement','limited results cannot be bulk-replaced through visible IDs','cancelled search cannot be bulk-replaced','other files byte-identical'],geometry,layout,initial,selection,visible_plan,minimap:{before,after},evidence:root},null,2));
  test_window.destroy();app.exit(0);
}).catch(error=>{console.error(error);test_window?.destroy();app.exit(1)});
