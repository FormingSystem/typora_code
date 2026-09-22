// 隔离验证真实 Markdown / Monaco 预览，不启动 Typora，不访问工作区或用户配置。
const {app, BrowserWindow} = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {build} = require('esbuild');
const {editor_plugins} = require('./editor_bundle.cjs');
const {pathToFileURL}=require('node:url');
const typora_root=process.env.TYPORA_PREVIEW_TEST_ROOT;
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_lookup_preview_'));
const workspace = path.join(evidence, 'files'); fs.mkdirSync(workspace);
const prefix = Array.from({length:44}, (_, index) => `Paragraph ${index}: ordinary preview content.`).join('\n\n');
const documents = {
  'notes.md': ['# Preview title', '', '**Strong** and *emphasis*.', '', '- first item', '- second item', '', '| Name | Value |', '| --- | --- |', '| table_target | 42 |', '', '> A quoted sentence.', '', prefix, '', '## Target heading', '', 'Selected needle_target appears here.', '', '```c', 'int code_target = 7;', '```', '', '<script>window.preview_attack = 1;</script>', '', '<img src="https://preview.invalid/image" onerror="window.preview_attack = 2">', '', '<a href="javascript:window.preview_attack=3">dangerous link</a>', '', '<svg onload="window.preview_attack=4"><a href="https://preview.invalid/svg">svg link</a></svg>', ''].join('\r\n'),
  'module.d.ts': Array.from({length:260}, (_, index) => index === 184 ? 'declare const lookup_target: string;' : `declare const value_${index}: number;`).join('\n'),
  'long_notes.md': ['---','title: Long source reading','---','','# Long document','',...Array.from({length:1200},(_,index)=>`Paragraph ${index}: long Markdown reading position.\n`),'```c','int demo_remove(void) { return 0; }','```',''].join('\n'),
  'slow.md': '# Old request\n\nslow_target must not replace the latest preview.\n',
  'fast.md': '# Latest request\n\nfast_target stays visible.\n',
  'repeated.md': ['```c', ...Array.from({length:180}, (_, index) => index === 0 ? 'int repeat_target = 0;' : index === 140 ? 'repeat_target += 1;' : `int filler_${index} = ${index};`), '```', ''].join('\n'),
  'link_offset.md': '[repeat_link](https://preview.invalid/repeat_link) repeat_link intended repeat_link later.\n',
  'tab_positions.md': ['---','title: Metadata stays hidden','---','','# Source map','','```c','static int sample(void) {','\treturn 1;','}','```','','```mermaid','sequenceDiagram','  A->>B: Earlier diagram','```','','## Correct paragraph','','`ct_rcu_watching_cpu_acquire()` is the expected rendered position.',''].join('\r\n'),
  'diagram.md':['# Diagram preview','','```mermaid','flowchart LR','  A[diagram_target] --> B[Next step]','```','','Selected paragraph_target stays below the rendered diagram.',''].join('\n'),
  'large.md': 'large_target',
  'binary.bin': '\0binary_target',
};
for (const [name, text] of Object.entries(documents)) fs.writeFileSync(path.join(workspace, name), text);
app.setPath('userData', path.join(evidence, 'user_data')); app.disableHardwareAcceleration();
let test_window;
const checks = [], failures = [], network_requests = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => test_window.webContents.executeJavaScript(source);
const wait = async source => {for (let index = 0; index < 160; index++) {if (await evaluate(source)) return; await delay(35);} throw new Error('Timed out: '+source);};
const capture = async name => fs.writeFileSync(path.join(evidence, name+'.png'), (await test_window.webContents.capturePage()).toPNG());
const verify = async (name, action) => {try {await action(); checks.push(name);} catch (error) {failures.push({name,error:String(error.stack || error)}); await capture('failure_'+failures.length);}};
const key = async key_code => {test_window.webContents.sendInputEvent({type:'keyDown',keyCode:key_code});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:key_code});await delay(60);};
const wheel = async (delta, modifiers = []) => {
  const point=await evaluate('(()=>{const rect=preview.container.querySelector(".workspace-lookup-preview-body").getBoundingClientRect();return{x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)}})()');
  test_window.webContents.sendInputEvent({type:'mouseMove',...point});await delay(40);
  test_window.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:delta,deltaX:0,wheelTicksY:delta/120,wheelTicksX:0,modifiers});await delay(130);
};
app.whenReady().then(async () => {
  test_window = new BrowserWindow({show:false,width:1120,height:760,webPreferences:{contextIsolation:false,nodeIntegration:true,offscreen:true,backgroundThrottling:false}});
  test_window.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (details, reply) => {network_requests.push(details.url);reply({cancel:true});});
  const html = path.join(evidence, 'test.html');
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8">${typora_root?'<base href="'+pathToFileURL(path.join(typora_root,'resources/window.html')).href+'">':''}<style>
    :root{--text-color:#24292f;--bg-color:#fff;--preview-heading:#175f91;--select-text-bg-color:#67a8e9}html,body{height:100%;margin:0;overflow:hidden}body{color:var(--text-color);background:var(--bg-color);font:16px/1.5 system-ui}html.dark{--text-color:#ddd;--bg-color:#202124;--preview-heading:#c7a0ff}#preview_mount{position:absolute;left:0;top:0;bottom:0;width:340px;border-right:1px solid #777}#central{position:absolute;left:380px;right:20px;top:20px;bottom:20px;overflow:auto}#write{font-size:20px;min-height:1500px;padding-top:12px}#write h1,#write h2{color:var(--preview-heading)}#write strong{font-weight:800}#write blockquote{border-left:4px solid #888;padding-left:10px}html.dark #write{font-size:22px}#central:focus-within{outline:1px solid #888}.workspace-lookup-preview-body{scrollbar-width:thin}
  </style><section id="preview_mount"></section><section id="central"><article id="write" contenteditable="true"><p>Central reader selection remains here.</p></article></section>`);
  await test_window.loadFile(html);
  const bundle = await build({plugins:editor_plugins(),stdin:{contents:'export {create_lookup_preview} from "./src/workspace_lookup_preview";export * from "./src/reading_reflow";export * as monaco from "monaco-editor/editor/editor.api";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'lookup_qa',write:false});
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(`(()=>{
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(style);
    window.documents=${JSON.stringify(documents)};window.workspace_path=${JSON.stringify(workspace)};window.preview_attack=0;window.reads=[];window.delay_files=new Map();
    const files_api=require('node:fs').promises;window.path_api=require('node:path');
    window.files={fs:{promises:{stat:async file=>file.endsWith('large.md')?{isFile:()=>true,size:3*1024*1024}:files_api.stat(file),readFile:async file=>{reads.push(file);const pause=delay_files.get(file);if(pause)await new Promise(resolve=>setTimeout(resolve,pause));return files_api.readFile(file);}}},path_api,open_file(){throw new Error('Preview must not open the central file');}};
    window.make_match=(name,needle,occurrence=0)=>{const text=documents[name];let start=-1;for(let index=0;index<=occurrence;index++)start=text.indexOf(needle,start+1);const end=start+needle.length;if(start<0)throw new Error('missing fixture match');const lines=text.slice(0,start).split(/\\r\\n|\\r|\\n/),ends=text.slice(0,end).split(/\\r\\n|\\r|\\n/);return{id:name+':'+start,start,end,line:lines.length,column:lines.at(-1).length+1,end_line:ends.length,end_column:ends.at(-1).length+1,text:needle,preview:needle,preview_ranges:[{start:0,end:needle.length}]};};
    window.file_result=(name,needle,occurrence=0)=>({file_path:path_api.join(workspace_path,name),relative_path:name,matches:[make_match(name,needle,occurrence)]});
    window.show_file=(name,needle,occurrence=0)=>preview.show(file_result(name,needle,occurrence),make_match(name,needle,occurrence));
    window.markdown_root=()=>preview.container.querySelector('.workspace-lookup-markdown')?.shadowRoot;
    window.source_editor=()=>lookup_qa.monaco.editor.getEditors().find(editor=>preview.container.contains(editor.getDomNode()));
    window.reader_state=()=>({focus:document.activeElement?.id,selection:window.getSelection()?.toString(),scroll:document.querySelector('#central').scrollTop,text:document.querySelector('#write').textContent});
    window.keep_reader=()=>{const reader=document.querySelector('#write');reader.focus({preventScroll:true});const text=reader.querySelector('p').firstChild,range=document.createRange();range.setStart(text,8);range.setEnd(text,14);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.querySelector('#central').scrollTop=100;return reader_state();};
    localStorage.clear();window.preview=lookup_qa.create_lookup_preview(files);document.querySelector('#preview_mount').append(preview.container);
  })()`);
  const central_before = await evaluate('keep_reader()');
  await evaluate('show_file("notes.md","needle_target")');await delay(100);
  await verify('Markdown GFM preserves headings tables lists quotes and fenced code', async () => {
    const structure=await evaluate(`(()=>{const root=markdown_root();return{h1:root.querySelector('h1')?.textContent,h2:root.querySelector('h2')?.textContent,rows:root.querySelectorAll('table tr').length,cells:root.querySelectorAll('table td').length,list:[...root.querySelectorAll('li')].map(node=>node.textContent),quote:root.querySelector('blockquote')?.textContent.trim(),code:root.querySelector('pre code')?.textContent.trim(),code_class:root.querySelector('pre code')?.className,strong:root.querySelector('strong')?.textContent}})()`);
    assert.deepEqual(structure,{h1:'Preview title',h2:'Target heading',rows:2,cells:2,list:['first item','second item'],quote:'A quoted sentence.',code:'int code_target = 7;',code_class:'language-c',strong:'Strong'});
  });
  await verify('Markdown CRLF match selects and reveals the correct rendered block', async () => {
    const position=await evaluate(`(()=>{const mark=markdown_root().querySelector('mark'),body=preview.container.querySelector('.workspace-lookup-preview-body'),a=mark.getBoundingClientRect(),b=body.getBoundingClientRect();return{text:mark.textContent,selected:!!mark.closest('.lookup-target-block'),top:a.top-b.top,bottom:a.bottom-b.top,height:b.height,scroll:body.scrollTop}})()`);
    assert.equal(position.text,'needle_target');assert(position.selected);assert(position.scroll>0);assert(position.top>=0&&position.bottom<=position.height);
  });
  await verify('Markdown fences use the source language tokenizer and visible syntax colors',async()=>{
    const colors=await evaluate('[...new Set([...markdown_root().querySelectorAll("pre code span")].filter(node=>node.textContent.trim()).map(node=>getComputedStyle(node).color))]');assert(colors.length>=2,JSON.stringify(colors));
  });
  await verify('Markdown preview preserves central focus selection scroll and text', async () => assert.deepEqual(await evaluate('reader_state()'),central_before));
  await verify('Preview uses its full content height without repeating the file path in a header', async () => {
    const layout=await evaluate('(()=>{const body=preview.container.querySelector(".workspace-lookup-preview-body"),outer=preview.container.getBoundingClientRect(),inner=body.getBoundingClientRect();return{header:preview.container.querySelectorAll(".workspace-lookup-preview-title").length,top:inner.top-outer.top,height:inner.height-outer.height,label:body.getAttribute("aria-label")}})()');assert.equal(layout.header,0);assert.equal(layout.top,0);assert.equal(layout.height,0);assert(layout.label.includes('notes.md'));
  });
  await verify('Preview sanitization removes executable markup links and remote images', async () => {
    const safety=await evaluate(`(()=>{const reader=markdown_root().querySelector('#write');return{attack:preview_attack,forbidden:reader.querySelectorAll('script,img,iframe,object,embed,style,[onerror],[onload],a[href],a[target]').length,text:reader.textContent}})()`);
    assert.equal(safety.attack,0);assert.equal(safety.forbidden,0);assert(safety.text.includes('dangerous link'));assert.equal(network_requests.length,0);
  });
  await verify('Theme colors and default 80 percent derive from the central body font', async () => {
    const theme=await evaluate(`(()=>{const reader=markdown_root().querySelector('#write');return{scale:preview.container.dataset.previewScale,font:getComputedStyle(reader).fontSize,zoom:getComputedStyle(reader).zoom,heading:getComputedStyle(markdown_root().querySelector('h1')).color}})()`);
    assert.deepEqual(theme,{scale:'80',font:'20px',zoom:'0.8',heading:'rgb(23, 95, 145)'});
  });
  await verify('Real Ctrl and Meta wheel scale only Markdown preview by five percent and persist the result', async () => {
    const central=await evaluate('reader_state()'),zoom=test_window.webContents.getZoomFactor();
    await wheel(120,['control']);assert.equal(await evaluate('preview.container.dataset.previewScale'),'85');assert.equal(await evaluate('getComputedStyle(markdown_root().querySelector("#write")).zoom'),'0.85');assert.equal(await evaluate('localStorage.getItem("linux-note:lookup:preview-scale:v1")'),'85');assert.equal(test_window.webContents.getZoomFactor(),zoom);assert.deepEqual(await evaluate('reader_state()'),central);
    await evaluate('preview.dispose();preview=lookup_qa.create_lookup_preview(files);document.querySelector("#preview_mount").append(preview.container)');assert.equal(await evaluate('preview.container.dataset.previewScale'),'85');await evaluate('show_file("notes.md","needle_target")');await delay(70);
    await wheel(-120,['meta']);assert.equal(await evaluate('preview.container.dataset.previewScale'),'80');assert.equal(test_window.webContents.getZoomFactor(),zoom);assert.deepEqual(await evaluate('reader_state()'),central);
  });
  await verify('Ordinary Markdown wheel keeps independent scrolling without changing preview scale', async () => {
    const central=await evaluate('reader_state()');await evaluate('preview.container.querySelector(".workspace-lookup-preview-body").scrollTop=100');await wheel(-120);
    assert(await evaluate('preview.container.querySelector(".workspace-lookup-preview-body").scrollTop>100'));assert.equal(await evaluate('preview.container.dataset.previewScale'),'80');assert.deepEqual(await evaluate('reader_state()'),central);
  });
  await verify('Shared scale applies bounded percentages to Markdown layout and persistent state', async () => {
    for(const [requested,value]of[[1,50],[200,150]]){await evaluate(`preview.set_scale(${requested})`);assert.equal(await evaluate('preview.get_scale()'),value);assert.equal(await evaluate('preview.container.dataset.previewScale'),String(value));assert.equal(await evaluate('localStorage.getItem("linux-note:lookup:preview-scale:v1")'),String(value));assert.equal(await evaluate('getComputedStyle(markdown_root().querySelector("#write")).zoom'),String(value/100));}
    await evaluate('preview.set_scale(80)');assert.equal(await evaluate('preview.container.dataset.previewScale'),'80');
  });
  await verify('Wheel updates the shared percentage and consumes zoom at both limits', async () => {
    const state=await evaluate('(()=>{const event=new WheelEvent("wheel",{ctrlKey:true,deltaY:-120,bubbles:true,cancelable:true,composed:true});preview.container.querySelector(".workspace-lookup-preview-body").dispatchEvent(event);return{prevented:event.defaultPrevented,scale:preview.get_scale(),stored:preview.container.dataset.previewScale}})()');assert.deepEqual(state,{prevented:true,scale:85,stored:'85'});
    for(const [delta,value]of[[-120,150],[120,50]]){await evaluate(`preview.set_scale(${value})`);const bounded=await evaluate(`(()=>{const event=new WheelEvent('wheel',{ctrlKey:true,deltaY:${delta},bubbles:true,cancelable:true,composed:true});preview.container.querySelector('.workspace-lookup-preview-body').dispatchEvent(event);return{prevented:event.defaultPrevented,scale:preview.container.dataset.previewScale}})()`);assert.deepEqual(bounded,{prevented:true,scale:String(value)});}
    await evaluate('preview.set_scale(80)');
  });
  await verify('A new preview restores the last saved percentage', async () => {
    await evaluate('preview.set_scale(150)');
    await evaluate('preview.dispose();preview=lookup_qa.create_lookup_preview(files);document.querySelector("#preview_mount").append(preview.container)');assert.equal(await evaluate('preview.container.dataset.previewScale'),'150');
    await evaluate('preview.set_scale(80)');
  });
  await evaluate('show_file("notes.md","table_target")');await delay(70);
  await verify('A match in a table retains the whole table and highlights the correct cell', async () => {assert.equal(await evaluate('markdown_root().querySelector("mark")?.textContent'),'table_target');assert.equal(await evaluate('markdown_root().querySelectorAll(".lookup-target-block table tr").length'),2);});
  await evaluate('show_file("notes.md","code_target")');await delay(70);
  await verify('A match in a fenced block preserves the code block instead of rendering lines separately', async () => {assert.equal(await evaluate('markdown_root().querySelector("pre code mark")?.textContent'),'code_target');assert.equal(await evaluate('markdown_root().querySelector("pre code")?.textContent.trim()'),'int code_target = 7;');});
  await evaluate('document.documentElement.classList.add("dark")');await delay(80);
  await verify('Markdown preview responds to a live theme and base font change', async () => {
    const theme=await evaluate(`(()=>{const root=markdown_root();return{font:getComputedStyle(root.querySelector('#write')).fontSize,heading:getComputedStyle(root.querySelector('h1')).color,color:getComputedStyle(preview.container).color,scale:preview.container.dataset.previewScale}})()`);
    assert.deepEqual(theme,{font:'22px',heading:'rgb(199, 160, 255)',color:'rgb(221, 221, 221)',scale:'80'});
  });
  await evaluate('document.documentElement.classList.remove("dark");keep_reader()');await delay(60);const source_central = await evaluate('reader_state()');
  await evaluate('show_file("module.d.ts","lookup_target")');await wait('source_editor()?.getModel()?.getLanguageId()==="typescript"');await delay(130);
  await verify('Compound TypeScript file has exact Monaco selection without taking focus', async () => {
    const source=await evaluate(`(()=>{const editor=source_editor(),model=editor.getModel(),range=editor.getSelection();return{language:model.getLanguageId(),line:range.startLineNumber,column:range.startColumn,end:range.endColumn,text:model.getValueInRange(range),read_only:editor.getOption(lookup_qa.monaco.editor.EditorOption.readOnly),minimap:editor.getOption(lookup_qa.monaco.editor.EditorOption.minimap).enabled,focus:editor.hasTextFocus(),scroll:editor.getScrollTop(),font:editor.getOption(lookup_qa.monaco.editor.EditorOption.fontSize)}})()`);
    assert.equal(source.language,'typescript');assert.equal(source.line,185);assert.equal(source.column,15);assert.equal(source.end,28);assert.equal(source.text,'lookup_target');assert(source.read_only);assert.equal(source.minimap,false);assert.equal(source.focus,false);assert(source.scroll>0);assert.equal(source.font,16);assert.deepEqual(await evaluate('reader_state()'),source_central);
  });
  await verify('Monaco preview renders multiple syntax token colors', async () => {const colors=await evaluate(`[...new Set([...preview.container.querySelectorAll('.view-line span[class*=mtk]')].filter(node=>node.textContent.trim()).map(node=>getComputedStyle(node).color))]`);assert(colors.length>=2,JSON.stringify(colors));});
  await verify('Real Ctrl wheel changes only Monaco preview font and ordinary wheel still scrolls its source', async () => {
    const central=await evaluate('reader_state()'),zoom=test_window.webContents.getZoomFactor(),selection=await evaluate('JSON.stringify(source_editor().getSelection())');
    await wheel(120,['control']);assert.equal(await evaluate('source_editor().getOption(lookup_qa.monaco.editor.EditorOption.fontSize)'),17);assert.equal(await evaluate('preview.container.dataset.previewScale'),'85');assert.equal(await evaluate('JSON.stringify(source_editor().getSelection())'),selection);assert.equal(test_window.webContents.getZoomFactor(),zoom);assert.deepEqual(await evaluate('reader_state()'),central);
    await wheel(-120,['control']);assert.equal(await evaluate('preview.container.dataset.previewScale'),'80');const top=await evaluate('source_editor().getScrollTop()');await wheel(120);assert(await evaluate('source_editor().getScrollTop()')<top);assert.equal(await evaluate('preview.container.dataset.previewScale'),'80');assert.deepEqual(await evaluate('reader_state()'),central);
  });
  await verify('Source preview responds immediately to 50 80 and 150 percent settings', async () => {
    for(const value of [50,150,80]){await evaluate(`preview.set_scale(${value})`);assert.equal(await evaluate('source_editor().getOption(lookup_qa.monaco.editor.EditorOption.fontSize)'),20*value/100);}
  });
  await evaluate('document.documentElement.classList.add("dark")');await delay(100);
  await verify('An already open source preview follows dark theme as well as its font size', async () => {assert.equal(await evaluate('source_editor().getOption(lookup_qa.monaco.editor.EditorOption.fontSize)'),17.6);assert(await evaluate('source_editor().getDomNode().classList.contains("vs-dark")'));});
  await evaluate('document.querySelector("#preview_mount").style.width="220px"');await delay(100);
  await verify('Narrow source preview uses the available panel width without a second column', async () => {
    const layout=await evaluate(`(()=>{const body=preview.container.querySelector('.workspace-lookup-preview-body'),editor=source_editor();return{body:body.clientWidth,editor:editor.getLayoutInfo().width,diff:preview.container.querySelectorAll('.monaco-diff-editor').length,outer:preview.container.scrollWidth,client:preview.container.clientWidth}})()`);
    assert.equal(layout.diff,0);assert(layout.editor>=layout.body-2&&layout.editor<=layout.body);assert.equal(layout.outer,layout.client);
  });await capture('source_narrow');
  await verify('Narrow source preview keeps the selected occurrence horizontally visible', async () => {
    const position=await evaluate(`(()=>{const editor=source_editor(),range=editor.getSelection(),layout=editor.getLayoutInfo();return{start:editor.getScrolledVisiblePosition(range.getStartPosition()),end:editor.getScrolledVisiblePosition(range.getEndPosition()),left:layout.contentLeft,right:layout.width-layout.verticalScrollbarWidth,focus:editor.hasTextFocus()}})()`);
    assert(position.start.left>=position.left&&position.end.left<=position.right,JSON.stringify(position));assert.equal(position.focus,false);
  });
  await evaluate('show_file("notes.md","needle_target")');await delay(90);
  await verify('Narrow Markdown preview wraps while keeping independent scrolling', async () => {const metrics=await evaluate(`(()=>{const body=preview.container.querySelector('.workspace-lookup-preview-body');return{width:body.clientWidth,outer:preview.container.scrollWidth,client:preview.container.clientWidth,scroll:body.scrollTop,central:document.querySelector('#central').scrollTop}})()`);assert.equal(metrics.outer,metrics.client);assert(metrics.scroll>0);assert.equal(metrics.central,source_central.scroll);});await capture('markdown_narrow');
  await evaluate('show_file("repeated.md","repeat_target",1)');await delay(90);
  await verify('Repeated text inside one long Markdown fence highlights the selected occurrence', async () => {
    const repeated=await evaluate(`(()=>{const code=markdown_root().querySelector('pre code'),mark=code.querySelector('mark'),range=document.createRange();range.setStart(code,0);range.setEndBefore(mark);const body=preview.container.querySelector('.workspace-lookup-preview-body'),a=mark.getBoundingClientRect(),b=body.getBoundingClientRect();return{line:range.toString().split('\\n').length,top:a.top-b.top,bottom:a.bottom-b.top,height:b.height,scroll:body.scrollTop}})()`);
    assert.equal(repeated.line,141,JSON.stringify(repeated));assert(repeated.scroll>0);assert(repeated.top>=0&&repeated.bottom<=repeated.height);
  });
  await evaluate('show_file("link_offset.md","repeat_link",2)');await delay(80);
  await verify('A hidden Markdown link URL does not shift the visible match occurrence', async () => {
    const marked_position=await evaluate(`(()=>{const paragraph=markdown_root().querySelector('p'),mark=paragraph.querySelector('mark'),range=document.createRange();range.setStart(paragraph,0);range.setEndBefore(mark);return{before:range.toString(),marked:mark.textContent,after:mark.nextSibling?.textContent}})()`);
    assert.deepEqual(marked_position,{before:'repeat_link ',marked:'repeat_link',after:' intended repeat_link later.'});
  });
  await evaluate('show_file("tab_positions.md","ct_rcu_watching_cpu_acquire")');await delay(80);
  await verify('Tabs in earlier fences and CRLF do not shift a later Markdown hit into the preceding diagram',async()=>{
    const state=await evaluate('(()=>{const root=markdown_root(),mark=root.querySelector("mark"),body=preview.container.querySelector(".workspace-lookup-preview-body"),a=mark.getBoundingClientRect(),b=body.getBoundingClientRect();return{text:mark.textContent,code:mark.parentElement.tagName,block:mark.closest(".lookup-target-block").textContent.trim(),metadata:root.querySelector("#write").textContent.includes("Metadata stays hidden"),top:a.top-b.top,bottom:a.bottom-b.top,height:b.height}})()');assert.equal(state.text,'ct_rcu_watching_cpu_acquire');assert.equal(state.code,'CODE');assert.equal(state.block,'ct_rcu_watching_cpu_acquire() is the expected rendered position.');assert.equal(state.metadata,false);assert(state.top>=0&&state.bottom<=state.height);
  });
  if(typora_root)await verify('The installed Mermaid library renders in isolation and keeps both diagram and source-hit positions',async()=>{
    await evaluate('window.mermaid={initialize(){throw new Error("Must not reconfigure central diagrams")},render(){throw new Error("Must not use central diagram instance")}};show_file("diagram.md","paragraph_target")');await delay(100);
    const svg=await evaluate('(()=>{const root=markdown_root(),svg=root.querySelector(".lookup-diagram svg"),mark=root.querySelector("mark"),body=preview.container.querySelector(".workspace-lookup-preview-body"),a=mark.getBoundingClientRect(),b=body.getBoundingClientRect();return{diagram:!!svg,label:svg?.textContent,text:mark.textContent,visible:a.top>=b.top&&a.bottom<=b.bottom}})()');assert(svg.diagram);assert(svg.label.includes('diagram_target'));assert.equal(svg.text,'paragraph_target');assert(svg.visible);assert.equal(network_requests.length,0);
    await evaluate('show_file("diagram.md","diagram_target")');await delay(70);assert(await evaluate('!!markdown_root().querySelector(".lookup-diagram svg")'));assert.equal(await evaluate('markdown_root().querySelector("pre code mark")?.textContent'),'diagram_target');await capture('rendered_diagram');
  });
  await evaluate('document.documentElement.classList.remove("dark");document.querySelector("#preview_mount").style.width="340px";show_file("long_notes.md","demo_remove")');await delay(100);
  await verify('A near-line-2400 Markdown match survives body class and style changes and remains visible during Ctrl wheel scaling', async () => {
    const position=()=>evaluate('(()=>{const body=preview.container.querySelector(".workspace-lookup-preview-body"),mark=markdown_root().querySelector("mark"),a=mark.getBoundingClientRect(),b=body.getBoundingClientRect();return{text:mark.textContent,top:a.top-b.top,bottom:a.bottom-b.top,height:b.height,scroll:body.scrollTop}})()');
    assert(await evaluate('make_match("long_notes.md","demo_remove").line>2300'));const before=await position();assert.equal(before.text,'demo_remove');assert(before.scroll>10000);assert(before.top>=0&&before.bottom<=before.height);
    await evaluate('document.body.classList.add("lookup-preview-layout-probe");document.body.style.setProperty("--lookup-preview-probe","1");new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
    const after=await position();assert(after.scroll>10000);assert(Math.abs(after.scroll-before.scroll)<2);assert(after.top>=0&&after.bottom<=after.height);
    const scale=Number(await evaluate('preview.container.dataset.previewScale'));await wheel(120,['control']);assert.equal(Number(await evaluate('preview.container.dataset.previewScale')),scale+5);const zoomed=await position();assert(zoomed.scroll>10000);assert(zoomed.top>=0&&zoomed.bottom<=zoomed.height,JSON.stringify(zoomed));await wheel(-120,['control']);
    await evaluate('document.body.classList.remove("lookup-preview-layout-probe");document.body.style.removeProperty("--lookup-preview-probe");void 0');
  });
  await verify('Reselect during a pending preview read does not create a second request', async () => {
    await evaluate('delay_files.set(path_api.join(workspace_path,"slow.md"),180);window.pending_reselect=show_file("slow.md","slow_target");window.reselect_reads=reads.length;preview.reveal_match();preview.reveal_match();void 0');
    await evaluate('pending_reselect');assert.equal(await evaluate('reads.length-reselect_reads'),1);assert.equal(await evaluate('markdown_root().querySelector("mark").textContent'),'slow_target');
  });
  await verify('A slow earlier file read cannot overwrite the latest selected preview', async () => {
    await evaluate('delay_files.set(path_api.join(workspace_path,"slow.md"),180);window.old_request=show_file("slow.md","slow_target")');await delay(15);await evaluate('show_file("fast.md","fast_target")');await evaluate('old_request');
    assert.equal(await evaluate('markdown_root().querySelector("h1")?.textContent'),'Latest request');assert.equal(await evaluate('preview.container.querySelector(".workspace-lookup-preview-body").dataset.previewPath'),path.join(workspace,'fast.md'));
  });
  await verify('Large or binary content shows an explicit preview limit without executing or opening it', async () => {
    const reads_before=await evaluate('reads.length');await evaluate('show_file("large.md","large_target")');assert(await evaluate('preview.container.textContent.includes("2 MiB")'));assert.equal(await evaluate('reads.length'),reads_before);
    await evaluate('show_file("binary.bin","binary_target")');assert(await evaluate('preview.container.textContent.includes("二进制")'));assert.equal(await evaluate('preview_attack'),0);assert.equal(network_requests.length,0);
  });
  await verify('Current text survives 20 width and percentage reflows without returning to the original hit',async()=>{
    await evaluate('show_file("long_notes.md","Paragraph 10")');await delay(80);
    await evaluate(`window.scroll_body=preview.container.querySelector('.workspace-lookup-preview-body');window.anchor_root=markdown_root().querySelector('#write');scroll_body.scrollTop=scroll_body.scrollHeight/2;`);await delay(50);
    for(let i=0;i<20;i++){
      await evaluate('window.anchor=lookup_qa.capture_reflow_anchor(scroll_body,anchor_root)');
      await evaluate(`preview.set_scale(${i%2?80:110});document.querySelector('#preview_mount').style.width='${i%2?340:240}px';`);await delay(80);
      const result=await evaluate(`(()=>{const r=document.createRange();r.setStart(anchor.node,anchor.offset);r.setEnd(anchor.node,anchor.offset+1);const p=r.getBoundingClientRect(),v=scroll_body.getBoundingClientRect();return {top:p.top-v.top,height:v.height,scroll:scroll_body.scrollTop};})()`);
      assert(result.top>=0&&result.top<result.height&&result.scroll>1000,JSON.stringify({i,...result}));
    }
  });
  await verify('Disposing during a pending read removes resources and prevents late rendering', async () => {
    await evaluate('window.pending_request=show_file("slow.md","slow_target");preview.dispose()');await evaluate('pending_request');assert.equal(await evaluate('document.querySelectorAll(".workspace-lookup-preview").length'),0);assert.equal(await evaluate('lookup_qa.monaco.editor.getModels().length'),0);
  });
  const result={status:failures.length?'FAIL':'PASS',checks,failures,network_requests,evidence};fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));test_window.destroy();app.exit(failures.length?1:0);
}).catch(async error=>{console.error(error);console.error(evidence);if(test_window&&!test_window.isDestroyed()){await capture('fatal');test_window.destroy();}app.exit(1);});
