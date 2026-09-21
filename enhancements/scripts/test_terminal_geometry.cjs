const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_terminal_geometry_'));
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();
let win;const samples=[];
const evaluate=async source=>{const result=await win.webContents.executeJavaScript('(async()=>{try{return {value:await (0,eval)('+JSON.stringify(source)+')}}catch(error){return {error:error.stack}}})()');if(result.error)throw Error(result.error);return result.value;};
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  const html=path.join(root,'fixture.html');
  fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;overflow:hidden}#host{display:flex;position:absolute;left:30px;top:20px;width:900px;height:300px}footer{position:absolute;left:30px;top:320px;width:900px;height:24px}</style><main id="host"></main><footer>status</footer>');
  await win.loadFile(html);
  const bundle=await build({stdin:{contents:'export {terminal_surface} from "./src/terminal_surface";export {terminal_defaults} from "./src/terminal_settings";export {default as css} from "./src/terminal_workspace.css";export {default as xterm_css} from "@xterm/xterm/css/xterm.css";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'geometry_api',loader:{'.css':'text'},write:false});
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(`{const style=document.createElement('style');style.textContent=geometry_api.xterm_css+geometry_api.css;document.head.append(style);window.surface=new geometry_api.terminal_surface(geometry_api.terminal_defaults,{input(){},resize(){},copy:async()=>{},active(){},error(error){throw error}});document.querySelector('#host').append(surface.container);surface.mount();}`);
  for(const zoom of [0.8,1,1.25])for(const font_size of [12,14,20])for(const height of [143,220,317])for(const status of [false,true]){
    win.webContents.setZoomFactor(zoom);
    const sample=await evaluate(`(async()=>{const host=document.querySelector('#host');host.style.height='${height}px';document.querySelector('footer').style.top='${height+20}px';surface.apply_settings({...geometry_api.terminal_defaults,font_size:${font_size}});surface.set_status(${status}?'error':'running',${status}?'状态信息':'');await new Promise(r=>setTimeout(r,70));await new Promise(r=>surface.term.write('\\r\\n'.repeat(70)+'LAST_LINE',r));await new Promise(requestAnimationFrame);const screen=surface.container.querySelector('.xterm-screen').getBoundingClientRect(),viewport=surface.viewport.getBoundingClientRect(),last=surface.container.querySelector('.xterm-rows').lastElementChild.getBoundingClientRect(),style=getComputedStyle(surface.term.element);return {zoom:${zoom},font_size:${font_size},height:${height},status:${status},screen_bottom:screen.bottom,last_bottom:last.bottom,boundary:viewport.bottom,gap:viewport.bottom-screen.bottom,padding:parseFloat(style.paddingBottom),rows:surface.term.rows};})()`);
    samples.push(sample);assert(sample.gap>=3.5,JSON.stringify(sample));assert(sample.last_bottom<=sample.boundary-3.5,JSON.stringify(sample));
  }
  await evaluate('surface.dispose()');
  fs.writeFileSync(path.join(root,'checks.json'),JSON.stringify({status:'PASS',samples},null,2));
  console.log(JSON.stringify({status:'PASS',cases:samples.length,evidence:root}));
}).catch(async error=>{console.error(error);process.exitCode=1;fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify({error:String(error),samples},null,2));}).finally(()=>{win?.destroy();app.exit(process.exitCode||0)});
