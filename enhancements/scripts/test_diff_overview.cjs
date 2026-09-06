// 原生 Monaco 差异概览的颜色、标准布局和真实鼠标定位回归；不访问用户仓库。
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { editor_plugins } = require('./editor_bundle.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_diff_overview_'));
app.setPath('userData', path.join(root, 'user_data')); app.disableHardwareAcceleration();
let test_window;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = source => test_window.webContents.executeJavaScript(source);
const wait = async source => { for (let index = 0; index < 180; index += 1) { if (await evaluate(source)) return; await delay(40); } throw new Error('Timed out: '+source); };
app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show:false,width:1280,height:850,webPreferences:{contextIsolation:false,backgroundThrottling:false,offscreen:true} });
  const filename = path.join(root,'test.html');
  fs.writeFileSync(filename,'<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden;color:#24292f;background:white}body{display:flex}</style>');
  await test_window.loadFile(filename);
  const bundle = await build({plugins:editor_plugins(),stdin:{contents:'export { git_diff_editor } from "./src/git_diff_editor";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'diff_qa',write:false});
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(String.raw`(() => {
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(style);
    const lines=Array.from({length:500},(_,index)=>'int line_'+(index+1)+' = '+(index+1)+';');const changed=[...lines];
    changed.splice(400,0,'// INSERTED GREEN ONE','int inserted_value = 1000;','// INSERTED GREEN THREE');changed[229]='int changed_value = 999;';changed.splice(98,4);
    window.preview=new diff_qa.git_diff_editor({title:'example.c 的更改',file:'example.c',left:lines.join('\n'),right:changed.join('\n')});document.body.append(preview.container);
  })()`);
  await wait('document.querySelector("[data-diff-ready=true]") && preview.editor.getLineChanges()?.length===3');
  await delay(350);
  const metrics = await evaluate(`(() => {
    const root=document.querySelector('.diffOverview');const original=root.querySelector('.original.diffOverviewRuler'),modified=root.querySelector('.modified.diffOverviewRuler');
    const marks=canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let red=0,green=0;const green_rows=new Set(),red_rows=new Set();for(let offset=0;offset<pixels.length;offset+=4){if(!pixels[offset+3])continue;const row=Math.floor(offset/4/canvas.width);if(pixels[offset]>pixels[offset+1]+30&&pixels[offset]>pixels[offset+2]+30){red++;red_rows.add(row);}if(pixels[offset+1]>pixels[offset]+20&&pixels[offset+1]>pixels[offset+2]+30){green++;green_rows.add(row);}}return{red,green,green_rows:[...green_rows],red_rows:[...red_rows]};};
    const left=preview.editor.getOriginalEditor(),right=preview.editor.getModifiedEditor();
    return{width:root.getBoundingClientRect().width,original_width:original.getBoundingClientRect().width,modified_width:modified.getBoundingClientRect().width,original:marks(original),modified:marks(modified),scrollbars:[left.getRawOptions().scrollbar.verticalScrollbarSize,right.getRawOptions().scrollbar.verticalScrollbarSize],minimap:!!document.querySelector('.editor.modified .minimap'),before:left.getScrollTop()};
  })()`);
  assert.equal(metrics.width,30);assert.equal(metrics.original_width,15);assert.equal(metrics.modified_width,15);
  assert(metrics.original.red>0 && metrics.modified.green>0);assert.equal(metrics.original.green,0);assert.equal(metrics.modified.red,0);
  assert.deepEqual(metrics.scrollbars,[8,8]);assert(metrics.minimap);
  fs.writeFileSync(path.join(root,'overview_before.png'),(await test_window.webContents.capturePage()).toPNG());
  const click_mark = async (selector,row) => {
    const point=await evaluate(`(() => {const canvas=document.querySelector(${JSON.stringify(selector)}),box=canvas.getBoundingClientRect();return{x:Math.round(box.x+box.width/2),y:Math.round(box.y+(${row}+.5)/canvas.height*box.height)};})()`);
    for(const type of ['mouseMove','mouseDown','mouseUp']){test_window.webContents.sendInputEvent({type,...point,button:'left',clickCount:1});await delay(35);}await delay(150);
  };
  await click_mark('.diffOverview .modified.diffOverviewRuler',metrics.modified.green_rows.at(-1));
  const added = await evaluate('({top:preview.editor.getModifiedEditor().getScrollTop(),original:preview.editor.getOriginalEditor().getScrollTop(),ranges:preview.editor.getModifiedEditor().getVisibleRanges().map(range=>({start:range.startLineNumber,end:range.endLineNumber}))})');
  assert(added.top>metrics.before+3000);assert(added.ranges.some(range=>range.start<=399&&range.end>=399));assert(Math.abs(added.top-added.original)<2);
  await click_mark('.diffOverview .original.diffOverviewRuler',metrics.original.red_rows[0]);
  const removed = await evaluate('({top:preview.editor.getOriginalEditor().getScrollTop(),ranges:preview.editor.getOriginalEditor().getVisibleRanges().map(range=>({start:range.startLineNumber,end:range.endLineNumber}))})');
  assert(removed.top<added.top-3000);assert(removed.ranges.some(range=>range.start<=100&&range.end>=100));
  await evaluate('preview.editor.updateOptions({wordWrap:"on",renderSideBySide:false});');await delay(250);
  assert(await evaluate('!!document.querySelector(".diffOverview .modified.diffOverviewRuler") && !!document.querySelector(".editor.modified .minimap")'));
  await evaluate('preview.editor.updateOptions({renderSideBySide:true});');await delay(150);
  fs.writeFileSync(path.join(root,'overview_after.png'),(await test_window.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({status:'PASS',checks:['upstream 30px overview has two 15px lanes','removed content uses red and inserted content uses green','both pane scrollbars remain 8px','modified document minimap remains enabled','real click on added marker reaches insertion with synchronized panes','real click on removed marker reaches deletion','overview and minimap survive layout option changes'],metrics,added,removed,evidence:root},null,2));
  await evaluate('preview.dispose()');test_window.destroy();app.exit(0);
}).catch(error=>{console.error(error);test_window?.destroy();app.exit(1);});
