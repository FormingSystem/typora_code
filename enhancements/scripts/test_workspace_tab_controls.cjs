const {app,BrowserWindow}=require('electron');const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_tab_controls_'));app.setPath('userData',path.join(root,'electron'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1100,height:720,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});win.webContents.on('console-message',(_e,_l,m)=>console.log(m));const html=path.join(root,'host.html');fs.writeFileSync(html,'<!doctype html><body><div id="typora-sidebar"><div id="sidebar-content"><div id="outline-content"></div><div id="file-library"></div><div id="file-library-search"><div><input id="file-library-search-input"></div></div><div id="file-library-search-result"></div></div></div><div id="typora-sidebar-resizer"></div><content><div id="write"></div></content><footer id="footer"><span id="footer-word-count"></span></footer>','utf8');await win.loadFile(html);
await win.webContents.executeJavaScript(`window.$=window.jQuery=require(${JSON.stringify(require.resolve('jquery'))});window.fixture_errors=[];window.addEventListener('error',e=>(fixture_errors.push(String(e.error?.stack||e.error)),console.log(e.error?.stack)));window.addEventListener('unhandledrejection',e=>fixture_errors.push(String(e.reason)));window.reqnode=name=>require(name);window._options={userDataPath:${JSON.stringify(root)},mountFolder:${JSON.stringify(path.join(root,'one'))},appLocale:'en',locale:'en'};window.fixture_noop=()=>{};window.fixture_object=()=>new Proxy(function(){},{get(target,key){if(key in target)return target[key];if(key==='then'||typeof key==='symbol')return undefined;return target[key]=fixture_object();}});window.editor=fixture_object();editor.writingArea=document.querySelector('#write');editor.library=fixture_object();editor.selection=fixture_object();editor.sourceView=fixture_object();editor.nodeMap={allNodes:{_set:[],first:()=>null}};editor.getMarkdown=()=>'';window.File=fixture_object();File.isNode=true;File.isMac=false;File.isWin=true;File.filePath='';File.bundle={filePath:''};File.option={};File.getMountFolder=()=>_options.mountFolder;File.setMountFolder=path=>_options.mountFolder=path;File.editor=editor;window.JSBridge=fixture_object();window.bridge=fixture_object();window.ClientCommand=fixture_object();window.CodeMirror=fixture_object();window.gettext=value=>value;void 0`);
// Only host APIs are substituted; runtime production bundle and settings/fs implementation are real.
fs.mkdirSync(path.join(root,'typora_code','locales'),{recursive:true});for(const name of fs.readdirSync(path.join(__dirname,'../dist/locales')))fs.copyFileSync(path.join(__dirname,'../dist/locales',name),path.join(root,'typora_code','locales',name));
await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'../dist/workspace_core.js'),'utf8'));
await win.webContents.executeJavaScript(`window.runtime=window[Symbol.for('typora-code:workspace')];runtime.ready.then(()=>'ready').catch(error=>{console.log(fixture_errors.join('\\n'));throw error})`);

