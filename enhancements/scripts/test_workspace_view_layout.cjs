// 使用原生工具栏节点与生产面板验证实际布局，隐藏窗口不启动用户 Typora。
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_view_layout_'));app.setPath('userData',path.join(evidence,'profile'));app.disableHardwareAcceleration();
let test_window;const checks=[],delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=expression=>test_window.webContents.executeJavaScript(expression);
const check=(value,label)=>{assert(value,label);checks.push(label)};
app.whenReady().then(async()=>{
  test_window=new BrowserWindow({show:false,width:1000,height:740,webPreferences:{contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  const html=path.join(evidence,'fixture.html');fs.writeFileSync(html,`<!doctype html><meta charset=utf-8><style>
  html,body{height:100%;margin:0;overflow:hidden;font:13px system-ui;--typ-footer-height:30px;--bg-color:#fff;--text-color:#333}
  .typ-workspace-root{position:absolute;top:70px;left:240px;right:0;bottom:var(--typ-footer-height)}.native-leaf{width:100%;height:100%;overflow:hidden}#write{padding:30px}footer.ty-footer{position:fixed;left:240px;right:0;bottom:0;height:30px;background:#eee}.hide-footer footer.ty-footer{display:none}
  .ty-editor-toolbar{position:fixed;bottom:14px;left:449px;height:35px;width:320px;background:#eee;z-index:600;overflow:hidden}.ty-editor-toolbar button{height:30px}
  </style><body class=show-footer><main class=typ-workspace-root><section class=native-leaf><div id=write contenteditable=true>UNSAVED_MARKDOWN</div></section></main><footer class=ty-footer>status</footer><div class=ty-editor-toolbar style="display:none"><button>加粗</button><button>标题</button></div></body>`);await test_window.loadFile(html);
  const bundle=await build({stdin:{contents:'export {bind_workspace_native_toolbar} from "./src/workspace_native_toolbar";export {create_terminal_panel} from "./src/terminal_panel";export {default as terminal_css} from "./src/terminal_workspace.css";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'layout_api',loader:{'.css':'text'},write:false});await evaluate(bundle.outputFiles[0].text);
  await evaluate(`window.original_toolbar=document.querySelector('.ty-editor-toolbar');window.original_style=original_toolbar.style.cssText;window.changed_leaf=()=>{};window.source=false;window.toolbar_clicks=0;original_toolbar.querySelector('button').onclick=()=>toolbar_clicks++;
    window.native_leaf={state:{path:'doc.md'},containerEl:document.querySelector('.native-leaf'),view:{isEditor:()=>true}};window.workspace={activeLeaf:native_leaf,on(name,callback){changed_leaf=callback;return()=>changed_leaf=()=>{}}};window.files={core:{app:{workspace}},source_editor_active:()=>source};window.runtime={File:{bundle:{filePath:'doc.md'},editor:{toolbar:{dom:original_toolbar}},option:{showToolbar:false}}};window.binding=layout_api.bind_workspace_native_toolbar(files,runtime);
    window.terminal_style=document.createElement('style');terminal_style.textContent=layout_api.terminal_css;document.head.append(terminal_style);window.panel=layout_api.create_terminal_panel(()=>{});void 0`);await delay(100);
  check(await evaluate('getComputedStyle(original_toolbar).display==="none"'),'initial native toolbar preference stays hidden');
  await evaluate('original_toolbar.style.display="block";runtime.File.option.showToolbar=true');await delay(100);
  const geometry=()=>evaluate(`(()=>{const t=original_toolbar.getBoundingClientRect(),r=native_leaf.containerEl.getBoundingClientRect(),p=panel.container.getBoundingClientRect(),f=document.querySelector('footer.ty-footer').getBoundingClientRect();return{visible:t.height>0,top:t.top,bottom:t.bottom,left:t.left,right:t.right,root_bottom:r.bottom,panel_top:p.top,panel_bottom:p.bottom,footer_top:f.top,inside:t.top>=r.top&&t.bottom<=r.bottom-7&&t.left>=r.left+7&&t.right<=r.right-7,centered:Math.abs(t.left+t.right-r.left-r.right)<1,viewport:innerHeight}})()`);
  let metrics=await geometry();check(metrics.inside&&metrics.centered,'native toolbar sits centered inside its document above footer');
  await evaluate('original_toolbar.querySelector("button").click()');check(await evaluate('toolbar_clicks===1'),'original toolbar DOM and action handler remain');
  for(const zoom of [1,1.25]){
    test_window.webContents.setZoomFactor(zoom);await evaluate('panel.show()');await delay(140);metrics=await geometry();
    check(metrics.inside&&metrics.bottom<metrics.panel_top&&Math.abs(metrics.root_bottom-metrics.panel_top)<1,'visible terminal bounds the Markdown toolbar at zoom '+zoom);
    await evaluate('document.body.classList.remove("show-footer");document.body.classList.add("hide-footer")');await delay(140);metrics=await geometry();
    check(metrics.inside&&Math.abs(metrics.panel_bottom-metrics.viewport)<1&&Math.abs(metrics.root_bottom-metrics.panel_top)<1,'hidden footer releases actual panel space at zoom '+zoom);
    await evaluate('panel.hide()');await delay(100);metrics=await geometry();check(metrics.inside&&Math.abs(metrics.root_bottom-metrics.viewport)<1,'hidden footer also releases editor space at zoom '+zoom);
    await evaluate('document.body.classList.add("show-footer");document.body.classList.remove("hide-footer");panel.show()');await delay(140);metrics=await geometry();
    check(Math.abs(metrics.panel_bottom-metrics.footer_top)<1,'restored footer regains exactly its own space at zoom '+zoom);
  }
  await evaluate('panel.maximize()');await delay(160);check(await evaluate('getComputedStyle(original_toolbar).display==="none"&&runtime.File.option.showToolbar'),'maximized terminal suspends toolbar without changing native preference');
  await evaluate('panel.maximize()');await delay(130);check((await geometry()).inside,'restored reading area restores toolbar');
  await evaluate('workspace.activeLeaf={state:{path:"typ://terminal"},containerEl:panel.container,view:{isEditor:()=>false}};changed_leaf()');await delay(80);
  check(await evaluate('getComputedStyle(original_toolbar).display==="none"&&runtime.File.option.showToolbar'),'non-Markdown leaf cannot expose native formatting toolbar');
  await evaluate('workspace.activeLeaf=native_leaf;changed_leaf()');await delay(80);check((await geometry()).inside,'returning to Markdown restores its native toolbar');
  test_window.setContentSize(580,540);await delay(140);check((await geometry()).inside,'narrow reading area constrains toolbar width');
  fs.writeFileSync(path.join(evidence,'bounded_toolbar.png'),(await test_window.webContents.capturePage()).toPNG());
  await evaluate('original_toolbar.style.display="none";runtime.File.option.showToolbar=false');await delay(80);check(await evaluate('getComputedStyle(original_toolbar).display==="none"'),'native off switch remains effective');
  await evaluate('binding.dispose();panel.dispose();terminal_style.remove()');await delay(60);
  check(await evaluate('original_toolbar===document.querySelector(".ty-editor-toolbar")&&!original_toolbar.hasAttribute("data-workspace-native-toolbar")&&!original_toolbar.hasAttribute("data-workspace-toolbar-suspended")&&!original_toolbar.style.getPropertyValue("--workspace-toolbar-top")&&original_toolbar.style.cssText===original_style'),'dispose restores original node attributes and geometry');
  check(await evaluate('document.querySelector("#write").textContent==="UNSAVED_MARKDOWN"'),'layout actions preserve unsaved document');
  console.log(JSON.stringify({status:'PASS',checks,evidence}));test_window.destroy();app.exit(0);
}).catch(async error=>{console.error(error);console.error(evidence);if(test_window&&!test_window.isDestroyed()){fs.writeFileSync(path.join(evidence,'failure.png'),(await test_window.webContents.capturePage()).toPNG());test_window.destroy();}app.exit(1)});
