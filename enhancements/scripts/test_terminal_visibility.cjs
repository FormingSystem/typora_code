const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {build}=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_terminal_visibility_')),checks=[],samples=[];
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();let win;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const evaluate=async source=>{const result=await win.webContents.executeJavaScript('(async()=>{try{return {value:await (0,eval)('+JSON.stringify(source)+')}}catch(error){return {error:error.stack}}})()');if(result.error)throw Error(result.error);return result.value;};
const check=async(source,label)=>{assert(await evaluate(source),label);checks.push(label);};
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
 const html=path.join(root,'fixture.html');fs.writeFileSync(html,'<!doctype html><style>html,body{margin:0;overflow:hidden}.typ-workspace-root{position:absolute;left:220px;right:0;top:35px;bottom:24px}footer{position:absolute;bottom:0;height:24px}</style><main class="typ-workspace-root">UNSAVED</main><footer class="ty-footer"></footer>');await win.loadFile(html);
 const bundle=await build({stdin:{contents:'export {bind_terminal_workspace} from "./src/terminal_workspace";export {create_terminal_panel} from "./src/terminal_panel";export {create_terminal_layout} from "./src/terminal_layout";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'api',loader:{'.css':'text'},write:false,plugins:[...require('./editor_bundle.cjs').editor_plugins(),{name:'visibility-fixture',setup(build){
  if(process.env.TC_TERMINAL_BASELINE==='1')build.onLoad({filter:/terminal_(panel|layout|workspace)\.ts$/},args=>({contents:cp.execFileSync('git',['show','1d99401f27b6d8fe2dc8abde54816018fdafd7d2:enhancements/src/'+path.basename(args.path)],{encoding:'utf8'}),loader:'ts'}));
  build.onLoad({filter:/terminal_profile_detection\.ts$/},()=>({contents:'export function create_terminal_profile_service(){return{profiles:()=>[],warnings:()=>[],ready:()=>new Promise(()=>{}),dispose(){}}}',loader:'js'}));
 }}]});await evaluate(bundle.outputFiles[0].text);
 await evaluate(`(async()=>{window.reqnode=require;window._options={userDataPath:${JSON.stringify(root)}};window.commands=new Map();window.core={WorkspaceView:class{},app:{commands:{register(c){commands.set(c.id,c);return()=>commands.delete(c.id)}},viewManager:{registerView(){return()=>{}}},workspace:{on(){return()=>{}},ribbon:{addButton(){return()=>{}}}}}};window.host={core,fs:require('fs'),path_api:require('path'),process_api:process,workspace_path:()=>${JSON.stringify(root)},copy:async()=>{}};window.key_sample=null;window.addEventListener("keydown",e=>{if(e.code==="Backquote"){const t=performance.now();requestAnimationFrame(()=>key_sample={trusted:e.isTrusted,next_frame_ms:performance.now()-t,height:second.surface.viewport.clientHeight})}},true);window.binding=api.bind_terminal_workspace(host);window.first=await binding.open(${JSON.stringify(root)});window.second=await binding.open(${JSON.stringify(root)});})()`);
 await delay(100);
 const baseline=await evaluate(`(()=>{const p=document.querySelector('.typora-terminal-panel');binding.toggle();binding.toggle();return {reopen_height:second.surface.viewport.clientHeight,selected:document.querySelector('.terminal-tab[aria-selected=true]')?.dataset.session,expected:second.session.id}})()`);
 samples.push({baseline});
 // 旧版先完整记录两个独立缺陷，再以失败状态退出，避免只发现第一个问题。
 if(process.env.TC_TERMINAL_BASELINE==='1'){
  samples.push(await evaluate(`(()=>{const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame,queue=new Map();let serial=0;window.requestAnimationFrame=fn=>{queue.set(++serial,fn);return serial};window.cancelAnimationFrame=id=>queue.delete(id);try{const p=api.create_terminal_panel(()=>{});for(let i=0;i<1000;i++){p.layout();p.show();p.hide();}p.dispose();return {orphan_frames:queue.size};}finally{window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel}})()`));
  console.log(JSON.stringify({status:'BASELINE',samples}));assert(baseline.reopen_height>100&&baseline.selected===baseline.expected,'old implementation loses geometry and active session');
 }
 await check('second.surface.viewport.clientHeight>100','重开命令返回时恢复有效高度');
 await check('document.querySelector(".terminal-tab[aria-selected=true]").dataset.session===second.session.id','重开保留第二个活动会话');
 await check('document.activeElement===second.surface.term.textarea','焦点回到所属终端');
 for(const count of [20,100,1000]){
  samples.push(await evaluate(`(()=>{const rows=[...document.querySelectorAll('.terminal-tab')],start=performance.now();for(let i=0;i<${count};i++){binding.toggle();binding.toggle();}return {count:${count},duration_ms:performance.now()-start,rows_retained:rows.every((row,i)=>document.querySelectorAll('.terminal-tab')[i]===row),height:second.surface.viewport.clientHeight}})()`));
  assert(samples.at(-1).rows_retained&&samples.at(-1).height>100);checks.push(count+'次同栈显隐保留列表节点和几何');
 }
 // 真实Chromium鼠标：关闭按钮再快捷键打开，不仅直接调用toggle。
 const point=await evaluate(`(()=>{const r=document.querySelector('button[title="隐藏面板（保留进程）"]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
 await evaluate('window.input_samples=[];document.addEventListener("click",e=>{if(e.target.closest("button[title=\\"隐藏面板（保留进程）\\"]"))input_samples.push({trusted:e.isTrusted,start:performance.now()})},true);void 0');
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await delay(50);
 await check('document.querySelector(".typora-terminal-panel").hidden&&input_samples[0]?.trusted','真实鼠标关闭仅隐藏');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'`',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'`',modifiers:['control']});await delay(100);
 await check('key_sample?.trusted&&key_sample.height>100','真实快捷键下一帧显示所属终端');samples.push(await evaluate('key_sample'));
 await evaluate('binding.dispose();void 0');await delay(60);
 // 可控帧队列核对同步布局消费、幂等显隐及销毁清理，不依赖墙钟阈值。
 const scheduling=await evaluate(`(()=>{const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame,queue=new Map();let serial=0,calls=0;window.requestAnimationFrame=fn=>{queue.set(++serial,fn);return serial};window.cancelAnimationFrame=id=>queue.delete(id);try{const panel=api.create_terminal_panel(()=>calls++);panel.layout();panel.show();const pending_after_show=queue.size;for(let i=0;i<1000;i++){panel.layout();panel.hide();panel.layout();panel.show();}const pending_after_toggle=queue.size;const before=calls;panel.show();panel.show();const redundant=calls-before;panel.layout();panel.dispose();const pending_after_dispose=queue.size;const body=document.createElement('div'),tabs=document.createElement('div');body.append(tabs);document.body.append(body);const layout=api.create_terminal_layout(body,tabs,()=>{});layout.layout();layout.update(new Map());const split_pending=queue.size;layout.dispose();body.remove();return{pending_after_show,pending_after_toggle,pending_after_dispose,redundant,split_pending};}finally{window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel}})()`);
 assert.deepEqual(scheduling,{pending_after_show:0,pending_after_toggle:0,pending_after_dispose:0,redundant:0,split_pending:0});checks.push('1000轮同步布局消费旧帧、重复show无更新、销毁无遗留帧');samples.push(scheduling);
 console.log(JSON.stringify({status:'PASS',checks,samples,limits:'真实Chromium输入；PTY/Shell探测被挂起，启动性能由原生ConPTY夹具另测'}));
}).catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(win&&!win.isDestroyed()){await evaluate('window.binding?.dispose()').catch(()=>{});win.destroy()}app.exit(process.exitCode||0)});
