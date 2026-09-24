const {app,BrowserWindow}=require('electron');
const {build}=require('esbuild');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'typora_graph_ref_colors_'));app.setPath('userData',path.join(temp,'profile'));app.disableHardwareAcceleration();
let window;
app.whenReady().then(async()=>{
  const bundle=await build({plugins:require('./editor_bundle.cjs').editor_plugins(),stdin:{contents:'export {git_graph_panel} from "./src/git_graph_panel";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'qa',loader:{'.css':'text'}});
  const html=path.join(temp,'index.html');fs.writeFileSync(html,'<!doctype html><html><body></body></html>');
  window=new BrowserWindow({show:false,width:1200,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false}});await window.loadFile(html);
  const run=source=>window.webContents.executeJavaScript(source);
  await run(bundle.outputFiles[0].text);
  await run(`(()=>{
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'))};document.head.append(style);
    document.body.style='height:650px;--bg-color:#fff;--text-color:#333;color:var(--text-color)';
    const runner=()=>({run:async()=>'',cancel(){}});
    const host={runner,path_api:{join:(...parts)=>parts.join('/'),basename:value=>value.split('/').pop()},process_api:{platform:'win32'},fs:{existsSync:()=>false,statSync:()=>({size:0}),readFileSync:()=>''},core:{app:{workspace:{sidebar:{toggle(){}},activeLeaf:null}}},terminal(){},clear_avatars(){},copy:async()=>{},can_change_files:()=>true,show_output(){},show_history(){},export_file(){},discover:async()=>[]};
    window.panel=new qa.git_graph_panel(host,'C:/repo');document.body.append(panel.container);
    window.hashes=['a','b','d','c'].map(value=>value.repeat(40));
    const commits=hashes.map((hash,index)=>({hash,parents:index<3?[hashes[3]]:[],author:'Author',date:'2026-01-01',subject:['main','feature','stash','base'][index],...(index===2?{stash:'stash@{0}'}:{})}));
    panel.state={root:'C:/repo',head:hashes[1],branch:'feature',commits,refs:[{hash:hashes[0],name:'refs/heads/main'},{hash:hashes[1],name:'refs/heads/feature'},{hash:hashes[1],name:'refs/remotes/origin/feature'},{hash:hashes[1],name:'refs/tags/v1'},{hash:hashes[2],name:'refs/remotes/origin/other'}],changes:[],stashes:[],remotes:[],operation:'',more:false};
    panel.settings.mute_unreachable=false;panel.settings.combine_refs=true;panel.settings.show_remotes=true;
    window.menu_calls=[];panel.target_menu=(event,...args)=>menu_calls.push(args);
    window.inspect_refs=()=>[...panel.list.querySelectorAll('.git-graph-row[data-hash]')].map(row=>({hash:row.dataset.hash,dot:getComputedStyle(row.querySelector('svg circle')).fill,refs:[...row.querySelectorAll('.git-graph-refs')].map(badge=>({kind:badge.className,text:badge.textContent,color:getComputedStyle(badge).color,border:getComputedStyle(badge).borderColor,active:badge.dataset.active,icon:badge.querySelector('svg').dataset.gitIcon,background:getComputedStyle(badge.querySelector('svg')).backgroundColor,icon_color:getComputedStyle(badge.querySelector('svg')).color,height:badge.getBoundingClientRect().height})),head:row.querySelector('.git-graph-head-dot')?{width:row.querySelector('.git-graph-head-dot').getBoundingClientRect().width,border:getComputedStyle(row.querySelector('.git-graph-head-dot')).borderColor,label:row.querySelector('.git-graph-head-dot').getAttribute('aria-label')}:null}));
  })()`);
  for(const dark of [false,true])for(const alignment of ['normal','right','graph'])for(const combined of [false,true]){
    await run(`document.body.style.setProperty('--bg-color','${dark?'#1e1e1e':'#ffffff'}');document.body.style.setProperty('--text-color','${dark?'#cccccc':'#333333'}');panel.settings.label_alignment='${alignment}';panel.settings.combine_refs=${combined};panel.render_history()`);
    const rows=await run('inspect_refs()');assert.notEqual(rows[0].dot,rows[1].dot,'feature occupies a distinct lane colour');
    for(const row of rows){for(const badge of row.refs){assert.equal(badge.background,row.dot,'reference icon matches its commit vertex');assert.equal(badge.color,dark?'rgb(204, 204, 204)':'rgb(51, 51, 51)','reference text follows theme, not lane or kind');assert.equal(badge.icon_color,dark?'rgb(30, 30, 30)':'rgb(255, 255, 255)','reference glyph uses editor background');assert.equal(badge.height,20);if(badge.active)assert.equal(badge.border,row.dot,'active branch border follows its lane');}if(row.head){assert.equal(row.head.border,row.dot,'HEAD ring follows vertex');assert.equal(row.head.width,10,'HEAD ring has a six pixel center and two pixel border');}}
    const feature=rows[1];assert(feature.refs.some(badge=>badge.icon==='tag'));assert(rows[2].refs.some(badge=>badge.icon==='archive'));assert.equal(feature.refs.filter(badge=>badge.kind.includes('git-ref-remote')).length,combined?0:1);
    if(combined){await run(`panel.list.querySelector('.git-graph-ref-remote').click()`);assert.deepEqual(await run('menu_calls.pop()'),['remote','origin/feature',await run('hashes[1]')],'combined remote segment preserves remote action target');}
  }
  await run(`panel.render_history();document.body.append(panel.workbench.sidebar);panel.workbench.history.render(panel.state)`);
  for(const selector of ['.git-graph-row[data-hash]','.git-scm-history-commit']){
    const paths=await run(`(()=>{const rows=[...document.querySelectorAll('${selector}')];return rows.map(row=>{const svg=row.querySelector('${selector.startsWith('.git-graph')?'svg':'svg.git-scm-history-topology'}'),dot=svg.querySelector('circle');return {color:dot.getAttribute('fill'),out:[...svg.querySelectorAll('path')].filter(path=>path.getAttribute('d').startsWith('M'+dot.getAttribute('cx')+','+dot.getAttribute('cy')+' ')).map(path=>path.getAttribute('stroke')),all:[...svg.querySelectorAll('path')].map(path=>path.getAttribute('stroke'))}})})()`);
    assert.equal(paths.length,4);
    for(const row of paths.slice(0,3)){assert(row.out.includes(row.color),'branch leaves its own node in its own colour');assert(paths[3].all.includes(row.color),'each branch retains colour until the shared parent node');}
  }
  await run(`panel.settings.colors=['#123456','#abcdef'];panel.state.changes=[{path:'dirty.md',index:'M',worktree:' ',status:'M'}];panel.render_history()`);
  const custom=await run('inspect_refs().filter(row=>row.refs.length)');for(const row of custom)for(const badge of row.refs)assert.equal(badge.background,row.dot,'custom palette and connected worktree retain row colour identity');
  await run(`panel.state.head='';panel.state.branch='';panel.render_history()`);assert.equal(await run('panel.list.querySelectorAll(".git-graph-head-dot,[data-active=true]").length'),0,'unborn/detached selection does not mark a branch active');
  await run(`panel.state.head=hashes[1];panel.render_history()`);assert.equal(await run('panel.list.querySelectorAll(".git-graph-head-dot").length'),1,'detached HEAD retains its vertex marker');
  const scm=await run(`(()=>{const host=document.createElement('div');host.className='linux-note-git-source-control';host.innerHTML='<span class="git-scm-history-ref">branch</span><span class="git-scm-history-ref" data-current="true">current</span>';document.body.append(host);const colors=[...host.children].map(node=>getComputedStyle(node).backgroundColor);host.remove();return colors})()`);
  assert.deepEqual(scm,['rgb(101, 45, 144)','rgb(26, 92, 255)'],'SCM references share the fixed theme charts colours');
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(temp,'references.png'),(await window.webContents.capturePage()).toPNG());await run('panel.dispose()');
  console.log('Git Graph reference colours PASS: branch, combined/uncombined remote, tag, stash, active/detached HEAD, theme, alignment, custom palette, connected worktree. '+temp);window.destroy();app.exit(0);
}).catch(error=>{console.error(error);window?.destroy();app.exit(1)});
