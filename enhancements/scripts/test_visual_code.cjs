const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {build}=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_visual_code_')),checks=[];
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();let win;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ev=source=>win.webContents.executeJavaScript(source);
const samples={
 svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80"><rect width="240" height="80" fill="lightblue"/><text x="10" y="40">架构 SVG</text></svg>',
 html:'<style>.card{color:red;padding:12px}</style><div class="card">HTML 组成</div>',
 mermaid:'flowchart LR\n A[设备] --> B[驱动]',
 graphviz:'digraph { A -> B }',
 wavedrom:"{signal:[{name:'clk',wave:'p.....'},{name:'data',wave:'x.345x',data:['A','B','C']}]}",
 vega:JSON.stringify({$schema:'https://vega.github.io/schema/vega/v6.json',width:200,height:100,data:[{name:'table',values:[{x:10,y:20}]}],marks:[{type:'rect',from:{data:'table'},encode:{enter:{x:{field:'x'},y:{field:'y'},width:{value:80},height:{value:40},fill:{value:'steelblue'}}}}]}),
 vega_lite:JSON.stringify({data:{values:[{a:'A',b:3},{a:'B',b:5}]},mark:'bar',encoding:{x:{field:'a',type:'nominal'},y:{field:'b',type:'quantitative'}}}),
 echarts:JSON.stringify({animation:false,xAxis:{data:['A','B']},yAxis:{},series:[{type:'bar',data:[2,3]}]}),
 plantuml:'@startuml\nAlice -> Bob : hello\n@enduml',
 math:'E=mc^2',flow:'st=>start: Start\ne=>end: End\nst->e',sequence:'Alice->Bob: hello',
 react:'import React, {useState} from "react"; export default function App(){const [n,set_n]=useState(0);return <button onClick={()=>set_n(n+1)}>Count {n}</button>}',
 html_live:'<button id="count">0</button><script>document.getElementById("count").onclick=e=>e.target.textContent=Number(e.target.textContent)+1;</script>',
 javascript_live:'root.textContent="isolated="+(typeof require)+","+(typeof process);try{parent.document.body.dataset.compromised="yes"}catch{root.dataset.isolated="yes"}'
};
async function render(format,source){
 await ev(`window.result=null;window.binding?.dispose();document.getElementById('out').replaceChildren();window.binding=qa.create_visual_sandbox(document.getElementById('out'),${JSON.stringify(format)},${JSON.stringify(source)},v=>{if(v.ready||v.error)window.result=v;});void 0;`);
 const start=Date.now();while(Date.now()-start<45000){const result=await ev('window.result');if(result)return result;await pause(30);}throw Error('No response: '+format);
}
app.whenReady().then(async()=>{
 fs.mkdirSync(path.join(root,'typora_code/assets'),{recursive:true});fs.cpSync(path.join(__dirname,'../dist/assets/visual'),path.join(root,'typora_code/assets/visual'),{recursive:true});
 win=new BrowserWindow({show:false,width:1000,height:850,webPreferences:{offscreen:true,nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});
 await win.loadURL('data:text/html,<!doctype html><body style="color:rgb(20,20,20);background:white"><div id="out"></div></body>');
 win.webContents.on('console-message',(_event,_level,message)=>{if(/error|failed/i.test(message))console.error(message.slice(0,300));});
 await ev(`window.reqnode=require;window._options={userDataPath:${JSON.stringify(root)}};`);
 const {inline_css_assets}=await import('./build_workspace_styles.mjs');
 const bundle=await build({plugins:[{name:'shadow-style-fixture',setup(context){context.onLoad({filter:/_shadow\.css$/},args=>({contents:inline_css_assets(args.path),loader:'text'}));}},...require('./editor_bundle.cjs').editor_plugins()],stdin:{contents:"export {create_visual_sandbox} from './src/visual_code_sandbox';export {create_visual_code_view,create_visual_code_previews} from './src/visual_code_view';export {bind_reading_visual_code} from './src/reading_visual_code';export {visual_marked,render_visual_math} from './src/visual_markdown_math';export {export_visual_svg} from './src/visual_code_export';export {create_git_markdown_diff} from './src/git_markdown_diff';export {create_lookup_preview} from './src/workspace_lookup_preview';export {bind_workspace_split_markdown} from './src/workspace_split_markdown';",resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'qa',loader:{'.css':'text'}});
 await ev(bundle.outputFiles[0].text);
 for(const [format,source] of Object.entries(samples)){
  const result=await render(format,source);assert(!result.error,format+': '+result.error);assert(result.ready,format);
  if(!['html','math','react','html_live','javascript_live'].includes(format))assert(result.svg?.includes('<svg'),format+' SVG');
  const frame=win.webContents.mainFrame.frames.find(frame=>frame.url==='about:srcdoc');assert(frame,format+' iframe');
  assert.equal(await frame.executeJavaScript('typeof require'),'undefined',format+' Node isolation');
  assert.equal(await ev('document.body.dataset.compromised'),undefined,'parent intact');
  if(format==='react'||format==='html_live'){await pause(100);await frame.executeJavaScript('document.querySelector("button").click()');await pause(80);assert.match(await frame.executeJavaScript('document.querySelector("button").textContent'),/1/);}
  checks.push(format);console.log('PASS '+format);
 }
 let result=await render('graphviz','not a graph');assert(result.error,'syntax failure');checks.push('syntax-error');
 result=await render('svg','<svg xmlns="http://www.w3.org/2000/svg"><script>parent.document.body.dataset.compromised="yes"</script><rect width="20" height="20"/></svg>');assert(!result.error);assert(!result.svg.includes('<script'));checks.push('svg-script-stripped');
 await ev('window.binding.dispose();window.result=null;window.binding=qa.create_visual_sandbox(document.getElementById("out"),"plantuml","@startuml\\nA->B:x\\n@enduml",v=>window.result=v);window.binding.dispose();');await pause(500);assert.equal(await ev('window.result'),null);assert.equal(await ev('document.querySelectorAll("iframe").length'),0);checks.push('cancel-cleanup');
 await ev(`(async()=>{const root=document.getElementById('out');root.innerHTML=qa.visual_marked.parse('Inline $x^2$ .\\n\\n$$\\n\\frac{1}{2}\\n$$');await qa.render_visual_math(root,()=>true);})()`);
 assert.equal(await ev('document.querySelectorAll(".katex").length'),2);checks.push('inline-and-block-math');
 for(let i=0;i<20;i++){
  await ev(`window.preview?.dispose();document.getElementById('out').innerHTML='<pre><code class="language-svg"></code></pre>';document.querySelector('code').textContent=${JSON.stringify(samples.svg)};window.preview=qa.create_visual_code_previews();void 0;`);
  await ev(`preview.render(document.querySelector('code'),600,false,()=>true)`);
  for(let n=0;n<200&&await ev('!document.querySelector("[data-visual-state=ready]")');n++)await pause(10);
  assert.equal(await ev('document.querySelector(".visual-code-view").dataset.visualState'),'ready');
 }
 await pause(500);
 const painted=win.webContents.mainFrame.frames.find(frame=>frame.url==='about:srcdoc');assert(await painted.executeJavaScript('document.querySelector("svg").getBoundingClientRect().height>0'),'visible SVG geometry');
 fs.writeFileSync(path.join(root,'visual-toolbar.png'),(await win.webContents.capturePage()).toPNG());
 checks.push('20-preview-render-dispose');await ev('preview.dispose();');assert.equal(await ev('document.querySelectorAll("iframe").length'),0);
 await ev(`window.control_view=qa.create_visual_code_view('react',${JSON.stringify(samples.react)});document.getElementById('out').id='write';document.getElementById('write').append(control_view.root);control_view.start();control_view.root.querySelector('button').focus();`);
 assert.equal(await ev('getComputedStyle(control_view.root.querySelector("button")).borderRadius'),'4px');assert.equal(await ev('getComputedStyle(control_view.root.querySelector("button:disabled")).opacity'),'0.5');
 await ev(`control_view.dispose();document.getElementById('write').id='out';const host=document.createElement('div');document.getElementById('out').append(host);const shadow=host.attachShadow({mode:'open'});const article=document.createElement('article');article.id='write';shadow.append(article);window.control_view=qa.create_visual_code_view('react',${JSON.stringify(samples.react)});article.append(control_view.root);control_view.start();`);
 assert.equal(await ev('getComputedStyle(control_view.root.querySelector("button")).borderRadius'),'4px');await ev('control_view.dispose();document.getElementById("out").replaceChildren()');checks.push('native-and-shadow-control-states');
 const markdown='# Diagram\n\n```svg\n'+samples.svg+'\n```\n\nInline $x^2$ .';
 await ev(`window.diff=qa.create_git_markdown_diff();document.getElementById('out').append(diff.container);diff.render(${JSON.stringify(markdown)},${JSON.stringify(markdown)},[],['old','new']);void 0;`);
 for(let n=0;n<400&&await ev('diff.shadow.querySelectorAll("[data-visual-state=ready]").length!==2');n++)await pause(25);
 assert.equal(await ev('diff.shadow.querySelectorAll("[data-visual-state=ready]").length'),2);assert.equal(await ev('diff.shadow.querySelectorAll(".katex").length'),2);await ev('diff.dispose()');checks.push('git-both-sides-svg-and-math');
 await ev(`window.lookup=qa.create_lookup_preview({copy(){}},async()=>${JSON.stringify(markdown)});document.getElementById('out').append(lookup.container);void 0;`);
 await ev(`lookup.show({file_path:'F:/fixture.md',relative_path:'fixture.md',matches:[]},{id:'fixture',line:1,column:1,end_line:1,end_column:2,text:'#'})`);
 for(let n=0;n<400&&await ev('!lookup.container.querySelector(".workspace-lookup-markdown").shadowRoot.querySelector("[data-visual-state=ready]")');n++)await pause(25);
 assert.equal(await ev('lookup.container.querySelector(".workspace-lookup-markdown").shadowRoot.querySelectorAll("[data-visual-state=ready]").length'),1);assert.equal(await ev('lookup.container.querySelector(".workspace-lookup-markdown").shadowRoot.querySelectorAll(".katex").length'),1);await ev('lookup.dispose()');checks.push('lookup-svg-and-math');
 await ev(`window.split=qa.bind_workspace_split_markdown({copy(){}});const pane=document.createElement('div');pane.className='typ-markdown-preview';pane.innerHTML='<pre><code class="language-svg"></code></pre>';pane.querySelector('code').textContent=${JSON.stringify(samples.svg)};document.getElementById('out').append(pane);pane.dispatchEvent(new CustomEvent('typora-code:markdown-pane-rendered',{bubbles:true,detail:{root:pane}}));`);
 for(let n=0;n<400&&await ev('!document.querySelector("[data-visual-state=ready]")');n++)await pause(25);
 assert.equal(await ev('document.querySelectorAll("[data-visual-state=ready]").length'),1);await ev('split.dispose();document.getElementById("out").replaceChildren()');checks.push('split-svg');
 const save=path.join(root,'saved.svg');await ev(`window.JSBridge={invoke:async()=>({filePath:${JSON.stringify(save)}})};qa.export_visual_svg(${JSON.stringify(samples.svg)},()=>true)`);assert.equal(fs.readFileSync(save,'utf8'),samples.svg);
 await ev(`window.JSBridge={invoke:async()=>({canceled:true})};qa.export_visual_svg('cancel',()=>true)`);assert.equal(fs.readFileSync(save,'utf8'),samples.svg);checks.push('export-save-and-cancel');
 fs.writeFileSync(path.join(root,'checks.json'),JSON.stringify({status:'PASS',checks},null,2));console.log(JSON.stringify({status:'PASS',checks,evidence:root}));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);fs.writeFileSync(path.join(root,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(error)},null,2));win?.destroy();app.exit(1);});
