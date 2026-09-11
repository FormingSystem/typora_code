// 两个真实隐藏 renderer 的 BroadcastChannel 移交；不启动或改写用户 Typora。
const {app,BrowserWindow,ipcMain,screen}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {build}=require('esbuild');
for(const stream of [process.stdout,process.stderr])stream.on('error',()=>app.exit(1));
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_detached_window_'));
app.setPath('userData',path.join(evidence,'user_data'));app.disableHardwareAcceleration();
const windows=[];let bundle,html,source,last_child,mode='normal',launches=0;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=(win,code)=>win.webContents.executeJavaScript(code).catch(error=>{throw new Error(code+': '+error.message);});
const wait=async(win,code)=>{for(let i=0;i<180;i++){if(await evaluate(win,code))return;await delay(20);}throw Error('Timed out: '+code);};
const open=async(anchor='')=>{
  const win=new BrowserWindow({show:false,width:720,height:480,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});windows.push(win);
  await win.loadFile(html);await evaluate(win,bundle);
  await evaluate(win,`window.notices=[];window.releases=0;window.received=[];window.block_import=false;window.capture_error=false;window.changed=false;window.leaf={state:{path:'/workspace/example.c'},parent:{},view:{containerEl:document.body},containerEl:document.body};
    window._options={initFilePath:'',initAnchor:${JSON.stringify(anchor)}};
    window.File={option:{initAnchor:${JSON.stringify(anchor)}},bundle:{filePath:''},changeCounter:{isDocumentEdited:()=>false}};
    window.files={core:{app:{workspace:{activeLeaf:leaf,eachLeaves:callback=>callback(leaf)}}},
      capture_transfer:async()=>{if(capture_error)throw Error('文件正在保存');return {schema:1,kind:'source',file_path:'/workspace/example.c',root:'/workspace',text:'int dirty_value = 7;',dirty:true};},
      receive_transfer:async(snapshot,target,signal)=>{if(target.group!==leaf.parent)throw Error('wrong target group');window.last_index=target.index;received.push(snapshot);if(block_import)await new Promise(resolve=>window.finish_import=resolve);if(signal.aborted)throw Error('cancelled');},
      release_transfer:async(target,snapshot,signal)=>{if(signal.aborted)return false;if(changed)return false;releases++;return target===leaf&&snapshot.text==='int dirty_value = 7;';}
    };
    window.install=(initial_anchor='',timeout_ms=1800,extra={})=>{window.binding=detach_qa.bind_workspace_detached_window(files,{initial_anchor,timeout_ms,notify:message=>notices.push(message),open_window:(anchor,root)=>require('electron').ipcRenderer.invoke('fixture:open-window',anchor,root),...extra});};
    install(${JSON.stringify(anchor)});
    window.start_drag=()=>{window.token=crypto.randomUUID();document.dispatchEvent(new CustomEvent('typora-code:tab-drag-start',{detail:{leaf,transfer_token:token}}));return token;};
    window.end_drag=(extra={})=>document.dispatchEvent(new CustomEvent('typora-code:tab-drag-end',{detail:{leaf,transfer_token:token,screen_x:screenX+outerWidth+80,screen_y:screenY+100,drop_effect:'none',...extra}}));
    window.detach=()=>{start_drag();end_drag();};void 0;`);
  return win;
};
app.whenReady().then(async()=>{
  html=path.join(evidence,'window.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><p>Independent transfer fixture</p>');
  bundle=(await build({stdin:{contents:'export {bind_workspace_detached_window} from "./src/workspace_detached_window";',resolveDir:path.join(__dirname,'..')},bundle:true,format:'iife',globalName:'detach_qa',loader:{'.css':'text'},write:false})).outputFiles[0].text;
  ipcMain.handle('fixture:open-window',async(_event,anchor,root)=>{
    launches++;assert.match(anchor,/^#typora-code-window-[0-9a-f-]{36}$/);assert.equal(root,'/workspace');
    if(mode==='fail')throw Error('原生窗口创建失败');
    if(mode==='timeout')return {winId:99};
    last_child=await open(anchor);if(mode==='blocked')await evaluate(last_child,'block_import=true;void 0');
    return {winId:last_child.id};
  });
  source=await open();
  await evaluate(source,'detach()');
  await wait(source,'releases===1');
  assert.equal(await evaluate(last_child,'received.length'),1);
  assert.equal(await evaluate(last_child,'received[0].text'),'int dirty_value = 7;');
  assert.deepEqual(await evaluate(source,'notices'),[]);
  assert.deepEqual(await evaluate(last_child,'[_options.initAnchor,File.option.initAnchor]'),['',''],'both native anchor owners consume the safe fragment');
  // 同窗、取消、侧栏、标题栏落下均不创建窗口。实际窗口尺寸决定边界。
  for(const detail of [{local_drop:true},{cancelled:true},{screen_x:0,screen_y:0},await evaluate(source,'({screen_x:screenX+20,screen_y:screenY+30})')]){
    await evaluate(source,`start_drag();end_drag(${JSON.stringify(detail)});void 0`);
  }
  await delay(100);assert.equal(launches,1);
  const merge_target=await open();
  const merge_token=await evaluate(source,'start_drag()');
  assert.equal(await evaluate(merge_target,`document.dispatchEvent(new CustomEvent('typora-code:tab-drop',{cancelable:true,detail:{transfer_token:${JSON.stringify(merge_token)},target_group:leaf.parent,target_index:3}}))`),false);
  await evaluate(source,"end_drag({drop_effect:'move'});void 0");
  await wait(source,'releases===2');assert.equal(launches,1,'merging into an existing window creates no extra window');
  assert.equal(await evaluate(merge_target,'last_index'),3,'existing window receives the actual insertion point');
  assert.equal(await evaluate(merge_target,'received.length'),1);
  // 无有效令牌的既有空窗不能接收另一个窗口的正文。
  const unrelated=await open();
  assert.equal(await evaluate(unrelated,'received.length'),0);
  await evaluate(source,'changed=true;detach();void 0');await wait(source,'notices.length===1');
  assert.equal(await evaluate(source,'releases'),2,'changed source remains open after target ACK');
  assert.match(await evaluate(source,'notices[0]'),/保留/);
  await evaluate(source,'changed=false;notices=[];capture_error=true;detach();void 0');await wait(source,'notices.length===1');
  assert.equal(launches,2,'invalid source never creates a new window');
  mode='fail';await evaluate(source,'capture_error=false;notices=[];detach();void 0');await wait(source,'notices.length===1');
  assert.equal(await evaluate(source,'releases'),2,'failed native creation retains original');
  mode='timeout';await evaluate(source,'notices=[];detach();detach();void 0');await wait(source,'notices.length===1');
  assert.equal(launches,4,'repeated drag while transfer pending creates one window');
  assert.equal(await evaluate(source,'releases'),2,'missing receiver timeout retains original');
  // 捕获还未创建窗口时，慢盘也必须能取消并允许重试。
  await evaluate(source,`notices=[];window.capture_original=files.capture_transfer;files.capture_transfer=async(target,signal)=>{window.capture_signal=signal;await new Promise(resolve=>window.finish_capture=resolve);return capture_original();};detach();void 0`);
  await wait(source,'notices.length===1');assert.equal(await evaluate(source,'capture_signal.aborted'),true);
  await evaluate(source,'finish_capture();files.capture_transfer=capture_original;void 0');await delay(100);
  assert.equal(launches,4,'late capture result does not create a window after cancellation');
  // ACK不能撤销总超时；磁盘复查悬挂时仍可取消，迟到结果不能删来源。
  mode='normal';await evaluate(source,`notices=[];files.release_transfer=async(target,snapshot,signal)=>{window.release_started=true;await new Promise(resolve=>window.finish_release=resolve);if(signal.aborted)return false;releases++;return true;};detach();void 0`);
  await wait(source,'window.release_started===true');await wait(source,'notices.length===1');
  await evaluate(source,'finish_release();void 0');await delay(100);
  assert.equal(await evaluate(source,'releases'),2,'ACK retains a bounded release deadline');
  await evaluate(source,'window.release_started=false;void 0');
  // 释放期间卸载应使 AbortSignal 失效，迟到结果不能再删来源。
  mode='normal';await evaluate(source,`notices=[];files.release_transfer=async(target,snapshot,signal)=>{window.release_started=true;await new Promise(resolve=>window.finish_release=resolve);if(signal.aborted)return false;releases++;return true;};detach();void 0`);
  await wait(source,'window.release_started===true');await evaluate(source,'binding.dispose();finish_release();void 0');await delay(150);
  assert.equal(await evaluate(source,'releases'),2);
  const previous_launches=launches;await evaluate(source,'detach();void 0');await delay(100);assert.equal(launches,previous_launches,'disposed binder no longer handles drags');
  // Closing uses a real removal from eachLeaves, unlike the reusable transport
  // fixture above. A native query may yield while the user starts another draft.
  const lifecycle=await open(),close_checks=[];
  for(const scenario of ['query_new_dirty','query_new_text','query_dispose','query_loading','query_saving','query_switching','query_init_parse','main_window','another_leaf','loading','saving','switching','init_parse','clean_auxiliary','shared_dirty_auxiliary']){
    const auxiliary=scenario!=='main_window',dirty=scenario.startsWith('query_')||scenario==='shared_dirty_auxiliary';
    await evaluate(lifecycle,`binding.dispose();window.peer?.close();window.notices=[];window.releases=0;window.native_calls=[];window.native_dirty=${dirty};window.native_text='original markdown draft';window.query_pending=${scenario.startsWith('query_')};window.release_native_query=null;window.owned_leaves=[leaf];leaf.state.path='/workspace/example.md';files.core.app.workspace.eachLeaves=callback=>owned_leaves.forEach(callback);File.bundle={filePath:'/workspace/example.md',savedContent:'saved markdown baseline'};File.editor={getMarkdown:()=>native_text};File.changeCounter.isDocumentEdited=()=>native_dirty;window.native_loading=false;File.isFileLoading=()=>native_loading;File.inSavingProcess=false;File._onFileSwitching=false;File._onInitParse=false;window.JSBridge={invoke:async command=>{native_calls.push(command);if(command==='document.noOtherWindow')return query_pending?new Promise(resolve=>release_native_query=resolve):false;}};files.capture_transfer=async()=>({schema:1,kind:'markdown',file_path:'/workspace/example.md',root:'/workspace',text:native_text,dirty:native_dirty,markdown_baseline:'saved markdown baseline'});files.release_transfer=async(target,snapshot,signal)=>{if(signal.aborted)return false;owned_leaves=owned_leaves.filter(item=>item!==target);${scenario === 'another_leaf' ? "owned_leaves.push({state:{path:'/workspace/another.c'},parent:leaf.parent});" : ''}${scenario === 'loading' ? 'native_loading=true;' : ''}${scenario === 'saving' ? 'File.inSavingProcess=true;' : ''}${scenario === 'switching' ? 'File._onFileSwitching=true;' : ''}${scenario === 'init_parse' ? 'File._onInitParse=true;' : ''}releases++;return true;};install(${auxiliary ? "'#typora-code-window-'+crypto.randomUUID()" : "''"});start_drag();window.peer_id=crypto.randomUUID();window.peer=new BroadcastChannel('typora-code:tab-transfer:'+token);peer.onmessage=event=>{if(event.data.kind==='payload')peer.postMessage({kind:'accepted',peer_id})};peer.postMessage({kind:'ready',peer_id});void 0`);
    await wait(lifecycle,'releases===1');
    if(scenario.startsWith('query_')){
      await wait(lifecycle,"typeof release_native_query==='function'");
      await evaluate(lifecycle,({query_new_dirty:"File.bundle.filePath='';native_text='new user draft';",query_new_text:"native_text='user edited the same document during native query';",query_dispose:'binding.dispose();',query_loading:'native_loading=true;',query_saving:'File.inSavingProcess=true;',query_switching:'File._onFileSwitching=true;',query_init_parse:'File._onInitParse=true;'}[scenario])+"release_native_query(false);void 0");
    }
    await delay(100);
    const calls=await evaluate(lifecycle,'native_calls');
    assert.equal(calls.filter(command=>command==='window.close').length,['clean_auxiliary','shared_dirty_auxiliary'].includes(scenario)?1:0,`${scenario}: only an unchanged empty auxiliary window may close`);
    assert.equal(await evaluate(lifecycle,'owned_leaves.length'),scenario==='another_leaf'?1:0,'the close guard was reached after the source leaf was really removed');
    close_checks.push({scenario,calls});
  }
  await evaluate(lifecycle,'binding.dispose();peer.close();void 0');

  // Failure injection uses the same public channel seam; never replace the
  // binder or invoke private callbacks directly. Exceptions must not strand a
  // pending leaf/token, bypass cancellation, or stop cleanup of other channels.
  const failures=await open();
  await evaluate(failures,`binding.dispose();window.channel_attempts=0;window.channels=[];window.constructor_failures=0;window.post_failure=false;window.channel_errors=[];window.capture_signals=[];window.owned_leaves=[leaf];files.core.app.workspace.eachLeaves=callback=>owned_leaves.forEach(callback);window.addEventListener('error',event=>{channel_errors.push(event.message);event.preventDefault()});window.channel_factory=name=>{channel_attempts++;if(constructor_failures-->0)throw Error('controlled channel constructor failure');const channel={name,onmessage:null,onmessageerror:null,closed:0,messages:[],postMessage(message){if(post_failure)throw Error('controlled channel post failure');this.messages.push(message)},close(){this.closed++}};channels.push(channel);return channel;};window.setup_failures=()=>{binding.dispose();channels=[];channel_attempts=0;constructor_failures=0;post_failure=false;notices=[];channel_errors=[];owned_leaves=[leaf];capture_signals=[];install('',1800,{channel:channel_factory});};window.offer_drop=(transfer_token=crypto.randomUUID())=>document.dispatchEvent(new CustomEvent('typora-code:tab-drop',{cancelable:true,detail:{transfer_token,target_group:leaf.parent,target_index:0}}));void 0`);
  await evaluate(failures,'setup_failures();constructor_failures=1;start_drag();start_drag();end_drag({cancelled:true});void 0');
  assert.deepEqual(await evaluate(failures,'[channel_attempts,channels.length,channels[0]?.closed,channel_errors.length]'),[2,1,1,0],'source channel construction failure must release the pending leaf so retry succeeds');
  await evaluate(failures,'setup_failures();constructor_failures=1;window.retry_token=crypto.randomUUID();offer_drop(retry_token);offer_drop(retry_token);binding.dispose();void 0');
  assert.deepEqual(await evaluate(failures,'[channel_attempts,channels.length,channels[0]?.closed,channel_errors.length]'),[2,1,1,0],'receiver construction failure must release the token so retry succeeds');
  await evaluate(failures,'setup_failures();start_drag();post_failure=true;end_drag({cancelled:true});post_failure=false;start_drag();end_drag({cancelled:true});void 0');
  assert.deepEqual(await evaluate(failures,'[channel_attempts,channels.map(channel=>channel.closed),channel_errors.length]'),[2,[1,1],0],'a failing cancellation post still closes the sender and permits another drag');
  await evaluate(failures,'setup_failures();window.retry_token=crypto.randomUUID();post_failure=true;offer_drop(retry_token);post_failure=false;offer_drop(retry_token);binding.dispose();void 0');
  assert.deepEqual(await evaluate(failures,'[channel_attempts,channels.map(channel=>channel.closed),channel_errors.length]'),[2,[1,1],0],'a failing ready post closes the receiver and permits retrying the same token');
  await evaluate(failures,`setup_failures();window.second_leaf={state:{path:'/workspace/second.c'},parent:leaf.parent};owned_leaves.push(second_leaf);files.capture_transfer=(_leaf,signal)=>{capture_signals.push(signal);return new Promise(()=>{})};start_drag();document.dispatchEvent(new CustomEvent('typora-code:tab-drag-start',{detail:{leaf:second_leaf,transfer_token:crypto.randomUUID()}}));for(const channel of channels)channel.onmessage({data:{kind:'ready',peer_id:crypto.randomUUID()}});offer_drop();void 0`);
  await wait(failures,'capture_signals.length===2');
  await evaluate(failures,'post_failure=true;window.previous_binding=binding;binding.dispose();void 0');
  assert.deepEqual(await evaluate(failures,'[channels.map(channel=>channel.closed),capture_signals.map(signal=>signal.aborted),channel_errors.length]'),[[1,1,1],[true,true],0],'dispose cleans all sender/receiver channels and aborts captures even when every post fails');
  await evaluate(failures,'post_failure=false;install("",1800,{channel:channel_factory});void 0');
  assert.equal(await evaluate(failures,'binding!==previous_binding'),true,'failed transport cleanup must remove the old WeakMap binding');
  await evaluate(failures,'binding.dispose();void 0');

  // Electron's documented maximize() also shows a hidden window. Keep this
  // fixture hidden: set real native bounds to restored/work-area/display sizes
  // and test the renderer's resulting coordinates. This is geometry coverage,
  // not a claim of exercising OS maximize/fullscreen transitions or OS dragging.
  const geometry=await open(),display=screen.getDisplayMatching(geometry.getBounds()),work_area=display.workArea;
  const window_bounds_checks=[];let geometry_shown=false;geometry.on('show',()=>{geometry_shown=true;});
  await evaluate(geometry,`window.captures=0;window.original_capture=files.capture_transfer;files.capture_transfer=(...args)=>{captures++;return original_capture(...args)};document.body.innerHTML='<header id="titlebar">Title bar</header><aside id="sidebar">Explorer</aside><main id="editor">Editor</main>';const style=document.createElement('style');style.textContent='html,body{margin:0;width:100%;height:100%;overflow:hidden}#titlebar{position:absolute;top:0;left:0;right:0;height:36px}#sidebar{position:absolute;left:0;top:36px;bottom:0;width:180px}#editor{position:absolute;top:36px;left:180px;right:0;bottom:0}';document.head.append(style);void 0`);
  const dimensions=[
    {state:'restored',bounds:{x:work_area.x+40,y:work_area.y+40,width:Math.min(720,work_area.width-80),height:Math.min(480,work_area.height-80)}},
    {state:'maximized-size',bounds:work_area},
    {state:'fullscreen-size',bounds:display.bounds},
  ];
  mode='normal';
  for(const {state,bounds} of dimensions){
    geometry.setBounds(bounds);await delay(100);
    const actual=await evaluate(geometry,'({x:screenX,y:screenY,width:outerWidth,height:outerHeight,inner_width:innerWidth,inner_height:innerHeight})');
    assert(actual.width>0&&actual.height>0,`${state}: hidden renderer exposes actual window dimensions`);
    assert.equal(geometry.isVisible(),false,'geometry fixture never becomes visible');
    const launches_before=launches,captures_before=await evaluate(geometry,'captures'),releases_before=await evaluate(geometry,'releases');
    const inside=await evaluate(geometry,`['titlebar','sidebar','editor'].map(id=>{const rect=document.getElementById(id).getBoundingClientRect();return{id,screen_x:screenX+Math.round(rect.left+Math.min(40,rect.width/2)),screen_y:screenY+Math.round(rect.top+Math.min(16,rect.height/2))}})`);
    for(const point of inside)await evaluate(geometry,`start_drag();end_drag(${JSON.stringify(point)});void 0`);
    // The outer-right edge belongs to the window too; only a point beyond it
    // detaches. This also catches accidentally using one editor group's bounds.
    await evaluate(geometry,'start_drag();end_drag({screen_x:screenX+outerWidth,screen_y:screenY+100});void 0');
    await delay(80);
    assert.equal(launches,launches_before,`${state}: title bar, sidebar, editor and window edge never detach`);
    assert.equal(await evaluate(geometry,'captures'),captures_before,`${state}: inside drops do not even capture a document`);
    await evaluate(geometry,'start_drag();end_drag({screen_x:screenX+outerWidth+80,screen_y:screenY+100});void 0');
    await wait(geometry,`releases===${releases_before+1}`);
    assert.equal(launches,launches_before+1,`${state}: exactly one window is created beyond the actual outer boundary`);
    assert.equal(await evaluate(geometry,'captures'),captures_before+1,`${state}: only outside drop captures the document`);
    assert.equal(geometry.isVisible(),false);assert.equal(geometry_shown,false,'no maximize() side effect can show the test window');
    window_bounds_checks.push({state,method:'hidden-setBounds',native_bounds:geometry.getBounds(),actual,inside,created_windows:launches-launches_before});
  }
  await evaluate(geometry,'binding.dispose();void 0');

  // ACK can arrive before native dragend. Removing the source tab triggers the
  // tab observer's cancelled end event during release; it must not cancel its
  // own already-accepted transaction or leave the now-empty auxiliary behind.
  const release_source=await open(),release_target=await open(),release_drag_checks=[];
  for(const removal_timing of ['before-removal','after-removal']){
    await evaluate(release_source,`binding.dispose();window.protocol_tap?.close();window.owned_leaves=[leaf];window.releases=0;window.notices=[];window.native_close_count=0;window.protocol_messages=[];files.core.app.workspace.eachLeaves=callback=>owned_leaves.forEach(callback);File.bundle.filePath='/workspace/native.md';window.JSBridge={invoke:async command=>{if(command==='window.close')native_close_count++}};files.release_transfer=async(target,snapshot,signal)=>{if(signal.aborted)return false;${removal_timing === 'after-removal' ? 'owned_leaves=[];' : ''}document.dispatchEvent(new CustomEvent('typora-code:tab-drag-end',{detail:{leaf:target,transfer_token:token,cancelled:true,drop_effect:'none',screen_x:0,screen_y:0}}));${removal_timing === 'before-removal' ? 'owned_leaves=[];' : ''}if(signal.aborted)return false;releases++;return true;};install('#typora-code-window-'+crypto.randomUUID());start_drag();window.protocol_tap=new BroadcastChannel('typora-code:tab-transfer:'+token);protocol_tap.onmessage=event=>protocol_messages.push(event.data.kind);void 0`);
    await evaluate(release_target,'notices=[];void 0');
    const token=await evaluate(release_source,'token');
    await evaluate(release_target,`document.dispatchEvent(new CustomEvent('typora-code:tab-drop',{cancelable:true,detail:{transfer_token:${JSON.stringify(token)},target_group:leaf.parent,target_index:0}}));void 0`);
    await wait(release_source,'releases===1&&native_close_count===1&&protocol_messages.includes("committed")');
    await delay(100);
    assert.equal(await evaluate(release_source,'owned_leaves.length'),0,'ACK release actually removes the source leaf');
    assert.equal(await evaluate(release_source,'protocol_messages.includes("cancel")'),false,'source invalidation caused by its own release never cancels an accepted transfer');
    assert.deepEqual(await evaluate(release_source,'notices'),[],'successful release has no source cancellation notice');
    assert.deepEqual(await evaluate(release_target,'notices'),[],'target receives commit instead of a misleading source-cancel notice');
    release_drag_checks.push(removal_timing);
  }
  await evaluate(release_source,'binding.dispose();protocol_tap.close();void 0');
  console.log(JSON.stringify({status:'PASS',checks:22,close_checks,channel_failure_checks:6,window_bounds_checks,release_drag_checks,evidence}));
  for(const win of windows)if(!win.isDestroyed())win.destroy();app.exit(0);
}).catch(error=>{console.error(error);console.error(evidence);for(const win of windows)if(!win.isDestroyed())win.destroy();app.exit(1);});
