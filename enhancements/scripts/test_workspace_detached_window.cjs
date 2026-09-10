// 两个真实隐藏 renderer 的 BroadcastChannel 移交；不启动或改写用户 Typora。
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_detached_window_'));
app.setPath('userData',path.join(evidence,'user_data'));app.disableHardwareAcceleration();
const windows=[];let bundle,html,source,last_child,mode='normal',launches=0;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=(win,code)=>win.webContents.executeJavaScript(code).catch(error=>{throw new Error(code+': '+error.message);});
const wait=async(win,code)=>{for(let i=0;i<180;i++){if(await evaluate(win,code))return;await delay(20);}throw Error('Timed out: '+code);};
const open=async(anchor='')=>{
  const win=new BrowserWindow({show:false,width:720,height:480,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});windows.push(win);
  await win.loadFile(html);await evaluate(win,bundle);
  await evaluate(win,`window.notices=[];window.releases=0;window.received=[];window.block_import=false;window.capture_error=false;window.changed=false;window.leaf={state:{path:'/workspace/example.c'},parent:{},view:{containerEl:document.body},containerEl:document.body};
    window._options={initFilePath:'',initAnchor:${JSON.stringify(anchor)}};
    window.File={bundle:{filePath:''},changeCounter:{isDocumentEdited:()=>false}};
    window.files={core:{app:{workspace:{eachLeaves:callback=>callback(leaf)}}},
      capture_transfer:async()=>{if(capture_error)throw Error('文件正在保存');return {schema:1,kind:'source',file_path:'/workspace/example.c',root:'/workspace',text:'int dirty_value = 7;',dirty:true};},
      receive_transfer:async(snapshot)=>{received.push(snapshot);if(block_import)await new Promise(resolve=>window.finish_import=resolve);},
      release_transfer:async(target,snapshot,signal)=>{if(signal.aborted)return false;if(changed)return false;releases++;return target===leaf&&snapshot.text==='int dirty_value = 7;';}
    };
    window.install=(initial_anchor='',timeout_ms=1800)=>{window.binding=detach_qa.bind_workspace_detached_window(files,{initial_anchor,timeout_ms,notify:message=>notices.push(message),open_window:(anchor,root)=>require('electron').ipcRenderer.invoke('fixture:open-window',anchor,root)});};
    install(${JSON.stringify(anchor)});
    window.detach=()=>document.dispatchEvent(new CustomEvent('typora-code:tab-detach',{cancelable:true,detail:{leaf}}));void 0;`);
  return win;
};
app.whenReady().then(async()=>{
  html=path.join(evidence,'window.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><p>Independent transfer fixture</p>');
  bundle=(await build({stdin:{contents:'export {bind_workspace_detached_window} from "./src/workspace_detached_window";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'detach_qa',loader:{'.css':'text'},write:false})).outputFiles[0].text;
  ipcMain.handle('fixture:open-window',async(_event,anchor,root)=>{
    launches++;assert.match(anchor,/^typora-code-transfer:[0-9a-f-]{36}$/);assert.equal(root,'/workspace');
    if(mode==='fail')throw Error('原生窗口创建失败');
    if(mode==='timeout')return {winId:99};
    last_child=await open(anchor);if(mode==='blocked')await evaluate(last_child,'block_import=true;void 0');
    return {winId:last_child.id};
  });
  source=await open();
  assert.equal(await evaluate(source,'detach()'),false,'owned drag event is accepted');
  await wait(source,'releases===1');
  assert.equal(await evaluate(last_child,'received.length'),1);
  assert.equal(await evaluate(last_child,'received[0].text'),'int dirty_value = 7;');
  assert.deepEqual(await evaluate(source,'notices'),[]);
  // 无有效令牌的既有空窗不能接收另一个窗口的正文。
  const unrelated=await open();
  assert.equal(await evaluate(unrelated,'received.length'),0);
  await evaluate(source,'changed=true;detach();void 0');await wait(source,'notices.length===1');
  assert.equal(await evaluate(source,'releases'),1,'changed source remains open after target ACK');
  assert.match(await evaluate(source,'notices[0]'),/保留/);
  await evaluate(source,'changed=false;notices=[];capture_error=true;detach();void 0');await wait(source,'notices.length===1');
  assert.equal(launches,2,'invalid source never creates a new window');
  mode='fail';await evaluate(source,'capture_error=false;notices=[];detach();void 0');await wait(source,'notices.length===1');
  assert.equal(await evaluate(source,'releases'),1,'failed native creation retains original');
  mode='timeout';await evaluate(source,'notices=[];detach();detach();void 0');await wait(source,'notices.length===1');
  assert.equal(launches,4,'repeated drag while transfer pending creates one window');
  assert.equal(await evaluate(source,'releases'),1,'missing receiver timeout retains original');
  // 捕获还未创建窗口时，慢盘也必须能取消并允许重试。
  await evaluate(source,`notices=[];window.capture_original=files.capture_transfer;files.capture_transfer=async(target,signal)=>{window.capture_signal=signal;await new Promise(resolve=>window.finish_capture=resolve);return capture_original();};detach();void 0`);
  await wait(source,'notices.length===1');assert.equal(await evaluate(source,'capture_signal.aborted'),true);
  await evaluate(source,'finish_capture();files.capture_transfer=capture_original;void 0');await delay(100);
  assert.equal(launches,4,'late capture result does not create a window after cancellation');
  // ACK不能撤销总超时；磁盘复查悬挂时仍可取消，迟到结果不能删来源。
  mode='normal';await evaluate(source,`notices=[];files.release_transfer=async(target,snapshot,signal)=>{window.release_started=true;await new Promise(resolve=>window.finish_release=resolve);if(signal.aborted)return false;releases++;return true;};detach();void 0`);
  await wait(source,'window.release_started===true');await wait(source,'notices.length===1');
  await evaluate(source,'finish_release();void 0');await delay(100);
  assert.equal(await evaluate(source,'releases'),1,'ACK retains a bounded release deadline');
  await evaluate(source,'window.release_started=false;void 0');
  // 释放期间卸载应使 AbortSignal 失效，迟到结果不能再删来源。
  mode='normal';await evaluate(source,`notices=[];files.release_transfer=async(target,snapshot,signal)=>{window.release_started=true;await new Promise(resolve=>window.finish_release=resolve);if(signal.aborted)return false;releases++;return true;};detach();void 0`);
  await wait(source,'window.release_started===true');await evaluate(source,'binding.dispose();finish_release();void 0');await delay(150);
  assert.equal(await evaluate(source,'releases'),1);
  const previous_launches=launches;await evaluate(source,'detach();void 0');await delay(100);assert.equal(launches,previous_launches,'disposed binder no longer handles drags');
  console.log(JSON.stringify({status:'PASS',checks:14,evidence}));
  for(const win of windows)if(!win.isDestroyed())win.destroy();app.exit(0);
}).catch(error=>{console.error(error);console.error(evidence);for(const win of windows)if(!win.isDestroyed())win.destroy();app.exit(1);});
