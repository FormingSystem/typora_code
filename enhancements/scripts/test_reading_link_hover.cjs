const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_link_hover_'));
app.setPath('userData',path.join(root,'user_data'));app.disableHardwareAcceleration();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:560,height:330,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,offscreen:true}});
  const file=path.join(root,'host.html');
  fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><body><div id="write" contenteditable="true"><p>Draft preserved <span md-inline="link" class="md-link"><a id="local" href="hardware.md#接口" title="original title" aria-describedby="old-description"><strong>Hardware</strong></a></span></p><a id="external" href="https://example.invalid/?q=%3Cimg%3E">Remote</a><a id="cancel" href="missing.yml">Missing</a><a id="outside" href="../../outside.md">Outside</a></div><section class="typ-markdown-preview"><a id="preview" href="../boards/board.yml">Board</a></section>');
  await win.loadFile(file);
  const bundle=await build({stdin:{contents:'export {bind_reading_link_hover} from "./src/reading_link_hover";',resolveDir:path.join(__dirname,'..')},plugins:require('./editor_bundle.cjs').editor_plugins(),bundle:true,loader:{'.css':'text'},format:'iife',globalName:'hover_qa',write:false});
  const evaluate=source=>win.webContents.executeJavaScript(source);
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(`window.copied=[];window.reqnode=name=>name==='electron'?{clipboard:{writeText:text=>copied.push(text)}}:require(name);window.project_root=${JSON.stringify(root)};window.File={getMountFolder:()=>project_root,bundle:{filePath:${JSON.stringify(path.join(root,'project-docs','chapter.md'))}}};window[Symbol.for('typora-code:workspace')]={app:{workspace:{eachLeaves:fn=>fn({state:{path:${JSON.stringify(path.join(root,'other','chapter.md'))}},view:{containerEl:document.querySelector('.typ-markdown-preview')}})}}};window.opens=0;document.addEventListener('click',event=>{opens++;event.preventDefault()});window.binding=hover_qa.bind_reading_link_hover();window.original_html=document.querySelector('#write').innerHTML;window.enter=id=>document.querySelector(id).dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));window.leave=id=>document.querySelector(id).dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}));window.tip_info=()=>({original:document.querySelector('.workspace-link-original')?.textContent,target:document.querySelector('.workspace-link-target')?.textContent||''});void 0`);
  await evaluate(`enter('#local strong')`);await delay(650);
  assert(await evaluate(`document.querySelector('.workspace-link-hover').hidden`),'does not show before the requested 1 second');
  await delay(450);
  assert.deepEqual(await evaluate('tip_info()'),{original:'hardware.md#接口',target:'项目内：/project-docs/hardware.md#接口'});
  assert.equal(await evaluate('opens'),0,'hover does not invoke navigation');
  await evaluate(`leave('#local')`);await delay(100);await evaluate(`enter('.workspace-link-hover')`);await delay(300);
  assert(!(await evaluate(`document.querySelector('.workspace-link-hover').hidden`)),'crossing the gap to the tooltip keeps it open');
  await evaluate(`document.querySelector('.workspace-link-original').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));const range=document.createRange();range.selectNodeContents(document.querySelector('.workspace-link-original'));getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Control',ctrlKey:true,bubbles:true}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true}));document.querySelector('.workspace-link-hover').dispatchEvent(new Event('scroll'));void 0`);
  assert.equal(await evaluate(`String(getSelection())`),'hardware.md#接口');
  assert(!(await evaluate(`document.querySelector('.workspace-link-hover').hidden`)),'selection, Ctrl+C and tooltip scrolling keep the tooltip available');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.workspace-link-hover')).pointerEvents`),'auto');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.workspace-link-original')).userSelect`),'text');
  await evaluate(`document.querySelector('.workspace-link-copy').click()`);
  assert.deepEqual(await evaluate('copied'),['hardware.md#接口']);assert.equal(await evaluate('opens'),0,'copy does not bubble into document navigation');
  await evaluate(`leave('.workspace-link-hover')`);await delay(100);assert(!(await evaluate(`document.querySelector('.workspace-link-hover').hidden`)),'small pointer gap is tolerated');await delay(200);
  assert(await evaluate(`document.querySelector('.workspace-link-hover').hidden`),'leaving both link and tooltip closes after 250ms');
  await evaluate(`document.querySelector('#local').click()`);
  assert.equal(await evaluate('opens'),1,'existing click handler remains available');
  await evaluate(`leave('#local')`);await delay(300);
  assert(await evaluate(`document.querySelector('.workspace-link-hover').hidden&&document.querySelector('#write').innerHTML===original_html`),'leave restores native title and accessibility attributes without changing the draft');
  await evaluate(`enter('#cancel')`);await delay(350);await evaluate(`leave('#cancel')`);await delay(800);
  assert(await evaluate(`document.querySelector('.workspace-link-hover').hidden`),'leaving before the delay cancels stale results');
  await evaluate(`enter('#preview')`);await delay(1100);
  assert.deepEqual(await evaluate('tip_info()'),{original:'../boards/board.yml',target:'项目内：/boards/board.yml'});
  await evaluate(`document.dispatchEvent(new Event('scroll'))`);
  assert(await evaluate(`document.querySelector('.workspace-link-hover').hidden`),'scroll dismisses the tooltip');
  await evaluate(`enter('#external')`);await delay(1100);
  assert.deepEqual(await evaluate('tip_info()'),{original:'https://example.invalid/?q=<img>',target:''});
  assert(await evaluate(`!document.querySelector('.workspace-link-hover img')&&document.querySelector('.workspace-link-hover').getBoundingClientRect().right<=innerWidth`),'target is inert text contained in the viewport');
  await evaluate(`document.querySelector('#external').setAttribute('href','https://example.invalid/changed')`);await delay(20);
  assert(await evaluate(`document.querySelector('.workspace-link-hover').hidden`),'changing a link dismisses stale target information');
  await evaluate(`enter('#outside')`);await delay(1100);
  assert.deepEqual(await evaluate('tip_info()'),{original:'../../outside.md',target:'项目外：../outside.md'});
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert(await evaluate(`document.querySelector('.workspace-link-hover').hidden`),'Escape dismisses interactive tooltip');
  await evaluate(`window.project_root='';enter('#local')`);await delay(1100);
  assert.equal(await evaluate(`tip_info().target`),'目标：未打开项目，无法计算项目相对位置');
  await evaluate(`document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));window.project_root=${JSON.stringify(root)}`);
  assert(await evaluate(`document.querySelector('.workspace-link-hover').hidden`),'outside click dismisses without source changes');
  await evaluate(`window.previous_reqnode=reqnode;window.previous_source=File.bundle.filePath;window.reqnode=name=>name==='path'?require('path').win32:previous_reqnode(name);File.bundle.filePath=${JSON.stringify('C:\\project\\docs\\chapter.md')};window.project_root=${JSON.stringify('D:\\another-project')};enter('#local')`);await delay(1100);
  assert.equal(await evaluate(`tip_info().target`),'项目外：目标位于其他磁盘或共享位置','different Windows volumes cannot be represented as a project-local path');
  await evaluate(`window.dispatchEvent(new Event('blur'));window.reqnode=previous_reqnode;File.bundle.filePath=previous_source;window.project_root=${JSON.stringify(root)};document.querySelector('#outside').setAttribute('href','%3Cimg%20src=x%20onerror=alert(1)%3E.md');enter('#outside')`);await delay(1100);
  assert.equal(await evaluate(`tip_info().target`),'项目内：/project-docs/<img src=x onerror=alert(1)>.md');
  assert(await evaluate(`!document.querySelector('.workspace-link-hover img')`),'decoded target is rendered with textContent');
  await evaluate(`window.dispatchEvent(new Event('blur'));document.querySelector('#outside').setAttribute('href','../../outside.md');document.querySelector('#external').setAttribute('href','https://example.invalid/?q=%3Cimg%3E')`);
  assert(await evaluate(`document.querySelector('.workspace-link-hover').hidden`),'window blur dismisses interactive tooltip');
  const encoded_chinese='../'+encodeURIComponent('治理')+'/'+encodeURIComponent('开发规范')+'.md#'+encodeURIComponent('第2章_中文接口🔗');
  const encoded_file_url=require('node:url').pathToFileURL(path.join(root,'project-docs','原始%标题.md')).href+'#'+encodeURIComponent('章节锚点');
  const readable_cases=[
    {href:encoded_chinese,original:'../治理/开发规范.md#第2章_中文接口🔗',target:'项目内：/治理/开发规范.md#第2章_中文接口🔗'},
    {href:'notes/%25E6%2596%2587.md#%25E6%2596%2587',original:'notes/%E6%96%87.md#%E6%96%87',target:'项目内：/project-docs/notes/%E6%96%87.md#%E6%96%87'},
    {href:'hardware.md#%E6%8E%A5%E5%8F%A3%2F%23%3F%26%3D%25',original:'hardware.md#接口%2F%23%3F%26%3D%',target:'项目内：/project-docs/hardware.md#接口%2F%23%3F%26%3D%'},
    {href:'hardware.md#%E6%8E%A5%E5%8F%A3%FF%ZZ%E4%B8%00%0A',original:'hardware.md#接口%FF%ZZ%E4%B8%00%0A',target:'项目内：/project-docs/hardware.md#接口%FF%ZZ%E4%B8%00%0A'},
    {href:encoded_file_url,original:decodeURI(encoded_file_url),target:'项目内：/project-docs/原始%标题.md#章节锚点'},
  ];
  for(const test_case of readable_cases){
    await evaluate(`window.dispatchEvent(new Event('blur'));document.querySelector('#cancel').setAttribute('href',${JSON.stringify(test_case.href)});enter('#cancel')`);await delay(1100);
    assert.deepEqual(await evaluate('tip_info()'),{original:test_case.original,target:test_case.target},'link and project-relative target are readable without repeated decoding');
    assert.equal(await evaluate(`document.querySelector('#cancel').getAttribute('href')`),test_case.href,'display decoding never changes the navigable href');
    await evaluate(`document.querySelector('.workspace-link-copy').click()`);
    assert.equal(await evaluate('copied.at(-1)'),test_case.href,'copy retains the exact encoded link including reserved characters and malformed escapes');
    assert.equal(await evaluate('opens'),1,'readable hover and copy never invoke document navigation');
    assert(await evaluate(`!document.querySelector('.workspace-link-hover img,.workspace-link-hover script')`),'readable link remains inert text');
  }
  await evaluate(`window.dispatchEvent(new Event('blur'));document.querySelector('#cancel').setAttribute('href','missing.yml')`);
  assert(await evaluate(`document.querySelector('#write').innerHTML===original_html`),'tooltip actions preserve the original document and host attributes');
  await evaluate(`leave('#external');enter('#cancel');document.querySelector('#cancel').remove()`);await delay(1100);
  assert(await evaluate(`document.querySelector('.workspace-link-hover').hidden`),'removed document cannot leave a late tooltip');
  await evaluate(`enter('#local');binding.dispose()`);await delay(1100);
  assert(await evaluate(`!document.querySelector('.workspace-link-hover')&&document.querySelector('#local').title==='original title'&&!document.querySelector('#typora-code-link-hover')`),'dispose cancels pending work and restores host attributes');
  console.log('PASS '+root);win.destroy();app.exit(0);
}).catch(error=>{console.error(error);console.error(root);app.exit(1)});
