// 隐藏 Electron 验证真正的 window.close / beforeunload；不启动 Typora，不读取用户文件。
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_source_lifecycle_'));
app.setPath('userData',path.join(evidence,'profile'));app.disableHardwareAcceleration();
let test_window;const checks=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=source=>test_window.webContents.executeJavaScript(source);
const wait=async source=>{for(let index=0;index<100;index++){if(await evaluate(source))return;await delay(30);}throw new Error('Timed out: '+source);};
app.whenReady().then(async()=>{
  test_window=new BrowserWindow({show:false,width:700,height:520,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  test_window.webContents.on('will-prevent-unload',()=>{});
  const html=path.join(evidence,'test.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><p>Isolated source close fixture</p>');await test_window.loadFile(html);
  const bundle=await build({entryPoints:[path.join(__dirname,'../src/workspace_source_lifecycle.ts')],bundle:true,write:false,format:'iife',globalName:'lifecycle_qa',loader:{'.css':'text'}});
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(`(()=>{
    window.native_calls=0;window.save_calls=0;window.dirty_flag=true;window.save_mode='success';window.release_save=undefined;
    // 先注册宿主事件，与 Typora 顺序相同；原生 Markdown 用户取消后阻止真正销毁。
    window.onbeforeunload=()=>{native_calls++;return false;};
    window.view={file_path:'sample.c',disposed:false,leaf:{state:{path:'sample.c'}},dirty:()=>dirty_flag,release_source(){this.disposed=true;},async save(){save_calls++;if(save_mode==='failed')return false;if(save_mode==='pending')await new Promise(resolve=>release_save=resolve);dirty_flag=false;return true;}};
    window.core={app:{workspace:{eachLeaves(callback){callback(view.leaf);}},commands:{}}};
    window.lifecycle=lifecycle_qa.bind_source_lifecycle(core,()=>[view]);
    window.dialog=()=>document.querySelector('[data-workspace-save-close]');
    window.click_label=label=>{const button=[...document.querySelectorAll('.git-graph-dialog-footer button')].find(button=>button.textContent===label);if(!button)throw new Error('missing '+label);button.click();};
  })()`);
  await evaluate('window.close()');await wait('Boolean(dialog())');
  assert.equal(await evaluate('native_calls'),0);checks.push('Dirty source blocks earlier native onbeforeunload before its close side effects');
  await evaluate('click_label("关闭")');await delay(50);assert.equal(await evaluate('dirty_flag'),true);assert.equal(test_window.isDestroyed(),false);checks.push('Cancel keeps the window and dirty source');
  await evaluate('window.close()');await wait('Boolean(dialog())');await evaluate('click_label("不保存并关闭")');await wait('native_calls===1');
  assert.equal(await evaluate('Boolean(dialog())'),false);assert.equal(test_window.isDestroyed(),false);checks.push('Discard grants one asynchronous real close event and native cancellation leaves the window open');
  await evaluate('window.close()');await wait('Boolean(dialog())');assert.equal(await evaluate('native_calls'),1);checks.push('A native Markdown cancellation does not permanently bypass source protection');
  await evaluate('save_mode="failed";click_label("全部保存并关闭")');await delay(60);assert.equal(await evaluate('Boolean(dialog())'),true);assert.equal(await evaluate('native_calls'),1);checks.push('Failed save keeps the source close dialog and does not invoke the native close');
  await evaluate('save_mode="pending";click_label("全部保存并关闭")');await wait('typeof release_save==="function"');
  assert(await evaluate(`[...document.querySelectorAll('.git-graph-dialog-footer button')].find(button=>button.textContent==='不保存并关闭').disabled`));
  await evaluate('click_label("关闭");release_save()');await delay(100);
  assert.equal(await evaluate('native_calls'),1);assert.equal(test_window.isDestroyed(),false);checks.push('Cancel during an asynchronous save prevents a later automatic close');
  await evaluate('dirty_flag=true;save_mode="success";window.close()');await wait('Boolean(dialog())');await evaluate('click_label("全部保存并关闭")');await wait('native_calls===2');
  assert.equal(await evaluate('dirty_flag'),false);assert.equal(await evaluate('Boolean(dialog())'),false);checks.push('Successful save grants the native close without a second source prompt');
  await evaluate('window.close()');await wait('native_calls===3');assert.equal(await evaluate('Boolean(dialog())'),false);checks.push('A clean source leaves the native Markdown close workflow unchanged');
  const result={status:'PASS',checks,evidence};fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));test_window.destroy();app.exit(0);
}).catch(async error=>{const result={status:'FAIL',checks,error:String(error.stack||error),evidence};fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));console.error(JSON.stringify(result));if(test_window&&!test_window.isDestroyed())test_window.destroy();app.exit(1);});
