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
for(const directory of ['src','.hidden','ignored'])fs.mkdirSync(path.join(workspace,directory));
const documents={
  'alpha.md':'# Original\nneedle Alpha\nNEEDLE beta\nneedles plural\n',
  'src/sample.test.ts':'const needle = 1;\nfunction unrelated() {}\n',
  '.hidden/hidden.py':'needle\n',
  'ignored/generated.log':'needle ignored\n',
  '.gitignore':'ignored/\n',
  'odd.unrecognized':'ordinary text\n',
  'Dockerfile.dev':'FROM scratch\n',
  'module.d.ts':'declare const result: string;\n',
  'script':'#!/usr/bin/env python3\nprint("hello")\n',
  'long.c':Array.from({length:700},(_,index)=>'int value_'+index+' = '+index+';').join('\n'),
};
for(const [name,text]of Object.entries(documents))fs.writeFileSync(path.join(workspace,name),text);
fs.writeFileSync(path.join(workspace,'data.tar.gz'),Buffer.from([0x1f,0x8b,8,0]));
app.setPath('userData',path.join(root,'user_data'));app.disableHardwareAcceleration();
let test_window;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=source=>test_window.webContents.executeJavaScript(source);
const wait=async source=>{for(let index=0;index<240;index++){if(await evaluate(source))return;await delay(25);}throw new Error('Timed out: '+source)};
app.whenReady().then(async()=>{
  test_window=new BrowserWindow({show:false,width:1280,height:850,webPreferences:{contextIsolation:false,nodeIntegration:true,backgroundThrottling:false,offscreen:true}});
  const filename=path.join(root,'test.html');fs.writeFileSync(filename,'<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden;color:#24292f;background:white;font-family:Arial}#sidebar-content{position:absolute;left:36px;top:0;bottom:0;width:320px}#editor-group{position:absolute;left:356px;right:0;top:0;bottom:0}.typ-ribbon-item{width:35px;height:35px;position:absolute;left:0;top:0;cursor:pointer}.leaf{height:100%;width:100%}</style><div class="typ-ribbon-item" data-id="core.search">搜索</div><div id="typora-sidebar"><div id="sidebar-content"></div></div><div id="editor-group"></div>');await test_window.loadFile(filename);
  const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export {bind_workspace_files} from "./src/workspace_files";export {bind_workspace_search} from "./src/workspace_search";export {FILE_LANGUAGE_RULES} from "./src/file_language";export * as monaco from "monaco-editor/editor/editor.api";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'files_qa',write:false});await evaluate(bundle.outputFiles[0].text);
  await evaluate(String.raw`(()=>{
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(style);
    window.workspace_path=${JSON.stringify(workspace)};window.native_opens=[];window.shell_calls=[];window.copied=[];window.leaves=[];window.factories=new Map();window.commands=new Map();window.listeners=new Map();window.extra_ribbon=[];
    const native_worker=window.Worker;window.worker_queries=[];window.Worker=class extends native_worker{postMessage(message,...args){if(message?.options?.regex)worker_queries.push(message.options.query);return super.postMessage(message,...args)}};
    window.reqnode=name=>name==='electron'?{shell:{openPath:file=>shell_calls.push(file),showItemInFolder:file=>shell_calls.push(file)},clipboard:{writeText:text=>copied.push(text)}}:require(name);
    window.File={getMountFolder:()=>workspace_path,bundle:{filePath:workspace_path+'/alpha.md'},changeCounter:{isDocumentEdited:()=>false},editor:{library:{openFile:file=>native_opens.push(file)}}};
    window.sidebar={panels:[],activePanel:undefined,isShown:false,addPanel(panel){this.panels.push(panel);if(panel.ribbonButton)extra_ribbon.push(panel.ribbonButton)},switch(kind){if(this.activePanel instanceof kind)this.toggle();else{this.hide();this.activePanel=this.panels.find(panel=>panel instanceof kind);this.show()}},show(){this.isShown=true;this.activePanel?.show()},hide(){this.isShown=false;this.activePanel?.hide()},toggle(){this.isShown?this.hide():this.show()}};
    class panel {show(){document.querySelector('#sidebar-content').append(this.containerEl);this.onshow()}hide(){this.containerEl.remove();this.onhide()}}
    class view {constructor(leaf){this.leaf=leaf;this.containerEl=document.createElement('div')}onOpen(){}onClose(){}}
    window.parent_group={appendChild(leaf){leaves.push(leaf)},toggleTab(uri){return leaves.find(leaf=>leaf.state.path===uri)}};
    const native_leaf={state:{path:workspace_path+'/alpha.md'},parent:parent_group,view:{containerEl:document.createElement('div'),onOpen(){},onClose(){}},containerEl:document.createElement('div')};leaves.push(native_leaf);let active=native_leaf;
    const workspace_api={sidebar,activeFile:workspace_path+'/alpha.md',get activeLeaf(){return active},set activeLeaf(leaf){active?.view.onClose?.();active=leaf;const group=document.querySelector('#editor-group');group.replaceChildren(leaf.view.containerEl);leaf.view.onOpen();listeners.get('active-leaf:change')?.forEach(callback=>callback(leaf))},eachLeaves(callback){leaves.forEach(callback)},createLeaf(descriptor){const leaf={...descriptor,parent:parent_group,containerEl:document.createElement('div')};leaf.view=factories.get(descriptor.type)(leaf);return leaf},on(event,callback){if(!listeners.has(event))listeners.set(event,[]);listeners.get(event).push(callback);return()=>listeners.set(event,listeners.get(event).filter(item=>item!==callback))}};
    window.core={SidebarPanel:panel,WorkspaceView:view,app:{openFile:file=>native_opens.push(file),workspace:workspace_api,viewManager:{registerView:(name,factory)=>factories.set(name,factory)},commands:{register:command=>commands.set(command.id,command),run:id=>commands.get(id)?.callback()}}};
    window.files=files_qa.bind_workspace_files(core);window.search=files_qa.bind_workspace_search(core,files);window.active_editor=()=>core.app.workspace.activeLeaf.view.editor?.focused_editor();
  })()`);
  const open=async name=>{await evaluate(`files.open_file(${JSON.stringify(path.join(workspace,name))})`);await wait('!!active_editor()');await delay(80)};
  const click=async(selector,button='left',fraction=.5)=>{const point=await evaluate(`(()=>{const box=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(box.left+box.width/2),y:Math.round(box.top+box.height*${fraction})}})()`);for(const type of ['mouseMove','mouseDown','mouseUp']){test_window.webContents.sendInputEvent({type,...point,button,clickCount:1});await delay(25)}await delay(100)};
  await evaluate(`files.open_file(${JSON.stringify(path.join(workspace,'alpha.md'))})`);assert.equal((await evaluate('native_opens')).at(-1),path.join(workspace,'alpha.md'));
  await open('odd.unrecognized');assert.equal(await evaluate('active_editor().getModel().getLanguageId()'),'plaintext');
  const geometry=await evaluate('(()=>{const body=document.querySelector(".workspace-file-body").getBoundingClientRect(),editor=document.querySelector(".workspace-file-body .monaco-editor").getBoundingClientRect();return{body:body.width,editor:editor.width,height:editor.height,editors:document.querySelectorAll(".workspace-file-body .monaco-editor").length,readonly:active_editor().getRawOptions().readOnly}})()');
  assert.equal(geometry.editors,1);assert(Math.abs(geometry.editor-geometry.body)<2);assert(geometry.height>650);assert(geometry.readonly);
  const missing=await evaluate('[...new Set(files_qa.FILE_LANGUAGE_RULES.map(rule=>rule.language))].filter(id=>!files_qa.monaco.languages.getLanguages().some(language=>language.id===id))');assert.deepEqual(missing,[],'every mapped language must be registered in Monaco');
  for(const [name,language]of [['Dockerfile.dev','dockerfile'],['module.d.ts','typescript'],['script','python']]){await open(name);assert.equal(await evaluate('active_editor().getModel().getLanguageId()'),language,name)}
  await open('long.c');await wait('!!document.querySelector(".workspace-file-body .minimap canvas")');const before=await evaluate('active_editor().getScrollTop()');await click('.workspace-file-body .minimap','left',.8);const after=await evaluate('active_editor().getScrollTop()');assert(after>before+5000);assert(await evaluate('active_editor().getVisibleRanges().some(range=>range.startLineNumber>400)'));
  await evaluate(`files.open_file(${JSON.stringify(path.join(workspace,'data.tar.gz'))})`);await wait('document.querySelector(".workspace-file-notice")?.textContent.includes("二进制")');assert.equal(await evaluate('shell_calls.length'),0,'binary preview does not automatically launch external apps');
  await click('[data-id="core.search"]');assert.equal(await evaluate('extra_ribbon.length'),0,'search reuses existing activity button');
  const set_input=async(label,value)=>evaluate(`(()=>{const input=document.querySelector('[aria-label=${JSON.stringify(label)}]');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  const search_for=async(value,count)=>{await set_input('搜索内容',value);await wait(`document.querySelectorAll('.workspace-search-match').length===${count} && !document.querySelector('[aria-label="停止搜索"]')`);await delay(50)};
  await search_for('needle',5);
  const initial=await evaluate('[...document.querySelectorAll(".workspace-search-file")].map(group=>({file:group.dataset.path,path:group.querySelector(".workspace-search-file-path").textContent,matches:[...group.querySelectorAll(".workspace-search-match")].map(row=>({line:row.querySelector(".workspace-search-line").textContent,mark:row.querySelector("mark").textContent}))}))');
  assert.equal(initial.length,3);assert(initial.some(file=>file.path==='src'));assert(initial.some(file=>file.path==='.hidden'));assert(initial.find(file=>file.file.endsWith('alpha.md')).matches.some(match=>match.line==='3'&&match.mark==='NEEDLE'));
  const match_selector='.workspace-search-file[data-path='+JSON.stringify(path.join(workspace,'alpha.md'))+'] .workspace-search-match:nth-of-type(2)';
  await click(match_selector);await wait('active_editor()?.getModel().getLanguageId()==="markdown"');const selection=await evaluate('(()=>{const editor=active_editor(),range=editor.getSelection();return{line:range.startLineNumber,column:range.startColumn,end:range.endColumn,text:editor.getModel().getValueInRange(range)}})()');assert.deepEqual(selection,{line:3,column:1,end:7,text:'NEEDLE'});assert(await evaluate('[...document.querySelectorAll(".workspace-file-toolbar button")].some(button=>button.textContent==="打开 Markdown 渲染")'));
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
  assert.equal(await evaluate('document.querySelector(".workspace-search-status").textContent'),'在 2 个文件中找到 4 个结果');
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
  console.log(JSON.stringify({status:'PASS',checks:['Markdown uses native rendered opener','unknown file opens one full-width read-only source editor','all mapped languages registered in real Monaco','compound suffix, Dockerfile prefix and shebang reach correct model language','real minimap click jumps into long source document','binary file stays visible with explanation and no external execution','search reuses native activity entry','results group files with path, line number and highlighted literal text','real result click selects exact Markdown source match','case sensitive, whole word and regex toggles change results','regex matching runs in real isolated Worker','new invalid query immediately invalidates old replacement results without writing files','invalid regex reports Chinese error','include and exclude globs change file scope','replacement preview renders before and after without modifying files','explicit confirmation applies only previewed file','removing a result file excludes it from preview and actual replacement','limited results cannot be bulk-replaced through visible IDs','cancelled search cannot be bulk-replaced','other files byte-identical'],geometry,initial,selection,visible_plan,minimap:{before,after},evidence:root},null,2));
  test_window.destroy();app.exit(0);
}).catch(error=>{console.error(error);test_window?.destroy();app.exit(1)});
