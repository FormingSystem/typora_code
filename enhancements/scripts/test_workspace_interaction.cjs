// 真实指针 + 正式CSS；UI由菜单、活动栏、标签适配器和SCM实例创建。
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const evidence=path.join(__dirname,'../../.cache/interaction_ui_'+Date.now());fs.mkdirSync(evidence,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'typora_interaction_')));app.disableHardwareAcceleration();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let win;const checks=[];
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  const asset=name=>pathToFileURL(path.join(__dirname,'../dist',name)).href;
  const html=path.join(evidence,'fixture.html');fs.writeFileSync(html,`<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="${asset('workspace_core.css')}"><link id="typora-code-workspace-styles" rel="stylesheet" href="${asset('workspace.css')}">
  <style>html,body{margin:0;height:100%;font:13px 'Segoe UI';--bg-color:white;--text-color:#202020}#top-titlebar button{background:#fafafd}#ribbon{box-sizing:border-box;padding:0;display:block!important;position:fixed;top:40px;left:0;width:48px;height:calc(100vh - 40px)}#ribbon>.group.bottom{position:absolute;bottom:0;left:0}#ribbon .group.bottom>.typ-ribbon-item{box-sizing:border-box;padding:0;width:48px;height:48px;display:flex;align-items:center;justify-content:center}#tabs{position:absolute;left:330px;top:45px;width:700px}#scm{position:absolute;top:100px;left:50px;width:280px;height:calc(100vh - 100px)}.linux-note-git-source-control{height:100%}footer.ty-footer{position:absolute;bottom:0;height:26px;left:330px;right:0;padding:0;display:flex;align-items:center}#safe{position:absolute;top:70px;right:10px}</style>
  </head><body><div id="top-titlebar" data-workspace-titlebar="ready"></div><div class="typ-ribbon" id="ribbon"><div class="group top"><div class="typ-ribbon-item" data-id="core.file-explorer" title="文件"></div></div><div class="group bottom"><button class="typ-ribbon-item" data-id="settings">⚙</button><div class="typ-ribbon-item" data-id="linux_note:terminal"></div></div></div><div class="typ-workspace-tabs mod-active" id="tabs"><div class="typ-workspace-tab-header"><div class="typ-tabs"><div class="typ-tab active" data-id="one.md"><i class="typ-file-icon"></i><span class="typ-file-basename">当前文档</span><span class="typ-file-ext">.md</span><i class="typ-icon typ-close"></i></div><div class="typ-tab" data-id="draft.c"><i class="typ-file-icon"></i><span class="typ-file-basename">编辑中的长名称代码</span><i class="typ-icon typ-close"></i></div></div></div></div><div id="scm"></div><button id="safe">其他区域</button><footer class="ty-footer"><span class="workspace-footer-control"><span class="workspace-footer-text">4997词</span></span></footer></body></html>`);
  await win.loadFile(html);win.webContents.debugger.attach();await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});const ev=async source=>{const result=await win.webContents.executeJavaScript(`(()=>{try{return{value:(0,eval)(${JSON.stringify(source)})}}catch(error){return{error:error.stack}}})()`);if(result.error)throw Error(result.error);return result.value;};
  const bundle=await require('esbuild').build({stdin:{contents:'export {bind_workspace_hover} from "./src/workspace_hover";export {git_source_control} from "./src/git_source_control";export {git_graph_panel} from "./src/git_graph_panel";export {build_git_graph} from "./src/git_graph_data";export {graph_defaults} from "./src/git_graph_settings";export {create_workspace_titlebar_menu} from "./src/workspace_titlebar_menu";export {bind_workspace_tab_controls} from "./src/workspace_tab_controls";export {install_workspace_activity} from "./src/workspace_activity";export {git_icon} from "./src/git_icons";export {read_commit_hover_detail} from "./src/git_graph_repository";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'qa',loader:{'.css':'text'}});await ev(bundle.outputFiles[0].text);
  await ev(`window.errors=[];window.addEventListener('error',e=>errors.push(String(e.error||e.message)));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
    window.menu=qa.create_workspace_titlebar_menu(document.querySelector('#top-titlebar'),[{label:'文件',mnemonic:'f',entries:async()=>[{label:'打开',action(){}}]},{label:'终端',mnemonic:'t',entries:async()=>[{label:'新建',action(){}}]}]);document.querySelector('#top-titlebar').append(menu.element);menu.refresh();
    window.activity=qa.install_workspace_activity({ribbon:document.querySelector('#ribbon'),item_ids:['core.file-explorer'],read_state:()=>({active_id:'core.file-explorer',sidebar_visible:true})});document.querySelector('[data-id="linux_note:terminal"]').append(qa.git_icon('terminal'));
    const tab_leaves=[...document.querySelectorAll('.typ-tab')].map(tab=>({state:{path:tab.dataset.id},view:{},parent:{tabHeader:{getTabById:id=>[...document.querySelectorAll('.typ-tab')].find(node=>node.dataset.id===id)}}}));window.tabs=qa.bind_workspace_tab_controls({app:{workspace:{eachLeaves:fn=>tab_leaves.forEach(fn),on:()=>()=>{}}}});document.querySelectorAll('.typ-tab .typ-file-icon').forEach(n=>n.append(qa.git_icon('file')));
    const commit=(n)=>({hash:String(n).padStart(40,'0'),parents:n>1?[String(n-1).padStart(40,'0')]:[],author:'测试作者',date:'2026-09-12T10:00:00+08:00',subject:n===40?'很长的提交标题：<img src=x onerror=alert(1)> 修改说明':'修复布局 '+n});
    window.delay_a=false;window.release_a=null;window.reads=[];window.panel={root:'fixture',branches:[],state:{root:'fixture',head:commit(40).hash,branch:'main',refs:[{name:'refs/heads/main',hash:commit(40).hash},{name:'refs/remotes/origin/main',hash:commit(40).hash}],commits:Array.from({length:40},(_,i)=>commit(40-i)),changes:[],stashes:[],remotes:[],more:false,operation:''},settings:qa.graph_defaults,repo_select:document.createElement('select'),emoji:s=>s,date:c=>c.date,configured_menu(){},action_dialog(){},refresh(){},report(){},host:{copy:s=>{window.copied=s}},runner:{run:async(root,args)=>{reads.push(args);if(delay_a&&args.includes(commit(40).hash))await new Promise(r=>release_a=r);return args.includes('--numstat')?'2\\t1\\tfile.md\\0':'完整提交信息 <img> '+args.find(x=>/^[0-9]{40}$/.test(x))}},draw_graph:(row,lanes,options)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',(lanes+1)*11);svg.setAttribute('height',22);return svg;}};
    window.scm=new qa.git_source_control(panel);panel.workbench=scm;const shell=document.createElement('div');shell.className='linux-note-git-source-control';shell.append(scm.sidebar);document.querySelector('#scm').append(shell);scm.history_ratio=.15;scm.apply_history_layout();scm.history.render(panel.state);scm.branch.textContent='main';void 0`);
  const move=async selector=>{const p=await ev(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(p.x*win.webContents.getZoomFactor()),y:Math.round(p.y*win.webContents.getZoomFactor())});await pause(160);};
  const check=async(label,code)=>{assert(await ev(code),label+' '+JSON.stringify(await ev(`({tip:document.querySelector('.workspace-hover-surface')?.outerHTML,viewport:[innerWidth,innerHeight],geometry:[...document.querySelectorAll('.workspace-hover-surface')].map(n=>({...n.getBoundingClientRect().toJSON(),side:n.dataset.hoverSide})),probe:window.probe?.getBoundingClientRect().toJSON(),reads,errors,hover:[...document.querySelectorAll('.git-scm-history-commit:hover')].map(n=>n.dataset.hash)})`)));checks.push(label);};
  const bg=selector=>ev(`getComputedStyle(document.querySelector(${JSON.stringify(selector)}),${JSON.stringify(selector.includes(".typ-tab")?"::after":null)}).backgroundColor`);
  for(const theme of ['light','dark']){
    await ev(`document.documentElement.dataset.workspaceFileIconTheme='${theme}'`);
    for(const zoom of [1,1.2,1.25]){
      win.webContents.setZoomFactor(zoom);await pause(150);
      for(const selector of ['.workspace-titlebar-menu>button','.workspace-titlebar-menu>button:nth-child(2)','#ribbon .group.bottom>button','#ribbon .group.bottom>div','.git-scm-branch','.typ-tab:not(.active)']){
        await move('#safe');const before=await bg(selector);await move(selector);const during=await bg(selector);assert.notEqual(before,during,theme+' '+zoom+' hover '+selector+' '+JSON.stringify(await ev(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect();return {rect:[r.x,r.y,r.width,r.height],viewport:[innerWidth,innerHeight],hover:n.matches(':hover'),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,150)}})()`)));await move('#safe');assert.equal(await bg(selector),before,'leave restores background');checks.push(theme+' '+zoom+' hover '+selector);
      }
      await check('glyph and icon centers '+theme+' '+zoom,`[...document.querySelectorAll('.typ-tab')].every(tab=>{const r=tab.getBoundingClientRect(),cy=r.y+r.height/2;return [...tab.querySelectorAll('.typ-file-icon,.typ-file-basename,.typ-file-ext,.typ-close')].filter(n=>n.getClientRects().length).every(n=>{let box=n.getBoundingClientRect();if(n.matches('span')){const range=document.createRange();range.selectNodeContents(n);box=range.getBoundingClientRect()}return Math.abs(box.y+box.height/2-cy)<1.2})})`);
    }
  }
  win.webContents.setZoomFactor(1);await ev('document.documentElement.dataset.workspaceFileIconTheme="light"');await move('#safe');
  await move('.workspace-titlebar-menu>button:nth-child(2)');await ev('document.querySelector(".workspace-titlebar-menu>button:nth-child(2)").click()');await move('#safe');await check('expanded menu remains highlighted','document.querySelector(".workspace-titlebar-menu>button:nth-child(2)").getAttribute("aria-expanded")==="true"&&getComputedStyle(document.querySelector(".workspace-titlebar-menu>button:nth-child(2)")).backgroundColor!=="rgb(250, 250, 253)"');await ev('menu.dispose()');
  for(const width of [200,280,420]){
    await ev(`document.querySelector('#scm').style.width='${width}px'`);await pause(100);await move('#safe');
    await check('no idle action gap '+width,'(()=>{const row=document.querySelector(".git-scm-history-commit"),entry=row.parentElement;return Math.abs(row.getBoundingClientRect().width-entry.getBoundingClientRect().width)<1&&entry.scrollWidth<=entry.clientWidth+1})()');
    await move('.git-scm-history-entry:first-child>.git-scm-history-commit');
    await check('actions show immediately before first details '+width,'getComputedStyle(document.querySelector(".git-scm-history-commit-action")).opacity==="1"&&!document.querySelector(".git-commit-hover")');await pause(550);
    await check('structured commit hover '+width,'(()=>{const tip=document.querySelector(".git-commit-hover");return !!tip&&tip.textContent.includes("+2")&&tip.textContent.includes("−1")&&!tip.querySelector("img")&&!document.querySelector(".git-scm-history-commit[title]")})()');
    await check('card avoids the complete list and scrollbar '+width,'(()=>{const tip=document.querySelector(".git-commit-hover").getBoundingClientRect(),list=scm.history.list.getBoundingClientRect();return tip.left>=list.right+3||tip.right<=list.left-3||tip.bottom<=list.top-3||tip.top>=list.bottom+3})()');
    await check('commit and action columns do not overlap '+width,'(()=>{const r=document.querySelector(".git-scm-history-commit").getBoundingClientRect(),a=document.querySelector(".git-scm-history-commit-action").getBoundingClientRect();return r.right<=a.left+1&&a.width===22})()');
    await check('compact pointer card centers on its row '+width,'(()=>{const tip=document.querySelector(".git-commit-hover"),t=tip.getBoundingClientRect(),r=document.querySelector(".git-scm-history-commit").getBoundingClientRect(),s=getComputedStyle(tip);return Math.abs(t.y+t.height/2-r.y-r.height/2)<1&&s.fontSize==="12px"&&s.lineHeight==="19px"&&s.paddingTop==="2px"&&s.borderRadius==="3px"&&!!document.querySelector(".workspace-hover-pointer")})()');
    await check('action remains hit-testable while details are shown '+width,'(()=>{const a=document.querySelector(".git-scm-history-commit-action"),r=a.getBoundingClientRect();return a.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()');
    await move('.git-commit-hover-copy');await pause(300);await check('pointer can enter and copy','!!document.querySelector(".git-commit-hover")');await ev('document.querySelector(".git-commit-hover-copy").click()');await pause(30);await check('copy exact identity','copied===panel.state.head');
    await check('card fits viewport','(()=>{const r=document.querySelector(".git-commit-hover").getBoundingClientRect();return r.left>=7&&r.right<=innerWidth-7&&r.top>=7&&r.bottom<=innerHeight-7})()');
    await ev('window.dispatchEvent(new Event("resize"))');await check('resize closes card','!document.querySelector(".git-commit-hover")');
  }
  await ev('scm.history.open_changes=async(state,commit)=>{window.opened_changes=commit.hash};document.querySelector("#scm").style.width="280px";void 0');
  await move('#safe');await move('.git-scm-history-entry:first-child>.git-scm-history-commit');await pause(550);
  await move('.git-scm-history-entry:first-child>.git-scm-history-commit-action');
  const action_point=await ev('(()=>{const r=document.querySelector(".git-scm-history-commit-action").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...action_point,button:'left',clickCount:1});await pause(50);
  await check('real click reaches row action with a visible detail card','opened_changes===panel.state.head&&!document.querySelector(".git-commit-hover")');
  await ev('document.activeElement.blur();panel.settings.history_always_show_actions=true;scm.history.render(panel.state);void 0');await move('#safe');
  await check('always-show configuration applies to every idle row','[...document.querySelectorAll(".git-scm-history-commit-action")].every(a=>getComputedStyle(a).opacity==="1"&&a.getBoundingClientRect().width===22)');
  await ev('panel.settings.history_always_show_actions=false;scm.history.render(panel.state);void 0');await move('#safe');
  await check('turning always-show off restores idle layout','document.querySelector(".git-scm-history-commit-action").getBoundingClientRect().width===0');
  await move('.git-scm-history-entry:first-child>.git-scm-history-commit');await pause(550);await move('.git-scm-history-entry:nth-child(2)>.git-scm-history-commit');
  await check('visible hover group changes identity without another initial wait','document.querySelector(".git-commit-hover")?.dataset.hash===panel.state.commits[1].hash');
  await move('#safe');await pause(300);
  await ev('document.querySelector("#scm").style.width="280px"');await move('#safe');await move('.git-scm-history-entry:nth-child(2)>.git-scm-history-commit');await pause(550);await check('second commit identity','document.querySelector(".git-commit-hover")?.dataset.hash===panel.state.commits[1].hash');
  await ev('scm.history.list.scrollTop=200');await pause(100);await check('scroll closes card','!document.querySelector(".git-commit-hover")');
  await ev('scm.history.list.scrollTop=0;scm.history.render(panel.state)');await move('#safe');await move('.git-scm-history-entry:first-child>.git-scm-history-commit');await pause(550);await ev('document.querySelector(".git-commit-hover-copy").focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await pause(450);await check('Escape restores row focus','!document.querySelector(".git-commit-hover")&&document.activeElement.matches(".git-scm-history-commit")');
  await ev('document.activeElement.blur();scm.history.render(panel.state)');await move('#safe');
  // 未完成的A读取，在刷新后不得写入B的浮层。
  await ev('window.old_read=panel.runner.run;panel.runner.run=async(root,args)=>args.includes(panel.state.commits[2].hash)?await new Promise(r=>{(window.pending_resolves||=[]).push(()=>r(args.includes("--numstat")?"7\\t0\\tx\\0":"旧提交A"))}):old_read(root,args);void 0');
  await move('.git-scm-history-entry:nth-child(3)>.git-scm-history-commit');await pause(550);await move('.git-scm-history-entry:nth-child(4)>.git-scm-history-commit');await pause(550);await ev('(window.pending_resolves||[]).forEach(r=>r())');await pause(50);await check('stale asynchronous commit cannot replace current','document.querySelector(".git-commit-hover")?.dataset.hash===panel.state.commits[3].hash&&!document.querySelector(".git-commit-hover").textContent.includes("旧提交A")');
  fs.writeFileSync(path.join(evidence,'graph_hover.png'),(await win.webContents.capturePage()).toPNG());
  await ev('scm.history.render(panel.state)');await check('refresh cancels visible hover','!document.querySelector(".git-commit-hover")');

  // 详情必须真正显示全名；文字行盒、徽章和浮层均不能裁掉长名称。
  for(const theme of ['light','dark'])for(const zoom of [1,1.25]){
    win.webContents.setZoomFactor(zoom);await move('#safe');
    await ev(`window.full_refs=['codex/sync-arm-external-resources','origin/'+ 'very_long_branch_name_'.repeat(16)];document.documentElement.dataset.workspaceFileIconTheme='${theme}';document.querySelector('#scm').style.width='280px';panel.state.refs=full_refs.map((name,i)=>({name:(i?'refs/remotes/':'refs/heads/')+name,hash:panel.state.head}));scm.history.render(panel.state);void 0`);
    await move('.git-scm-history-entry:first-child>.git-scm-history-commit');await pause(550);
    await check('full branch text stays visible in detail '+theme+' '+zoom,`(()=>{const tip=document.querySelector('.git-commit-hover');if(!tip)return false;const names=[...tip.querySelectorAll('.git-scm-history-ref-name')],expected=['main',...full_refs];return names.length===3&&names.every((n,i)=>{const badge=n.closest('.git-scm-history-ref'),b=badge.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(n);return n.textContent===expected[i]&&n.scrollWidth<=n.clientWidth+1&&n.scrollHeight<=n.clientHeight+1&&[...range.getClientRects()].every(r=>r.top>=b.top-.6&&r.bottom<=b.bottom+.6&&r.left>=b.left-.6&&r.right<=b.right+.6)})&&names[1].getBoundingClientRect().width>100&&names[2].parentElement.getBoundingClientRect().height>18&&tip.scrollWidth<=tip.clientWidth+1})()`);
    await check('list keeps single-line clipped ref '+theme+' '+zoom,`[...document.querySelector('.git-scm-history-commit').querySelectorAll('.git-scm-history-ref-name')].every(n=>n.getBoundingClientRect().width<=100.1&&n.parentElement.getBoundingClientRect().height===18)`);
    fs.writeFileSync(path.join(evidence,'full_refs_'+theme+'_'+zoom+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  // 由生产 Graph/SCM 创建选中行；只切换宿主底色/文字及生产主题标记，不注入待测选中色。
  await move('#safe');
  await ev(`window.selection_theme=document.createElement('style');document.head.append(selection_theme);
    window.selection_old_groups=scm.groups_state;window.selection_old_open=scm.open_default_file;window.selection_old_ratio=scm.history_ratio;
    scm.open_default_file=async()=>{};scm.history_ratio=.5;scm.apply_history_layout();
    scm.groups_state=[{id:'working',title:'更改',from:'INDEX',to:'WORKTREE',files:[{path:'selection_theme.txt',status:'M'}]}];scm.render_groups();document.querySelector('#scm .git-scm-group').open=true;
    document.querySelector('#scm .git-scm-file').click();
    scm.history.files_cache.set(panel.state.commits[1].hash,[]);document.querySelector('#scm .git-scm-history-entry:nth-child(2)>.git-scm-history-commit').click();
    window.selection_graph=new qa.git_graph_panel({runner:()=>({run:async()=>'',cancel(){}}),path_api:require('node:path')},'selection-fixture');
    selection_graph.container.id='selection-graph';selection_graph.container.style.cssText='position:absolute;left:350px;top:160px;width:720px;height:500px';document.body.append(selection_graph.container);
    selection_graph.state={...panel.state,refs:[],changes:[]};selection_graph.selected=panel.state.commits[1].hash;selection_graph.render_history();
    window.selection_rows=[document.querySelector('#selection-graph .git-graph-row[aria-pressed=true]'),document.querySelector('#scm .git-scm-file.selected'),document.querySelector('#scm .git-scm-history-commit[aria-expanded=true]')];void 0`);
  const selection_cases=[
    ['Graph commit','#selection-graph .git-graph-row[aria-pressed=true]','.git-graph-subject-text',24],
    ['SCM file','#scm .git-scm-file.selected','.git-scm-file-name',22],
    ['SCM history','#scm .git-scm-history-commit[aria-expanded=true]','.git-scm-history-subject',22]
  ];
  const selection_snapshot=(selector,label)=>ev(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}),text=node.querySelector(${JSON.stringify(label)}),style=getComputedStyle(node),outer=node.closest('.git-scm-history-entry')||node,r=outer.getBoundingClientRect(),t=text.getBoundingClientRect();return {background:style.backgroundColor,foreground:getComputedStyle(text).color,row_height:node.getBoundingClientRect().height,outer:[r.x,r.y,r.width,r.height],label_height:t.height,hovered:node.matches(':hover'),status_color:node.querySelector('.git-scm-file-status')?getComputedStyle(node.querySelector('.git-scm-file-status')).color:null}})()`);
  const selection_layout=value=>({row_height:value.row_height,outer:value.outer,label_height:value.label_height});
  for(const zoom of [1,1.25]){
    win.webContents.setZoomFactor(zoom);await pause(100);
    const selection_geometry=new Map();
    for(const theme of ['light','dark','light']){
      const dark=theme==='dark',background=dark?'rgb(44, 45, 46)':'rgba(218, 218, 218, 0.6)',foreground=dark?'rgb(237, 237, 237)':'rgb(32, 32, 32)';
      await ev(`selection_theme.textContent='html,body{--bg-color:${dark?'#121314':'#ffffff'};--text-color:${dark?'#ededed':'#202020'};background:${dark?'#121314':'#ffffff'};color:${dark?'#ededed':'#202020'}}';document.documentElement.dataset.workspaceFileIconTheme='${theme}';document.activeElement.blur();void 0`);await pause(100);
      assert.equal(await ev('document.documentElement.style.getPropertyValue("--linux-note-shell-inactive-selection-background")+document.documentElement.style.getPropertyValue("--linux-note-shell-inactive-selection-foreground")'),'','no inline selection-token fixture');
      for(const [name,selector,label,height] of selection_cases){
        await move('#safe');const normal=await selection_snapshot(selector,label);
        assert.equal(normal.background,background,name+' '+theme+' idle background');assert.equal(normal.foreground,foreground,name+' '+theme+' idle text');assert.equal(normal.row_height,height,name+' fixed row height');if(name==='SCM file')assert.equal(normal.status_color,'rgb(168, 121, 22)',name+' status keeps modified color');
        if(!selection_geometry.has(name))selection_geometry.set(name,selection_layout(normal));else assert.deepEqual(selection_layout(normal),selection_geometry.get(name),name+' theme switch preserves layout');
        await move(selector);const hovered=await selection_snapshot(selector,label);assert(hovered.hovered,name+' receives real pointer hover');
        assert.equal(hovered.background,background,name+' '+theme+' selected hover background');assert.equal(hovered.foreground,foreground,name+' '+theme+' selected hover text');assert.equal(hovered.status_color,normal.status_color,name+' hover preserves status color');assert.deepEqual(selection_layout(hovered),selection_layout(normal),name+' selected hover preserves outer layout');
        if(name==='SCM file')for(const action of ['open','discard','stage']){
          const button_selector=selector+' .git-scm-inline-action[data-scm-file-action="'+action+'"]';
          await move('#safe');const button_idle=await bg(button_selector);await move(button_selector);const button_hover=await bg(button_selector),row_hover=await selection_snapshot(selector,label);
          assert.notEqual(button_hover,button_idle,action+' button has its own hover feedback');assert.notEqual(button_hover,background,action+' button hover differs from selected row');
          assert.equal(row_hover.background,background,action+' hover keeps row selected');assert.equal(row_hover.foreground,foreground,action+' hover keeps filename readable');assert.equal(row_hover.status_color,normal.status_color,action+' hover preserves status color');assert.deepEqual(selection_layout(row_hover),selection_layout(normal),action+' hover preserves row layout');
          await move('#safe');assert.equal(await bg(button_selector),button_idle,action+' leave restores button background');
        }
        await move('#safe');const restored=await selection_snapshot(selector,label);assert.deepEqual(restored,normal,name+' pointer leave restores selected row');
        checks.push(name+' '+theme+' '+zoom+' selected normal/hover colors and stable layout');
      }
      await check('theme preserves production row identities '+theme+' '+zoom,"selection_rows.every(node=>node.isConnected)&&selection_graph.selected===panel.state.commits[1].hash&&scm.history.selected===panel.state.commits[1].hash&&selection_rows[1].classList.contains('selected')");
    }
  }
  await ev('selection_graph.dispose();selection_theme.remove();scm.open_default_file=selection_old_open;scm.groups_state=selection_old_groups;scm.render_groups();scm.history.selected="";scm.history_ratio=selection_old_ratio;scm.apply_history_layout();void 0');
  win.webContents.setZoomFactor(1);await move('#safe');await ev('scm.history.render(panel.state)');
  await move('#safe');await move('.git-scm-history-entry:first-child>.git-scm-history-commit');await pause(550);await ev('scm.dispose();activity.dispose();tabs.dispose()');await check('dispose removes cards and adapter roles','!document.querySelector(".git-commit-hover")&&!document.querySelector(".typ-tab[data-workspace-interaction]")');
  // 独立模块可以改变延迟，仍复用呈现失败和卸载的统一清理。
  await ev(`window.local_hover=qa.bind_workspace_hover(document.querySelector('#safe'),target=>({anchor:target,label:'局部提示',render(){throw Error('expected render failure')}}),{delay_ms:0,hide_delay_ms:0});document.querySelector('#safe').focus();void 0`);await pause(80);
  await check('local options and failed render cleanup','!document.querySelector(".workspace-hover-surface")&&!document.querySelector("#safe").hasAttribute("aria-describedby")');await ev('local_hover.dispose();void 0');
  // 共同定位针对不同形状/边缘选择无交叠区域；无可用字行时不显示。
  await ev(`window.probe=document.createElement('div');probe.style.cssText='position:fixed';window.probe_button=document.createElement('button');probe_button.textContent='定位目标';probe_button.style.cssText='position:absolute;left:0;top:8px;width:100%;height:22px';probe.append(probe_button);document.body.append(probe);window.probe_hover=qa.bind_workspace_hover(probe,()=>({anchor:probe_button,layout_anchor:probe,compact:true,show_pointer:true,label:'边缘回退',render(tip){tip.textContent='很长的详情 '.repeat(200);tip.style.width='400px';tip.style.height='180px'}}),{delay_ms:0});void 0`);
  for(const [name,left,top,width,height,side] of [['right',50,200,200,250,'right'],['left',750,200,200,250,'left'],['below',60,40,980,100,'below'],['above',60,500,980,260,'above'],['constrained',40,40,980,660,'below']]){
    await ev(`probe_hover.hide();probe_button.blur();probe.style.left='${left}px';probe.style.top='${top}px';probe.style.width='${width}px';probe.style.height='${height}px';void 0`);await pause(70);await ev('probe_button.focus({preventScroll:true});void 0');await pause(70);
    await check('shared geometry '+name,`(()=>{const tip=document.querySelector('.workspace-hover-surface'),r=tip?.getBoundingClientRect(),a=probe.getBoundingClientRect();return !!r&&tip.dataset.hoverSide==='${side}'&&(r.left>=a.right+3||r.right<=a.left-3||r.bottom<=a.top-3||r.top>=a.bottom+3)&&r.left>=7&&r.top>=7&&r.right<=innerWidth-7&&r.bottom<=innerHeight-7})()`);
  }
  await ev('probe_hover.hide();probe_button.blur();probe.style.cssText="position:fixed;inset:0";probe_button.focus({preventScroll:true});void 0');await pause(60);
  await check('unavailable clear area removes card pointer and ARIA','!document.querySelector(".workspace-hover-surface,.workspace-hover-pointer")&&!probe_button.hasAttribute("aria-describedby")');
  await ev('probe_hover.dispose();probe.remove();void 0');
  await check('no renderer errors','errors.length===0');
  fs.writeFileSync(path.join(evidence,'checks.json'),JSON.stringify({status:'PASS',checks},null,2));console.log(JSON.stringify({status:'PASS',count:checks.length,evidence}));win.destroy();app.exit(0);
}).catch(error=>{console.error(error.stack);if(win&&!win.isDestroyed())win.destroy();app.exit(1);});
