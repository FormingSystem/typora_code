// 使用原生侧栏的 absolute 内容区和悬浮文件 footer，验证 SCM 折叠标题不被覆盖。
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {build}=require('esbuild');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_scm_layout_'));
app.setPath('userData',path.join(evidence,'user_data'));app.disableHardwareAcceleration();
let test_window;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=source=>test_window.webContents.executeJavaScript(source);
const capture=async name=>fs.writeFileSync(path.join(evidence,name+'.png'),(await test_window.webContents.capturePage()).toPNG());
const click_toggle=async()=>{
  const point=await evaluate(`(()=>{const node=document.querySelector('.git-scm-history-toggle'),box=node.getBoundingClientRect(),x=Math.round(box.left+box.width/2),y=Math.round(box.top+box.height/2);return{x,y,hit:node.contains(document.elementFromPoint(x,y)),bottom:box.bottom,viewport:innerHeight};})()`);
  assert(point.hit,'折叠标题被遮挡：'+JSON.stringify(point));const zoom=test_window.webContents.getZoomFactor();for(const type of ['mouseMove','mouseDown','mouseUp']){test_window.webContents.sendInputEvent({type,x:Math.round(point.x*zoom),y:Math.round(point.y*zoom),button:'left',clickCount:1});await delay(35);}await delay(100);
};
app.whenReady().then(async()=>{
  test_window=new BrowserWindow({show:false,width:720,height:600,webPreferences:{contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  test_window.webContents.on('console-message',(_event,_level,message)=>console.error(message));
  const html=path.join(evidence,'test.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:white;font:14px system-ui}#typora-sidebar{position:fixed;top:0;bottom:0;height:100%;width:260px;contain:strict;background:#fafafa}.sidebar-content{position:absolute;top:18px;bottom:0;display:flex;flex-direction:column;width:100%;overflow:auto}.sidebar-footer{display:block;position:absolute;bottom:0;width:100%;height:30px;z-index:2;background:#ddd}#editors{margin-left:260px;padding:20px}footer.ty-footer{position:fixed;left:260px;right:0;bottom:0;height:30px;z-index:4;background:#eee}</style><aside id="typora-sidebar"><div id="sidebar-content" class="sidebar-content"></div><div class="sidebar-footer">原生文件夹工具栏</div></aside><main id="editors">编辑区</main><footer class="ty-footer">状态栏</footer>');await test_window.loadFile(html);
  const bundle=await build({stdin:{contents:'export {git_source_control} from "./src/git_source_control";export {git_operation_progress} from "./src/git_operation_progress";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'layout_qa',write:false});await evaluate(bundle.outputFiles[0].text);
  await evaluate(String.raw`(()=>{
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(style);
    window.panel={progress:new layout_qa.git_operation_progress(),root:'layout-fixture',container:document.createElement("div"),branches:[],state:{root:'layout-fixture',head:'',refs:[],commits:[],more:false,remotes:[]},settings:{},host:{show_history(){}},refresh(){},configured_menu(){},action_dialog(){},quick_action(){},report(){}};
    window.scm=new layout_qa.git_source_control(panel);panel.workbench=scm;scm.history.render(panel.state);const shell=document.createElement('section');shell.className='linux-note-git-source-control';shell.append(scm.sidebar);document.querySelector('#sidebar-content').append(shell);window.shell=shell;
    scm.groups_state=[{id:'staged',title:'暂存的更改',from:'head',to:'index',files:[]},{id:'changes',title:'更改',from:'index',to:'worktree',files:Array.from({length:50},(_,index)=>({path:'nested/changed_'+index+'.md',status:'M'}))}];scm.render_groups();
    scm.message.value=Array.from({length:30},(_,index)=>'提交说明第'+index+'行').join('\n');scm.message.dispatchEvent(new Event('input'));
    scm.notice.textContent=Array.from({length:12},(_,index)=>'操作输出 '+index).join('\n');scm.show_repositories=true;const repository=document.createElement('div');repository.className='git-scm-repository-row';repository.textContent='测试仓库';scm.repositories.container.append(repository);scm.apply_history_layout();
  })()`);await delay(200);
  // 分隔条必须覆盖真实边界；显隐、鼠标和键盘均不能额外占用内容高度。
  const read_sash=()=>evaluate(`(()=>{const top=scm.changes_pane.getBoundingClientRect(),bottom=scm.history.container.getBoundingClientRect(),sash=scm.history_sash.getBoundingClientRect();return{gap:bottom.top-top.bottom,center:sash.top+sash.height/2,boundary:bottom.top,height:sash.height,x:sash.left+sash.width/2,y:sash.top+sash.height/2,color:getComputedStyle(scm.history_sash,'::before').backgroundColor,position:getComputedStyle(scm.history_sash).position,dragging:scm.history_sash.classList.contains('dragging'),ratio:scm.history_ratio,rows:getComputedStyle(scm.sections).gridTemplateRows};})()`);
  const pointer=(type,x,y,extra={})=>{const zoom=test_window.webContents.getZoomFactor();test_window.webContents.sendInputEvent({type,x:Math.round(x*zoom),y:Math.round(y*zoom),...extra});};
  const assert_overlay=async()=>{const m=await read_sash();assert(Math.abs(m.gap)<.1,'分隔条预留了额外高度：'+JSON.stringify(m));assert.equal(m.position,'absolute');assert(Math.abs(m.height-4)<.1);assert(Math.abs(m.center-m.boundary)<.1,'命中区没有对准实际轨道边界：'+JSON.stringify(m));return m;};
  await assert_overlay();
  const idle=await read_sash();assert.equal(idle.color,'rgba(0, 0, 0, 0)');
  pointer('mouseMove',idle.x,idle.y);await delay(70);assert.equal((await read_sash()).color,'rgba(0, 0, 0, 0)','穿过边界不应立即闪烁');await delay(350);
  const hovered=await assert_overlay();assert.equal(hovered.color,'rgb(0, 127, 212)');assert.equal(hovered.rows,idle.rows);await capture('sash_hover');
  pointer('mouseMove',600,20);await delay(50);assert.equal((await read_sash()).color,'rgba(0, 0, 0, 0)');await capture('sash_idle');
  pointer('mouseMove',idle.x,idle.y);pointer('mouseDown',idle.x,idle.y,{button:'left',clickCount:1});await delay(25);assert((await read_sash()).dragging);assert.equal((await read_sash()).color,'rgb(0, 127, 212)');
  const target=await evaluate('(()=>{const r=scm.sections.getBoundingClientRect();return r.top+r.height*.7})()');pointer('mouseMove',idle.x,target,{button:'left'});await delay(60);assert(Math.abs((await assert_overlay()).ratio-.7)<.01);pointer('mouseUp',idle.x,target,{button:'left',clickCount:1});await delay(40);assert(!(await read_sash()).dragging);
  pointer('mouseMove',600,20);await delay(50);assert.equal((await read_sash()).color,'rgba(0, 0, 0, 0)','鼠标松开并离开后不残留常亮');
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Home'});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Home'});await delay(50);assert.equal((await read_sash()).ratio,.55);
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});await delay(50);assert(Math.abs((await assert_overlay()).ratio-.57)<.001);
  await evaluate('scm.history_sash.blur();scm.sections.style.flex="none";scm.sections.style.height="90px";scm.history_ratio=.85;scm.apply_history_layout()');await assert_overlay();assert.equal(await evaluate('scm.history.header.getBoundingClientRect().height'),22);
  await evaluate('scm.sections.style.flex="";scm.sections.style.height=""');
  for(const [width,height,zoom]of[[720,600,1],[640,360,1],[720,600,1.5],[720,600,2]]){
    test_window.setSize(width,height);test_window.webContents.setZoomFactor(zoom);await delay(120);
    for(const ratio of [.15,.55,.85]){await evaluate('scm.history_ratio='+ratio+';scm.apply_history_layout()');await assert_overlay();}
  }
  for(const key of ['show_changes','show_history']){await evaluate('scm.'+key+'=false;scm.apply_history_layout()');assert.equal(await evaluate('getComputedStyle(scm.history_sash).display'),'none');await evaluate('scm.'+key+'=true;scm.apply_history_layout()');await assert_overlay();}
  await evaluate('scm.history_ratio=.55;scm.apply_history_layout()');
  const metrics=[];
  for(const [width,height,zoom]of[[720,600,1],[640,360,1],[720,600,1.5],[720,600,2]]){
    test_window.setSize(width,height);test_window.webContents.setZoomFactor(zoom);await delay(180);
    if(await evaluate('scm.history_open'))await click_toggle();
    const result=await evaluate(`(()=>{const header=scm.history.header.getBoundingClientRect(),toggle=scm.history.toggle.getBoundingClientRect(),sidebar=document.querySelector('#sidebar-content').getBoundingClientRect(),x=toggle.left+Math.min(20,toggle.width/2),y=toggle.top+toggle.height/2;return{viewport:innerHeight,header_top:header.top,header_bottom:header.bottom,header_height:header.height,sidebar_bottom:sidebar.bottom,footer_display:getComputedStyle(document.querySelector('.sidebar-footer')).display,hit:scm.history.toggle.contains(document.elementFromPoint(x,y)),changes_scroll:scm.changes_pane.scrollHeight>scm.changes_pane.clientHeight||scm.groups.scrollHeight>scm.groups.clientHeight,message_height:scm.message.getBoundingClientRect().height};})()`);
    assert(Math.abs(result.header_height-22)<=1);assert(result.header_bottom<=result.viewport+1);assert(result.header_bottom<=result.sidebar_bottom+1);assert(result.hit);assert.equal(result.footer_display,'none');assert(result.message_height<=120);assert(result.changes_scroll);metrics.push({width,height,zoom,...result});await capture('collapsed_'+height+'_'+zoom);
    await click_toggle();assert(await evaluate('scm.history_open'));await click_toggle();assert(!await evaluate('scm.history_open'));
  }
  for(const class_name of ['linux-note-workspace-search','linux-note-workspace-explorer']){await evaluate('shell.className='+JSON.stringify(class_name));assert.equal(await evaluate('getComputedStyle(document.querySelector(".sidebar-footer")).display'),'none');}
  assert.notEqual(await evaluate('getComputedStyle(document.querySelector("footer.ty-footer")).display'),'none');await evaluate('shell.remove()');assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".sidebar-footer")).display'),'none');
  console.log(JSON.stringify({status:'PASS',checks:['zero-gap overlay sash across sizes, ratios, zoom and visibility','300ms hover without layout shift and instant drag feedback','actual mouse drag and keyboard keep existing ratio controls','native file footer cannot cover a mounted Git panel','collapsed history keeps its VS Code 22px pane header visible','real toggle remains clickable in small windows','150 and 200 percent zoom preserve header visibility','long message and command output scroll inside Changes','native file footer stays hidden for custom Search and Explorer','editor status bar remains available','switching away restores the native file footer'],metrics,evidence}));test_window.destroy();app.exit(0);
}).catch(async error=>{console.error(error);console.error(evidence);if(test_window&&!test_window.isDestroyed()){await capture('failure');test_window.destroy();}app.exit(1);});
