// 真实Monaco差异及Chromium排版；不依赖用户文档。
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_markdown_diff_'));app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();
let win;const checks=[],pause=ms=>new Promise(r=>setTimeout(r,ms)),run=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){console.error(s);throw e}},wait=async s=>{for(let i=0;i<400;i++){if(await run(s))return;await pause(25);}throw Error('Timeout: '+s);},check=async(s,label)=>{assert(await run(s),label);checks.push(label);};
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,width:1200,height:820,webPreferences:{contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  win.webContents.on('console-message',(_event,_level,message)=>console.log(message));
  const file=path.join(root,'test.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden;background:white;color:#222}body{display:flex;font:16px/1.6 "Courier New"}#write{font-size:16px}#write h1{color:#0066bb}#write table{border-collapse:collapse}#write td,#write th{border:1px solid #999;padding:4px}</style>');await win.loadFile(file);
  await win.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'));
  const bundle=await require('esbuild').build({plugins:require('./editor_bundle.cjs').editor_plugins(),stdin:{contents:'export {git_diff_editor} from "./src/git_diff_editor";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,loader:{'.css':'text'},format:'iife',globalName:'qa'});await run(bundle.outputFiles[0].text);
  const left='---\ntitle: old\n---\n\n# 标题\n\n普通 **旧文字**。\n\n- 一\n- 删除\n\n| 名称 | 值 |\n| --- | --- |\n| 数字 | 1 |\n\n> 原引用\n\n```js\nconst value = 1;\n```\n\n![图片](old.png)\n\n结尾相同\n';
  const right=left.replace('old','new').replace('旧文字','新文字').replace('- 删除','- 新增').replace('| 1 |','| 2 |').replace('原引用','新引用').replace('value = 1','value = 2').replace('old.png','new.png');
  await run(`window.left_text=${JSON.stringify(left)};window.right_text=${JSON.stringify(right)};window.preview=new qa.git_diff_editor({title:'说明.md',file:'说明.md',left:left_text,right:right_text,left_label:'HEAD',right_label:'工作区'});preview.container.style.fontFamily='Arial';document.body.append(preview.container);window.shadow=preview.markdown_preview.shadow;`);
  await wait('preview.markdown_preview.container.dataset.ready==="true"');await pause(300);
  await check('preview.rendered_markdown&&preview.body.hidden','Markdown默认进入渲染比较');
  await check('shadow.querySelectorAll("h1").length===2&&shadow.querySelectorAll("table").length===2&&shadow.querySelectorAll("ul").length===2&&shadow.querySelectorAll("blockquote").length===2','标题列表表格引用保持完整排版');
  await check('shadow.textContent.includes("title: old")&&shadow.textContent.includes("title: new")','Front Matter差异可见');
  await check('shadow.querySelector("[data-changed=true] [data-side=left] strong")?.textContent==="旧文字"&&shadow.querySelector("[data-changed=true] [data-side=right] strong")?.textContent==="新文字"&&!shadow.querySelector("img")','增删块可见且历史图片不冒充当前图片');
  await check('getComputedStyle(shadow.querySelector("[data-changed=true] [data-side=left]")).backgroundColor!==getComputedStyle(shadow.querySelector("[data-changed=true] [data-side=right]")).backgroundColor','左右实际绘制红绿差异色');
  await check('[...shadow.querySelectorAll(".markdown-diff-row")].every(row=>Math.abs(row.children[0].getBoundingClientRect().top-row.children[1].getBoundingClientRect().top)<1&&Math.abs(row.children[0].getBoundingClientRect().height-row.children[1].getBoundingClientRect().height)<1)','两侧每个对应块顶部及高度对齐');
  await check('getComputedStyle(shadow.querySelector("h1")).color==="rgb(0, 102, 187)"','复用当前正文主题');
  await check('getComputedStyle(shadow.querySelector("#write")).fontFamily===getComputedStyle(document.body).fontFamily','功能区字体不能覆盖正文继承的主题字体');
  await run('window.theme_node=document.createElement("style");theme_node.textContent=":root{--qa-heading:rgb(120,30,80)}#write h1{color:var(--qa-heading)}";document.head.append(theme_node)');
  await wait('getComputedStyle(shadow.querySelector("h1")).color==="rgb(120, 30, 80)"');checks.push('主题根变量在Shadow中生效并响应异步插入');
  await run('theme_node.media="not all"');await wait('getComputedStyle(shadow.querySelector("h1")).color==="rgb(0, 102, 187)"');checks.push('未生效的主题media不能覆盖有效样式');
  await run('theme_node.media="all";theme_node.sheet.disabled=true;document.body.classList.add("qa-theme-change")');await wait('getComputedStyle(shadow.querySelector("h1")).color==="rgb(0, 102, 187)"');checks.push('禁用主题不进入阅读样式');
  await run('theme_node.remove()');
  await run('preview.range_action=async()=>{};preview.range_available=()=>true;preview.editor.getModifiedEditor().setSelection({startLineNumber:7,startColumn:1,endLineNumber:8,endColumn:1});');
  await check('preview.range_snapshot()===undefined','渲染态不能对隐藏源码选区暂存');
  await run('preview.navigate("next")');await check('preview.markdown_preview.scroll.scrollTop>0||shadow.activeElement?.dataset.changed==="true"','下一处更改定位当前渲染块');
  fs.writeFileSync(path.join(root,'light.png'),(await win.webContents.capturePage()).toPNG());
  for(let i=0;i<20;i++){await run('preview.set_markdown_mode(false);preview.set_markdown_mode(true)');await wait('preview.markdown_preview.container.dataset.ready==="true"');}
  await check('preview.models.length===2&&preview.models[0].getValue()===left_text&&preview.models[1].getValue()===right_text','20次切换保留两份只读源码及模型');
  await run('document.body.style.color="rgb(220,220,220)";document.body.style.background="#202020"');await wait('preview.markdown_preview.container.dataset.theme==="dark"');
  await check('getComputedStyle(shadow.querySelector("[data-changed=true] [data-side=right]")).backgroundColor==="rgba(156, 204, 44, 0.2)"','暗色采用固定差异颜色');
  await win.setContentSize(420,700);await pause(100);await check('shadow.querySelector(".markdown-diff-row").children[1].getBoundingClientRect().left>shadow.querySelector(".markdown-diff-row").children[0].getBoundingClientRect().left','窄视口保持左右比较');
  await win.webContents.setZoomFactor(1.25);await pause(100);await check('preview.markdown_preview.scroll.clientHeight>100','窗口放大后比较仍有独立滚动区域');
  await run('preview.set_markdown_mode(false)');await check('!preview.body.hidden&&preview.markdown_preview.container.hidden&&preview.editor.getModel().original.getValue()===left_text','可切回源码差异');
  await run('preview.dispose();window.preview=new qa.git_diff_editor({title:"code.ts",file:"code.ts",left:"a",right:"b"});document.body.append(preview.container)');await check('!preview.markdown_preview&&!preview.body.hidden','非Markdown保持源码比较');
  for(const [before,after,label] of [['','# 新建\n\n内容','纯新增'],['# 删除\n\n内容','','纯删除'],['# 同一\n\n重复\n\n重复\n','# 同一\n\n重复\n\n重复\n','不变'],['[链接][x]\n\n[x]: https://old.invalid\n','[链接][x]\n\n[x]: https://new.invalid\n','引用链接变更'],['<script>window.hacked=true</script>\n','<img src=x onerror="window.hacked=true">\n','不执行历史HTML']]){
    await run(`preview.dispose();window.preview=new qa.git_diff_editor({title:'case.md',file:'case.md',left:${JSON.stringify(before)},right:${JSON.stringify(after)}});document.body.append(preview.container);window.shadow=preview.markdown_preview.shadow;`);await wait('preview.markdown_preview.container.dataset.ready==="true"');
    await check(label==='不变'?'!shadow.querySelector("[data-changed=true]")':label==='不执行历史HTML'?'!window.hacked&&!shadow.querySelector("script,img,[onerror]")':'!!shadow.querySelector("[data-changed=true]")',label);
  }
  await run('preview.dispose();window.many=Array.from({length:600},(_,i)=>"段落 "+i+"\\n\\n").join("");window.preview=new qa.git_diff_editor({title:"long.md",file:"long.md",left:many,right:many.replace("段落 300","修改 300")});document.body.append(preview.container)');await wait('preview.markdown_preview.container.dataset.ready==="true"');
  await check('preview.markdown_preview.shadow.querySelectorAll(".markdown-diff-row").length===601','600段压力只改变对应块且保留其余对齐');
  await run('window.overview=preview.container.querySelector(".git-markdown-overview");window.reader_scroll=preview.markdown_preview.scroll;');
  await wait('overview.dataset.markCount==="1"');
  await check('overview.getBoundingClientRect().width===30&&overview.clientHeight===reader_scroll.clientHeight','渲染概览常驻右侧30px且与视口同高');
  await check('(()=>{const c=overview.querySelector("canvas"),ctx=c.getContext("2d"),data=ctx.getImageData(0,0,c.width,c.height).data;let red=0,green=0;for(let i=0;i<data.length;i+=4){if(data[i+3]&&data[i]>data[i+1])red++;if(data[i+3]&&data[i+1]>data[i])green++;}return red>0&&green>0})()','概览画布实际绘出红绿变更');
  await run('window.click_mark=()=>{const row=preview.markdown_preview.shadow.querySelector("[data-changed=true]"),base=preview.markdown_preview.shadow.querySelector("#write"),box=overview.getBoundingClientRect();overview.dispatchEvent(new PointerEvent("pointerdown",{button:0,pointerId:5,clientX:box.right-3,clientY:box.top+(row.getBoundingClientRect().top-base.getBoundingClientRect().top+2)/reader_scroll.scrollHeight*box.height,bubbles:true}));};click_mark()');
  await pause(50);await check('(()=>{const row=preview.markdown_preview.shadow.querySelector("[data-changed=true]").getBoundingClientRect(),box=reader_scroll.getBoundingClientRect();return row.top>=box.top&&row.top<box.bottom})()','单击概览变更定位实际排版块');
  await run('overview.dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}))');await pause(50);await check('reader_scroll.scrollTop===0','概览Home回到起点');
  await run('window.thumb=overview.querySelector(".git-markdown-overview-viewport");window.tb=thumb.getBoundingClientRect();thumb.dispatchEvent(new PointerEvent("pointerdown",{button:0,pointerId:7,clientX:tb.left+2,clientY:tb.top+2,bubbles:true}));overview.dispatchEvent(new PointerEvent("pointermove",{pointerId:7,clientY:overview.getBoundingClientRect().bottom,bubbles:true}));overview.dispatchEvent(new PointerEvent("pointerup",{pointerId:7,bubbles:true}));');await pause(50);
  await check('reader_scroll.scrollTop>=reader_scroll.scrollHeight-reader_scroll.clientHeight-2&&!overview.dataset.dragging','拖动概览滑块到底并释放');
  await run('window.tb=thumb.getBoundingClientRect();thumb.dispatchEvent(new PointerEvent("pointerdown",{button:0,pointerId:8,clientX:tb.left+2,clientY:tb.top+2,bubbles:true}));overview.dispatchEvent(new PointerEvent("pointercancel",{pointerId:8,bubbles:true}));window.cancel_top=reader_scroll.scrollTop;overview.dispatchEvent(new PointerEvent("pointermove",{pointerId:8,clientY:0,bubbles:true}));');await check('!overview.dataset.dragging&&reader_scroll.scrollTop===cancel_top','取消拖动后不再改变阅读位置');
  await run('overview.dispatchEvent(new KeyboardEvent("keydown",{key:"PageUp",bubbles:true}))');await pause(50);await check('reader_scroll.scrollTop<reader_scroll.scrollHeight-reader_scroll.clientHeight-10','概览PageUp与同一阅读容器同步');
  await run('reader_scroll.scrollTop=0');await pause(50);await check('parseFloat(thumb.style.top)===0','正文滚动同步概览视口');
  for(const zoom of [.8,1,1.25]){await win.webContents.setZoomFactor(zoom);await pause(100);await run('click_mark()');await pause(30);await check('(()=>{const row=preview.markdown_preview.shadow.querySelector("[data-changed=true]").getBoundingClientRect(),box=reader_scroll.getBoundingClientRect();return row.top>=box.top-1&&row.top<box.bottom})()','概览缩放后跳转 '+zoom);}
  for(let i=0;i<20;i++){await run('preview.set_markdown_mode(false);preview.set_markdown_mode(true)');await wait('preview.markdown_preview.container.dataset.ready==="true"');}
  await check('preview.container.querySelectorAll(".git-markdown-overview").length===1','20次模式切换只有一个概览');
  fs.writeFileSync(path.join(root,'overview.png'),(await win.webContents.capturePage()).toPNG());
  await run('preview.update({...preview.data,right:"# 最新\\n\\n当前内容"})');await wait('preview.markdown_preview.shadow.querySelector("h1")?.textContent==="最新"');
  await check('!preview.markdown_preview.shadow.textContent.includes("修改 300")','刷新抛弃旧比较内容');
  await wait('overview.dataset.markCount==="1"');
  await run('preview.update({...preview.data,left:"相同",right:"相同"})');await wait('preview.markdown_preview.container.dataset.ready==="true"&&overview.dataset.markCount==="0"');await check('overview.querySelector(".git-markdown-overview-viewport").hidden','无差异刷新清除旧标记且短文无滑块');
  await run('preview.update({...preview.data,right:"x".repeat(1024*1024+1)})');await wait('!preview.rendered_markdown');await check('preview.status.textContent.includes("1MiB")&&!preview.body.hidden','过大渲染明确回退源码');
  await run('preview.dispose()');await check('!document.querySelector(".git-markdown-diff")','销毁清理视图及资源');
  console.log(JSON.stringify({status:'PASS',checks,evidence:root},null,2));win.destroy();app.quit();
}).catch(error=>{console.error(error);if(win)win.destroy();app.exit(1)});
