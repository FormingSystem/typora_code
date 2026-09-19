// 功能/系统边界：真实Chromium几何、原生滚动算法端口；不操作用户窗口。
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {build}=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_stability_ui_'));
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();let win;
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true}});
 await win.loadURL('data:text/html,<style>body{margin:0}content{display:block;position:absolute;left:0;right:400px;top:89px;bottom:22px;overflow:auto}h2{margin:0;height:30px}footer{position:absolute;bottom:0;height:22px;width:100%}.workspace-breadcrumbs{position:absolute;top:67px;left:0;width:600px;height:22px}</style><nav class="workspace-breadcrumbs"></nav><content class="typ-workspace-binding"><div style="height:600px"></div><h2 id="heading">Heading</h2><div style="height:900px"></div></content><footer class="ty-footer"></footer>');
 const bundle=await build({stdin:{contents:'export * from "./src/reading_native_scroll";export * from "./src/reading_viewport";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'qa'});
 await win.webContents.executeJavaScript(bundle.outputFiles[0].text);
 const result=await win.webContents.executeJavaScript(`(()=>{
  const checks=[],content=document.querySelector('content'),heading=document.querySelector('#heading');
  const check=(condition,label)=>{if(!condition)throw Error(label);checks.push(label);};
  // 与已核对的宿主显式滚动计算一致：文档坐标减margin和原生顶栏。
  const selection={scrollAdjust(target,margin){if(margin!=null)content.scrollTop=target.getBoundingClientRect().top+content.scrollTop-margin;return 17;}};
  const editor={selection,sourceView:{inSourceMode:false}},runtime={File:{}};
  selection.scrollAdjust(heading,10);check(heading.getBoundingClientRect().top<89,'旧窗口原点会把标题滚到工作台上方');
  const original=selection.scrollAdjust,stop=qa.bind_reading_native_scroll(editor,runtime);
    for(const top of [67,89,111]){content.style.top=top+'px';document.querySelector('nav').style.top=(top-22)+'px';content.scrollTop=0;
      check(selection.scrollAdjust(heading,10)===17,'返回值保持');check(Math.abs(heading.getBoundingClientRect().top-top-10)<1,'标题避开实际导航下沿');}
  const before=content.scrollTop;selection.scrollAdjust(heading);check(content.scrollTop===before,'隐式滚动不强制改变行为');
  editor.sourceView.inSourceMode=true;selection.scrollAdjust(heading,10);check(heading.getBoundingClientRect().top<content.getBoundingClientRect().top,'源码模式保留原方法');editor.sourceView.inSourceMode=false;
  content.style.top='67px';document.querySelector('nav').style.top='67px';check(qa.reading_viewport_bounds(content).top===89,'覆盖导航只扣一次');
  document.querySelector('nav').hidden=true;check(qa.reading_viewport_bounds(content).top===67,'隐藏导航不扣');
  document.querySelector('nav').hidden=false;document.querySelector('nav').style.left='700px';check(qa.reading_viewport_bounds(content).top===67,'邻组导航不扣');
  stop();check(selection.scrollAdjust===original,'销毁恢复宿主方法');check(heading.textContent==='Heading','正文保持');return checks;
 })()`);
 fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({status:'PASS',checks:result},null,2),'utf8');
 console.log(JSON.stringify({status:'PASS',checks:result.length,evidence:root}));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);win?.destroy();app.exit(1);});
