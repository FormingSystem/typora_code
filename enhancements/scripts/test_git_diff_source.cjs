// 验证活动差异来源、焦点选择及虚拟历史列表中的精确定位。
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {build}=require('esbuild');
const {editor_plugins}=require('./editor_bundle.cjs');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_diff_source_'));
app.setPath('userData',path.join(evidence,'user_data'));app.disableHardwareAcceleration();
let test_window;const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=source=>test_window.webContents.executeJavaScript(source.includes('await ')?`(async()=>{${source}})()`:source);

const capture=async name=>fs.writeFileSync(path.join(evidence,name+'.png'),(await test_window.webContents.capturePage()).toPNG());
app.whenReady().then(async()=>{
  test_window=new BrowserWindow({show:false,width:780,height:800,webPreferences:{contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  test_window.webContents.on('console-message',(_event,_level,message)=>console.log(message));
  const html=path.join(evidence,'test.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;font:13px system-ui;background:white}#sidebar{width:300px;height:100%;border-right:1px solid #ddd;box-sizing:border-box;display:flex;flex-direction:column}</style><aside id="sidebar" class="linux-note-git-source-control git-scm-sidebar"></aside>');await test_window.loadFile(html);test_window.webContents.debugger.attach();await test_window.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled",{enabled:true});
  const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export {sync_git_source_rows} from "./src/git_diff_source";export {acquire_workspace_interaction} from "./src/workspace_interaction";export {git_scm_history} from "./src/git_scm_history";export {git_graph_panel} from "./src/git_graph_panel";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'history_qa',write:false});await test_window.webContents.executeJavaScript(bundle.outputFiles[0].text);
  await evaluate(`(()=>{const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(style);})()`);
  await evaluate(String.raw`(()=>{
    const make=(hash,parents)=>({hash,parents,author:'测试作者',date:'2026-09-06',subject:hash==='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'?'修正文件列表缩进和显示位置':hash});
    const commits=[make('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']),make('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',['cccccccccccccccccccccccccccccccccccccccc']),make('cccccccccccccccccccccccccccccccccccccccc',Array.from({length:12},(_,index)=>'branch_'+index)),...Array.from({length:12},(_,index)=>make('branch_'+index,['base'])),make('base',['tail']),make('tail',[])];
    window.state={root:'layout-fixture',head:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',branch:'main',refs:[{name:'refs/heads/main',hash:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},{name:'refs/remotes/origin/main',hash:'cccccccccccccccccccccccccccccccccccccccc'}],commits,more:false,remotes:[]};
    window.opened=[];window.revisions=[];window.owner={sidebar:document.querySelector('#sidebar'),load_epoch:0,repository_action_available(root){return root===this.panel.root},history_tree:false,history_open:true,toggle_history(){},save_layout(){},open_file(...args){opened.push(args)},open_revision_file(...args){revisions.push(args)},file_entries(){return[]},panel:{root:state.root,state,branches:[],settings:{colors:['#1679e8','#6c369d','#008866'],graph_style:'curved',show_tags:true,show_remotes:true},emoji:text=>text,date:commit=>commit.date,host:{},configured_menu(){},target_menu(){},draw_graph:history_qa.git_graph_panel.prototype.draw_graph}};
    window.history_view=new history_qa.git_scm_history(owner);history_view.root=state.root;
    for(const commit of commits)history_view.files_cache.set(commit.hash,[{path:'src/configure_environment.sh',status:'M'},{path:'README.md',status:'A'}]);
    window.interaction=history_qa.acquire_workspace_interaction(document.querySelector('#sidebar'));document.querySelector('#sidebar').append(history_view.container);history_view.render(state);
  })()`);await delay(100);

  const checks=[];
  const check=async(expression,label)=>{assert(await evaluate(expression),label);checks.push(label);};
  await test_window.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../src/workspace_colors.css'),'utf8'));
  await evaluate(`window.source={root:state.root,from:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',to:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',file:'README.md'};owner.panel.host.diff_source=()=>source;owner.sync_source_selection=()=>history_qa.sync_git_source_rows(owner.sidebar,source);owner.apply_history_layout=()=>history_view.set_open(true);owner.panel.runner={run:async()=> ['M','README.md',''].join(String.fromCharCode(0))};history_view.selected='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';history_view.render(state);`);
  await check(`document.querySelector('[data-history-file="README.md"]').getAttribute('aria-current')==='true'`,'rendered row projects active diff identity');
  for(const theme of ['light','dark']){
    await evaluate(`document.documentElement.dataset.workspaceColors='${theme}';document.querySelector('[data-history-file="README.md"]').focus()`);
    await check(`getComputedStyle(document.querySelector('[data-history-file="README.md"]')).backgroundColor==='${theme==='dark'?'rgb(4, 57, 94)':'rgb(232, 232, 232)'}'`,'focused selected colour '+theme);
    await evaluate(`document.activeElement.blur()`);
    await check(`document.querySelector('[data-history-file="README.md"]').classList.contains('selected')&&getComputedStyle(document.querySelector('[data-history-file="README.md"]')).backgroundColor==='${theme==='dark'?'rgb(55, 55, 61)':'rgb(232, 232, 232)'}'`,'selection survives blur '+theme);
  }
  await evaluate(`source={...source,to:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',from:'cccccccccccccccccccccccccccccccccccccccc'};owner.sync_source_selection()`);
  await check(`!document.querySelector('[data-git-source-selected=true]')`,'same file in different commit cannot inherit selection');
  await evaluate(`source=undefined;owner.sync_source_selection()`);
  await check(`!document.querySelector('[aria-current=true]')`,'ordinary editor clears old source');
  await evaluate(`source={root:state.root,from:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',to:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',file:'README.md'};history_view.selected='';history_view.render(state);owner.panel.runner.run=async()=>['M','README.md',''].join(String.fromCharCode(0));await history_view.reveal_source(source,()=>true)`);
  await check(`history_view.selected==='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'&&document.activeElement.dataset.historyFile==='README.md'&&document.activeElement.dataset.gitSourceSelected==='true'`,'reveal expands commit and focuses selected file without opening diff');
  await check(`opened.length===0`,'reveal does not reopen document');
  for(const size of [20,100,1000]){console.log("reveal scale",size);
    await evaluate(`window.files=Array.from({length:${size}},(_,i)=>({path:'dir/file'+String(i).padStart(4,'0')+'.md',status:'M'}));owner.panel.runner.run=async()=>files.flatMap(f=>['M',f.path]).concat('').join(String.fromCharCode(0));source={root:state.root,from:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',to:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',file:files.at(-1).path};owner.history_tree=true;history_view.collapsed_directories.add('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:dir');await history_view.reveal_source(source,()=>true)`);
    await check(`document.activeElement.dataset.historyFile===source.file&&document.activeElement.dataset.gitSourceSelected==='true'`,'reveal final file and collapsed ancestors '+size);
    if(size===1000)await check(`document.querySelectorAll('[data-history-file]').length<100`,'1000 files remain virtualized');
  }
  await evaluate(`window.release;owner.panel.runner.run=()=>new Promise(resolve=>release=resolve);window.live=true;window.pending=history_view.reveal_source(source,()=>live);live=false;release(['M','README.md',''].join(String.fromCharCode(0)));await pending`);
  await check(`document.activeElement.dataset.historyFile===source.file`,'late cancelled reveal cannot replace current location');
  await evaluate(`owner.history_tree=false;source={root:state.root,from:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',to:'dddddddddddddddddddddddddddddddddddddddd',file:'new.md',old_path:'old.md'};owner.panel.runner.run=async(_root,args)=>args[0]==='log'?[source.to,source.from,'author','2026-09-24','filtered commit',''].join(String.fromCharCode(0)):['R100','old.md','new.md',''].join(String.fromCharCode(0));await history_view.reveal_source(source,()=>true)`);
  await check(`document.activeElement.dataset.historyFile==='new.md'&&document.activeElement.dataset.gitSourceSelected==='true'&&state.commits.every(c=>c.hash!==source.to)`,'filtered commit loads directly and renamed file preserves old path without changing filter');
  await evaluate(`source={...source,old_path:'unrelated.md'};owner.sync_source_selection()`);
  await check(`!document.querySelector('[data-git-source-selected=true]')`,'different rename origin cannot inherit selection');
  await evaluate(`history_view.dispose();interaction.remove()`);
  console.log(JSON.stringify({status:'PASS',checks,evidence}));test_window.destroy();app.exit(0);
}).catch(async error=>{console.error(error);console.error(evidence);console.error(await evaluate(`JSON.stringify({selected:history_view.selected,source,files:[...document.querySelectorAll('[data-history-file]')].map(n=>n.dataset.historyFile),height:history_view.list.clientHeight,scroll:history_view.list.scrollTop,targets:[...document.querySelectorAll('[data-commit]')].map(n=>({h:n.clientHeight,rect:n.getBoundingClientRect().toJSON()}))})`));if(test_window&&!test_window.isDestroyed()){await capture('failure');test_window.destroy();}app.exit(1);});
