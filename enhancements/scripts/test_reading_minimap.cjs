// 使用隔离的 Chromium 窗口验证实际文本缩略图、真实鼠标定位和多编辑组清理。
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_minimap_'));
app.setPath('userData', path.join(root, 'user_data')); app.disableHardwareAcceleration();
let test_window;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => test_window.webContents.executeJavaScript(source);
const wait = async source => { for (let index = 0; index < 150; index += 1) { if (await evaluate(source)) return; await delay(40); } throw new Error('Timed out: ' + source); };
app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { contextIsolation: false, backgroundThrottling: false, offscreen: true } });
  const html = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}body{font:16px/1.8 monospace}content{display:block;position:absolute;left:0;top:32px;bottom:25px;width:50%;overflow:auto}#write{padding:20px;box-sizing:border-box}.typ-workspace-leaf{position:absolute;left:50%;width:50%;top:32px;bottom:25px;overflow:auto;display:flex;align-items:flex-start}.typ-markdown-preview{padding:20px;box-sizing:border-box;width:100%}h2{color:#005cc5}p{margin:12px 0}#source{position:absolute;inset:0;display:none}.CodeMirror{position:absolute;inset:0}.CodeMirror-scroll{height:100%;overflow:auto}.CodeMirror-lines{height:9000px}</style><content><div id="write"></div></content><section class="typ-workspace-leaf mod-active"><div class="typ-markdown-preview"></div></section><div id="source"><div class="CodeMirror"><div class="CodeMirror-scroll"><div class="CodeMirror-lines"></div></div></div></div>';
  const filename = path.join(root, 'test.html'); fs.writeFileSync(filename, html); await test_window.loadFile(filename);
  await evaluate(`(() => {
    const source = Array.from({length:800}, (_,index) => '<h2>Section ' + index + ' 标题</h2><p>' + 'Document content ' + index + ': Linux kernel, RCU and memory. '.repeat(4) + '</p>').join('');
    document.querySelector('#write').innerHTML=source; document.querySelector('.typ-markdown-preview').innerHTML=source.replaceAll('Document content','Independent preview');
    window.original=document.querySelector('#write').innerHTML; window.original_preview=document.querySelector('.typ-markdown-preview').innerHTML;
    const leaf={state:{path:'preview.md'},containerEl:document.querySelector('.typ-workspace-leaf'),view:{containerEl:document.querySelector('.typ-markdown-preview')}};
    window.leaves=[leaf]; window[Symbol.for('typora-plugin-core@v2')]={app:{workspace:{eachLeaves:callback=>window.leaves.forEach(callback)}}};
  })()`);
  const bundle = await build({ stdin: { contents:'export { bind_reading_minimap } from "./src/reading_minimap";', resolveDir:path.join(__dirname,'..') }, bundle:true, loader:{'.css':'text'}, format:'iife', globalName:'minimap_qa', write:false });
  await evaluate(bundle.outputFiles[0].text); await evaluate('minimap_qa.bind_reading_minimap()');
  await wait('document.querySelectorAll(".linux-note-reading-minimap[data-ready=true]").length===2');
  assert(await evaluate(`Array.from(document.querySelectorAll('.linux-note-reading-minimap canvas')).every(canvas => {const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return pixels.some((value,index)=>index%4===3&&value>0);})`));
  const initial_canvas = await evaluate('document.querySelector("content .linux-note-reading-minimap canvas").toDataURL()');
  assert(await evaluate('document.querySelector("content .linux-note-reading-minimap canvas").toDataURL()!==document.querySelector(".typ-workspace-leaf .linux-note-reading-minimap canvas").toDataURL()'));
  const position = await evaluate(`(() => {const bounds=document.querySelector('content .linux-note-reading-minimap').getBoundingClientRect();return {x:Math.round(bounds.x+30),y:Math.round(bounds.y+bounds.height*.6)};})()`);
  for (const type of ['mouseMove','mouseDown','mouseUp']) test_window.webContents.sendInputEvent({type,...position,button:'left',clickCount:1});
  await delay(120);
  assert(await evaluate('document.querySelector("content").scrollTop>2000 && document.querySelector(".typ-workspace-leaf").scrollTop===0'));
  const old_top = await evaluate('document.querySelector("content").scrollTop');
  test_window.webContents.sendInputEvent({type:'mouseDown',...position,button:'left',clickCount:1});
  test_window.webContents.sendInputEvent({type:'mouseMove',x:position.x,y:position.y+70,button:'left'});
  test_window.webContents.sendInputEvent({type:'mouseUp',x:position.x,y:position.y+70,button:'left',clickCount:1});
  await delay(120); assert(await evaluate('document.querySelector("content").scrollTop')>old_top);
  assert.equal(await evaluate('document.querySelector("content .linux-note-reading-minimap canvas").toDataURL()'), initial_canvas);
  const concurrent_paint = await evaluate(`new Promise((resolve,reject) => {
    const rail=document.querySelector('content .linux-note-reading-minimap'),content=document.querySelector('content');let frames=0;const started=Date.now();
    document.querySelector('#write').style.outlineColor='transparent';
    const tick=()=>{if(rail.dataset.ready==='false'){content.scrollTop-=17;frames+=1;}else if(frames){resolve({frames,pixels:rail.querySelector('canvas').toDataURL()});return;}if(Date.now()-started>3000){reject(new Error('No asynchronous paint observed'));return;}requestAnimationFrame(tick);};requestAnimationFrame(tick);
  })`);
  assert(concurrent_paint.frames > 0); assert.equal(concurrent_paint.pixels, initial_canvas);
  await evaluate('document.querySelector("#write").style.removeProperty("outline-color")');
  assert(await evaluate('document.querySelector("#write").innerHTML===original && document.querySelector(".typ-markdown-preview").innerHTML===original_preview'));
  await evaluate('document.querySelector(".typ-workspace-leaf").remove();window.leaves=[];');
  await wait('document.querySelectorAll(".linux-note-reading-minimap").length===1');
  await evaluate(`(() => {
    document.querySelector('#write').innerHTML='<div id="clip_box" style="height:100px;overflow:auto;color:rgb(255,0,0);line-height:20px">'+Array.from({length:100},(_,index)=>'<div>Buffered code line '+index+'</div>').join('')+'</div><p style="color:rgb(0,0,255)">Body after the collapsed code block</p><div style="height:1700px"></div>';
    document.querySelector('content').scrollTop=0;
  })()`);
  await delay(220); await wait('document.querySelector("content .linux-note-reading-minimap").dataset.ready==="true"');
  const clip_evidence = await evaluate(`(() => {
    const canvas=document.querySelector('content .linux-note-reading-minimap canvas'),content=document.querySelector('content'),write=document.querySelector('#write'),clip_box=document.querySelector('#clip_box');
    const scale_y=Math.min(88/write.clientWidth,content.clientHeight/content.scrollHeight)*canvas.height/content.clientHeight;
    const clip_end=Math.ceil((clip_box.getBoundingClientRect().top-content.getBoundingClientRect().top+content.scrollTop+clip_box.clientHeight)*scale_y)+1;
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let clipped_red=0,visible_red=0,body_blue=0;
    for(let index=0;index<data.length;index+=4){if(data[index+3]<10)continue;const below=Math.floor(index/4/canvas.width)>=clip_end;if(data[index]>data[index+1]*2&&data[index]>data[index+2]*2){if(below)clipped_red+=1;else visible_red+=1;}if(below&&data[index+2]>data[index]*2&&data[index+2]>data[index+1]*2)body_blue+=1;}
    return {clip_end,clipped_red,visible_red,body_blue,hidden_line_bottom:clip_box.lastElementChild.getBoundingClientRect().bottom,clip_bottom:clip_box.getBoundingClientRect().bottom};
  })()`);
  assert(clip_evidence.hidden_line_bottom > clip_evidence.clip_bottom + 1000);
  assert.equal(clip_evidence.clipped_red, 0); assert(clip_evidence.visible_red > 0 && clip_evidence.body_blue > 0);
  fs.writeFileSync(path.join(root,'clipped_minimap.png'),(await test_window.webContents.capturePage()).toPNG());
  await evaluate(`(() => {
    const owner=document.querySelector('.CodeMirror'), scroller=document.querySelector('.CodeMirror-scroll');const handlers=new Map();
    window.File={editor:{sourceView:{inSourceMode:true,cm:{getWrapperElement:()=>owner,getScrollerElement:()=>scroller,getScrollInfo:()=>({top:scroller.scrollTop,height:9000,clientHeight:scroller.clientHeight}),lineCount:()=>300,getLine:line=>'# Source line '+line,heightAtLine:line=>line*30,defaultTextHeight:()=>30,scrollTo:(_left,top)=>{scroller.scrollTop=top;},refresh(){},on:(name,callback)=>handlers.set(name,callback),off:name=>handlers.delete(name)}}}};
    document.querySelector('content').style.display='none';document.querySelector('#source').style.display='block';window.source_handlers=handlers;
    const preview=document.createElement('section');preview.className='typ-workspace-leaf mod-active';preview.innerHTML='<div class="typ-markdown-preview"><h2>Independent source-mode preview</h2><p>Keep this document open while using source mode.</p></div>';document.body.append(preview);
    window.leaves=[{state:{path:'source_preview.md'},containerEl:preview,view:{containerEl:preview.firstElementChild}}];
  })()`);
  await wait('!!document.querySelector(".CodeMirror .linux-note-reading-minimap[data-ready=true]")');
  await wait('!!document.querySelector(".typ-workspace-leaf .linux-note-reading-minimap[data-ready=true]")');
  assert(await evaluate('document.querySelectorAll(".linux-note-reading-minimap").length===2 && !document.querySelector("content .linux-note-reading-minimap")'));
  await evaluate(`document.querySelector('.CodeMirror .linux-note-reading-minimap').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}))`);
  assert(await evaluate('document.querySelector(".CodeMirror-scroll").scrollTop>8000'));
  await evaluate(`File.editor.sourceView.inSourceMode=false;document.querySelector('#source').style.display='none';document.querySelector('content').style.display='block';`);
  await wait('!!document.querySelector("content .linux-note-reading-minimap[data-ready=true]")');
  assert(await evaluate('source_handlers.size===0 && !document.querySelector(".CodeMirror .linux-note-reading-minimap")'));
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  assert(await evaluate('document.querySelectorAll(".linux-note-reading-minimap").length===0 && !document.querySelector("[data-linux-note-minimap-owner]")'));
  console.log(JSON.stringify({status:'PASS',checks:['actual rendered text pixels in both panes','different documents produce different thumbnails','real click and drag scroll only targeted pane','scroll updates viewport without repainting full document','concurrent scrolling does not misalign asynchronous painting','document content remains unchanged','closed pane removes minimap','inner scroll buffer lines do not paint over following text','source mode uses complete CodeMirror lines and scroll API','source mode retains independent preview minimaps','mode switch releases source listeners','pagehide disposes maps and ownership'],clip_evidence,screenshot:path.join(root,'clipped_minimap.png')},null,2));
  test_window.destroy(); app.exit(0);
}).catch(error=>{console.error(error);test_window?.destroy();app.exit(1);});
