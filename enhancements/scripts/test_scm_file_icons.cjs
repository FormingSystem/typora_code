// SCM files share Explorer Seti associations; resource-group twisties retain their geometry.
// Exercise the two host SCM file slots without changing the Git Graph extension's icons.
const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_scm_file_icons_'));
app.setPath('userData',path.join(evidence,'profile'));app.disableHardwareAcceleration();let test_window;
app.whenReady().then(async()=>{
 test_window=new BrowserWindow({show:false,width:720,height:850,webPreferences:{offscreen:true,nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});
 const html=path.join(evidence,'fixture.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>body{font:13px/22px "Segoe UI";margin:0}#host{width:320px;height:820px}.git-scm-sidebar{height:100%}</style><aside id="typora-sidebar"><main id="host" class="linux-note-git-source-control"></main></aside>');await test_window.loadFile(html);
 const bundle=await build({stdin:{contents:'export {git_source_control} from "./src/git_source_control";export {git_operation_progress} from "./src/git_operation_progress";export {git_graph_panel} from "./src/git_graph_panel";export {git_icon} from "./src/git_icons";export {compare_files,parse_status,INDEX,WORKTREE} from "./src/git_graph_repository";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,loader:{'.css':'text'},format:'iife',globalName:'scm_qa'});
 const evaluate=source=>test_window.webContents.executeJavaScript(source);
 await evaluate(bundle.outputFiles[0].text);
 await test_window.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'));
 await evaluate(`(()=>{
 window.opened=[];window.files=[{path:'docs/guide.md',old_path:'docs/guide.ts',status:'R'},{path:'src/main.ts',status:'M'},{path:'unknown.custom_extension',status:'D'}];
 window.panel={progress:new scm_qa.git_operation_progress(),container:document.createElement('section'),disposed:false,pending:false,writing:false,root:'fixture',state:{root:'fixture',head:'a'.repeat(40),branch:'main',operation:'',refs:[],commits:[],more:false,changes:[],remotes:[]},branches:[],settings:{initial_count:50,history_toolbar_hidden:[],history_shortcuts:{}},host:{show_history(){},open_panel(){}},repo_select:document.createElement('select'),refresh(){},configured_menu(){},action_dialog(){},quick_action(){},report(){},switch_repo(){},manage_repositories(){}};
 panel.container.className='linux-note-git-graph';panel.container.dataset.state='ready';
 const option=document.createElement('option');option.value='fixture';panel.repo_select.append(option);
 window.scm=new scm_qa.git_source_control(panel);panel.workbench=scm;scm.open_file=async(file,from,to)=>opened.push({path:file.path,from,to});document.querySelector('#host').append(scm.sidebar);
 scm.groups_state=[{id:'staged',title:'Staged Changes',from:'head',to:'index',files:[]},{id:'changes',title:'Changes',from:'index',to:'worktree',files}];scm.render_groups();
 window.commit={hash:'a'.repeat(40),parents:['b'.repeat(40)],subject:'fixture'};window.history_target=document.createElement('div');scm.history.container.append(history_target);scm.history.render_files(history_target,commit,files);

 window.graph_icon=scm_qa.git_icon('file');graph_icon.id='extension-file-icon';document.body.append(graph_icon);
 })()`);
 assert(await evaluate('scm.title.querySelectorAll("button").length===1&&!!scm.title.querySelector("[data-git-icon=more]")&&!!scm.history.header.querySelector(".git-scm-history-refresh")&&!!scm.history.header.querySelector(".git-scm-history-more-menu")'));
 const geometry=await evaluate(`(()=>{
 const box=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,visibility:s.visibility,opacity:s.opacity,transform:s.transform,color:s.color,font:s.fontSize,weight:s.fontWeight}};
 const groups=[...document.querySelectorAll('.git-scm-group')].map(group=>{const summary=group.querySelector('summary'),icon=summary.querySelector('.git-disclosure-icon'),label=summary.querySelector('.git-scm-group-label');return {id:group.dataset.scmGroup,empty:!group.querySelector('.git-scm-file'),official:icon.tagName.toLowerCase()==='svg'&&icon.dataset.gitIcon==='chevron-right'&&!!icon.querySelector('path'),summary:box(summary),icon:box(icon),label:box(label)}});
 return {groups,header_rows:[...document.querySelectorAll('.git-scm-input-heading,.git-scm-history-header')].map(box),headers:[box(document.querySelector('.git-scm-input-heading>.git-disclosure-icon')),box(document.querySelector('.git-scm-history-toggle>.git-disclosure-icon'))],buttons:[...document.querySelectorAll('.git-scm-commit-bar>button')].map(button=>({text:box(button).color,icon:box(button.querySelector('svg')).color})),extra_input:!!document.querySelector('.git-scm-filter'),adjacent:scm.changes_body.querySelector(".git-scm-inputs").nextElementSibling===scm.groups};})()`);
 assert.equal(geometry.header_rows.length,2);assert(geometry.header_rows.every(row=>row.height===22));assert(geometry.headers.every(icon=>icon.width===16&&icon.height===16));
 assert.equal(geometry.groups.length,2);assert(geometry.groups.some(group=>group.empty));
 for(const group of geometry.groups){assert(group.official);assert.equal(group.summary.height,22);assert.equal(group.summary.font,'13px');assert.equal(group.summary.weight,'400');assert.equal(group.icon.width,16);assert.equal(group.icon.height,16);assert.equal(group.icon.visibility,'visible');assert.equal(group.icon.opacity,'1');assert.notEqual(group.icon.display,'none');assert(group.icon.x+group.icon.width<=group.label.x);assert.equal(group.icon.transform,'matrix(0, 1, -1, 0, 0, 0)');}
 assert.equal(geometry.groups[0].icon.x,geometry.groups[1].icon.x);assert.equal(geometry.headers[0].x,geometry.headers[1].x);assert(geometry.buttons.every(button=>button.text==='rgb(255, 255, 255)'&&button.icon===button.text));assert(!geometry.extra_input&&geometry.adjacent);
 for(const id of ['staged','changes']){
  await evaluate(`document.querySelector('[data-scm-group="${id}"]>summary').click()`);
  assert(await evaluate(`!document.querySelector('[data-scm-group="${id}"]').open&&getComputedStyle(document.querySelector('[data-scm-group="${id}"]>summary>.git-disclosure-icon')).transform==='none'`));
  await evaluate(`document.querySelector('[data-scm-group="${id}"]>summary').click()`);
  assert(await evaluate(`document.querySelector('[data-scm-group="${id}"]').open&&getComputedStyle(document.querySelector('[data-scm-group="${id}"]>summary>.git-disclosure-icon')).transform==='matrix(0, 1, -1, 0, 0, 0)'`));
 }
 for(const tree of [false,true]){
  await evaluate(`scm.tree=${tree};scm.history_tree=${tree};scm.render_groups();scm.history.render_files(history_target,commit,files)`);
  assert(await evaluate(`[...document.querySelectorAll('.git-scm-file,.git-scm-history-file')].length===6&&[...document.querySelectorAll('.git-scm-file,.git-scm-history-file')].every(row=>row.querySelector('.git-scm-file-label>.workspace-file-theme-icon')&&row.getBoundingClientRect().height===22)`));
 }
 await evaluate('scm.tree=false;scm.history_tree=false;scm.render_groups();scm.history.render_files(history_target,commit,files)');
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('.git-scm-file-label>.workspace-file-theme-icon')].map(node=>node.dataset.vscodeFileIcon)`),['_markdown','_typescript','_default','_markdown','_typescript','_default']);
 await evaluate('document.fonts.ready.then(()=>true)');
 assert(await evaluate(`[...document.querySelectorAll('.git-scm-file-label>.workspace-file-theme-icon')].every(node=>getComputedStyle(node).fontFamily==='typora-code-seti'&&node.getBoundingClientRect().width===16)`));
 for(const selector of ['.git-scm-file','.git-scm-history-file']){
  const point=await evaluate(`(()=>{const node=document.querySelector('${selector}');node.scrollIntoView();const r=node.getBoundingClientRect();return{x:Math.round(r.left+40),y:Math.round(r.top+r.height/2)}})()`);
  test_window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});test_window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
 }
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.deepEqual(await evaluate('opened'),[{path:'docs/guide.md',from:'index',to:'worktree'},{path:'docs/guide.md',from:'b'.repeat(40),to:'a'.repeat(40)}]);
 assert(await evaluate(`graph_icon.tagName.toLowerCase()==='svg'&&graph_icon.dataset.gitIcon==='file'&&!graph_icon.classList.contains('workspace-file-theme-icon')`));
 await evaluate(`(()=>{
   window.writes=0;panel.quick_action=()=>writes++;
   scm.message.value='kept draft';scm.message.dispatchEvent(new Event('input'));
   document.querySelector('#host').style.height='310px';
   scm.groups_state[1].files=Array.from({length:80},(_,i)=>({path:'long/path/file_'+i+'.md',status:'M'}));scm.render_groups();
   scm.groups.querySelector('[data-scm-group=staged]').open=false;
 })()`);await new Promise(resolve=>setTimeout(resolve,80));
 await evaluate('scm.groups.scrollTop=150');await new Promise(resolve=>setTimeout(resolve,60));
 const scroll_before=await evaluate('scm.groups.scrollTop');assert(scroll_before>0,JSON.stringify(await evaluate('[scm.changes_pane,scm.input_section,scm.changes_body,scm.groups].map(n=>({height:n.clientHeight,scroll:n.scrollHeight,css:getComputedStyle(n).height,open:n.open}))')));
 const graph_before=await evaluate('scm.history.container.getBoundingClientRect().y');
 await evaluate(`scm.input_section.querySelector('summary').click()`);await new Promise(resolve=>setTimeout(resolve,80));
 assert(await evaluate(`!scm.input_section.open&&scm.changes_body.inert&&scm.changes_body.getBoundingClientRect().height===0&&[...scm.changes_body.querySelectorAll('input,textarea,button,summary')].every(node=>node.getClientRects().length===0)`));
 assert(await evaluate(`(()=>{scm.message.focus();return document.activeElement!==scm.message})()`));
 assert.equal(await evaluate('scm.history.container.getBoundingClientRect().y'),graph_before);
 await evaluate(`window.release_refresh=null;const gate=new Promise(resolve=>release_refresh=resolve);panel.runner={run:async()=>{await gate;return Array.from({length:80},(_,i)=>'M\0long/path/file_'+i+'.md\0').join('')}};window.refresh_done=scm.refresh();true`);
 await evaluate('release_refresh();true');await evaluate('refresh_done.then(()=>true)');
 assert(await evaluate('!scm.input_section.open&&scm.changes_body.inert&&scm.message.value==="kept draft"'));
 await evaluate(`scm.input_section.querySelector('summary').click()`);await new Promise(resolve=>setTimeout(resolve,80));
 assert(await evaluate('scm.input_section.open&&!scm.changes_body.inert&&scm.message.value==="kept draft"&&!scm.groups.querySelector("[data-scm-group=staged]").open&&scm.groups.querySelector("[data-scm-group=changes]").open'));
 assert.equal(await evaluate('scm.groups.scrollTop'),scroll_before);assert.equal(await evaluate('writes'),0);
 assert(await evaluate('scm.groups.scrollHeight>scm.groups.clientHeight&&scm.changes_pane.scrollHeight<=scm.changes_pane.clientHeight+1'));
 fs.writeFileSync(path.join(evidence,'scm_file_icons.png'),(await test_window.webContents.capturePage()).toPNG());
 await evaluate('scm.dispose()');assert(!await evaluate(`Boolean(document.getElementById('typora-code-style:workspace_file_icons'))`));
 // 真实临时 Git 生成组内状态；验证默认打开只对无当前比较基线的新增文件生效。
 const repository=path.join(evidence,'repository');fs.mkdirSync(repository);
 const git=(...args)=>require('node:child_process').execFileSync('git',args,{cwd:repository,encoding:'utf8',windowsHide:true});
 git('init','-b','main');git('config','core.autocrlf','false');for(const name of ['tracked.md','removed.txt','before.txt'])fs.writeFileSync(path.join(repository,name),name+' original\n');git('add','.');git('-c','user.name=Fixture','-c','user.email=f@example.invalid','commit','-m','fixture');
 fs.writeFileSync(path.join(repository,'new.md'),'# New Markdown\n');fs.writeFileSync(path.join(repository,'new.txt'),'new text\n');fs.writeFileSync(path.join(repository,'staged.md'),'# staged version\n');git('add','staged.md');fs.appendFileSync(path.join(repository,'staged.md'),'working edit\n');fs.appendFileSync(path.join(repository,'tracked.md'),'changed\n');fs.unlinkSync(path.join(repository,'removed.txt'));git('mv','before.txt','after.txt');
 const head=git('rev-parse','HEAD').trim(),before_index=git('ls-files','--stage');
 await evaluate(`window.direct_opens=[];window.quick_actions=[];panel.root=${JSON.stringify(repository)};panel.host.open_file=async(root,file)=>direct_opens.push({root,file});panel.quick_action=(action,files)=>quick_actions.push({action,files});window.git_run=async(root,args)=>require('node:child_process').execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});panel.state={...panel.state,root:panel.root,head:${JSON.stringify(head)},changes:scm_qa.parse_status(${JSON.stringify(git('status','--porcelain','-z'))})};void 0`);
 await evaluate(`(async()=>{scm.groups_state=[{id:'staged',title:'Staged Changes',from:panel.state.head,to:scm_qa.INDEX,files:await scm_qa.compare_files(git_run,panel.state,panel.state.head,scm_qa.INDEX)},{id:'changes',title:'Changes',from:scm_qa.INDEX,to:scm_qa.WORKTREE,files:await scm_qa.compare_files(git_run,panel.state,scm_qa.INDEX,scm_qa.WORKTREE)}];opened.length=0;scm.tree=false;scm.render_groups();})()`);
 for(const [group,file,enter]of [['changes','new.md',false],['changes','new.txt',true],['staged','staged.md',false]]){
  await evaluate(`(()=>{const row=scm.groups.querySelector('[data-scm-group="${group}"] [data-file="${file}"]');${enter?"row.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));":"row.click();"}})()`);
 }
 assert.deepEqual((await evaluate('direct_opens')).map(item=>item.file),['new.md','new.txt','staged.md']);assert.equal(await evaluate('opened.length'),0);
 for(const [group,file]of [['changes','tracked.md'],['changes','removed.txt'],['changes','staged.md'],['staged','after.txt']])await evaluate(`scm.groups.querySelector('[data-scm-group="${group}"] [data-file="${file}"]').click()`);
 assert.deepEqual((await evaluate('opened')).map(item=>[item.path,item.from,item.to]),[['tracked.md','INDEX','WORKTREE'],['removed.txt','INDEX','WORKTREE'],['staged.md','INDEX','WORKTREE'],['after.txt',head,'INDEX']]);
 await evaluate(`scm.groups.querySelector('[data-scm-group="changes"] [data-file="new.md"] [data-scm-file-action="stage"]').click()`);assert.equal(await evaluate('direct_opens.length'),3);assert.equal(await evaluate('opened.length'),4);assert.equal(await evaluate('quick_actions.length'),1);
 await evaluate(`(()=>{const group=scm.groups_state[1],file=group.files.find(file=>file.path==='new.md');scm.file_entries(file,group.from,group.to,group.files).find(item=>item.id==='open_diff').action();})()`);assert.equal(await evaluate('opened.length'),5,'explicit Open Changes remains a comparison');
 await evaluate(`window.discard_plans=[];panel.action_dialog=(...args)=>discard_plans.push(args);scm.groups.querySelector('[data-file="new.md"] [data-scm-file-action="open"]').click();scm.groups.querySelector('[data-file="new.md"] [data-scm-file-action="discard"]').click();`);
 assert.equal(await evaluate('direct_opens.at(-1).file'),'new.md');assert.equal(await evaluate('opened.length'),5,'inline open and discard do not bubble into diff opening');
 assert.deepEqual(await evaluate('discard_plans[0]'),['discard_changes','file','new.md',head,{include_untracked:true},['new.md']],'discard opens existing confirmed action plan rather than writing directly');
 assert(await evaluate('scm.groups.querySelector(`[data-file="removed.txt"] [data-scm-file-action="open"]`).disabled'));
 await evaluate(`scm.tree=true;scm.groups_state[1].files.push({path:'folder/nested.md',status:'??'});scm.render_groups();window.before_directory_opens=direct_opens.length;window.before_directory_diffs=opened.length;scm.groups.querySelector('.git-scm-directory>summary').click()`);
 assert(await evaluate('!scm.groups.querySelector(".git-scm-directory").open&&direct_opens.length===before_directory_opens&&opened.length===before_directory_diffs'),'directory click only toggles its children');
 await evaluate(`window.late_diffs=0;window.pending_reads=[];panel.status=document.createElement('div');panel.host.revision_text=()=>new Promise(resolve=>pending_reads.push(resolve));panel.host.open_document=()=>late_diffs++;window.pending_diff=scm_qa.git_source_control.prototype.open_file.call(scm,{path:'tracked.md',status:'M'},scm_qa.INDEX,scm_qa.WORKTREE);void 0`);
 await evaluate(`scm.open_default_file({path:'new.md',status:'??'},scm_qa.INDEX,scm_qa.WORKTREE,[])`);
 await evaluate(`pending_reads.forEach(resolve=>resolve('old pending comparison'));pending_diff`);
 assert.equal(await evaluate('late_diffs'),0,'new-file navigation cancels an older in-flight diff before it can steal the active tab');
 // 中央 Graph 的实际文件行必须复用 SCM 默认路由；历史快照和显式比较仍有各自语义。
 await evaluate(`window.graph_files=document.createElement('div');document.querySelector('#host').append(graph_files);window.graph_panel={workbench:scm,settings:{file_view:'list'},review_active:()=>false,file_menu(){},open_diff:scm_qa.git_graph_panel.prototype.open_diff};direct_opens.length=0;opened.length=0;void 0`);
 for(const [from,to]of [[head,'WORKTREE'],['INDEX','WORKTREE'],[head,'INDEX']]){
  await evaluate(`(async()=>{graph_panel.from=${JSON.stringify(from)};graph_panel.to=${JSON.stringify(to)};graph_panel.files=await scm_qa.compare_files(git_run,panel.state,graph_panel.from,graph_panel.to);graph_files.replaceChildren();scm_qa.git_graph_panel.prototype.render_files.call(graph_panel,graph_files);for(const row of graph_files.querySelectorAll('.git-graph-file'))row.click();})()`);
 }
 assert.deepEqual((await evaluate('direct_opens')).map(item=>item.file).sort(),['new.md','new.md','new.txt','new.txt','staged.md','staged.md']);
 assert((await evaluate('opened')).every(item=>!['new.md','new.txt'].includes(item.path)),'Graph additions are opened normally in combined, staged and unstaged comparisons');
 assert((await evaluate('opened')).some(item=>item.path==='staged.md'&&item.from==='INDEX'&&item.to==='WORKTREE'),'an already indexed addition with later edits still has a real index comparison');
 await evaluate(`graph_panel.from=${JSON.stringify(head)};graph_panel.to='c'.repeat(40);graph_panel.files=[{path:'new.md',status:'A'}];graph_files.replaceChildren();scm_qa.git_graph_panel.prototype.render_files.call(graph_panel,graph_files);graph_files.querySelector('button').click();void 0`);
 assert.equal((await evaluate('opened')).at(-1).to,'c'.repeat(40),'historical additions retain their historical diff');
 await evaluate(`graph_panel.from=scm_qa.INDEX;graph_panel.to=scm_qa.WORKTREE;graph_panel.open_diff({path:'new.md',status:'??'})`);
 assert.deepEqual((await evaluate('opened')).at(-1),{path:'new.md',from:'INDEX',to:'WORKTREE'},'explicit Graph Open Changes remains a diff');
 await evaluate(`panel.host.revision_text=async()=> 'tracked text';panel.host.open_document=(data,group,options)=>window.adjacent_options=options;panel.mark_reviewed=()=>{};window.adjacent_files=[{path:'tracked.md',status:'M'},{path:'new.md',status:'??'},{path:'new.txt',status:'A'}];void 0`);
 await evaluate(`scm_qa.git_source_control.prototype.open_file.call(scm,adjacent_files[0],scm_qa.INDEX,scm_qa.WORKTREE,adjacent_files)`);
 await evaluate(`direct_opens.length=0;adjacent_options.adjacent(1);adjacent_options.adjacent(-1);void 0`);
 assert.deepEqual((await evaluate('direct_opens')).map(item=>item.file),['new.md','new.txt'],'previous/next file use the same default routing for new files');
 assert.equal(git('ls-files','--stage'),before_index,'opening files and mocked staging do not write index');assert.equal(fs.readFileSync(path.join(repository,'new.md'),'utf8'),'# New Markdown\n');
 console.log(JSON.stringify({status:'PASS',geometry,checks:['parent fold hides commit and both child groups from layout and focus','controlled asynchronous refresh retains parent fold and draft','reopen restores child state and scroll; Graph position unchanged','short window long list scrolls inside groups; fold issues no Git write','empty and populated groups toggle with 16px icons','22px regular group rows and aligned headers','white button glyphs and no filter','Explorer Seti file associations in SCM tree/list modes, including rename destination and unknown extension','native click comparison revisions','real Git U and A open current MD and TXT; M D R retain exact comparison revisions','inline open discard and stage do not bubble; discard retains confirmation plan and index bytes','directory expansion does not open a file; late comparisons cannot steal newer navigation'],evidence}));test_window.destroy();app.exit(0);
}).catch(error=>{console.error(error);console.error(evidence);test_window?.destroy();app.exit(1)});
