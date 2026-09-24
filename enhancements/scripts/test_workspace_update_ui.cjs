// 隐藏Electron；服务替身只替换网络和安装，不写真实用户目录。
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora-update-ui-'));app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();
let win;const checks=[];
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:900,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});await win.loadURL('about:blank');
 const evaluate=code=>win.webContents.executeJavaScript(code),delay=ms=>new Promise(r=>setTimeout(r,ms)),check=async(code,label)=>{assert(await evaluate(code),label);checks.push(label);};
 await win.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'));
 const bundle=await require('esbuild').build({plugins:require('./editor_bundle.cjs').editor_plugins(),stdin:{contents:'export {bind_workspace_update} from "./src/workspace_update";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,loader:{'.css':'text'},globalName:'update_qa'});await evaluate(bundle.outputFiles[0].text);
 const current=JSON.parse(fs.readFileSync(path.join(__dirname,'../release.json'),'utf8'));
 await evaluate(`window.commands=new Map();window.calls=[];window.service={update_paths:user_data=>({state_root:require("path").join(user_data,"temp","typora_code_updates")}),installed_identity:()=>window.identity||null,release_info:value=>value,session_identity:async()=>'12-34',claim_startup:()=>{calls.push('claim');return true;},check_update:async()=>{calls.push('check');return {commit:'a'.repeat(40),commit_message:'固定提交ZIP更新',release:{releases:[{sequence:${current.releases[0].sequence+1},version:'next',date:'2026-09-20',notes:['<img src=x onerror=alert(1)>','修复目录刷新']}]}};},start_update:()=>{calls.push('install');return 'job';},status_of:()=>{if(window.read_failure)throw Error('状态暂不可读');return {phase:window.phase||'downloading',message:'进度',bytes:window.bytes,total_bytes:window.total_bytes}},cancel_update:()=>calls.push('cancel')};window.reqnode=name=>name.endsWith('workspace_update_service.cjs')?service:name==='process'?{platform:'win32',ppid:12,execPath:'X:/Typora/Typora.exe'}:name==='fs'?{readFileSync:file=>{if(file.endsWith('release.json')&&window.release_unreadable)throw Error('release unreadable');if(file.endsWith('release.json')&&window.disk_release)return JSON.stringify(window.disk_release);if(file.endsWith('active_job.json')){if(window.active_job)return JSON.stringify({job:'job'});throw Error('ENOENT');}return JSON.stringify(file.endsWith('runtime.json')?{node_version:'24.20.0'}:${JSON.stringify(current)});},mkdirSync(){},appendFileSync(){}}:require(name);window._options={userDataPath:${JSON.stringify(root)}};window[Symbol.for('typora-code:workspace')]={app:{settings:{get:()=>({proxy_mode:'direct',proxy_url:'',ca_file:''})},commands:{register(command){commands.set(command.id,command.callback);return ()=>commands.delete(command.id);}}}};window.binding=update_qa.bind_workspace_update();void 0;`);
 const version_check=label=>check(`document.querySelector('.workspace-update-version')?.textContent.includes('当前运行版本：${current.releases[0].version}')`,label);
 await delay(2150);await check("calls.filter(x=>x==='check').length===1&&document.querySelectorAll('[role=dialog]').length===1",'启动异步检查一次并打开公告');
 await version_check('新版公告显示实际运行版本');
 await check("document.querySelector('[role=dialog]').textContent.includes('可更新版本：next')",'目标版本独立标明');
 await check("document.querySelector('[role=dialog]').textContent.includes('<img src=x onerror=alert(1)>')&&!document.querySelector('[role=dialog] img')",'公告作为纯文本，不执行HTML');
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='稍后').click()");await check("!document.querySelector('[role=dialog]')&&!calls.includes('install')",'稍后关闭不下载或安装');
 await evaluate("commands.get('typora_code:check_update')();commands.get('typora_code:check_update')();");await delay(30);await check("document.querySelectorAll('[role=dialog]').length===1&&calls.filter(x=>x==='check').length===2",'重复手动检查只开一个弹窗');
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='立即更新').click()");await delay(30);await check("calls.filter(x=>x==='install').length===1&&document.querySelector('[role=dialog]').textContent.includes('取消下载')",'选择更新一次启动任务并显示进度');
 await version_check('下载进度显示实际运行版本');
 await check("!document.querySelector('[role=progressbar]').hidden&&!document.querySelector('[role=progressbar]').hasAttribute('aria-valuenow')",'未知下载总量使用活动条，不冒充百分比');
 const motion=await evaluate("getComputedStyle(document.querySelector('.workspace-progress-bit')).transform");await delay(180);
 await check(`getComputedStyle(document.querySelector('.workspace-progress-bit')).transform!==${JSON.stringify(motion)}`,'等待网络期间进度条实际运动');
 await evaluate("window.bytes=524288;window.total_bytes=1048576");await delay(400);
 await check("document.querySelector('[role=progressbar]').getAttribute('aria-valuenow')==='50'&&document.querySelector('[role=dialog]').textContent.includes('0.5 MB / 1.0 MB（50%）')",'已知总量显示真实下载量和50%');
 await evaluate("window.bytes=1048576");await delay(400);
 await check("document.querySelector('[role=progressbar]').getAttribute('aria-valuenow')==='100'",'下载完成显示100%');
 await evaluate("window.phase='verifying'");await delay(400);
 await check("!document.querySelector('[role=progressbar]').hasAttribute('aria-valuenow')&&!document.querySelector('[role=dialog]').textContent.includes('100%')",'校验解压移除下载百分比并持续活动');
 await evaluate("window.read_failure=true");await delay(400);
 await check("document.querySelector('[role=progressbar]').hidden&&document.querySelector('[role=status]').textContent.includes('暂时无法读取')",'读取状态失败不保留虚假活动，明确提示');
 await evaluate("window.read_failure=false;window.active_job=true;document.querySelector('[role=dialog] button').click();commands.get('typora_code:check_update')()");await delay(40);
 await check("document.querySelectorAll('[role=progressbar]').length===1&&!document.querySelector('[role=progressbar]').hidden&&calls.filter(x=>x==='install').length===1",'关闭再检查恢复同一后台任务，不重复安装');
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='取消下载').click()");
 await check("document.querySelector('[role=status]').textContent.includes('正在取消')",'取消点击立即给出反馈');
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='取消下载').click();window.phase='installing'");await delay(400);await check("calls.includes('cancel')&&[...document.querySelectorAll('button')].find(b=>b.textContent==='取消下载').disabled",'只在下载校验阶段可取消，安装阶段禁用取消');
 await check("!document.querySelector('[role=progressbar]').hidden&&!document.querySelector('[role=progressbar]').hasAttribute('aria-valuenow')",'安装使用活动条不伪造进度');
 await evaluate(`window.disk_release=${JSON.stringify(current)};disk_release.releases[0]={...disk_release.releases[0],sequence:disk_release.releases[0].sequence+1,version:'installed-next'};window.phase='succeeded'`);await delay(400);await check("![...document.querySelectorAll('button')].some(b=>b.textContent==='取消下载')",'成功停止轮询与取消入口');
 await check("document.querySelector('[role=progressbar]').getAttribute('aria-valuenow')==='100'&&document.querySelector('[role=progressbar]').getAttribute('aria-busy')==='false'",'成功后停止动画显示完成');
 await version_check('安装成功仍显示旧窗口运行版本');
 await check("document.querySelector('.workspace-update-version').textContent.includes('已安装版本：installed-next（重启后生效）')",'安装后明确区分磁盘版本与当前运行版本');
 await evaluate('window.disk_release=null');
 await evaluate("window.active_job=false;document.querySelector('[role=dialog] button').click();window.identity={commit:'b'.repeat(40),basis:'installed-archive'};commands.get('typora_code:check_update')()");await delay(30);await check("document.querySelector('[role=dialog]').textContent.includes('手动重启')",'同版本提交变化提示手动重启');await version_check('同版本新提交待重启仍显示运行版本');await check("document.querySelector('.workspace-update-version').textContent.includes('（重启后生效）')",'同序号不同提交保留重启标记');await evaluate('window.identity=null');
 await evaluate('binding.dispose()');await check("!document.querySelector('[role=dialog]')&&commands.size===0",'销毁清理弹窗、命令及定时器');
 await evaluate("service.check_update=async()=>{throw Error('offline')};window.binding=update_qa.bind_workspace_update();commands.get('typora_code:check_update')()");await delay(30);await check("document.querySelector('[role=dialog]').textContent.includes('offline')",'手动失败展示错误');await version_check('离线失败仍可读当前运行版本');await evaluate("document.querySelector('[role=dialog] button').click();commands.get('typora_code:check_update')()");await delay(30);await check("document.querySelector('[role=dialog]').textContent.includes('offline')",'关闭失败弹窗后可以再次检查');await evaluate('binding.dispose()');
 // 直接重试必须由真实按钮进入同一检查，不再要求先关闭结果窗。
 await evaluate("window.retry_pending=[];service.check_update=(_current,options)=>new Promise((resolve,reject)=>retry_pending.push({resolve,reject,signal:options.signal}));window.binding=update_qa.bind_workspace_update();commands.get('typora_code:check_update')()");
 for(let i=0;i<20;i++){
  await evaluate(`retry_pending[${i}].reject(Error('offline retry'))`);await delay(20);
  await check("[...document.querySelectorAll('button')].some(b=>b.textContent==='重试')&&[...document.querySelectorAll('button')].some(b=>b.textContent==='关闭')",'失败结果提供关闭及重试 '+i);
  await evaluate("window.stale_retry=[...document.querySelectorAll('button')].find(b=>b.textContent==='重试')");
  if(i===0){win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await delay(20);await check("document.activeElement?.textContent==='重试'",'Tab可到达重试');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await delay(20);}
  else await evaluate('stale_retry.click()');
  await evaluate('stale_retry.click();stale_retry.click()');
  await check(`retry_pending.length===${i+2}&&document.querySelectorAll('[role=dialog]').length===1&&document.querySelector('[role=status]').textContent==='正在检查更新…'`,'重试立即显示进度且旧按钮/连点不重复请求 '+i);
 }
 await evaluate('retry_pending[20].resolve(null)');await delay(20);
 await check("document.querySelector('[role=dialog]').textContent.includes('最新发布版本')&&![...document.querySelectorAll('button')].some(b=>b.textContent==='重试')",'重试成功替换结果并撤下重试');
 await evaluate('binding.dispose();stale_retry.click()');
 await check("retry_pending.length===21&&!document.querySelector('[role=dialog]')",'销毁后的旧重试按钮不能重新检查');
 // 可控慢响应验证点击当帧反馈及旧请求隔离；不连接真实更新服务器。
 await evaluate("window.pending=[];service.check_update=(_current,options)=>new Promise((resolve,reject)=>{pending.push({resolve,reject,signal:options.signal})});window.binding=update_qa.bind_workspace_update();commands.get('typora_code:check_update')()");
 await check("document.querySelector('[role=status]').textContent==='正在检查更新…'&&pending.length===1&&!pending[0].signal.aborted",'慢网络开始即显示状态及可取消检查');
 await version_check('慢网络开始当帧显示运行版本');
 await check("document.querySelector('[role=progressbar]')&&!document.querySelector('[role=progressbar]').hidden&&!document.querySelector('[role=progressbar]').hasAttribute('aria-valuenow')",'手动检查当帧显示未知总量活动条');
 await evaluate("for(let i=0;i<20;i++)commands.get('typora_code:check_update')()");
 await check("pending.length===1&&document.querySelectorAll('[role=dialog]').length===1",'连续20次点击共用同一检查');
 await evaluate("pending[0].resolve(null)");await delay(30);
 await check("document.querySelector('[role=dialog]').textContent.includes('最新发布版本')&&!document.querySelector('[role=status]')",'慢请求完成后替换为最新版本结果');
 await version_check('无更新结果显示运行版本');
 await evaluate("document.querySelector('[role=dialog] button').click();commands.get('typora_code:check_update')();document.querySelector('[role=dialog] button').click();commands.get('typora_code:check_update')()");
 await check("pending[1].signal.aborted&&!pending[2].signal.aborted&&document.querySelector('[role=status]')",'取消请求后立即重试使用新信号');
 await evaluate("pending[1].resolve({commit:'a'.repeat(40),release:{releases:[]}})");await delay(30);
 await check("document.querySelectorAll('[role=dialog]').length===1&&document.querySelector('[role=status]')&&!pending[2].signal.aborted",'旧检查迟到成功及finally不覆盖新检查');
 await evaluate("pending[2].reject(Error('更新服务器响应超时。'))");await delay(30);
 await check("document.querySelector('[role=dialog]').textContent.includes('超时')&&document.querySelector('[role=dialog]').textContent.includes('重试')",'网络超时明确显示失败与重试提示');
 await evaluate("document.querySelector('[role=dialog] button').click();commands.get('typora_code:check_update')();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',bubbles:true}));pending[3].reject(Error('late failure'))");await delay(30);
 await check("pending[3].signal.aborted&&!document.querySelector('[role=dialog]')",'Esc取消后迟到失败不重开错误弹窗');
 await evaluate("commands.get('typora_code:check_update')();binding.dispose();pending[4].resolve(null)");await delay(30);
 await check("pending[4].signal.aborted&&!document.querySelector('[role=dialog]')&&commands.size===0",'检查中销毁取消网络及迟到结果');
 await evaluate("window.pending=[];window.binding=update_qa.bind_workspace_update();void 0");await delay(2150);
 await check("pending.length===1&&!document.querySelector('[role=dialog]')",'自动检查待响应时保持后台静默');
 await evaluate("commands.get('typora_code:check_update')()");
 await check("pending.length===1&&document.querySelector('[role=status]')",'手动入口把后台检查转为可见且不另发请求');
 await evaluate("pending[0].resolve(null)");await delay(30);
 await check("document.querySelector('[role=dialog]').textContent.includes('最新发布版本')",'转为手动后的后台检查也显示完成结果');
 await evaluate("binding.dispose();window.pending=[];window.binding=update_qa.bind_workspace_update();void 0");await delay(2150);await evaluate("pending[0].reject(Error('background offline'))");await delay(30);
 await check("!document.querySelector('[role=dialog]')",'未手动介入的后台网络失败仍保持静默');await evaluate('binding.dispose()');
 // 窄窗口、缩放和主题只改变外观，不改变任务状态；结束与反复展示释放共享样式。
 await evaluate("window.active_job=true;window.phase='installing';window.binding=update_qa.bind_workspace_update();commands.get('typora_code:check_update')()");await delay(30);
 for(const zoom of [1,1.25])for(const color of ['rgb(14, 112, 192)','rgb(77, 170, 255)']){
  win.webContents.setZoomFactor(zoom);win.setSize(480,480);await evaluate(`document.documentElement.style.setProperty('--vscode-progressBar-background',${JSON.stringify(color)})`);await delay(60);
  await check(`(()=>{const bar=document.querySelector('[role=progressbar]'),r=bar.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&getComputedStyle(bar).height==='2px'&&getComputedStyle(bar.firstElementChild).backgroundColor===${JSON.stringify(color)}})()`,'进度在窄窗口/缩放/主题下可见 '+zoom+' '+color);
 }
 for(const phase of ['failed','cancelled']){
  await evaluate(`window.phase=${JSON.stringify(phase)}`);await delay(400);
  await check("document.querySelector('[role=progressbar]').hidden&&!document.querySelector('[role=dialog]').textContent.includes('取消下载')",phase+'停止活动并移除取消入口');
  await evaluate("document.querySelector('[role=dialog] button').click();window.phase='installing';commands.get('typora_code:check_update')()");await delay(30);
 }
 await evaluate('binding.dispose()');
 await check("!document.querySelector('[role=progressbar]')&&!document.getElementById('typora-code-workspace-progress')",'所有更新视图销毁后无进度节点或样式残留');
 await evaluate("window.release_unreadable=true;window.active_job=false;window.binding=update_qa.bind_workspace_update();commands.get('typora_code:check_update')()");await delay(30);
 await version_check('磁盘发行信息不可读不丢失运行版本');
 await check("document.querySelector('.workspace-update-version').textContent.includes('已安装版本：暂时无法读取')",'磁盘读取失败明确标记而不伪造安装版本');
 await evaluate('binding.dispose()');
 fs.writeFileSync(path.join(root,'checks.json'),JSON.stringify({checks}));console.log(JSON.stringify({status:'PASS',checks,evidence:root},null,2));win.destroy();app.exit(0);
}).catch(error=>{console.error(error);console.error(root);win?.destroy();app.exit(1)});
