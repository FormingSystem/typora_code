// 用后段多分支的历史重现前段单轨提交被全局宽度撑开的排版问题。
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {build}=require('esbuild');
const {editor_plugins}=require('./editor_bundle.cjs');
const evidence=fs.mkdtempSync(path.join(os.tmpdir(),'typora_history_layout_'));
app.setPath('userData',path.join(evidence,'user_data'));app.disableHardwareAcceleration();
let test_window;const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=source=>test_window.webContents.executeJavaScript(source);
const capture=async name=>fs.writeFileSync(path.join(evidence,name+'.png'),(await test_window.webContents.capturePage()).toPNG());
app.whenReady().then(async()=>{
  test_window=new BrowserWindow({show:false,width:780,height:800,webPreferences:{contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  const html=path.join(evidence,'test.html');fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;font:13px system-ui;background:white}#sidebar{width:300px;height:100%;border-right:1px solid #ddd;box-sizing:border-box;display:flex;flex-direction:column}</style><aside id="sidebar" class="linux-note-git-source-control git-scm-sidebar"></aside>');await test_window.loadFile(html);test_window.webContents.debugger.attach();await test_window.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled",{enabled:true});
  const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export {graph_defaults} from "./src/git_graph_settings";export {acquire_workspace_interaction} from "./src/workspace_interaction";export {git_scm_history} from "./src/git_scm_history";export {git_graph_panel} from "./src/git_graph_panel";',resolveDir:path.join(__dirname,'..')},bundle:true,loader:{'.css':'text'},format:'iife',globalName:'history_qa',write:false});await evaluate(bundle.outputFiles[0].text);
  await evaluate(`(()=>{const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(style);})()`);
  await evaluate(String.raw`(()=>{
    const make=(hash,parents)=>({hash,parents,author:'测试作者',date:'2026-09-06',subject:hash==='tip'?'修正文件列表缩进和显示位置':hash});
    const commits=[make('tip',['single']),make('single',['merge']),make('merge',Array.from({length:12},(_,index)=>'branch_'+index)),...Array.from({length:12},(_,index)=>make('branch_'+index,['base'])),make('base',['tail']),make('tail',[])];
    window.state={root:'layout-fixture',head:'tip',branch:'main',refs:[{name:'refs/heads/main',hash:'tip'},{name:'refs/remotes/origin/main',hash:'merge'}],commits,more:false,remotes:[]};
    window.opened=[];window.revisions=[];window.owner={sidebar:document.querySelector('#sidebar'),load_epoch:0,repository_action_available(root){return root===this.panel.root},history_tree:false,history_open:true,toggle_history(){},save_layout(){},open_file(...args){opened.push(args)},open_revision_file(...args){revisions.push(args)},file_entries(){return[]},panel:{root:state.root,state,branches:[],settings:{colors:['#1679e8','#6c369d','#008866'],graph_style:'curved',show_tags:true,show_remotes:true},emoji:text=>text,date:commit=>commit.date,host:{},configured_menu(){},target_menu(){},draw_graph:history_qa.git_graph_panel.prototype.draw_graph}};
    window.history_view=new history_qa.git_scm_history(owner);history_view.root=state.root;
    for(const commit of commits)history_view.files_cache.set(commit.hash,[{path:'src/configure_environment.sh',status:'M'},{path:'README.md',status:'A'}]);
    window.interaction=history_qa.acquire_workspace_interaction(document.querySelector('#sidebar'));document.querySelector('#sidebar').append(history_view.container);history_view.render(state);
  })()`);await delay(100);
  const hover_checks=[];
  const file_metrics=()=>evaluate(`(()=>{const row=document.querySelector('[data-hash=tip]').nextElementSibling.querySelector('[data-history-file]'),name=row.querySelector('.git-scm-history-file-name'),label=row.querySelector('.git-scm-file-label'),action=row.parentElement.querySelector('[data-history-file-action]'),box=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height}};return {row:box(row),name:box(name),label:box(label),action:box(action),radius:getComputedStyle(row).borderRadius,columns:getComputedStyle(row).gridTemplateColumns,opacity:getComputedStyle(action).opacity,font:getComputedStyle(name).font,overflow:history_view.list.scrollWidth-history_view.list.clientWidth}})()`);
  for(const theme of ['light','dark'])for(const zoom of [1,1.25])for(const width of [260,420]){
    test_window.webContents.setZoomFactor(zoom);
    await evaluate(`document.querySelector('#sidebar').style.width='${width}px';document.documentElement.dataset.workspaceFileIconTheme='${theme}';history_view.selected='tip';history_view.render(state);document.activeElement?.blur()`);
    test_window.webContents.sendInputEvent({type:'mouseMove',x:750,y:650});await delay(60);const idle=await file_metrics();
    assert.equal(idle.columns.trim().split(/\s+/).length,2,'idle history file does not reserve an action column');
    test_window.webContents.sendInputEvent({type:'mouseMove',x:Math.round((idle.row.left+35)*zoom),y:Math.round((idle.row.top+11)*zoom)});await delay(60);const hovered=await file_metrics();
    assert.equal(hovered.opacity,'1');assert.equal(hovered.radius,'4px');assert.equal(hovered.font,idle.font);assert(Math.abs(hovered.name.width-idle.name.width)<.1,'filename keeps natural width');assert.equal(hovered.name.left,idle.name.left);assert(hovered.label.right<=hovered.action.left,'visible text is clipped before action');assert(hovered.overflow<=1);
    const hit=await evaluate(`(()=>{const n=document.querySelector('[data-hash=tip]').nextElementSibling.querySelector('[data-history-file-action]'),r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()`);assert(hit,'action hit belongs to action');
    test_window.webContents.sendInputEvent({type:'mouseMove',x:750,y:650});await delay(60);assert.deepEqual(await file_metrics(),idle,'pointer leave restores label clipping and action visibility');hover_checks.push({theme,zoom,width,idle,hovered});
  }
  test_window.webContents.setZoomFactor(1);
  const metrics=[];
  for(const width of [220,300,480]){
    await evaluate(`document.querySelector('#sidebar').style.width='${width}px';history_view.selected='tip';history_view.render(state)`);await delay(50);
    const result=await evaluate(`(()=>{const row=document.querySelector('[data-hash=tip]'),svg=row.querySelector('.git-scm-history-topology'),subject=row.querySelector('.git-scm-history-subject'),expansion=row.nextElementSibling,files=expansion.querySelector('.git-scm-history-files'),next=document.querySelector('[data-hash=single] .git-scm-history-topology'),line=expansion.querySelector('line');const rightmost=[...expansion.querySelectorAll('.git-scm-file-status')].map(node=>node.getBoundingClientRect().right);return{svg_width:svg.getBoundingClientRect().width,indent:files.querySelector('.git-scm-file-label').getBoundingClientRect().left-row.getBoundingClientRect().left,gap:subject.getBoundingClientRect().left-svg.getBoundingClientRect().left,twistie:getComputedStyle(row.querySelector('.git-scm-history-disclosure')).display,file_width:files.clientWidth,line_x:line.x1.baseVal.value+line.ownerSVGElement.getBoundingClientRect().left,next_x:next.querySelector('circle').cx.baseVal.value+next.getBoundingClientRect().left,row_bottom:row.getBoundingClientRect().bottom,files_top:files.getBoundingClientRect().top,overflow:history_view.list.scrollWidth-history_view.list.clientWidth,rightmost,badge:row.querySelector('.git-scm-history-ref').textContent,head_fill:getComputedStyle(svg.querySelector('circle')).fill};})()`);
    assert.equal(result.svg_width,22);assert.equal(result.indent,22);assert.equal(result.gap,22);assert.equal(result.twistie,'none');assert(result.file_width>170);assert.equal(result.line_x,result.next_x);assert.equal(result.row_bottom,result.files_top);assert(result.overflow<=1);assert.equal(result.rightmost[0],result.rightmost[1]);assert.equal(result.badge,'main');
    assert.equal(await evaluate(`document.querySelector('[data-history-commit-action]').getBoundingClientRect().width`),0,'expanded alone does not expose an idle commit action');
    const actions=await evaluate(`(()=>{const row=document.querySelector('[data-hash=tip]'),commit=row.parentElement.querySelector('[data-history-commit-action]'),file=row.nextElementSibling.querySelector('[data-history-file]'),action=file.parentElement.querySelector('[data-history-file-action]');row.focus({preventScroll:true});const commit_rect=commit.getBoundingClientRect().toJSON(),summary_rect=row.querySelector('.git-scm-history-summary').getBoundingClientRect().toJSON(),commit_icon={kind:commit.querySelector('svg').dataset.gitIcon,width:commit.querySelector('svg').getBoundingClientRect().width,height:commit.querySelector('svg').getBoundingClientRect().height};action.focus();return{commit:commit_rect,summary:summary_rect,file:action.getBoundingClientRect().toJSON(),label:file.querySelector('.git-scm-file-label').getBoundingClientRect().toJSON(),status:file.querySelector('.git-scm-file-status').getBoundingClientRect().toJSON(),icons:[commit_icon,{kind:action.querySelector('svg').dataset.gitIcon,width:action.querySelector('svg').getBoundingClientRect().width,height:action.querySelector('svg').getBoundingClientRect().height}],visible:getComputedStyle(action).opacity,nested:document.querySelectorAll('button button').length};})()`);
    assert.equal(actions.commit.width,22);assert.equal(actions.commit.height,22);assert.equal(actions.file.width,22);assert.equal(actions.file.height,22);assert(actions.summary.right<=actions.commit.left);assert(actions.label.right<=actions.file.left);assert(actions.file.right<actions.status.left);assert.equal(actions.visible,'1');assert.equal(actions.nested,0);assert.deepEqual(actions.icons,[{kind:'diff-multiple',width:16,height:16},{kind:'go-to-file',width:16,height:16}]);metrics.push({width,...result,actions});await capture('single_lane_'+width);
  }
  await evaluate(`history_view.selected='merge';history_view.render(state)`);await delay(50);
  const merge=await evaluate(`(()=>{const row=document.querySelector('[data-hash=merge]'),svg=row.querySelector('.git-scm-history-topology'),continuation=row.nextElementSibling.querySelector('svg');return{width:svg.getBoundingClientRect().width,lines:[...continuation.querySelectorAll('line')].map(line=>line.x1.baseVal.value),continuation_width:continuation.getBoundingClientRect().width};})()`);
  assert.equal(merge.width,143);assert.equal(merge.continuation_width,143);assert.deepEqual(merge.lines,Array.from({length:12},(_,index)=>(index+1)*11));await capture('multi_lane');
  await evaluate(`history_view.selected='branch_11';history_view.render(state)`);await delay(50);
  assert.equal(await evaluate(`document.querySelector('[data-hash=branch_11]').nextElementSibling.querySelector('.git-scm-file-label').getBoundingClientRect().left-document.querySelector('[data-hash=branch_11]').getBoundingClientRect().left`),143,'all twelve branches keep their lanes until the common parent row');
  await evaluate(`document.querySelector('[data-hash=branch_11]').nextElementSibling.querySelector('[data-history-file]').click()`);assert.equal(await evaluate('opened.length'),1);
  await evaluate(`document.querySelector('[data-hash=branch_11]').click()`);assert.equal(await evaluate('document.querySelectorAll(".git-scm-history-expansion").length'),0);
  await evaluate(`history_view.selected='base';history_view.render(state)`);await delay(50);
  const converged=await evaluate(`(()=>{const row=document.querySelector('[data-hash=base]'),expansion=row.nextElementSibling,lines=[...expansion.querySelectorAll('line')],next=document.querySelector('[data-hash=tail] .git-scm-history-topology');return{indent:expansion.querySelector('.git-scm-file-label').getBoundingClientRect().left-row.getBoundingClientRect().left,lines:lines.map(line=>line.x1.baseVal.value),line_x:lines[0].x1.baseVal.value+lines[0].ownerSVGElement.getBoundingClientRect().left,next_x:next.querySelector('circle').cx.baseVal.value+next.getBoundingClientRect().left}})()`);
  assert.equal(converged.indent,22,'only after the common parent merges tracks does expansion return to one lane');assert.deepEqual(converged.lines,[11]);assert.equal(converged.line_x,converged.next_x);await capture('converged_parent');
  await evaluate(`document.querySelector('[data-hash=tip]').parentElement.querySelector('[data-history-commit-action]').click()`);await delay(50);
  assert.deepEqual(await evaluate(`({selected:history_view.selected,last:opened.at(-1).slice(1),count:opened.length})`),{selected:'tip',last:['single','tip',[{path:'src/configure_environment.sh',status:'M'},{path:'README.md',status:'A'}]],count:2});
  await evaluate(`document.querySelector('[data-hash=tip]').nextElementSibling.querySelector('[data-history-file-action][data-history-path="README.md"]').click()`);
  assert.deepEqual(await evaluate('revisions'),[[{path:'README.md',status:'A'},'single','tip']]);assert.equal(await evaluate('opened.length'),2,'read revision action must not bubble into diff/commit expansion');
  await evaluate(`owner.panel.root='another-repository';document.querySelector('[data-hash=tip]').nextElementSibling.querySelector('[data-history-file-action]').click();document.querySelector('[data-hash=tip]').parentElement.querySelector('[data-history-commit-action]').click()`);await delay(30);
  assert.deepEqual(await evaluate('[opened.length,revisions.length]'),[2,1],'stale history buttons cannot act on a newly selected repository');

  // 提交标签按自然文字顺序裁切；用真实指针验证操作出现前后没有作者列或字形挤压。
  await evaluate(`(()=>{
    const make=(hash,subject,author)=>({hash,subject,author,parents:[],date:'2026-09-13'});
    window.label_state={...state,head:'reference',refs:[{name:'refs/heads/main',hash:'reference'},{name:'refs/heads/feature/'+ 'very-long-branch-'.repeat(8),hash:'multiple'},{name:'refs/remotes/origin/feature/'+ 'remote-branch-'.repeat(8),hash:'multiple'}],commits:[
      make('short','修复图形','lizhaojun'),make('long','fix(workspace):  修复历史提交节点的标题作者排列与行尾裁切'.repeat(4),'lizhaojun'),
      make('author','短标题','a_very_long_author_name_'.repeat(12)),make('reference','当前提交','lizhaojun'),
      make('multiple','多个分支','lizhaojun'),make('empty','没有作者','')],more:false};
    owner.panel.root=label_state.root;owner.panel.state=label_state;history_view.selected='';
    window.commit_label_metrics=hash=>{
      const row=history_view.list.querySelector('[data-hash="'+hash+'"]'),subject=row.querySelector('.git-scm-history-subject'),author=row.querySelector('.git-scm-history-author'),label=subject.parentElement,action=row.parentElement.querySelector('[data-history-commit-action]');
      const box=n=>{if(!n)return null;const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height}};
      const author_style=author&&getComputedStyle(author),subject_style=getComputedStyle(subject),label_style=getComputedStyle(label);
      return {row:box(row),subject:box(subject),author:box(author),label:box(label),action:box(action),subject_font:subject_style.font,subject_size:parseFloat(subject_style.fontSize),weight:subject_style.fontWeight,author_size:author_style&&parseFloat(author_style.fontSize),author_margin:author_style&&parseFloat(author_style.marginLeft),author_opacity:author_style?.opacity,author_weight:author_style?.fontWeight,white_space:subject_style.whiteSpace,overflow:history_view.list.scrollWidth-history_view.list.clientWidth,label_overflow:label.scrollWidth-label.clientWidth,ellipsis:label_style.textOverflow,action_opacity:getComputedStyle(action).opacity,refs:[...row.querySelectorAll('.git-scm-history-ref-name')].map(box)};
    };
  })()`);
  const commit_labels=[];
  for(const theme of ['light','dark'])for(const zoom of [1,1.25])for(const width of [220,300,480,600]){
    test_window.webContents.setZoomFactor(zoom);
    await evaluate(`document.querySelector('#sidebar').style.width='${width}px';document.documentElement.dataset.workspaceFileIconTheme='${theme}';document.documentElement.style.setProperty('--bg-color','${theme==='dark'?'#1e1e1e':'#fff'}');document.body.style.background='${theme==='dark'?'#1e1e1e':'#fff'}';document.body.style.color='${theme==='dark'?'#ddd':'#333'}';document.documentElement.style.setProperty('--text-color','${theme==='dark'?'#ddd':'#333'}');owner.panel.settings.history_always_show_actions=false;history_view.render(label_state);document.activeElement?.blur()`);
    test_window.webContents.sendInputEvent({type:'mouseMove',x:760,y:700});await delay(60);
    const idle=await evaluate(`commit_label_metrics('short')`);
    assert(idle.author,'short commit includes author');
    assert(Math.abs(idle.author.left-idle.subject.right-idle.author_margin)<.2,'author follows subject with only the description margin');
    assert.equal(idle.ellipsis,'ellipsis','subject and author share one terminal ellipsis');
    assert.equal(idle.white_space,'pre','subject preserves consecutive spaces');
    assert(Math.abs(idle.author_size-idle.subject_size*.9)<.02,'author uses upstream description scale');
    assert(Math.abs(idle.author_margin-idle.author_size*.5)<.02,'author uses upstream half-em separation');
    assert.equal(idle.author_opacity,theme==='light'?'0.95':'0.7');
    assert.equal(idle.action.width,0);assert(idle.overflow<=1);
    const long=await evaluate(`commit_label_metrics('long')`),author=await evaluate(`commit_label_metrics('author')`),ref=await evaluate(`commit_label_metrics('reference')`),multiple=await evaluate(`commit_label_metrics('multiple')`),empty=await evaluate(`commit_label_metrics('empty')`);
    assert(long.subject.width>long.label.width&&long.author.left>long.label.right,'long subject clips before author instead of reserving an author column');
    assert(author.author.width>author.label.width&&author.label_overflow>0,'long author clips in the common text region');
    assert(ref.author&&multiple.author,'refs never remove author metadata');assert.equal(ref.weight,'600');assert.equal(ref.author_weight,'600');
    for(const item of [ref,multiple]){assert(item.overflow<=1);assert(item.refs.every(r=>r.width<=100.1),'each ref description has a 100px cap');}
    assert(!empty.author||empty.author.width===0,'missing author leaves no visible label');
    test_window.webContents.sendInputEvent({type:'mouseMove',x:Math.round((idle.row.left+30)*zoom),y:Math.round((idle.row.top+11)*zoom)});await delay(60);
    const hovered=await evaluate(`commit_label_metrics('short')`);assert.equal(hovered.action.width,22);assert.equal(hovered.action_opacity,'1');assert.equal(hovered.row.width,idle.row.width,'commit state background spans full row even with actions');
    assert.equal(hovered.subject.left,idle.subject.left);assert.equal(hovered.subject.width,idle.subject.width);assert.equal(hovered.author.left,idle.author.left);assert.equal(hovered.subject_font,idle.subject_font);assert(Math.abs(idle.label.width-hovered.label.width-22)<.2);assert(hovered.label.right<=hovered.action.left);
    const hit=await evaluate(`(()=>{const n=history_view.list.querySelector('[data-hash=short]').parentElement.querySelector('[data-history-commit-action]'),r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.left+r.width/2,r.top+11))})()`);assert(hit);
    test_window.webContents.sendInputEvent({type:'mouseMove',x:760,y:700});await delay(60);assert.deepEqual(await evaluate(`commit_label_metrics('short')`),idle,'pointer leave restores exact layout');
    await evaluate(`history_view.list.querySelector('[data-hash=short]').focus({preventScroll:true})`);const focused=await evaluate(`commit_label_metrics('short')`);assert.equal(focused.action.width,22);assert.equal(focused.author_opacity,'1');
    await evaluate(`document.activeElement.blur();owner.panel.settings.history_always_show_actions=true;history_view.render(label_state)`);assert.equal((await evaluate(`commit_label_metrics('short')`)).action.width,22);
    commit_labels.push({theme,zoom,width,idle,hovered,long,ref,multiple});
    if(zoom===1&&[300,600].includes(width))await capture('commit_labels_'+theme+'_'+width);
  }
  fs.writeFileSync(path.join(evidence,'commit_labels.json'),JSON.stringify(commit_labels,null,2));

  // 新增区间沿用真实共享选择与颜色，覆盖窄侧栏、缩放及Chromium指针悬停。
  await evaluate(`(()=>{const local='a'.repeat(40),remote='b'.repeat(40),base='c'.repeat(40);window.range_state={...state,head:local,branch:'main',refs:[],tracking:{merge_base:base,upstream:'refs/remotes/team/main',upstream_hash:remote,ahead:1,behind:1},commits:[{hash:local,parents:[base],subject:'local',author:'author',date:''},{hash:remote,parents:[base],subject:'remote',author:'author',date:''},{hash:base,parents:[],subject:'base',author:'author',date:''}]};owner.panel.state=range_state;history_view.selected='';})()`);
  const range_states=[];
  for(const theme of ['light','dark'])for(const zoom of [1,1.25])for(const width of [220,420]){
    test_window.webContents.setZoomFactor(zoom);
    await evaluate(`document.querySelector('#sidebar').style.width='${width}px';document.documentElement.dataset.workspaceFileIconTheme='${theme}';document.documentElement.style.setProperty('--bg-color','${theme==='dark'?'#1e1e1e':'#fff'}');document.documentElement.style.setProperty('--text-color','${theme==='dark'?'#ddd':'#333'}');history_view.render(range_state);history_view.selection.reset();document.activeElement?.blur()`);
    const sample=()=>evaluate(`(()=>{const rows=[...history_view.list.querySelectorAll('[data-history-range]')];return rows.map(row=>{const svg=row.querySelector('.git-history-node'),circles=[...svg.querySelectorAll('circle')],r=row.getBoundingClientRect();return {kind:row.dataset.historyRange,x:r.left+30,y:r.top+11,height:r.height,width:r.width,overflow:history_view.list.scrollWidth-history_view.list.clientWidth,background:getComputedStyle(row).backgroundColor,circles:circles.map(c=>({r:c.r.baseVal.value,fill:getComputedStyle(c).fill,stroke:getComputedStyle(c).stroke,dash:getComputedStyle(c).strokeDasharray}))}})})()`);
    test_window.webContents.sendInputEvent({type:'mouseMove',x:750,y:700});await delay(50);const idle=await sample();
    assert.equal(idle.length,2);for(const item of idle){assert.equal(item.height,22);assert(item.overflow<=1);assert.deepEqual(item.circles.map(c=>c.r),[7,5,5]);assert.equal(item.circles[2].dash,'4px, 2px');}
    test_window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(idle[0].x*zoom),y:Math.round(idle[0].y*zoom)});await delay(50);const hovered=await sample();assert.notEqual(hovered[0].circles[2].fill,idle[0].circles[2].fill);assert.equal(hovered[0].width,idle[0].width);
    await evaluate(`(()=>{const row=history_view.list.querySelector('[data-history-range=incoming]');history_view.selection.select([row.dataset.workspaceRowKey]);row.focus()})()`);const selected=await sample();assert.equal(await evaluate(`history_view.list.querySelectorAll('[data-workspace-selected=true]').length`),1);
    assert.notEqual(selected[1].background,'rgba(0, 0, 0, 0)');assert.equal(selected[1].width,idle[1].width);range_states.push({theme,zoom,width,idle,hovered,selected});
    if(zoom===1&&width===420)await capture('ranges_'+theme);
  }
  fs.writeFileSync(path.join(evidence,'range_states.json'),JSON.stringify(range_states,null,2));


  const branch_colors=[];
  await evaluate(`(()=>{const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/workspace_colors.css'),'utf8'))};document.head.append(style);document.body.style.background='var(--workspace-ui-background)';document.querySelector('#sidebar').style.background='var(--workspace-ui-chrome)';})()`);
  await evaluate(`(()=>{const make=(hash,parents)=>({hash,parents,author:'QA',date:'2026-09-25',subject:hash});state={...state,head:'current',branch:'main',tracking:undefined,commits:[make('future',['current']),make('current',['older']),make('older',[])],refs:[{name:'refs/heads/main',hash:'current'},{name:'refs/heads/future',hash:'future'}]};owner.panel.root=state.root;owner.panel.state=state;owner.panel.graph_color=history_qa.git_graph_panel.prototype.graph_color;owner.panel.settings.colors=[...history_qa.graph_defaults.colors];history_view.files_cache.set('future',[{path:'future.md',status:'M'}]);history_view.selected='future';})()`);
  for(const theme of ['light','dark']){
    await evaluate(`document.documentElement.dataset.workspaceColors='${theme}';document.documentElement.dataset.workspaceFileIconTheme='${theme}';history_view.render(state);history_view.selection.select(['commit:future']);history_view.list.querySelector('[data-hash=future]').focus()`);
    const sample=await evaluate(`(()=>{const row=hash=>history_view.list.querySelector('[data-hash='+hash+']'),color=hash=>getComputedStyle(row(hash).querySelector('circle')).fill;return {future:color('future'),current:color('current'),older:color('older'),incoming:getComputedStyle(row('current').querySelector('.git-scm-history-topology path')).stroke,continuation:getComputedStyle(row('future').nextElementSibling.querySelector('line')).stroke,selected:history_view.list.querySelectorAll('[data-workspace-selected=true]').length}})()`);
    assert.equal(sample.future,'rgb(255, 176, 0)');assert.notEqual(sample.current,sample.future);assert.equal(sample.current,sample.older);assert.equal(sample.incoming,'rgb(255, 176, 0)');assert.equal(sample.continuation,'rgb(255, 176, 0)');assert.equal(sample.selected,1);
    const future_box=await evaluate(`(()=>{const r=history_view.list.querySelector('[data-hash=current]').getBoundingClientRect();return{x:r.x+60,y:r.y+10}})()`);test_window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(future_box.x),y:Math.round(future_box.y)});
    assert.equal(await evaluate(`getComputedStyle(history_view.list.querySelector('[data-hash=future] circle')).fill`),sample.future);branch_colors.push({theme,...sample});await capture('branch_colors_'+theme);
  }
  await evaluate(`owner.panel.settings.colors=['#112233','#445566','#778899'];history_view.render(state)`);
  assert.equal(await evaluate(`history_view.list.querySelector('[data-hash=future] circle').getAttribute('fill')`),'#778899');assert.equal(await evaluate(`history_view.list.querySelector('[data-hash=current] circle').getAttribute('fill')`),'#112233');
  fs.writeFileSync(path.join(evidence,'branch_colors.json'),JSON.stringify(branch_colors,null,2));
  console.log(JSON.stringify({status:'PASS',checks:['later 12-lane merge cannot widen current single-lane row','single-lane file list begins at 22px without an extra count row','separate twistie column is removed','continuation and next commit retain identical lane coordinates','multi-parent expansion preserves all 12 live lanes','branches retain distinct tracks until their common parent then return to one-lane file indentation','narrow and wide sidebars keep status alignment and avoid overflow','file click still opens the selected comparison and commit click collapses it'],commit_label_scenarios:commit_labels.length,hover_checks,metrics,merge,converged,evidence}));test_window.destroy();app.exit(0);
}).catch(async error=>{console.error(error);console.error(evidence);if(test_window&&!test_window.isDestroyed()){await capture('failure');test_window.destroy();}app.exit(1);});
