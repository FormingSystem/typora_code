// 真实Chromium布局：测量复杂度、失效与位置保真，不用耗时阈值代替功能断言。
const {app,BrowserWindow}=require('electron'),{build}=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_reading_performance_')),checks=[];app.setPath('userData',path.join(evidence,'profile'));app.disableHardwareAcceleration();
let win;const pause=ms=>new Promise(r=>setTimeout(r,ms)),read=s=>win.webContents.executeJavaScript(s),check=async(s,label)=>{assert(await read(s),label);checks.push(label);};
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{contextIsolation:false,offscreen:true,backgroundThrottling:false}});
 const html=path.join(evidence,'fixture.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>body{margin:0}content{display:block;height:500px;overflow:auto}#write{font:18px/1.5 sans-serif;width:800px;margin:0}p{margin:12px 0}</style><content><article id="write"></article></content>');await win.loadFile(html);
 const bundle=await build({stdin:{contents:'export * from "./src/reading_reflow";export * from "./src/reading_positions";export * from "./src/workspace_markdown_theme";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'qa',write:false});await read(bundle.outputFiles[0].text);
 await read(`window.root=document.querySelector('#write');window.scroller=document.querySelector('content');window.binding=qa.bind_reading_reflow(scroller,root);window.bounds=0;window.original=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){bounds++;return original.call(this)};window.reference=()=>{const top=original.call(scroller).top,blocks=[...root.children].filter(n=>original.call(n).height>0&&!n.matches('script,style,button'));return blocks.find(n=>original.call(n).bottom>top+16)||blocks.at(-1)};void 0;`);
 for(const count of [20,100,1000]){
  await read(`root.innerHTML=Array.from({length:${count}},(_,i)=>'<p id="p'+i+'">Paragraph '+i+' '+('long 中文 paragraph '.repeat(20))+'</p>').join('');scroller.scrollTop=scroller.scrollHeight-1600`);await pause(80);
  await read('qa.capture_position(scroller,root);bounds=0;window.correct=true;for(let i=0;i<1000;i++){scroller.scrollTop+=i%2?12:-12;const p=qa.capture_position(scroller,root),a=qa.capture_reflow_anchor(scroller,root);correct=correct&&p.block.text===reference().textContent.trim().slice(0,160)&&!!a;}window.cost=bounds;void 0;');
  await check('correct','1000次采样与实际块一致 '+count);await check('cost<15000','滚动几何读取有界而非随正文增长 '+count);
 }
 await read(`root.querySelector('#p997').hidden=true;root.querySelector('#p995').textContent='Changed '+ 'wrap '.repeat(300);window.position=qa.capture_position(scroller,root);`);
 await check('position.block.text===reference().textContent.trim().slice(0,160)','同一任务修改/隐藏后立即失效');await pause(80);
 await read('window.anchor=qa.capture_reflow_anchor(scroller,root);binding.change(()=>{root.style.width="450px"});');await pause(80);
 await check(`(()=>{const r=document.createRange();r.setStart(anchor.node,anchor.offset);r.setEnd(anchor.node,anchor.offset+1);return Math.abs(r.getBoundingClientRect().top-original.call(scroller).top-anchor.top)<3})()`,'窄宽重排保持当前字符');
 await read('window.anchor=qa.capture_reflow_anchor(scroller,root);binding.change(()=>{root.style.zoom="0.85"});');await pause(80);
 await check(`(()=>{const r=document.createRange();r.setStart(anchor.node,anchor.offset);r.setEnd(anchor.node,anchor.offset+1);return Math.abs(r.getBoundingClientRect().top-original.call(scroller).top-anchor.top)<3})()`,'分数缩放保持当前字符');
 await read(`window.style=document.createElement('style');style.textContent='#write p{padding:7px}';document.head.append(style);`);await pause(80);
 await check('qa.capture_position(scroller,root).block.text===reference().textContent.trim().slice(0,160)','主题规则改变使块几何失效');
 await read(`root.style.zoom='1';root.innerHTML='<p id="one">one</p><p id="two">two</p>';style.textContent='#write p{margin:0;height:80px}body.swap #one{height:120px}body.swap #two{height:40px}';qa.capture_position(scroller,root);document.body.classList.add('swap');scroller.style.height='90px';scroller.scrollTop=90;`);
 await check(`qa.capture_position(scroller,root).block.text===reference().textContent.trim().slice(0,160)`,'祖先主题改变两块高度但总高不变仍失效');
 await read(`style.textContent='#write p{padding:7px}';root.style.width='800px';scroller.style.height='500px';`);
 await read(`window.calls=0;window.stop1=qa.observe_markdown_theme(()=>{calls++;qa.markdown_theme_rules()});window.stop2=qa.observe_markdown_theme(()=>{calls++;qa.markdown_theme_rules()});void 0;`);await pause(60);
 await check(`qa.markdown_theme_rules().includes('padding: 7px')`,'多个主题消费者读当前样式');
 await read(`style.textContent='#write p{padding:9px}';window.new_rules=qa.markdown_theme_rules();`);
 await check(`new_rules.includes('padding: 9px')&&!new_rules.includes('padding: 7px')`,'同一任务修改样式后同步读取不命中旧缓存');
 await read(`window.before=calls;for(let i=0;i<1000;i++)document.body.classList.toggle('irrelevant',!!(i%2));`);await pause(80);
 await check('calls-before<=2','1000次宿主状态变化每消费者只刷新一帧');
 await read('stop1();stop2();binding.dispose();window.before=calls;document.body.classList.toggle("irrelevant");scroller.scrollTop=50');await pause(80);
 await check('calls===before','销毁不保留主题回调');
 fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence}));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(error.stack)},null,2));console.error(evidence);win?.destroy();app.exit(1)});
