// Original Typora verifies the actual cascading of the top bar and the resource tree/search shared file directory; only operates the isolated workspace.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),frame=reqnode('electron').webFrame,base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<500;i++){if(fn())return;await pause(20);}throw Error(label);};
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const original=fs.promises.readdir;let reads=0;
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'窗口尺寸未就绪');await pause(500);
  const button=document.querySelector('.workspace-titlebar-search'),label=button.querySelector('span');
  for(const theme of ['cpp_github-consolas_light.css','cpp_github-consolas_dark.css','night.css']){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(500);
   for(const zoom of [1,.9,1.25]){frame.setZoomFactor(zoom);await pause(100);
    for(const text of ['zephyr_hc32f4a0','搜索文件','长工作区名称'.repeat(30)]){
     label.textContent=text;await pause(25);const b=button.getBoundingClientRect(),r=label.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(label);const t=range.getBoundingClientRect(),style=getComputedStyle(button);
     const children=[...button.querySelectorAll('*')].map(node=>({background:getComputedStyle(node).backgroundColor,color:getComputedStyle(node).color}));
     assert(r.top>b.top+.5&&r.bottom<b.bottom-.5,'行盒不覆盖边框 '+theme+'/'+zoom+'/'+text.length);
     assert(t.height<=r.height+.2,'文字真实行盒未裁切 '+theme+'/'+zoom+'/'+text.length);
     assert(children.every(node=>node.background==='rgba(0, 0, 0, 0)'&&node.color===style.color),'子元素透明且共用前景 '+theme+'/'+zoom+'/'+text.length);
     samples.push({theme,zoom,label_length:text.length,button:b.toJSON(),line:r.toJSON(),color:style.color,children});
    }
   }
  }
  frame.setZoomFactor(1);await pause(150);
  const root=files.context_root();assert(root===path.join(base,'workspace'),'仅使用隔离工作区');
  for(let i=0;i<20;i++){fs.mkdirSync(path.join(root,'catalogue-'+i),{recursive:true});for(let j=0;j<5;j++)fs.writeFileSync(path.join(root,'catalogue-'+i,'file-'+j+'.md'),'# shared directory');}
  await pause(400);fs.promises.readdir=async function(...args){if(String(args[0]).startsWith(root))reads++;return original.apply(this,args);};
  const open=async()=>{button.click();await wait(()=>{const p=document.querySelector('.workspace-quick-open');return p&&!p.hidden&&p.querySelectorAll('.workspace-quick-open-result').length>0&&!p.querySelector('[role=status]').textContent.includes('正在');},'搜索未就绪');};
  const close=()=>document.querySelector('.workspace-quick-open input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await open();close();await pause(200);const first_reads=reads;
  for(let i=0;i<100;i++){await open();assert(!document.querySelector('.workspace-quick-open [role=status]').textContent.includes('正在查找'),'重复打开不重新计数 '+i);close();}
  assert(reads===first_reads,'100次重开零新增readdir');samples.push({kind:'directory_reads',first_reads,after_100:reads});
  await files.fs.promises.writeFile(path.join(root,'catalogue-0','new-target.md'),'# new');await pause(300);await open();
  const input=document.querySelector('.workspace-quick-open input');input.value='new-target';input.dispatchEvent(new Event('input'));await wait(()=>document.querySelector('.workspace-quick-open-name')?.textContent==='new-target.md','新增文件未进入共同索引');assert(true,'文件写入后搜索可见');close();
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex'),limits:'原生宿主独立副本DOM点击及字号矩阵；未代替物理屏幕及实连SSH验收'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack),checks,samples},null,2));}
 finally{fs.promises.readdir=original;}
})();
