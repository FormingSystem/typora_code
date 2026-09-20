// 正式构建在原始宿主中的共享弹窗验收；更新服务使用替身，不安装或改动用户环境。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],user_data=window._options.userDataPath;
 const service=reqnode(path.join(user_data,'typora_code/assets/update/workspace_update_service.cjs'));
 const saved={check_update:service.check_update,start_update:service.start_update,status_of:service.status_of,cancel_update:service.cancel_update};
 const release=JSON.parse(fs.readFileSync(path.join(user_data,'typora_code/assets/update/release.json'),'utf8'));
 const document_file=path.join(base,'workspace/front.md'),before=fs.readFileSync(document_file,'utf8');
 const popup=()=>document.querySelector('.git-graph-dialog-shade');
 let resolve_check,signal,install_count=0,cancel_count=0;
 const geometry=label=>{
  const root=popup(),panel=root.querySelector('.git-graph-dialog'),header=root.querySelector('.workspace-dialog-header'),close=root.querySelector('.workspace-dialog-close'),footer=root.querySelector('.git-graph-dialog-footer');
  const box=node=>node.getBoundingClientRect(),rect=box(close),icon=box(close.querySelector('svg')),style=getComputedStyle(close),foot=box(footer),foot_style=getComputedStyle(footer);
  assert(rect.width===20&&rect.height===20&&icon.width===16&&icon.height===16,label+'标题栏关闭尺寸正确');
  assert(rect.right<=box(header).right&&rect.top>=box(header).top&&style.visibility==='visible'&&style.opacity!=='0',label+'右上关闭可见且未被裁切');
  assert(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.closest('button')===close,label+'关闭命中区可交互');
  assert(foot_style.justifyContent==='flex-end'&&foot.bottom<=innerHeight,label+'底部操作在可视区域右对齐');
  const rows=new Map();for(const button of footer.children){const b=box(button);rows.set(Math.round(b.top),{right:b.right,margin:parseFloat(getComputedStyle(button).marginRight)});}
  for(const last of rows.values())assert(Math.abs(last.right+last.margin-foot.right+parseFloat(foot_style.paddingRight))<1,label+'操作行右边界一致');
  samples.push({label,viewport:{width:innerWidth,height:innerHeight,dpi:devicePixelRatio,zoom:reqnode('electron').webFrame.getZoomFactor()},background:getComputedStyle(panel).backgroundColor,foreground:style.color,close:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},footer:{x:foot.x,y:foot.y,width:foot.width,height:foot.height}});
 };
 try{
  service.check_update=(_release,options)=>{signal=options.signal;return new Promise(resolve=>resolve_check=resolve);};
  service.start_update=()=>{install_count++;return 'fixture-job';};
  service.status_of=()=>({phase:'installing',message:'原生弹窗验收'});
  service.cancel_update=()=>cancel_count++;
  for(let i=0;i<100&&(File.isFileLoading()||!File.bundle.filePath.endsWith('front.md'));i++)await pause(50);
  await pause(2400);
  for(const [theme,name]of [['github.css','Github'],['cpp_github-consolas.css','Cpp'],['night.css','Night']]){
   await JSBridge.invoke('setting.setCurTheme',theme,name);File.setTheme(theme);await pause(350);document.querySelector('#ty-suppress-mode-warning-close-btn')?.click();
   for(const zoom of [1,1.25]){
    reqnode('electron').webFrame.setZoomFactor(zoom);await pause(120);
    const settings_before=localStorage.getItem('linux-note-terminal:v1:');
    core.app.commands.run('linux_note:terminal_settings');
    for(let i=0;i<100&&!popup()?.querySelector('[data-setting=font_size]');i++)await pause(50);
    assert(!!popup()?.querySelector('[data-setting=font_size]'),'真实终端设置就绪');
    geometry(name+'/'+zoom+'终端设置');
    if(zoom===1){
     const stage='dialog_'+name.toLowerCase();fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}));
     for(let i=0;i<100;i++){try{if(JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'' )).stage===stage)break;}catch{}await pause(50);}
    }
    popup().querySelector('[data-setting=font_size]').value='26';popup().querySelector('.workspace-dialog-close').click();
    assert(!popup()&&localStorage.getItem('linux-note-terminal:v1:')===settings_before,'关闭设置不应用草稿');
    core.app.commands.run('typora_code:check_update');await pause(30);geometry(name+'/'+zoom+'更新检查');
    popup().querySelector('.workspace-dialog-close').click();assert(signal.aborted&&!popup(),'标题关闭取消检查请求');resolve_check(null);await pause(20);
   }
  }
  core.app.commands.run('typora_code:check_update');await pause(30);
  const candidate=JSON.parse(JSON.stringify(release));candidate.releases[0].sequence++;candidate.releases[0].version='9999.1';
  resolve_check({release:candidate,commit:'a'.repeat(40)});await pause(50);geometry('新版本公告');
  popup().querySelector('.workspace-dialog-close').click();assert(install_count===0&&!popup(),'公告关闭等同稍后，未开始安装');
  core.app.commands.run('typora_code:check_update');await pause(30);resolve_check({release:candidate,commit:'a'.repeat(40)});await pause(50);
  [...popup().querySelectorAll('button')].find(b=>b.textContent==='立即更新').click();await pause(50);geometry('安装进度');
  popup().querySelector('.workspace-dialog-close').click();assert(!popup()&&install_count===1&&cancel_count===0,'关闭安装进度不取消任务');
  for(let i=0;i<20;i++){core.app.commands.run('typora_code:check_update');await pause(0);popup().querySelector('.workspace-dialog-close').click();resolve_check(null);await pause(0);assert(!popup(),'重复标题关闭无遗留 '+i);}
  assert(fs.readFileSync(document_file,'utf8')===before,'宿主文档未改变');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'正式资产和原始Typora；真实命令及DOM点击，无物理输入；更新服务替身，不联网安装'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
 finally{Object.assign(service,saved);}
})();
