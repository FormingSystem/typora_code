// 真实Monaco差异及Chromium排版；不依赖用户文档。
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_git_presentation_'));app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();
let win;const checks=[],pause=ms=>new Promise(r=>setTimeout(r,ms)),run=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){console.error(s);throw e}},wait=async s=>{for(let i=0;i<400;i++){if(await run(s))return;await pause(25);}throw Error('Timeout: '+s);},check=async(s,label)=>{assert(await run(s),label);checks.push(label);};
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,width:1200,height:820,webPreferences:{contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  win.webContents.on('console-message',(_event,_level,message)=>console.log(message));
  const file=path.join(root,'test.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden;background:white;color:#222}body{display:flex;font:16px/1.6 "Courier New"}#write{font-size:16px}#write h1{color:#0066bb}#write table{border-collapse:collapse}#write td,#write th{border:1px solid #999;padding:4px}</style>');await win.loadFile(file);
  await win.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'));
  const bundle=await require('esbuild').build({plugins:require('./editor_bundle.cjs').editor_plugins(),stdin:{contents:'export {git_diff_editor} from "./src/git_diff_editor";export * from "./src/workspace_text_presentation";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,loader:{'.css':'text'},format:'iife',globalName:'qa'});await run(bundle.outputFiles[0].text);

  await run(`localStorage.setItem('typora-code:text-presentation',JSON.stringify({schema:2026092402,word_wrap:false}));`);
  await check('qa.read_text_presentation().word_wrap===true','旧契约按本版默认迁移');
  await run('qa.update_text_presentation(false)');await check('!qa.read_text_presentation().word_wrap','当前契约保留关闭偏好');
  await run(`localStorage.setItem('typora-code:text-presentation',JSON.stringify({schema:2027092403,word_wrap:false}));`);await check('!qa.read_text_presentation().word_wrap','未来契约不被降级重置');
  await run(`localStorage.removeItem('typora-code:text-presentation')`);await check('qa.read_text_presentation().word_wrap','首次使用默认换行');
  await run(`window.code=Array.from({length:100},(_,i)=>'int value_'+i+' = '+('1234567890 + '.repeat(30))+'0;').join('\\n');window.source=new qa.git_diff_editor({title:'long.cpp',file:'long.cpp',left:code});source.container.style.width='100%';document.body.append(source.container);`);await pause(80);
  await check('source.wrapped&&source.models[0].getLineCount()===100&&source.models[0].getValue()===code','C++软换行不增逻辑行或改正文');
  await run(`source.editor.setScrollTop(source.editor.getTopForPosition(50,120));window.before=source.capture_content_anchor();qa.update_text_presentation(false);`);await pause(60);
  await check('!source.wrapped&&Math.abs(source.capture_content_anchor().line-before.line)<=1','关闭换行保留当前逻辑位置');
  await run(`source.editor.setScrollTop(source.editor.getTopForLineNumber(70));source.editor.setScrollLeft(400);window.before=source.capture_content_anchor();qa.update_text_presentation(true);`);await pause(60);
  await check('Math.abs(source.capture_content_anchor().line-before.line)<=1&&source.models[0].getValue()===code','横向滚动后开启换行不跳回旧位置');
  await run(`source.dispose();window.left_text='# 标题\\n\\n原段落\\n';window.right_text='# 标题\\n\\n新增内容\\n\\n原段落\\n';window.preview=new qa.git_diff_editor({title:'test.md',file:'test.md',left:left_text,right:right_text});document.body.append(preview.container);window.shadow=preview.markdown_preview.shadow;`);await wait('preview.markdown_preview.container.dataset.ready==="true"');
  await check('[...shadow.querySelectorAll("h1")].every(n=>n.closest("[data-changed]").dataset.changed==="false")','标题后插入段落不误染未修改标题');
  await run(`preview.update({...preview.data,left:'| 名称 | 内容 |\\n|---|---|\\n| A | 相同 |\\n| B | 旧内容 |\\n| C | 尾部 |\\n',right:'| 名称 | 内容 |\\n|---|---|\\n| A | 相同 |\\n| B | 新内容 |\\n| C | 尾部 |\\n'})`);await wait('preview.markdown_preview.container.dataset.ready==="true"&&shadow.textContent.includes("新内容")');
  await check('shadow.querySelectorAll("[data-diff-fragment]").length===2&&[...shadow.querySelectorAll("[data-diff-fragment]")].every(n=>/旧内容|新内容/.test(n.textContent))','表格只着色改变的两个单元格');
  await run(`preview.update({...preview.data,left:'- 一\\n- 三\\n',right:'- 一\\n- 二\\n- 三\\n'})`);await wait('preview.markdown_preview.container.dataset.ready==="true"&&shadow.querySelector("li")');
  await check('shadow.querySelectorAll("[data-diff-fragment]").length===1&&shadow.querySelector("[data-diff-fragment]").textContent==="二"','列表插入不误染其后相同项');

  const cases=[
    ['CRLF标题后新增', '# 标题\r\n\r\n原文\r\n','# 标题\r\n\r\n新增\r\n\r\n原文\r\n','[...shadow.querySelectorAll("h1")].every(n=>n.closest("[data-changed]").dataset.changed==="false")'],
    ['表格新增行只染新增', '| A | B |\n|---|---|\n| 一 | 1 |\n| 三 | 3 |','| A | B |\n|---|---|\n| 一 | 1 |\n| 二 | 2 |\n| 三 | 3 |','shadow.querySelectorAll("[data-diff-fragment]").length===1&&shadow.querySelector("[data-diff-fragment]").textContent.includes("二")'],
    ['列表删除只染删除项','- 一\n- 二\n- 三','- 一\n- 三','shadow.querySelectorAll("[data-diff-fragment]").length===1&&shadow.querySelector("[data-diff-fragment]").dataset.diffFragment==="left"'],
    ['链接目标变化仍有差异','[相同文字](a.md)','[相同文字](b.md)','!!shadow.querySelector("[data-changed=true]")']
  ];
  for(const [label,left,right,condition] of cases){await run(`preview.update({...preview.data,left:${JSON.stringify(left)},right:${JSON.stringify(right)}});void 0;`);await wait('preview.markdown_preview.container.dataset.ready==="true"');await check(condition,label);}
  await run(`window.many=Array.from({length:120},(_,i)=>'## 标题 '+i+'\\n\\n段落 '+i+' '+('内容文字'.repeat(40))+'\\n\\n').join('');preview.update({...preview.data,left:many,right:many.replace('段落 60','修改 60')})`);await wait('preview.markdown_preview.container.dataset.ready==="true"&&shadow.textContent.includes("标题 100")');
  for(let i=0;i<20;i++){
    await run(`window.line=${i%2?301:241};preview.markdown_preview.restore({side:'right',line,fraction:0});window.before=preview.capture_content_anchor();preview.set_markdown_mode(false)`);await pause(30);
    await check('Math.abs(preview.capture_content_anchor().line-before.line)<=2','排版到源码保持源行 '+i);
    await run(`window.source_view=preview.editor.getModifiedEditor();source_view.setScrollTop(source_view.getTopForLineNumber(${i%2?181:121}));window.before=preview.capture_content_anchor();preview.set_markdown_mode(true)`);await wait('preview.markdown_preview.container.dataset.ready==="true"');await pause(30);
    await check('Math.abs(preview.capture_content_anchor().line-before.line)<=2','源码滚动后排版使用新位置 '+i);
  }
  await run(`qa.update_text_presentation(false);window.other=new qa.git_diff_editor({title:'new.cpp',left:code});void 0;`);await check('!preview.wrapped&&!other.wrapped','多个现有和新窗口共享换行配置');
  await run('other.dispose();preview.dispose()');
  await win.reload();await wait('document.readyState==="complete"');await run(bundle.outputFiles[0].text);await check('!qa.read_text_presentation().word_wrap','页面重新加载保留当前契约关闭偏好');
  await run(`window.original_set=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota fixture')};qa.update_text_presentation(true);`);await check('qa.read_text_presentation().word_wrap','写入失败时当前窗口仍保留内存偏好');await run('Storage.prototype.setItem=original_set;qa.update_text_presentation(false)');
  console.log(JSON.stringify({status:'PASS',checks,evidence:root},null,2));win.destroy();app.quit();
}).catch(error=>{console.error(error);if(win)win.destroy();app.exit(1)});
