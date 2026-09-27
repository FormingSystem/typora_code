// 正式候选、原始宿主；仅操作隔离运行器的文档及终端。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await pause(40);}throw Error(label);};
 const command=name=>core.app.commands.run('linux_note:'+name);
 const source=path.join(base,'workspace/links.md'),target=path.join(base,'workspace/target.md');
 const text='# Links\n\n[目标](target.md)\n';fs.writeFileSync(source,text);fs.writeFileSync(target,'# 预览\n\n'+('正文内容\n\n'.repeat(100)));
 try{
  await pause(2400);await files.open_file(source);await wait(()=>document.querySelector('#write a[href]'),'链接未出现');
  const dock=document.querySelector('.workspace-link-dock');
  const select=async()=>{getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'));await pause(100);const link=document.querySelector('#write a[href]'),range=document.createRange();link.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,button:0}));range.selectNodeContents(link);getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));await wait(()=>!dock.hidden&&dock.querySelector('.workspace-link-preview')?.dataset.state==='ready','预览未就绪');};
  await select();dock.querySelector('.workspace-link-preview-pin').click();
  for(let i=0;i<12;i++)dock.querySelector('[data-edge="east"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}));
  command('terminal');await wait(()=>document.querySelector('.typora-terminal-panel')&&!document.querySelector('.typora-terminal-panel').hidden,'终端未打开');
  const panel=document.querySelector('.typora-terminal-panel');await pause(300);
  for(const theme of ['vscode2026_light.css','vscode2026_dark.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(300);
   for(const zoom of [1,1.25]){
    reqnode('electron').webFrame.setZoomFactor(zoom);await pause(150);
    const d=dock.getBoundingClientRect(),t=panel.getBoundingClientRect(),x=(Math.max(d.left,t.left)+Math.min(d.right,t.right))/2,y=(Math.max(d.top,t.top)+Math.min(d.bottom,t.bottom))/2;
    assert(Math.min(d.right,t.right)>Math.max(d.left,t.left)&&Math.min(d.bottom,t.bottom)>Math.max(d.top,t.top),'原生确有重叠 '+theme+'/'+zoom);
    assert(dock.contains(document.elementFromPoint(x,y)),'原生预览覆盖终端并命中 '+theme+'/'+zoom);
    assert(dock.contains(document.elementFromPoint(d.left+30,d.top+14)),'预览工具栏可达 '+theme+'/'+zoom);
    assert(panel.contains(document.elementFromPoint(t.right-25,t.bottom-25)),'终端其他区域可达 '+theme+'/'+zoom);
   }
  }
  reqnode('electron').webFrame.setZoomFactor(1);await pause(100);
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'preview_above_terminal_dark'}));await pause(600);
  dock.querySelector('[aria-label="关闭链接预览"]').click();await pause(120);
  const t=panel.getBoundingClientRect();assert(dock.hidden&&panel.contains(document.elementFromPoint(t.left+20,t.bottom-25)),'关闭恢复终端命中');
  await select();assert(!dock.hidden,'先开终端后开预览');
  panel.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,button:0}));await pause(120);assert(dock.hidden,'未固定预览点击终端关闭');
  await select();dock.querySelector('.workspace-link-preview-pin').click();panel.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,button:0}));await pause(120);assert(!dock.hidden,'固定预览点击终端保留');
  assert(fs.readFileSync(source,'utf8')===text,'原文保持未修改');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(_options.userDataPath,'typora_code/workbench.js'))).digest('hex'),limits:'原始宿主DOM事件与真实坐标命中；物理鼠标/其他平台未覆盖；网页预览另属已有浏览器套件。'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack)},null,2));}
 finally{command('terminal_kill');}
})();
