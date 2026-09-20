// 原始宿主独立副本及真实ConPTY；不修改用户文档、配置或运行窗口。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')];
 const command=name=>core.app.commands.run('linux_note:'+name);
 const terminal=()=>document.querySelector('.linux-note-terminal');
 const document_file=path.join(base,'workspace/front.md'),before=fs.readFileSync(document_file,'utf8');
 try{
  for(let i=0;i<100&&(File.isFileLoading()||!File.bundle.filePath.endsWith('front.md'));i++)await pause(50);
  await pause(2400);
  for(let round=0;round<3;round++){
   const started=performance.now(),stages=[];command('terminal_toggle');
   const surface=terminal(),panel=document.querySelector('.typora-terminal-panel');
   assert(surface&&!panel.hidden,'命令返回前已有可见终端面板 '+round);
   assert(surface.dataset.state==='starting'&&surface.getAttribute('aria-busy')==='true','真实进程未启动时显示忙碌状态 '+round);
   const observer=new MutationObserver(()=>{const label=surface.querySelector('[role=status]').textContent;if(stages.at(-1)?.label!==label)stages.push({ms:performance.now()-started,label,state:surface.dataset.state});});
   observer.observe(surface,{subtree:true,characterData:true,childList:true,attributes:true,attributeFilter:['data-state','aria-busy']});
   await new Promise(requestAnimationFrame);const frame_ms=performance.now()-started;
   const rect=surface.getBoundingClientRect();assert(rect.width>100&&rect.height>100,'下一绘制帧终端布局完整 '+round);
   for(let i=0;i<400&&surface.getAttribute('aria-busy')==='true';i++)await pause(25);
   observer.disconnect();
   assert(surface.dataset.state==='running'&&Number(surface.dataset.pid)>0,'真实Shell已启动 '+round);
   assert(surface.getAttribute('aria-busy')==='false'&&surface.querySelector('[role=progressbar]').hidden,'首次真实输出结束启动进度 '+round);
   samples.push({round,frame_ms,output_ms:performance.now()-started,stages,pid:Number(surface.dataset.pid),width:rect.width,height:rect.height});
   const pid=surface.dataset.pid;command('terminal_toggle');command('terminal_toggle');
   assert(terminal()===surface&&surface.dataset.pid===pid,'隐藏重开复用同一真实终端 '+round);
   command('terminal_kill');assert(!terminal(),'终止清理表面及进度节点 '+round);await pause(150);
  }
  for(let round=0;round<20;round++){
   command('terminal_toggle');assert(terminal()?.dataset.state==='starting','快速打开先展示启动状态 '+round);
   command('terminal_kill');await pause(15);assert(!terminal(),'立即终止不恢复迟到会话 '+round);
  }
  assert(!document.querySelector('.typora-terminal-panel [role=progressbar]'),'启动取消无遗留进度节点');
  assert(fs.readFileSync(document_file,'utf8')===before,'原生文档磁盘正文保持');
  samples.push({viewport:{width:innerWidth,height:innerHeight,dpi:devicePixelRatio,zoom:reqnode('electron').webFrame.getZoomFactor()},asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex')});
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,limits:'真实宿主与本机默认Shell、ConPTY；通过命令入口触发，无物理输入，不代表所有用户Shell配置的启动耗时'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples},null,2));}
 finally{command('terminal_kill');}
})();
