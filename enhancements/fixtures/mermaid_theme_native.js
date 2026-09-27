(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<400;i++){if(fn())return;await pause(30);}throw Error(label);};
 const text='# 图表颜色\n\n```mermaid\nflowchart LR\n  subgraph 设备\n  A[设备与驱动] --> B[生命周期]\n  end\n  B --> C[作者颜色]\n  style C fill:#123456,stroke:#abcdef,color:#fedcba\n```\n\n```mermaid\nsequenceDiagram\n Alice->>Bob: 请求\n Note over Alice,Bob: 说明\n Bob-->>Alice: 返回\n```\n\n```mermaid\npie title 比例\n "完成" : 70\n "待办" : 30\n```\n',file=path.join(base,'workspace/mermaid.md');
 const svg=()=>document.querySelector('#write [lang=mermaid] svg'),shape=()=>svg()?.querySelector('.node rect'),color=()=>shape()&&getComputedStyle(shape()).fill;
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'窗口准备超时');fs.writeFileSync(file,text);await files.open_file(file);
  await wait(()=>File.bundle.filePath===file&&!File.isFileLoading(),'文件打开');await wait(()=>svg(),'Mermaid未渲染');
  const dirty=File.isDirty,source=File.editor.diagrams;
  for(const theme of ['night.css','cpp_github-consolas_dark.css','cpp_github-consolas_light.css','cpp_github-consolas_dark.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(1300);
   await wait(()=>document.querySelectorAll('#write [lang=mermaid] svg').length===3,'三类图表');
   const opts=source.getCurrentMermaidOptions(),line=svg().querySelector('.flowchart-link'),label=svg().querySelector('.node .nodeLabel');
   samples.push({theme,options:opts,node:color(),line:line&&getComputedStyle(line).stroke,label:label&&getComputedStyle(label).color,canvas:getComputedStyle(document.querySelector('#write [lang=mermaid]')).backgroundColor});
   assert(opts.theme===(theme==='night.css'||theme.includes('dark')?'dark':'default'),'原生Mermaid主题 '+theme);
   if(theme.includes('dark')){assert(color()===samples[0].node,'Dark节点与原版Night一致');assert(line&&getComputedStyle(line).stroke===samples[0].line,'Dark连线与原版Night一致');}
   assert([...svg().querySelectorAll('.node rect')].some(node=>getComputedStyle(node).fill==='rgb(18, 52, 86)'),'作者style保留');
   assert(getComputedStyle(document.querySelector('#write [lang=mermaid]')).backgroundColor==='rgba(0, 0, 0, 0)','图表不再继承代码底色');
  }
  document.querySelector('#write [lang=mermaid]').scrollIntoView({block:'center'});await pause(300);await wait(()=>document.querySelector('.linux-note-mermaid-open:not([hidden])'),'可见全屏入口');const button=document.querySelector('.linux-note-mermaid-open:not([hidden])');assert(button,'全屏入口');button.click();await wait(()=>document.querySelector('.reading-media-viewer svg'),'全屏已打开');
  const viewer=document.querySelector('.reading-media-viewer');viewer.querySelector('[data-action=zoom-in]').click();const scale=viewer.style.getPropertyValue('--reading-media-scale');
  assert(getComputedStyle(viewer.querySelector('.node rect')).fill===color(),'全屏保留原生SVG颜色');viewer.querySelector('[data-action=close]').click();
  await JSBridge.invoke('setting.setCurTheme','cpp_github-consolas_light.css','Light');File.setTheme('cpp_github-consolas_light.css');await pause(1300);
  document.querySelector('#write [lang=mermaid]').scrollIntoView({block:'center'});await pause(200);document.querySelector('.linux-note-mermaid-open:not([hidden])').click();await pause(150);
  assert(getComputedStyle(document.querySelector('.reading-media-viewer .node rect')).fill===color(),'切主题后全屏采用当前原生SVG');document.querySelector('.reading-media-viewer [data-action=close]').click();
  for(let i=0;i<20;i++){const theme=i%2?'cpp_github-consolas_dark.css':'cpp_github-consolas_light.css';await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(100);}
  await pause(1200);assert(source.getCurrentMermaidOptions().theme==='dark','20次切换最终Dark');assert(document.querySelectorAll('#write [lang=mermaid] svg').length===3,'20次切换无重复SVG');
  assert(File.isDirty===dirty,'dirty保持');assert(fs.readFileSync(file,'utf8')===text,'Markdown原文保持');
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'mermaid_dark'}));await pause(500);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,samples,error:String(error.stack||error),html:document.querySelector('#write [lang=mermaid]')?.outerHTML},null,2));}
})();