win.webContents.debugger.attach();await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
const evaluate=source=>win.webContents.executeJavaScript(source);const pause=()=>new Promise(resolve=>setTimeout(resolve,80));const checks=[];
const check=async(source,label)=>{assert(await evaluate(source),label);checks.push(label)};
await win.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../dist/workspace_core.css'),'utf8'));
await win.webContents.insertCSS('html,body{margin:0;width:100%;height:100%;font-size:16px}body{overflow:hidden}#typora-sidebar,#typora-sidebar-resizer,.typ-ribbon{display:none!important}.fixture-tabs-host{position:fixed!important;inset:0!important;width:auto!important;height:auto!important;margin:0!important;display:flex!important;z-index:100000!important;background:white}.fixture-tabs-host>.typ-workspace-tabs{flex:1;min-width:0;max-width:100%}');
const bundle=await require('esbuild').build({stdin:{contents:'export {bind_workspace_tab_controls} from "./src/workspace_tab_controls";export {set_workspace_editor_setting} from "./src/workspace_editor_settings"; export {bind_workspace_file_tab_icons} from "./src/workspace_file_icons";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,loader:{'.css':'text'},format:'iife',globalName:'tab_qa'});await evaluate(bundle.outputFiles[0].text);
for(const name of ['one.md','two.md','background.md','other.md','预览说明.md',...Array.from({length:12},(_,i)=>'long_document_name_'+i+'.md')])fs.writeFileSync(path.join(root,name),'# fixture\n','utf8');
await evaluate(`process.chdir(${JSON.stringify(root)});void 0`);
await evaluate(`window.group=runtime.app.workspace.activeLeaf.parent;window.original_header=group.tabHeader.containerEl;window.original_tabs=group.tabHeader.container;window.root_el=runtime.app.workspace.rootSplit.containerEl;root_el.classList.add('fixture-tabs-host');window.open_groups=[];window.open_files=()=>open_groups.push(runtime.app.workspace.activeLeaf.parent);window.binding=tab_qa.bind_workspace_tab_controls(runtime);void 0`);await pause();
await check('group.tabHeader.containerEl===original_header&&group.tabHeader.container===original_tabs&&original_header.parentElement.classList.contains("workspace-tab-strip")','wrapper retains the actual core header references and delegated tab container');
await check('tab_qa.bind_workspace_tab_controls(runtime)===binding&&group.containerEl.querySelectorAll(".workspace-tab-strip").length===1&&!document.querySelector(".workspace-file-search-trigger")','repeat binding shares one observer and one wrapper per real group without a search action');
await check('group.activeLeaf.state.path===""&&getComputedStyle(original_header.parentElement).display!=="none"','real initial Untitled keeps its tab');
await evaluate(`group.removeTab('');void 0`);await pause();
await check('group.activeLeaf.state.path.startsWith("typ://core.empty/")&&getComputedStyle(original_header.parentElement).display==="none"','closing the last Untitled hides the entire empty-placeholder strip');
await evaluate(`runtime.app.viewManager.registerView('fixture.tabs',leaf=>new class extends runtime.WorkspaceView{constructor(leaf){super(leaf);this.containerEl=document.createElement('div');}onOpen(){}}(leaf));window.add_file=(target,name)=>{const leaf=runtime.app.workspace.createLeaf({type:'fixture.tabs',state:{path:name}});target.appendChild(leaf);return leaf;};window.first=add_file(group,'one.md');window.second=add_file(group,'two.md');runtime.app.workspace.activeLeaf=second;void 0`);await pause();
await check('getComputedStyle(original_header.parentElement).display!=="none"&&group.children.length===2','first real file replaces the empty leaf and restores the same tab strip');
await evaluate(`original_header.querySelector('[data-id="one.md"] .typ-file-basename').click();void 0`);
await check('runtime.app.workspace.activeLeaf===first&&group.activeLeaf===first','real delegated tab click still activates the correct file after wrapping');
await evaluate(`original_header.querySelector('[data-id="two.md"] .workspace-tab-close-icon').dispatchEvent(new MouseEvent("click",{bubbles:true}));void 0`);await pause();
await check('group.children.length===1&&group.children[0]===first&&!original_header.querySelector(`[data-id="two.md"]`)','real close delegation removes only the requested tab');
await evaluate(`window.background=add_file(group,'background.md');runtime.app.workspace.activeLeaf=background;window.other=new group.constructor();runtime.app.workspace.rootSplit.appendChild(other);window.other_leaf=add_file(other,'other.md');runtime.app.workspace.activeLeaf=other_leaf;void 0`);await pause();
await check('getComputedStyle(original_header.querySelector(".typ-tab.active")).color==="rgb(32, 32, 32)"&&getComputedStyle(original_header.querySelector(".typ-tab:not(.active)")).color.includes("0.5")&&getComputedStyle(other.tabHeader.getTabById("other.md")).color==="rgb(32, 32, 32)"','Modern Light colors share active states across groups and dim only inactive labels');
await evaluate(`runtime.app.workspace.activeLeaf=background;void 0`);
await check('runtime.app.workspace.activeLeaf===background','core group activation remains independent of titlebar search');
await check('getComputedStyle(original_header.querySelector(".typ-tab:not(.active)")).color.includes("0.5")&&getComputedStyle(original_header.querySelector(".typ-tab.active")).fontSize==="13px"&&original_header.querySelector(".typ-tab").getBoundingClientRect().height===32','focused group retains background-tab color, 13px type and source-backed 32px tab height');

await evaluate(`window.long_leaf=add_file(group,'file_name_that_is_longer_than_twenty_characters_中文&.md');runtime.app.workspace.activeLeaf=long_leaf;void 0`);await pause();
await check(`group.tabHeader.getTabById(long_leaf.state.path).querySelector('.typ-file-basename').textContent==='file_name_that_is_longer_than_twenty_characters_中文&'`,'full Unicode and ampersand filename survives production core rendering without pre-truncation');
await evaluate(`window.long_tab=group.tabHeader.getTabById(long_leaf.state.path);window.before_hover={label:long_tab.querySelector('.typ-file-basename').getBoundingClientRect().toJSON(),tab:long_tab.getBoundingClientRect().toJSON()};void 0`);
const hover_point=await evaluate(`(()=>{const r=long_tab.getBoundingClientRect();return {x:Math.round(r.right-10),y:Math.round(r.top+16)}})()`);
win.webContents.sendInputEvent({type:'mouseMove',...hover_point});await pause();

await check(`(()=>{const a=before_hover,b=long_tab.querySelector('.typ-file-basename').getBoundingClientRect(),t=long_tab.getBoundingClientRect();return a.label.x===b.x&&a.label.width===b.width&&a.tab.x===t.x&&a.tab.width===t.width&&getComputedStyle(long_tab.querySelector('.typ-close')).opacity==='1'&&getComputedStyle(long_tab,'::after').borderRadius==='4px'&&getComputedStyle(long_tab).borderTopWidth==='0px'})()`,'real pointer hover shows close overlay without moving filename or tab and keeps rounded inset fill');
fs.writeFileSync(path.join(root,'tab_controls_light.png'),(await win.webContents.capturePage()).toPNG());
await evaluate(`long_tab.focus();long_tab.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));void 0`);
await check(`document.activeElement===group.tabHeader.getTabById('one.md')`,'keyboard Home focuses the first real tab without opening a different document');
await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));void 0`);await pause();
await check(`runtime.app.workspace.activeLeaf===first`,'Enter on the focused tab activates the original leaf');
await evaluate(`window.keyboard_close=long_tab.querySelector('.typ-close');keyboard_close.focus();keyboard_close.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));void 0`);await pause();
await check(`!group.children.includes(long_leaf)&&group.children.includes(first)`,'Space on close removes only its target and does not activate a removed tab');
await evaluate(`runtime.app.workspace.activeLeaf=background;void 0`);await pause();

await evaluate(`document.documentElement.dataset.workspaceFileIconTheme='dark';void 0`);
await check('getComputedStyle(original_header.querySelector(".typ-tab.active")).color==="rgb(191, 191, 191)"&&getComputedStyle(other.tabHeader.getTabById("other.md")).color==="rgb(191, 191, 191)"','Modern Dark colors use the same active foreground in both groups');
await evaluate(`for(let i=0;i<12;i++)add_file(group,'long_document_name_'+i+'.md');runtime.app.workspace.activeLeaf=group.activeLeaf;void 0`);await pause();
win.setSize(460,720);await pause();
await check('(()=>{const header=original_header.getBoundingClientRect(),strip=original_header.parentElement.getBoundingClientRect();return header.width>30&&Math.abs(header.width-strip.width)<1&&!document.querySelector(".workspace-file-search-trigger")})()','actual narrow viewport uses full header width without a duplicate search control');
await check('original_header.parentElement.getBoundingClientRect().height===32&&other.tabHeader.containerEl.parentElement.getBoundingClientRect().height===32','overflowing and nonoverflowing groups retain the same 32px total strip height despite native scrollbars');
await evaluate(`original_header.scrollLeft=0;original_tabs.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}));void 0`);
await check('original_header.scrollLeft>0','core wheel-to-horizontal scroll handler survives wrapping');
fs.writeFileSync(path.join(root,'tab_controls_narrow.png'),(await win.webContents.capturePage()).toPNG());
await evaluate(`window.detached=other.containerEl;detached.remove();void 0`);await pause();
await check('!detached.querySelector(".workspace-tab-strip")&&other.tabHeader.containerEl.parentElement===detached&&!other.tabHeader.getTabById("other.md").hasAttribute("role")&&!other.tabHeader.getTabById("other.md").querySelector(".typ-close").hasAttribute("aria-label")','detached group releases its action and restores the original header position');
await evaluate(`root_el.append(detached);void 0`);await pause();
await check('detached.querySelectorAll(".workspace-tab-strip").length===1','reinserting a real group creates one wrapper');

// 仅替代宿主正文模式；真实叶子、分组、标签和共享 Seti 绑定一起验证标签呈现。
win.setSize(1100,720);await pause();
await evaluate(`
window.markdown_factory=runtime.app.viewManager.getViewCreatorByType('core.markdown');
runtime.app.viewManager.registerView('core.markdown',leaf=>new class extends runtime.WorkspaceView{
  constructor(leaf){super(leaf);this.containerEl=document.createElement('div');this.native_editor=true;}
  isEditor(){return this.native_editor;}
  onOpen(){}
}(leaf));
window.markdown_path=${JSON.stringify(path.join(root,'预览说明.md'))};
window.add_markdown=(target,native_editor)=>{
  const leaf=runtime.app.workspace.createLeaf({type:'core.markdown',state:{path:markdown_path}});
  leaf.view.native_editor=native_editor;target.appendChild(leaf);runtime.app.workspace.activeLeaf=leaf;return leaf;
};
window.markdown_left=add_markdown(group,true);window.markdown_right=add_markdown(other,false);
window.markdown_icon_binding=tab_qa.bind_workspace_file_tab_icons(runtime);
window.markdown_left_tab=group.tabHeader.getTabById(markdown_path);window.markdown_right_tab=other.tabHeader.getTabById(markdown_path);
window.markdown_left_label=markdown_left_tab.querySelector('.typ-file-basename');window.markdown_right_label=markdown_right_tab.querySelector('.typ-file-basename');
window.markdown_tab_matches=tab=>{
  const slot=tab.querySelector('.typ-file-icon'),icon=slot?.querySelector('.workspace-file-theme-icon');
  return !!icon&&icon.dataset.vscodeFileIcon==='_markdown'&&icon.dataset.fileIconPath===markdown_path
    &&icon.textContent.codePointAt(0)===0xe060&&getComputedStyle(icon).fontFamily==='typora-code-seti'
    &&getComputedStyle(slot).display!=='none'&&slot.getBoundingClientRect().width===16&&slot.getBoundingClientRect().height>0
    &&icon.getBoundingClientRect().width===16&&icon.getBoundingClientRect().height>0
    &&tab.querySelector('.workspace-tab-label').textContent===String.fromCodePoint(0xe060)+'预览说明.md'
    &&!tab.querySelector('.workspace-tab-preview-icon,.workspace-tab-preview-label,[data-git-icon="preview"]')
    &&!tab.classList.contains('is-workspace-markdown-preview');
};
markdown_left_tab.scrollIntoView({block:'nearest',inline:'nearest'});markdown_right_tab.scrollIntoView({block:'nearest',inline:'nearest'});void 0`);
await pause();await evaluate('document.fonts.ready.then(()=>true)');
await check('markdown_left.view.isEditor()&&!markdown_right.view.isEditor()&&markdown_tab_matches(markdown_left_tab)&&markdown_tab_matches(markdown_right_tab)','native-editor and reading Markdown tabs both show the real Seti file icon and exact filename without a preview prefix');
await check('markdown_left!==markdown_right&&markdown_left.parent===group&&markdown_right.parent===other&&markdown_left.state.path===markdown_right.state.path&&markdown_left_tab!==markdown_right_tab&&group.tabHeader.getTabById(markdown_path)===markdown_left_tab&&other.tabHeader.getTabById(markdown_path)===markdown_right_tab','the same Markdown path in two real groups keeps separate leaf and tab identities');
await check('markdown_left_label.textContent==="预览说明"&&markdown_right_label.textContent==="预览说明"&&markdown_left_tab.querySelector(".typ-file-ext").textContent===".md"&&markdown_right_tab.querySelector(".typ-file-ext").textContent===".md"','a filename containing the word preview retains its complete basename and Markdown extension');
await evaluate(`document.documentElement.dataset.workspaceFileIconTheme='light';void 0`);
await check('[markdown_left_tab,markdown_right_tab].every(tab=>getComputedStyle(tab.querySelector(".workspace-file-theme-icon")).color==="rgb(73, 139, 167)")','both Markdown modes retain the official light Seti file color');
fs.writeFileSync(path.join(root,'tab_controls_markdown_light.png'),(await win.webContents.capturePage()).toPNG());
await evaluate(`markdown_left.view.native_editor=false;markdown_right.view.native_editor=true;markdown_left.view.setIcon('fa-file-text');markdown_right.view.setIcon('fa-file-text-o');runtime.app.workspace.activeLeaf=markdown_left;void 0`);
await new Promise(resolve=>setTimeout(resolve,180));
await check('!markdown_left.view.isEditor()&&markdown_right.view.isEditor()&&markdown_tab_matches(markdown_left_tab)&&markdown_tab_matches(markdown_right_tab)&&markdown_left_tab.querySelector(".typ-file-basename")===markdown_left_label&&markdown_right_tab.querySelector(".typ-file-basename")===markdown_right_label','swapping Markdown modes and delayed native icons preserves both file labels and visible Seti icons');
// 核心 onToggle 只处理组内未选中标签；先通过真实标签切换建立此前置状态。
await evaluate(`other.tabHeader.getTabById(other_leaf.state.path).querySelector('.typ-file-basename').click();runtime.app.workspace.activeLeaf=markdown_left;void 0`);await pause();
await check('other.activeLeaf===other_leaf&&!markdown_right_tab.classList.contains("active")&&runtime.app.workspace.activeLeaf===markdown_left','right-group Markdown target is inactive before testing its delegated tab switch');
await evaluate(`markdown_right_tab.querySelector('.typ-file-basename').click();void 0`);await pause();
await check('runtime.app.workspace.activeLeaf===markdown_right&&other.activeLeaf===markdown_right&&markdown_tab_matches(markdown_right_tab)','clicking the inactive same-path Markdown label activates its own right-group leaf after the mode swap');
await evaluate(`group.tabHeader.getTabById(background.state.path).querySelector('.typ-file-basename').click();runtime.app.workspace.activeLeaf=markdown_right;void 0`);await pause();
await check('group.activeLeaf===background&&!markdown_left_tab.classList.contains("active")&&runtime.app.workspace.activeLeaf===markdown_right','left-group Markdown target is inactive before testing its delegated tab switch');
await evaluate(`markdown_left_tab.querySelector('.typ-file-basename').click();void 0`);await pause();
await check('runtime.app.workspace.activeLeaf===markdown_left&&group.activeLeaf===markdown_left&&markdown_tab_matches(markdown_left_tab)','clicking the inactive same-path label in the left group activates that distinct leaf');
await evaluate(`document.documentElement.dataset.workspaceFileIconTheme='dark';void 0`);
await check('[markdown_left_tab,markdown_right_tab].every(tab=>markdown_tab_matches(tab)&&getComputedStyle(tab.querySelector(".workspace-file-theme-icon")).color==="rgb(81, 154, 186)")','both Markdown modes retain visible file icons and the official dark Seti color');
fs.writeFileSync(path.join(root,'tab_controls_markdown_dark.png'),(await win.webContents.capturePage()).toPNG());
await evaluate(`markdown_icon_binding.dispose();runtime.app.viewManager.registerView('core.markdown',markdown_factory);void 0`);
await evaluate(`for(let i=0;i<2;i++)add_file(group,'long_document_name_'+i+'.md');tab_qa.set_workspace_editor_setting('wrap_tabs',true);void 0`);await pause();
await check(`original_header.parentElement.classList.contains('is-wrapping')&&original_header.getBoundingClientRect().height>32`,'configured wrapping places tabs on multiple lines');
await evaluate(`tab_qa.set_workspace_editor_setting('wrap_tabs',false);void 0`);await pause();
await check(`!original_header.parentElement.classList.contains('is-wrapping')&&original_header.getBoundingClientRect().height===32`,'disabling wrapping restores single row without closing files');
await evaluate(`binding.dispose();binding.dispose();void 0`);await pause();
await check('!document.querySelector(".workspace-tab-strip")&&!document.querySelector(".workspace-file-search-trigger")&&original_header.parentElement===group.containerEl&&original_tabs===group.tabHeader.container','dispose restores original DOM and removes every owned action');
await evaluate(`original_tabs.append(document.createElement('span'));void 0`);await pause();
await check('!document.querySelector(".workspace-tab-strip")&&!document.getElementById("typora-code-tab-controls")','post-dispose mutations do not recreate wrappers');
assert.deepEqual(await evaluate('fixture_errors'),[]);console.log(JSON.stringify({status:'PASS',checks,evidence:root}));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);console.error(root);app.exit(1)});
