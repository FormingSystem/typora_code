const {app,BrowserWindow}=require('electron'),{build}=require('esbuild'),fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'code_wheel_'));app.setPath('userData',path.join(base,'profile'));app.disableHardwareAcceleration();let win;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),read=script=>win.webContents.executeJavaScript(script),checks=[];
const check=async(script,label)=>{const result=await read(script);if(!result)console.log(await read('({outer:owner.scrollTop,inner:scroller.scrollTop,samples,rect:code_fence.getBoundingClientRect().toJSON()})'));assert(result,label);checks.push(label);};
const wheel=async(down)=>{
 const point=await read(`(()=>{const r=scroller.getBoundingClientRect(),v=owner.getBoundingClientRect();return{x:Math.round(r.left+80),y:Math.round(Math.max(v.top+25,Math.min(r.top+30,v.bottom-25)))}})()`);
 win.webContents.sendInputEvent({type:'mouseMove',...point});win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:down?-60:60,canScroll:true});await pause(120);
};
app.whenReady().then(async()=>{
 win=new BrowserWindow({width:1000,height:800,show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,offscreen:true}});
 win.webContents.on('console-message',event=>console.log(event.message));
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<style>body{margin:0}content{display:block;position:absolute;top:80px;bottom:30px;left:30px;right:30px;overflow:auto;line-height:24px}.spacer{height:500px}.md-fences{width:80%;height:300px}.CodeMirror-scroll{height:260px;overflow:auto;overscroll-behavior:contain}.lines{height:1800px}.linux-note-code-toggle{height:40px}footer{position:absolute;bottom:0;height:30px;width:100%}</style><input id="focus"><content><div class="spacer"></div><div class="md-fences linux-note-code-collapsible is-code-collapsed"><div class="CodeMirror-scroll"><div class="lines">代码</div></div><button class="linux-note-code-toggle">展开全部代码</button></div><div style="height:2000px"></div></content><footer class="ty-footer"></footer>`));
 const bundle=await build({stdin:{contents:'export {bind_reading_code_wheel} from "./src/reading_code_wheel";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'api',write:false});await read(bundle.outputFiles[0].text);
 await read(`window.owner=document.querySelector('content');window.code_fence=document.querySelector('.md-fences');window.scroller=document.querySelector('.CodeMirror-scroll');window.button=document.querySelector('button');owner.scrollTop=0;document.querySelector('#focus').focus();window.samples=[];document.addEventListener('wheel',event=>{const start=performance.now();requestAnimationFrame(()=>samples.push({trusted:event.isTrusted,ms:performance.now()-start,outer:owner.scrollTop,inner:scroller.scrollTop}));},{capture:true});`);
 await wheel(true);await check('scroller.scrollTop>0&&owner.scrollTop===0','旧行为复现：按钮在屏外却滚动代码');
 await read('window.dispose=api.bind_reading_code_wheel();scroller.scrollTop=0;owner.scrollTop=0;');await pause(400);await wheel(true);
 await check('owner.scrollTop>0&&scroller.scrollTop===0','底部未见时真实滚轮只滚正文');
 await read('owner.scrollTop=350;scroller.scrollTop=0');await wheel(true);await check('owner.scrollTop===350&&scroller.scrollTop>0','完整可见才允许原生内部滚动');
 await read('owner.scrollTop=550;scroller.scrollTop=100');await wheel(false);await check('owner.scrollTop<550&&scroller.scrollTop===100','顶部未见时反向滚轮只滚正文');
 await read('owner.scrollTop=350;scroller.scrollTop=0');await wheel(false);await check('owner.scrollTop<350&&scroller.scrollTop===0','内部顶部向外交回正文');
 await read('owner.scrollTop=350;scroller.scrollTop=scroller.scrollHeight;window.end=scroller.scrollTop');await wheel(true);await check('owner.scrollTop>350&&scroller.scrollTop===end','内部底部向外交回正文');
 for(const zoom of [1,1.25]){
  win.webContents.setZoomFactor(zoom);await pause(100);
  await read('owner.style.bottom="300px";owner.scrollTop=350;scroller.scrollTop=80');await wheel(true);await check('owner.scrollTop>350&&scroller.scrollTop===80','终端压缩后不截留 '+zoom);
  await read('owner.style.bottom="30px";owner.scrollTop=350;scroller.scrollTop=80');
 }
 win.webContents.setZoomFactor(1);await pause(100);
 await read(`window.synthetic=(data)=>{const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,...data});scroller.firstElementChild.dispatchEvent(event);return event.defaultPrevented;};owner.scrollTop=0;scroller.scrollTop=0;`);
 for(const options of [{ctrlKey:true,deltaY:60},{metaKey:true,deltaY:60},{shiftKey:true,deltaY:60},{deltaX:80,deltaY:10}])await check(`!synthetic(${JSON.stringify(options)})`,'修饰/横向手势不接管 '+JSON.stringify(options));
 await check('synthetic({deltaY:2,deltaMode:1})&&owner.scrollTop===48','行单位沿正文行高');
 await read('owner.scrollTop=0');await check('synthetic({deltaY:1,deltaMode:2})&&owner.scrollTop===owner.clientHeight','页单位沿可见区域');
 await read('code_fence.classList.remove("is-code-collapsed");owner.scrollTop=0');await check('!synthetic({deltaY:60})','展开代码不接管');
 await read('code_fence.classList.add("is-code-collapsed");window.new_fence=code_fence.cloneNode(true);code_fence.replaceWith(new_fence);code_fence=new_fence;scroller=code_fence.querySelector(".CodeMirror-scroll");');await wheel(true);await check('owner.scrollTop>0&&scroller.scrollTop===0','替换围栏自动接入');
 for(let i=0;i<20;i++){await read('owner.scrollTop=0;scroller.scrollTop=0');await wheel(true);await check('owner.scrollTop>0&&scroller.scrollTop===0','往返滚动 '+i);}
 await check('document.activeElement.id==="focus"','滚动不抢输入焦点');
 await read('dispose();owner.scrollTop=0;scroller.scrollTop=0');await wheel(true);await check('owner.scrollTop===0&&scroller.scrollTop>0','销毁移除监听');
 const samples=await read('samples');assert(samples.some(x=>x.trusted)&&samples.every(x=>x.ms<1000));
 console.log(JSON.stringify({status:'PASS',checks,samples,limits:'真实Chromium滚轮；几何夹具，不替代原生CodeMirror集成和物理设备'}));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);win?.destroy();app.exit(1);});
