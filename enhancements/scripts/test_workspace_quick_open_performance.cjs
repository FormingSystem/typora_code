// 大目录仅生成文件名，不读正文；使用真实 Chromium 事件循环测量输入阻塞与过期查询。
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {build}=require('esbuild');
const {editor_plugins}=require('./editor_bundle.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_quick_open_performance_'));
const baseline=process.argv.find(value=>value.startsWith('--baseline='))?.slice('--baseline='.length);
app.setPath('userData',path.join(root,'user_data'));app.disableHardwareAcceleration();
let test_window;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=source=>test_window.webContents.executeJavaScript(source);
const wait=async source=>{for(let index=0;index<1200;index++){if(await evaluate(source))return;await delay(20);}throw new Error('Timed out: '+source);};
app.whenReady().then(async()=>{
  test_window=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{contextIsolation:false,nodeIntegration:true,backgroundThrottling:false,offscreen:true}});
  const html=path.join(root,'test.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><button id="focus">Document focus</button>');await test_window.loadFile(html);
  const metrics=[];
  for(const source_ref of baseline?[baseline,undefined]:[undefined]){
    const source_plugin={name:'quick-open-baseline',setup(build){if(source_ref)build.onLoad({filter:/workspace_quick_open\.ts$/},()=>({contents:execFileSync('git',['show',`${source_ref}:enhancements/src/workspace_quick_open.ts`],{cwd:path.join(__dirname,'..'),encoding:'utf8',windowsHide:true}),loader:'ts'}));}};
    const bundle=await build({plugins:[...editor_plugins(),source_plugin],stdin:{contents:'export {create_workspace_quick_open} from "./src/workspace_quick_open";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'performance_qa',loader:{'.css':'text'},write:false});await evaluate(bundle.outputFiles[0].text);
    await evaluate(`(()=>{
      window.opened=[];window.directory_reads=0;window.File={};window.scan_released=false;window.root_path='C:/workspace';
      window.entries=Array.from({length:50000},(_,index)=>({name:'file_'+String(index).padStart(5,'0')+'.md',isDirectory:()=>false,isFile:()=>true}));
      window.host={path_api:require('node:path').win32,context_root:()=>root_path,open_file:file=>opened.push(file),fs:{promises:{readdir:async()=>{directory_reads++;await new Promise(resolve=>setTimeout(resolve,5));return entries;}}}};
      window.picker=performance_qa.create_workspace_quick_open(host);document.querySelector('#focus').focus();
      window.last_tick=performance.now();window.max_gap=0;window.ticks=0;window.first_result=0;window.start=performance.now();
      window.timer=setInterval(()=>{const now=performance.now();max_gap=Math.max(max_gap,now-last_tick);last_tick=now;ticks++;},5);
      window.observer=new MutationObserver(()=>{if(!first_result&&document.querySelector('.workspace-quick-open-result'))first_result=performance.now()-start;});observer.observe(picker.root,{subtree:true,childList:true});
      picker.open();
    })()`);
    const count_condition=source_ref?"document.querySelectorAll('.workspace-quick-open-result').length===100":"document.querySelectorAll('.workspace-quick-open-result').length>0&&document.querySelector('.workspace-quick-open-result').getAttribute('aria-setsize')==='512'";
    await wait(`${count_condition}&&!document.querySelector('.workspace-quick-open-status').textContent.includes('正在查找')`);
    const opened_metrics=await evaluate(`({elapsed_ms:performance.now()-start,first_result_ms:first_result,max_gap_ms:max_gap,ticks})`);
    const input_sync_ms=await evaluate(`(()=>{const start=performance.now();picker.input.value='file_49';picker.input.dispatchEvent(new Event('input'));return performance.now()-start;})()`);
    await wait(`${count_condition}&&[...document.querySelectorAll('.workspace-quick-open-name')].every(node=>node.textContent.startsWith('file_49'))`);
    if(!source_ref){
      assert(opened_metrics.max_gap_ms<100,'opening a large catalogue does not synchronously construct 512 rows');
      assert(input_sync_ms<100,'a query over 50k names yields instead of synchronously sorting the full catalogue');
      await evaluate(`picker.input.value='file_48';picker.input.dispatchEvent(new Event('input'));picker.input.value='file_47';picker.input.dispatchEvent(new Event('input'));void 0`);
      await wait(`document.querySelector('.workspace-quick-open-result')?.getAttribute('aria-setsize')==='512'&&[...document.querySelectorAll('.workspace-quick-open-name')].every(node=>node.textContent.startsWith('file_47'))`);
      await delay(80);assert(await evaluate(`[...document.querySelectorAll('.workspace-quick-open-name')].every(node=>node.textContent.startsWith('file_47'))`),'late filter slices never replace a newer query');
      await evaluate(`picker.input.value='file_46';picker.input.dispatchEvent(new Event('input'));picker.input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));void 0`);
      await wait(`picker.root.hidden&&opened.length===1`);assert((await evaluate('opened[0]')).endsWith('file_46000.md'),'Enter during ranking opens the new query result, never a stale displayed file');
      await evaluate('picker.open();void 0');await wait(`document.querySelectorAll('.workspace-quick-open-result').length>0&&document.querySelector('.workspace-quick-open-result').getAttribute('aria-setsize')==='512'&&!document.querySelector('.workspace-quick-open-status').textContent.includes('正在查找')`);
      await evaluate(`picker.input.value='file_45';picker.input.dispatchEvent(new Event('input'));picker.close();void 0`);await delay(80);
      assert(await evaluate(`picker.root.hidden&&!document.querySelector('.workspace-quick-open-result')&&document.activeElement.id==='focus'`),'close cancels in-flight ranking and restores document focus');
      await evaluate(`window.release_directory=null;host.fs.promises.readdir=async directory=>{if(directory===root_path)return [{name:'early.md',isDirectory:()=>false,isFile:()=>true},{name:'late',isDirectory:()=>true,isFile:()=>false}];await new Promise(resolve=>release_directory=resolve);return [{name:'late.md',isDirectory:()=>false,isFile:()=>true}];};picker.open();void 0`);
      await wait(`!!release_directory&&document.querySelector('.workspace-quick-open-name')?.textContent==='early.md'`);
      assert(await evaluate(`document.querySelector('.workspace-quick-open-status').textContent.includes('正在查找')`),'file results become interactive before directory enumeration completes');
      await evaluate('picker.close();release_directory();void 0');await delay(80);
      assert(await evaluate(`picker.root.hidden&&!document.querySelector('.workspace-quick-open-result')`),'late directory completion cannot reopen the cancelled picker');
    }
    metrics.push({revision:source_ref||'working_tree',files:50000,...Object.fromEntries(Object.entries(opened_metrics).map(([key,value])=>[key,Math.round(value)])),input_sync_ms:Math.round(input_sync_ms)});
    await evaluate('clearInterval(timer);observer.disconnect();picker.dispose();void 0');
  }
  console.log(JSON.stringify({status:'PASS',checks:['50000-name catalogue uses bounded top512 selection','query computation yields to Chromium input','latest query wins during sliced ranking','close cancels rendering and restores focus'],metrics,evidence:root},null,2));
  test_window.destroy();app.exit(0);
}).catch(error=>{console.error(error);test_window?.destroy();app.exit(1);});
