// 使用隔离的 Chromium 窗口验证实际文本缩略图、真实鼠标定位和多编辑组清理。
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { editor_plugins } = require('./editor_bundle.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_minimap_'));
app.setPath('userData', path.join(root, 'user_data')); app.disableHardwareAcceleration();
let test_window;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => test_window.webContents.executeJavaScript(source);
const wait = async source => { for (let index = 0; index < 150; index += 1) { if (await evaluate(source)) return; await delay(40); } throw new Error('Timed out: ' + source); };
app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { contextIsolation: false, backgroundThrottling: false, offscreen: true } });
  const html = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}body{font:16px/1.8 monospace}#sidebar{position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden}content{display:block;position:absolute;left:0;top:32px;bottom:25px;width:50%;overflow:auto}#write{padding:20px;box-sizing:border-box}.typ-workspace-leaf{position:absolute;left:50%;width:50%;top:32px;bottom:25px;overflow:auto;display:flex;align-items:flex-start}.typ-markdown-preview{padding:20px;box-sizing:border-box;width:100%}h2{color:#005cc5}p{margin:12px 0}#source{position:absolute;inset:0;display:none}.CodeMirror{position:absolute;inset:0}.CodeMirror-scroll{height:100%;overflow:auto}.CodeMirror-lines{height:9000px}.CodeMirror-line{font:16px/30px monospace}</style><aside id="sidebar"><div>资源管理器</div></aside><content><div id="write"></div></content><section class="typ-workspace-leaf mod-active"><div class="typ-markdown-preview"></div></section><div id="source"><div class="CodeMirror"><div class="CodeMirror-scroll"><div class="CodeMirror-lines"><pre class="CodeMirror-line">visible source row</pre></div></div></div></div>';
  const filename = path.join(root, 'test.html'); fs.writeFileSync(filename, html); await test_window.loadFile(filename);
  await evaluate(`(() => {
    const source = Array.from({length:800}, (_,index) => '<h2>Section ' + index + ' 标题</h2><p>' + 'Document content ' + index + ': Linux kernel, RCU and memory. '.repeat(4) + '</p>').join('');
    document.querySelector('#write').innerHTML=source; document.querySelector('.typ-markdown-preview').innerHTML=source.replaceAll('Document content','Independent preview');
    window.original=document.querySelector('#write').innerHTML; window.original_preview=document.querySelector('.typ-markdown-preview').innerHTML;
    const leaf={state:{path:'preview.md'},containerEl:document.querySelector('.typ-workspace-leaf'),view:{containerEl:document.querySelector('.typ-markdown-preview')}};
    window.leaves=[leaf]; window[Symbol.for('typora-code:workspace')]={app:{workspace:{eachLeaves:callback=>window.leaves.forEach(callback)}}};
  })()`);
  const bundle = await build({ plugins:editor_plugins(), stdin: { contents:'export { bind_reading_minimap } from "./src/reading_minimap";export {git_diff_editor} from "./src/git_diff_editor";', resolveDir:path.join(__dirname,'..') }, bundle:true, loader:{'.css':'text'}, format:'iife', globalName:'minimap_qa', write:false });
  await evaluate(bundle.outputFiles[0].text); await evaluate('minimap_qa.bind_reading_minimap(); void 0');
  await wait('document.querySelectorAll(".linux-note-reading-minimap[data-ready=true]").length===2');
  assert(await evaluate(`Array.from(document.querySelectorAll('.linux-note-reading-minimap canvas')).every(canvas => {const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return pixels.some((value,index)=>index%4===3&&value>0);})`));
  const initial_state = await evaluate(`(() => {const rail=document.querySelector('content .linux-note-reading-minimap'),canvas=rail.querySelector('canvas');window.stable_minimap_canvas=canvas;return {pixels:canvas.toDataURL(),commits:Number(rail.dataset.commitCount),ready:rail.dataset.ready};})()`);
  assert.equal(initial_state.commits, 1); assert.equal(initial_state.ready, 'true');
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
  await delay(350);
  assert.deepEqual(await evaluate(`(() => {const rail=document.querySelector('content .linux-note-reading-minimap'),canvas=rail.querySelector('canvas');return {same:canvas===window.stable_minimap_canvas,pixels:canvas.toDataURL(),commits:Number(rail.dataset.commitCount)};})()`), {same:true,pixels:initial_state.pixels,commits:initial_state.commits});
  await evaluate(`(() => {const sidebar=document.querySelector('#sidebar');for(let index=0;index<8;index+=1){sidebar.classList.toggle('open');sidebar.replaceChildren(Object.assign(document.createElement('div'),{textContent:'sidebar view '+index}));}sidebar.className='';})()`);
  await delay(350);
  assert.deepEqual(await evaluate(`(() => {const rail=document.querySelector('content .linux-note-reading-minimap'),canvas=rail.querySelector('canvas');return {same:canvas===window.stable_minimap_canvas,pixels:canvas.toDataURL(),commits:Number(rail.dataset.commitCount)};})()`), {same:true,pixels:initial_state.pixels,commits:initial_state.commits});
  const atomic_update = await evaluate(`new Promise((resolve,reject) => {
    const rail=document.querySelector('content .linux-note-reading-minimap'),canvas=rail.querySelector('canvas'),before=canvas.toDataURL(),commits=Number(rail.dataset.commitCount);let updating_frames=0;const started=Date.now();
    const has_pixels=()=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return data.some((value,index)=>index%4===3&&value>0);};
    const tick=()=>{if(canvas!==window.stable_minimap_canvas)return reject(new Error('Foreground canvas node changed'));if(rail.dataset.updating==='true'){updating_frames+=1;if(rail.dataset.ready!=='true'||canvas.toDataURL()!==before||!has_pixels())return reject(new Error('Foreground frame changed before atomic commit'));}else if(updating_frames){return resolve({updating_frames,commits:Number(rail.dataset.commitCount)-commits,changed:canvas.toDataURL()!==before,nonempty:has_pixels()});}if(Date.now()-started>6000)return reject(new Error('No completed asynchronous content paint observed'));requestAnimationFrame(tick);};
    document.querySelector('#write p').firstChild.data='Atomic replacement content: scheduler, RCU, memory ordering and a stable foreground canvas.';requestAnimationFrame(tick);
  })`);
  assert(atomic_update.updating_frames > 0); assert.deepEqual({commits:atomic_update.commits,changed:atomic_update.changed,nonempty:atomic_update.nonempty},{commits:1,changed:true,nonempty:true});
  await evaluate('window.expected_after_update=document.querySelector("#write").innerHTML');
  const resize_before = await evaluate(`(() => {const rail=document.querySelector('content .linux-note-reading-minimap');return {pixels:rail.querySelector('canvas').toDataURL(),commits:Number(rail.dataset.commitCount)};})()`);
  for (const width of ['49%','48%','47%','46%']) { await evaluate(`document.querySelector('content').style.width=${JSON.stringify(width)}`); await delay(30); }
  assert.deepEqual(await evaluate(`(() => {const rail=document.querySelector('content .linux-note-reading-minimap'),canvas=rail.querySelector('canvas');return {same:canvas===window.stable_minimap_canvas,pixels:canvas.toDataURL(),commits:Number(rail.dataset.commitCount),updating:rail.dataset.updating};})()`), {same:true,pixels:resize_before.pixels,commits:resize_before.commits,updating:'true'});
  await wait(`(() => {const rail=document.querySelector('content .linux-note-reading-minimap');return rail.dataset.updating==='false'&&Number(rail.dataset.commitCount)===${resize_before.commits + 1};})()`);
  await delay(300); assert.equal(await evaluate('Number(document.querySelector("content .linux-note-reading-minimap").dataset.commitCount)'), resize_before.commits + 1);
  assert(await evaluate('document.querySelector("#write").innerHTML===expected_after_update && document.querySelector(".typ-markdown-preview").innerHTML===original_preview'));
  // 原生底栏的 z-index 低于 fixed 缩略图，正文容器仍伸入底栏；字数按钮必须保持可点。
  await evaluate(`(() => {
    window.footer_clicks=0;
    window.mount_overlap_footer=owner=>{
      const bounds=owner.getBoundingClientRect(),footer=document.createElement('footer');footer.className='ty-footer';
      footer.style.cssText='position:fixed;z-index:4;height:30px;background:white;left:'+bounds.left+'px;width:'+owner.clientWidth+'px;top:'+(bounds.bottom-22)+'px';
      const count=document.createElement('button');count.id='footer_word_count';count.textContent='755 词';count.style.cssText='position:absolute;right:4px;top:0;width:88px;height:30px';count.onclick=()=>{window.footer_clicks+=1;};
      footer.append(count);document.body.append(footer);return footer;
    };
    window.overlap_footer=mount_overlap_footer(document.querySelector('content'));
    window.footer_original_scroll=document.querySelector('content').scrollTop;
  })()`);
  const native_footer_clip = `Math.abs(document.querySelector('content .linux-note-reading-minimap').getBoundingClientRect().bottom-overlap_footer.getBoundingClientRect().top)<0.1`;
  const native_full_height = `document.querySelector('content .linux-note-reading-minimap').getBoundingClientRect().height===document.querySelector('content').clientHeight`;
  await wait(native_footer_clip);
  assert(await evaluate(`document.querySelector('.typ-workspace-leaf .linux-note-reading-minimap').getBoundingClientRect().height===document.querySelector('.typ-workspace-leaf').clientHeight`), 'a footer in the native pane does not shorten the independent preview');
  const footer_position = await evaluate(`(() => {const count=document.querySelector('#footer_word_count'),bounds=count.getBoundingClientRect(),x=Math.round(bounds.left+bounds.width/2),y=Math.round(bounds.top+10);return {x,y,hit:count.contains(document.elementFromPoint(x,y)),rail_bottom:document.querySelector('content .linux-note-reading-minimap').getBoundingClientRect().bottom,footer_top:overlap_footer.getBoundingClientRect().top};})()`);
  assert(footer_position.hit, 'the word count owns the hit target inside the former overlapping minimap area');
  for (const type of ['mouseMove','mouseDown','mouseUp']) test_window.webContents.sendInputEvent({type,x:footer_position.x,y:footer_position.y,button:'left',clickCount:1});
  await wait('footer_clicks===1');
  assert(await evaluate('document.querySelector("content").scrollTop===footer_original_scroll'), 'clicking word count cannot scroll the document through the minimap');
  fs.writeFileSync(path.join(root,'footer_word_count.png'),(await test_window.webContents.capturePage()).toPNG());
  for (const [hide,show] of [['overlap_footer.hidden=true','overlap_footer.hidden=false'],['overlap_footer.style.visibility="hidden"','overlap_footer.style.visibility="visible"'],['overlap_footer.style.opacity="0"','overlap_footer.style.opacity="1"']]) {
    await evaluate(hide); await wait(native_full_height);
    await evaluate(show); await wait(native_footer_clip);
  }
  await evaluate('overlap_footer.style.top=(document.querySelector("content").getBoundingClientRect().bottom-80)+"px"');
  await wait(native_footer_clip);
  assert(await evaluate('document.querySelector("content").scrollTop===footer_original_scroll && document.querySelector("#write").innerHTML===expected_after_update'));
  await evaluate(`(() => {const owner=document.querySelector('.typ-workspace-leaf'),bounds=owner.getBoundingClientRect();overlap_footer.style.left=bounds.left+'px';overlap_footer.style.width=owner.clientWidth+'px';overlap_footer.style.top=(bounds.bottom-34)+'px';})()`);
  await wait(native_full_height);
  await wait(`Math.abs(document.querySelector('.typ-workspace-leaf .linux-note-reading-minimap').getBoundingClientRect().bottom-overlap_footer.getBoundingClientRect().top)<0.1`);
  assert(await evaluate('document.querySelector(".typ-markdown-preview").innerHTML===original_preview'), 'footer movement and preview cropping preserve preview content');
  await evaluate('overlap_footer.remove()');
  await wait(`document.querySelector('.typ-workspace-leaf .linux-note-reading-minimap').getBoundingClientRect().height===document.querySelector('.typ-workspace-leaf').clientHeight`);
  await wait(`document.querySelector('content .linux-note-reading-minimap').dataset.updating==='false'`);
  await evaluate('document.querySelector(".typ-workspace-leaf").remove();window.leaves=[];');
  await wait('document.querySelectorAll(".linux-note-reading-minimap").length===1');
  // .md 与 .txt/.ts 的真实 Monaco 单文件切换；原生 content 按核心行为归零，不借Graph替代。
  await evaluate(`(()=>{
    const style=document.createElement('style');style.textContent='content{transition:width .2s,height .2s,left .2s,top .2s}content.typ-deactive{width:0!important;height:0!important;left:0!important;top:0!important}#non_markdown{position:absolute;left:0;top:32px;width:46%;bottom:25px;display:none}#non_markdown>.git-graph-document{height:100%;width:100%;display:flex;flex-direction:column}#non_markdown .git-monaco-body{flex:1;min-height:0;width:100%;position:relative}';document.head.append(style);window.switch_style=style;
    const host=document.createElement('section');host.id='non_markdown';document.body.append(host);window.source_doc=new minimap_qa.git_diff_editor({title:'reading.txt',file:'reading.txt',left:Array.from({length:900},(_,index)=>'Line '+index+' actual Monaco source preview').join('\\n')});host.append(source_doc.container);
    window.reading_rail=document.querySelector('content .linux-note-reading-minimap');window.reading_canvas=reading_rail.querySelector('canvas');window.reading_commits=Number(reading_rail.dataset.commitCount);window.reading_bounds=reading_rail.style.cssText;
  })()`);
  for(const extension of ['txt','ts','txt']) {
    await evaluate(`source_doc.update({title:'reading.${extension}',file:'reading.${extension}',left:Array.from({length:900},(_,index)=>'Line '+index+' actual Monaco preview').join('\\n')});document.querySelector('content').classList.add('typ-deactive');document.querySelector('#non_markdown').style.display='block';source_doc.editor.layout();`);
    assert.equal(await evaluate('getComputedStyle(reading_rail).display'),'none','deactivation hides fixed reading minimap synchronously');
    await delay(260);
    assert(await evaluate('reading_rail.hidden&&reading_rail.style.cssText===reading_bounds&&reading_rail.querySelector("canvas")===reading_canvas&&Number(reading_rail.dataset.commitCount)===reading_commits'),'inactive zero-size Markdown never commits a shrunk canvas or top-left rail');
    await wait('source_doc.editor.getLayoutInfo().height>300&&source_doc.container.querySelector(".minimap canvas")?.getBoundingClientRect().height>100');
    assert(await evaluate('(()=>{const root=source_doc.body.getBoundingClientRect(),map=source_doc.container.querySelector(".minimap").getBoundingClientRect();return map.left>=root.left&&map.right<=root.right+1&&map.top>=root.top&&map.bottom<=root.bottom+1&&!source_doc.container.querySelector(".linux-note-reading-minimap")})()'));
    if(extension==='ts')fs.writeFileSync(path.join(root,'source_minimap_active.png'),(await test_window.webContents.capturePage()).toPNG());
    await evaluate('document.querySelector("#non_markdown").style.display="none";document.querySelector("content").classList.remove("typ-deactive")');
    await wait('!reading_rail.hidden&&reading_rail.getBoundingClientRect().height===document.querySelector("content").clientHeight');
    assert(await evaluate('reading_rail.style.cssText===reading_bounds&&reading_rail.querySelector("canvas")===reading_canvas'));
  }
  fs.writeFileSync(path.join(root,'markdown_source_switch.png'),(await test_window.webContents.capturePage()).toPNG());
  await evaluate('source_doc.dispose();document.querySelector("#non_markdown").remove();switch_style.remove()');
  const clip_commit = await evaluate('Number(document.querySelector("content .linux-note-reading-minimap").dataset.commitCount)');
  await evaluate(`(() => {
    document.querySelector('#write').innerHTML='<div id="clip_box" style="height:100px;overflow:auto;color:rgb(255,0,0);line-height:20px">'+Array.from({length:100},(_,index)=>'<div>Buffered code line '+index+'</div>').join('')+'</div><p style="color:rgb(0,0,255)">Body after the collapsed code block</p><div style="height:1700px"></div>';
    document.querySelector('content').scrollTop=0;
  })()`);
  await wait(`(() => {const rail=document.querySelector('content .linux-note-reading-minimap');return rail.dataset.updating==='false'&&Number(rail.dataset.commitCount)===${clip_commit + 1};})()`);
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
  const source_state = await evaluate(`(() => {const rail=document.querySelector('.CodeMirror .linux-note-reading-minimap'),canvas=rail.querySelector('canvas');window.stable_source_canvas=canvas;return {pixels:canvas.toDataURL(),commits:Number(rail.dataset.commitCount)};})()`);
  await evaluate(`document.querySelector('.CodeMirror .linux-note-reading-minimap').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}))`);
  assert(await evaluate('document.querySelector(".CodeMirror-scroll").scrollTop>8000'));
  await evaluate(`(() => {const lines=document.querySelector('.CodeMirror-lines'),row=document.createElement('pre');row.className='CodeMirror-line';row.textContent='virtual row after source scroll';lines.replaceChildren(row);document.querySelector('.CodeMirror-scroll').dispatchEvent(new Event('scroll'));})()`);
  await delay(350);
  assert.deepEqual(await evaluate(`(() => {const rail=document.querySelector('.CodeMirror .linux-note-reading-minimap'),canvas=rail.querySelector('canvas');return {same:canvas===window.stable_source_canvas,pixels:canvas.toDataURL(),commits:Number(rail.dataset.commitCount)};})()`), {same:true,pixels:source_state.pixels,commits:source_state.commits});
  await evaluate('window.source_footer_scroll=document.querySelector(".CodeMirror-scroll").scrollTop;overlap_footer=mount_overlap_footer(document.querySelector(".CodeMirror"))');
  await wait(`Math.abs(document.querySelector('.CodeMirror .linux-note-reading-minimap').getBoundingClientRect().bottom-overlap_footer.getBoundingClientRect().top)<0.1`);
  assert(await evaluate(`(() => {const count=document.querySelector('#footer_word_count'),bounds=count.getBoundingClientRect();return count.contains(document.elementFromPoint(bounds.left+bounds.width/2,bounds.top+10))&&document.querySelector('.CodeMirror-scroll').scrollTop===source_footer_scroll;})()`), 'source mode reserves the visible footer without changing CodeMirror position');
  await evaluate('overlap_footer.hidden=true');
  await wait(`document.querySelector('.CodeMirror .linux-note-reading-minimap').getBoundingClientRect().height===document.querySelector('.CodeMirror').clientHeight`);
  await evaluate('overlap_footer.remove()');
  await evaluate(`File.editor.sourceView.inSourceMode=false;document.querySelector('#source').style.display='none';document.querySelector('content').style.display='block';`);
  await wait('!!document.querySelector("content .linux-note-reading-minimap[data-ready=true]")');
  assert(await evaluate('source_handlers.size===0 && !document.querySelector(".CodeMirror .linux-note-reading-minimap")'));
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  assert(await evaluate('document.querySelectorAll(".linux-note-reading-minimap").length===0 && !document.querySelector("[data-linux-note-minimap-owner]")'));
  console.log(JSON.stringify({status:'PASS',checks:['Markdown and real Monaco txt/ts switches hide inactive minimaps synchronously, retain full-size reading canvas and restore bounded source minimaps','actual rendered text pixels in both panes','different documents produce different thumbnails','real click and drag scroll only targeted pane','pure rendered-document scrolling updates only the viewport','sidebar class and DOM churn with stable geometry commits zero frames','content mutation keeps one nonempty foreground canvas until one atomic commit','continuous resize events merge into one final commit','visible overlapping footer owns word-count hit target and mouse click without document scrolling','hidden and transparent footers restore the full reading viewport','footer position and horizontal intersection control native and preview bounds independently','CodeMirror source minimap also reserves the visible footer','minimap rendering does not mutate document content','closed pane removes minimap','inner scroll buffer lines do not paint over following text','source mode uses complete CodeMirror lines and scroll API','CodeMirror virtual DOM churn during pure scroll commits zero frames','source mode retains independent preview minimaps','mode switch releases source listeners','pagehide disposes maps and ownership'],atomic_update,clip_evidence,footer_position,screenshot:path.join(root,'clipped_minimap.png')},null,2));
  test_window.destroy(); app.exit(0);
}).catch(error=>{console.error(error);test_window?.destroy();app.exit(1);});
