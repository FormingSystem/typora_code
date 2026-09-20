// 在隔离宿主 head 内、候选脚本之前执行；不依赖尚未就绪的宿主 API。
(()=>{
 const samples=[],long_tasks=[];
 const probe=window.startup_timing_probe={samples,long_tasks,started:performance.now(),running:true,head_runtime:{require:typeof window.require,reqnode:typeof window.reqnode,options:typeof window._options,user_data:!!window._options?.userDataPath}};
 // 可选 CPU 归因仅用于专属测试进程；不开调试端口，不修改生产宿主。
 try{
  const node_require=window.reqnode||window.require;
  if(node_require&&node_require('process').env.TYPORA_STARTUP_CPU_PROFILE==='1'){
   const session=new (node_require('inspector').Session)();session.connect();
   const post=(method)=>new Promise((resolve,reject)=>session.post(method,(error,result)=>error?reject(error):resolve(result)));
   const started=post('Profiler.enable').then(()=>post('Profiler.start'));
   probe.stop_profile=async()=>{try{await started;return (await post('Profiler.stop')).profile;}finally{session.disconnect();}};
  }
 }catch(error){probe.profile_error=String(error);}
 try{probe.observer=new PerformanceObserver(list=>long_tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration,name:e.name}))));probe.observer.observe({type:'longtask',buffered:true});}catch{}
 let previous='';
 function frame(){
  if(!probe.running)return;
  const root=document.documentElement,body=document.body,title=document.querySelector('#top-titlebar'),content=document.querySelector('content');
  const write=document.querySelector('#write'),workspace=document.querySelector('.typ-workspace-root');
  const workspace_visibility=workspace?getComputedStyle(workspace).visibility:'absent';
  if(workspace_visibility==='visible'&&!probe.first_visible_root){probe.first_visible_root=workspace;probe.first_visible_write=write;}
  const state={body:!!body,ready:root.dataset.linuxNoteWorkspaceBrowser||'',title:title?.dataset.workspaceTitlebar||'',shown:!!body?.classList.contains('pin-outline'),visibility:content?getComputedStyle(content).visibility:'absent',write_visibility:write?getComputedStyle(write).visibility:'absent',workspace_visibility,overlay:body?getComputedStyle(body,'::after').content:'none',loading:root.dataset.typoraCodePresentation||'',left:content?.getBoundingClientRect().left??null};
  const key=JSON.stringify(state);if(key!==previous){samples.push({time:performance.now(),...state});previous=key;}
  probe.frame=requestAnimationFrame(frame);
 }
 probe.frame=requestAnimationFrame(frame);
 probe.stop=()=>{probe.running=false;cancelAnimationFrame(probe.frame);probe.observer?.disconnect();};
})();
