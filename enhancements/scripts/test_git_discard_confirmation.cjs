// 隔离 Electron 与真实临时 Git 验证放弃确认；回收适配器保留字节，不使用系统回收站。
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),child_process=require('node:child_process');
const {build}=require('esbuild'),{editor_plugins}=require('./editor_bundle.cjs');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_discard_confirmation_'));
const long_path='docs/中文长文件名_'+('long_name_'.repeat(6))+'with spaces [1].md';
const binary_path='new_binary.dat',checks=[],layouts=[];
const dialog='[data-linux-note-git-discard=ready]',scope=id=>`${dialog} [data-git-discard-scope=${id}]`,cancel=`${dialog} [data-git-discard-cancel]`;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let test_window;
const git=(root,args)=>child_process.execFileSync('git',['-c','core.hooksPath=.git/unused_hooks','-c','core.autocrlf=false',...args],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},stdio:['pipe','pipe','pipe']}).trim();
const write=(root,file,bytes)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);};
const create_repo=(name,mode='mixed')=>{
  const root=path.join(evidence,name);fs.mkdirSync(root);git(root,['init','-b','main']);
  for(const [key,value]of [['user.name','Discard UI QA'],['user.email','discard-ui@example.invalid'],['commit.gpgsign','false'],['core.autocrlf','false'],['core.hooksPath','.git/unused_hooks']])git(root,['config',key,value]);
  for(const file of ['tracked.md','deleted.md','staged_only.md'])write(root,file,'HEAD '+file+'\n');
  git(root,['add','.']);git(root,['commit','-m','discard fixture']);
  write(root,'staged_only.md','staged content stays\n');git(root,['add','staged_only.md']);
  if(['mixed','tracked'].includes(mode)){write(root,'tracked.md','index tracked\n');git(root,['add','tracked.md']);write(root,'tracked.md','working tracked\n');}
  if(mode==='deleted_many')fs.unlinkSync(path.join(root,'tracked.md'));
  if(['mixed','deleted','deleted_many'].includes(mode))fs.unlinkSync(path.join(root,'deleted.md'));
  if(['mixed','untracked'].includes(mode)){write(root,long_path,'new Markdown bytes\n');write(root,binary_path,Buffer.from([0,255,17,128,10,0,42]));}
  return {root,mode,files:['tracked.md','deleted.md','staged_only.md',long_path,binary_path]};
};
// UI刷新允许Git更新stat缓存；保护暂存路径、模式、对象ID和内容，而非缓存字节。
const snapshot=fixture=>({head:git(fixture.root,['rev-parse','HEAD']),index:JSON.stringify({entries:git(fixture.root,['ls-files','--stage','-z']),patch:git(fixture.root,['diff','--cached','--binary','--no-ext-diff','--no-textconv','--'])}),files:Object.fromEntries(fixture.files.map(file=>[file,fs.existsSync(path.join(fixture.root,file))?fs.readFileSync(path.join(fixture.root,file)).toString('base64'):null]))});
const unchanged=(fixture,before,label)=>assert.deepEqual(snapshot(fixture),before,label);
const evaluate=async source=>{try{return await test_window.webContents.executeJavaScript(source);}catch(error){console.error(source);throw error;}};
const wait=async source=>{for(let attempt=0;attempt<200;attempt++){if(await evaluate(source))return;await delay(40);}throw new Error('Timed out: '+source);};
const point=async selector=>evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw new Error('Missing '+${JSON.stringify(selector)});node.scrollIntoView({block:'nearest'});const rect=node.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;return{x:Math.round(x),y:Math.round(y),width:rect.width,height:rect.height,hit:node.contains(document.elementFromPoint(x,y))};})()`);
const click_point=async coordinates=>{for(const type of ['mouseMove','mouseDown','mouseUp']){test_window.webContents.sendInputEvent({type,x:coordinates.x,y:coordinates.y,button:'left',clickCount:1});await delay(20);}};
const click=async selector=>{await delay(40);const coordinates=await point(selector);assert(coordinates.hit&&coordinates.width&&coordinates.height,JSON.stringify({selector,...coordinates}));await click_point(coordinates);};
const key=async(key_code,modifiers=[])=>{test_window.webContents.sendInputEvent({type:'keyDown',keyCode:key_code,modifiers});if(key_code==='Enter')test_window.webContents.sendInputEvent({type:'char',keyCode:'\r',modifiers});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:key_code,modifiers});await delay(60);};
const capture=async name=>fs.writeFileSync(path.join(evidence,name+'.png'),(await test_window.webContents.capturePage()).toPNG());
// Windows缩放可能把内容尺寸取整为321×642；以真实CSS视口反馈收敛到目标。
const resize_viewport=async(width,height)=>{
  let requested_width=width,requested_height=height,actual;
  for(let attempt=0;attempt<5;attempt++){
    test_window.setContentSize(requested_width,requested_height);await delay(80);actual=await evaluate('({width:innerWidth,height:innerHeight})');
    if(actual.width===width&&Math.abs(actual.height-height)<=2)return;
    requested_width+=width-actual.width;requested_height+=height-actual.height;
  }
  throw new Error('Cannot resize fixture viewport: '+JSON.stringify({width,height,actual}));
};
const mount=async fixture=>{
  await evaluate(`(()=>{
    window.panel?.dispose();window.fixture_root=${JSON.stringify(fixture.root)};window.fixture_dirty=false;window.recycle_failure=false;window.prepare_failure=false;window.index_changes=[];window.mutations=[];window.recycled=[];window.prepare_gate=null;window.write_gate=null;window.validation_gate=null;
    window.panel=new discard_qa.git_graph_panel(host,fixture_root);document.querySelector('#sidebar').append(panel.workbench.sidebar);document.querySelector('#editor').append(panel.container);void panel.refresh();
  })()`);await wait('!panel.pending&&panel.container.dataset.state==="ready"');
  await evaluate(`(()=>{
    const writer=panel.writer.run;

    panel.writer.run=async(...args)=>{
      if(args[1][0]==='checkout-index'){mutations.push({root:args[0],args:args[1]});const gate=window.write_gate;if(gate){window.write_gate=null;gate.started=true;await gate.promise;}}
      const output=await writer(...args);const gate=window.validation_gate;if(gate&&args[1][0]==='rev-parse'){window.validation_gate=null;gate.started=true;await gate.promise;}return output;
    };
  })()`);
};
const make_gate=async name=>evaluate(`(()=>{const gate={started:false};gate.promise=new Promise(resolve=>gate.release=resolve);window.${name}=gate;window.saved_${name}=gate;})()`);
const settle_reads=async()=>{await wait('reads_in_flight===0');await evaluate('new Promise(resolve=>setTimeout(resolve,0))');await wait('reads_in_flight===0');};
const ready=async()=>{await wait(`document.querySelector(${JSON.stringify(dialog)})?.dataset.gitDiscardState==='ready'`);await delay(50);};
const closed=async()=>wait(`!document.querySelector(${JSON.stringify(dialog)})`);
const completed=async()=>{await closed();await wait('!panel.writing&&!panel.pending&&!!panel.workbench.notice.textContent');};
const open_group=async()=>{
  await evaluate(`(()=>{const heading=panel.workbench.groups.querySelector('[data-scm-group=changes]>summary');heading.focus();heading.querySelector('[data-git-icon=discard]').closest('button').id='discard-group-trigger';})()`);
  await click('#discard-group-trigger');
};
const open_file=async file=>{const selector=`[data-scm-group=changes] [data-file=${JSON.stringify(file)}]`;await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);await click(selector+' [data-scm-file-action=discard]');};
const verify_prompt=async expected=>{
  const actual=await evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(dialog)});return{scopes:[...root.querySelectorAll('[data-git-discard-scope]')].filter(node=>!node.hidden).map(node=>node.dataset.gitDiscardScope),cancel:document.activeElement===root.querySelector('[data-git-discard-cancel]'),legacy:!!root.querySelector('input[type=checkbox],.git-graph-action-preview,[data-git-preview],[data-git-execute]'),text:root.textContent};})()`);
  assert.deepEqual(actual.scopes,expected);assert(actual.cancel,'opening and preparing preserve the default Cancel focus');assert(!actual.legacy);assert(!/git (?:checkout-index|clean|restore)/.test(actual.text),'confirmation describes files rather than Git commands');return actual.text;
};
const no_mutations=async()=>{assert.equal(await evaluate('mutations.length'),0);assert.equal(await evaluate('recycled.length'),0);};
app.setPath('userData',path.join(evidence,'user_data'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  test_window=new BrowserWindow({show:false,frame:false,width:900,height:680,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  test_window.webContents.on('console-message',(_event,_level,message)=>console.error(message));
  const html=path.join(evidence,'fixture.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;font:13px system-ui}body{display:flex;background:var(--bg-color,#fff);color:var(--text-color,#222)}#sidebar{width:320px;flex:none;height:100%}#editor{flex:1;min-width:0}button,input{font:inherit}</style><section id="sidebar" class="linux-note-git-source-control"></section><section id="editor"></section>');
  await test_window.loadFile(html);test_window.webContents.debugger.attach();await test_window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export {git_graph_panel} from "./src/git_graph_panel";export {create_graph_host} from "./src/git_graph_host";export {git_graph_text} from "./src/git_graph_i18n";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'discard_qa',write:false});await evaluate(bundle.outputFiles[0].text);
  await evaluate(`(()=>{
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(style);
    const native_electron=require('electron'),native_fs=require('node:fs'),native_path=require('node:path'),temp=${JSON.stringify(evidence)};
    window.reqnode=name=>name==='electron'?{...native_electron,shell:{...native_electron.shell,trashItem:async target=>{
      const relative=native_path.relative(temp,target);if(!relative||native_path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+native_path.sep))throw new Error('Recycle adapter target escaped the temporary fixture');
      if(window.recycle_failure)throw new Error('Controlled recycle failure');
      const bytes=native_fs.readFileSync(target),destination=native_path.join(temp,'recycled',String(Date.now())+'_'+recycled.length+'_'+native_path.basename(target));native_fs.mkdirSync(native_path.dirname(destination),{recursive:true});native_fs.renameSync(target,destination);recycled.push({source:target,destination,bytes:bytes.toString('base64')});
    }}}:require(name);
    window._options={userDataPath:temp,displayLang:'zh-CN'};window.File={changeCounter:{isDocumentEdited:()=>window.fixture_dirty}};
    const core={WorkspaceView:class{},app:{viewManager:{registerView(){}},commands:{run(){},register(){}},workspace:{sidebar:{},on(){},ribbon:{addButton(){}},eachLeaves(){},activeLeaf:null}}};window.host=discard_qa.create_graph_host(core);
    window.reads_in_flight=0;const create_runner=host.runner.bind(host);
    host.runner=(...options)=>{const runner=create_runner(...options),run=runner.run;runner.run=async(...args)=>{window.reads_in_flight++;try{
      const index_path=native_path.join(args[0],'.git','index'),before_index=native_fs.existsSync(index_path)?native_fs.readFileSync(index_path).toString('base64'):null;const output=await run(...args);const after_index=native_fs.existsSync(index_path)?native_fs.readFileSync(index_path).toString('base64'):null;if(before_index!==after_index)window.index_changes.push({args:args[1],writable:!!options[1],before_index,after_index});if(!options[1]&&args[1][0]==='ls-files'&&args[1].includes('--stage')){
        if(window.prepare_failure)throw new Error('Controlled prepare failure');
        const gate=window.prepare_gate;if(gate){window.prepare_gate=null;gate.started=true;await gate.promise;}
      }return output;
    }finally{window.reads_in_flight--;}};return runner;};
  })()`);

  const cancelling=create_repo('cancel');await mount(cancelling);const cancel_before=snapshot(cancelling);
  for(const method of ['button','titlebar','enter','escape','outside']){
    await open_group();await ready();const text=await verify_prompt(['tracked','all']);assert(text.includes('已跟踪')&&text.includes('回收站'));
    await evaluate(`window.cancelled_scope=document.querySelector(${JSON.stringify(scope('all'))});void 0`);
    if(method==='button')await click(cancel);else if(method==='titlebar')await click('.workspace-dialog-close');else if(method==='enter')await key('Enter');else if(method==='escape')await key('Escape');else await click_point({x:2,y:2});
    await closed();await evaluate('cancelled_scope.click();cancelled_scope.onclick?.(new MouseEvent("click",{cancelable:true}))');unchanged(cancelling,cancel_before,method+' cancellation is read-only');await no_mutations();
  }
  checks.push('real group entry prepares a mixed confirmation with Cancel focus; pointer Cancel, Enter, Escape and outside dismissal write nothing');

  const tracked=create_repo('tracked_choice');await mount(tracked);const tracked_before=snapshot(tracked);await open_group();await ready();await verify_prompt(['tracked','all']);
  await evaluate(`document.querySelector(${JSON.stringify(cancel)}).focus()`);await key('Tab');assert(await evaluate('document.activeElement.matches(".workspace-dialog-close")'));await key('Tab');assert(await evaluate('document.activeElement.matches("summary")'));await key('Tab');assert.equal(await evaluate('document.activeElement.dataset.gitDiscardScope'),'tracked');await key('Enter');await completed();
  assert.equal(fs.readFileSync(path.join(tracked.root,'tracked.md'),'utf8'),'index tracked\n');assert.equal(fs.readFileSync(path.join(tracked.root,'deleted.md'),'utf8'),'HEAD deleted.md\n');
  const tracked_after=snapshot(tracked);assert.equal(tracked_after.head,tracked_before.head);assert.equal(tracked_after.index,tracked_before.index);for(const file of [long_path,binary_path,'staged_only.md'])assert.equal(tracked_after.files[file],tracked_before.files[file]);
  assert.deepEqual((await evaluate('panel.workbench.groups_state.find(group=>group.id==="changes").files.map(file=>file.path)')).sort(),[long_path,binary_path].sort(),'restored files disappear from the actual SCM Changes group');assert.equal(await evaluate('recycled.length'),0);assert.equal(await evaluate('mutations.length'),1);checks.push('keyboard tracked choice restores the index version and deleted tracked file, preserving untracked bytes, staged-only content, HEAD and staged paths, modes, object IDs and content');

  const all=create_repo('all_choice');await mount(all);const all_before=snapshot(all);await open_group();await ready();await make_gate('write_gate');
  await evaluate(`window.retained_all=document.querySelector(${JSON.stringify(scope('all'))});void 0`);const all_point=await point(scope('all'));await click_point(all_point);await wait('panel.writing&&saved_write_gate.started');await closed();
  await click_point(all_point);await key('Enter');await evaluate('retained_all.click();retained_all.onclick?.(new MouseEvent("click",{cancelable:true}))');
  assert.equal(await evaluate('mutations.length'),1);await evaluate('saved_write_gate.release()');await completed();
  const all_after=snapshot(all);assert.equal(all_after.head,all_before.head);assert.equal(all_after.index,all_before.index);assert.equal(all_after.files['staged_only.md'],all_before.files['staged_only.md']);
  assert.equal(fs.readFileSync(path.join(all.root,'tracked.md'),'utf8'),'index tracked\n');assert(!fs.existsSync(path.join(all.root,long_path)));assert(!fs.existsSync(path.join(all.root,binary_path)));
  const recycled=await evaluate('recycled');assert.equal(recycled.length,2);for(const item of recycled){const file=path.relative(all.root,item.source).replace(/\\/g,'/');assert.equal(item.bytes,all_before.files[file]);assert.equal(fs.readFileSync(item.destination).toString('base64'),item.bytes);}
  assert.equal(await evaluate('panel.workbench.groups_state.find(group=>group.id==="changes").files.length'),0,'successful restoration must not leave stat-only ghost changes');assert.equal(await evaluate('mutations.length'),1);checks.push('all choice closes confirmation then executes once despite repeated pointer, Enter and stale callbacks; the real host recycle adapter preserves both files byte-for-byte');

  for(const [mode,file,label]of [['tracked','tracked.md','放弃'],['deleted','deleted.md','恢复'],['untracked',long_path,'回收站']]){
    const single=create_repo('single_'+mode,mode);await mount(single);const before=snapshot(single);await open_file(file);await ready();const text=await verify_prompt(['all']);assert(text.includes(path.basename(file))&&text.includes(label),text);await click(scope('all'));await completed();
    const after=snapshot(single);assert.equal(after.head,before.head);assert.equal(after.index,before.index);for(const other_file of single.files.filter(item=>item!==file))assert.equal(after.files[other_file],before.files[other_file]);
    if(mode==='untracked'){assert.equal(after.files[file],null);assert.equal((await evaluate('recycled'))[0].bytes,before.files[file]);}else assert.equal(fs.readFileSync(path.join(single.root,file),'utf8'),mode==='tracked'?'index tracked\n':'HEAD deleted.md\n');
  }
  checks.push('single tracked, all-deleted tracked and single untracked entries show the full filename and correct restore/recycle wording, and affect only the selected file');

  const untracked=create_repo('untracked_only','untracked');await mount(untracked);const untracked_before=snapshot(untracked);await open_group();await ready();await verify_prompt(['all']);await click(scope('all'));await completed();
  assert.equal(await evaluate('mutations.length'),0);assert.equal(await evaluate('recycled.length'),2);assert.equal(snapshot(untracked).index,untracked_before.index);assert.equal(snapshot(untracked).head,untracked_before.head);checks.push('untracked-only group offers one explicit recycle confirmation without a tracked choice or checkout-index command');

  const deleted_many=create_repo('deleted_many','deleted_many');await mount(deleted_many);const deleted_many_before=snapshot(deleted_many);await open_group();await ready();const deleted_many_text=await verify_prompt(['all']);assert(deleted_many_text.includes('恢复')&&await evaluate(`document.querySelector(${JSON.stringify(scope('all'))}).textContent.includes('恢复全部')`));await click(scope('all'));await completed();
  const deleted_many_after=snapshot(deleted_many);assert.equal(deleted_many_after.head,deleted_many_before.head);assert.equal(deleted_many_after.index,deleted_many_before.index);for(const file of ['tracked.md','deleted.md'])assert.equal(fs.readFileSync(path.join(deleted_many.root,file),'utf8'),'HEAD '+file+'\n');assert.equal(await evaluate('panel.workbench.groups_state.find(group=>group.id==="changes").files.length'),0);checks.push('a group containing only deleted tracked files offers Restore All and restores both files without changing staged content');

  for(const change of ['working','index','untracked_bytes','dirty','late_dirty']){
    const stale=create_repo('stale_'+change);await mount(stale);await open_group();await ready();
    if(change==='working')write(stale.root,'tracked.md','newer working text\n');
    if(change==='index'){write(stale.root,'staged_only.md','newer index text\n');git(stale.root,['add','staged_only.md']);}
    if(change==='untracked_bytes')write(stale.root,binary_path,Buffer.from([0,255,17,128,10,0,43]));
    if(change==='dirty')await evaluate('window.fixture_dirty=true');
    if(change==='late_dirty')await make_gate('validation_gate');
    const before=snapshot(stale);await click(scope('all'));
    if(change==='late_dirty'){await wait('saved_validation_gate.started');await evaluate('window.fixture_dirty=true;saved_validation_gate.release()');}
    await completed();await no_mutations();unchanged(stale,before,change+' must preserve the newer state');const error_key=change.includes('dirty')?'action.error.unsaved_document':change==='untracked_bytes'?'action.error.untracked_changed':'action.error.repository_changed';assert(await evaluate(`panel.workbench.notice.textContent.includes(discard_qa.git_graph_text(${JSON.stringify(error_key)}))`));
  }
  checks.push('tracked edits, changed index, same-name same-length untracked byte edits and dirty documents before or during async validation reject the prepared write');

  const slow=create_repo('slow_prepare');await mount(slow);const slow_before=snapshot(slow);await make_gate('prepare_gate');await open_group();await wait('saved_prepare_gate.started');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(dialog)}).dataset.gitDiscardState`),'loading');assert(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(cancel)})`));
  assert(await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(dialog+' [data-git-discard-scope]')})).every(node=>node.disabled)`));await key('Enter');await closed();await evaluate('saved_prepare_gate.release()');await settle_reads();await closed();await no_mutations();unchanged(slow,slow_before,'late prepare after Cancel cannot resurrect or execute');
  await make_gate('prepare_gate');await open_group();await wait('saved_prepare_gate.started');await click(dialog+' h3');await evaluate('window.focus_during_prepare=document.activeElement;void 0');assert(!await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(cancel)})`),'pointer moved focus away from Cancel before the delayed result');
  await evaluate('saved_prepare_gate.release()');await ready();assert(await evaluate('document.activeElement===focus_during_prepare'),'late preparation cannot steal focus');await key('Escape');await closed();unchanged(slow,slow_before,'slow preparation is read-only');
  checks.push('loading permits cancellation only; delayed results neither reopen cancelled dialogs nor steal focus from a later pointer action');

  const prepare_error=create_repo('prepare_error');await mount(prepare_error);const prepare_error_before=snapshot(prepare_error);
  await evaluate('window.prepare_failure=true');await open_group();await wait(`document.querySelector(${JSON.stringify(dialog)})?.dataset.gitDiscardState==='error'`);
  assert(await evaluate(`document.querySelector(${JSON.stringify(dialog)}).textContent.includes('Controlled prepare failure')&&[...document.querySelectorAll(${JSON.stringify(dialog+' [data-git-discard-scope]')})].every(node=>node.disabled)`));
  assert(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(cancel)})`));await key('Enter');await closed();await no_mutations();unchanged(prepare_error,prepare_error_before,'failed preparation cannot become executable');checks.push('failed preparation reports an error with cancellation available and no executable scope');

  const replaced=create_repo('replaced');await mount(replaced);const replaced_before=snapshot(replaced);await make_gate('prepare_gate');await open_group();await wait('saved_prepare_gate.started');
  await evaluate('panel.action_dialog("discard_changes","file","tracked.md",panel.state.head,{include_untracked:true},["tracked.md"])');await ready();assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(dialog)}).length`),1);const replacement=await evaluate(`document.querySelector(${JSON.stringify(dialog)}).textContent`);assert(replacement.includes('tracked.md'));await evaluate('saved_prepare_gate.release()');await settle_reads();assert.equal(await evaluate(`document.querySelector(${JSON.stringify(dialog)}).textContent`),replacement);await click(cancel);await no_mutations();unchanged(replaced,replaced_before,'new confirmation supersedes the old prepare');
  checks.push('a new single-file confirmation supersedes an older pending group plan without replacing its target or writing');

  for(const lifetime of ['switch','dispose']){
    const original=create_repo('lifetime_'+lifetime),other=create_repo('other_'+lifetime);await mount(original);const before=snapshot(original),other_before=snapshot(other);await make_gate('prepare_gate');await open_group();await wait('saved_prepare_gate.started');
    if(lifetime==='switch'){await evaluate(`void panel.switch_repo(${JSON.stringify(other.root)})`);await wait('!panel.pending&&panel.container.dataset.state==="ready"');}else await evaluate('panel.dispose()');
    await closed();await evaluate('saved_prepare_gate.release()');await settle_reads();await closed();await no_mutations();unchanged(original,before,lifetime+' preserves the original repository');unchanged(other,other_before,lifetime+' preserves the next repository');
  }
  checks.push('repository switch and panel disposal invalidate pending confirmations and late readers without changing either repository');

  const failed=create_repo('recycle_failure');await mount(failed);const failed_before=snapshot(failed);await open_group();await ready();await evaluate('window.recycle_failure=true');await click(scope('all'));await completed();
  const failed_after=snapshot(failed);assert.equal(failed_after.head,failed_before.head);assert.equal(failed_after.index,failed_before.index);for(const file of [long_path,binary_path])assert.equal(failed_after.files[file],failed_before.files[file]);assert.equal(await evaluate('recycled.length'),0);assert(await evaluate('panel.workbench.notice.textContent.includes("Controlled recycle failure")'));checks.push('recycle failure reports the error and retains untracked bytes, with no permanent-delete fallback');

  const geometry=create_repo('layout');await mount(geometry);const geometry_before=snapshot(geometry);
  for(const width of [320,900])for(const dark of [false,true])for(const kind of ['mixed','single']){
    await resize_viewport(width,640);await evaluate(`document.documentElement.style.setProperty('--bg-color','${dark?'#202020':'#fff'}');document.documentElement.style.setProperty('--text-color','${dark?'#eee':'#222'}');document.body.style.backgroundColor='${dark?'#202020':'#fff'}'`);await delay(100);if(kind==='mixed')await open_group();else await open_file(long_path);await ready();await verify_prompt(kind==='mixed'?['tracked','all']:['all']);if(kind==='mixed'){await click(dialog+' details>summary');await wait('document.querySelector(".git-discard-files")?.childElementCount>1');}
    const metrics=await evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(dialog)}),panel=root.querySelector('.git-graph-dialog'),box=node=>{const r=node.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}},buttons=[...root.querySelectorAll('button')].filter(node=>!node.hidden);return{viewport:innerWidth,viewport_height:innerHeight,panel:box(panel),overflow:panel.scrollWidth-panel.clientWidth,text:root.textContent,buttons:buttons.map(node=>{const rect=box(node);return{...rect,hit:node.contains(document.elementFromPoint((rect.left+rect.right)/2,(rect.top+rect.bottom)/2)),text:node.textContent}})}})()`);
    assert(metrics.panel.left>=0&&metrics.panel.right<=width&&metrics.panel.top>=0&&metrics.panel.bottom<=metrics.viewport_height,JSON.stringify(metrics));assert(metrics.overflow<=1,JSON.stringify(metrics));assert(metrics.text.includes(path.basename(long_path)));
    for(const button of metrics.buttons){assert(button.hit&&button.width>0&&button.height>0,JSON.stringify(button));assert(button.left>=metrics.panel.left&&button.right<=metrics.panel.right&&button.top>=metrics.panel.top&&button.bottom<=metrics.panel.bottom);}
    for(let left=0;left<metrics.buttons.length;left++)for(let right=left+1;right<metrics.buttons.length;right++){const a=metrics.buttons[left],b=metrics.buttons[right];assert(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1,'confirmation choices cannot overlap');}
    layouts.push({width,dark,kind,...metrics});await capture(`discard_${kind}_${width}_${dark?'dark':'light'}`);await key('Escape');await closed();
  }
  unchanged(geometry,geometry_before,'layout and theme changes do not mutate the repository');await no_mutations();fs.writeFileSync(path.join(evidence,'layouts.json'),JSON.stringify(layouts,null,2));checks.push('320px and normal light/dark dialogs wrap long filenames with bounded, unobstructed, non-overlapping choices');
  await evaluate('panel.dispose();host.dispose()');console.log(JSON.stringify({status:'PASS',checks,evidence},null,2));test_window.destroy();app.exit(0);
}).catch(async error=>{console.error(error);console.error(evidence);if(test_window&&!test_window.isDestroyed()){try{await capture('failure');fs.writeFileSync(path.join(evidence,'failure_viewport.json'),JSON.stringify(await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})')));fs.writeFileSync(path.join(evidence,'index_changes.json'),JSON.stringify(await evaluate('window.index_changes'),null,2));fs.writeFileSync(path.join(evidence,'failure.html'),await evaluate('document.documentElement.outerHTML'));}catch{}test_window.destroy();}app.exit(1);});