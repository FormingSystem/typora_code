// Hidden-Electron geometry regression for the Source Control sidebar. Values
// mirror VS Code 1.136.2's workbench CSS: 22px list rows, 22px actions, 18px
// count badges, 30px single-line input and a 26px split commit button.
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { build } = require("esbuild");

// A lost test runner pipe must fail the fixture, not leave a GUI main-process
// exception dialog behind. The supported launcher waits for Electron's close.
for (const stream of [process.stdout, process.stderr]) stream.on("error", () => app.exit(1));

const evidence = process.env.TYPORA_THEME_EVIDENCE_DIR
  ? path.resolve(process.env.TYPORA_THEME_EVIDENCE_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "typora_scm_vscode_geometry_"));
fs.mkdirSync(evidence, { recursive: true });
app.setPath("userData", path.join(evidence, "scm_user_data"));
app.disableHardwareAcceleration();

let test_window;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const evaluate = source => test_window.webContents.executeJavaScript(source);
const settle = async () => { await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))"); await delay(80); };
const capture = async name => fs.writeFileSync(path.join(evidence, `${name}.png`), (await test_window.webContents.capturePage()).toPNG());
const close_to = (actual, expected, label) => assert(Math.abs(actual - expected) <= 1, `${label}: expected ${expected}px, got ${actual}px`);

app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show: false, width: 720, height: 700, backgroundColor: "#f8f8f8", webPreferences: { contextIsolation: false, offscreen: true, backgroundThrottling: false } });
  test_window.webContents.on("console-message", (_event, _level, message) => console.error(message));
  const html = path.join(evidence, "scm_fixture.html");
  fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;font:13px "Segoe UI",sans-serif;color:#3b3b3b;background:#fff}
    html{--bg-color:#fff;--side-bar-bg-color:#f8f8f8;--text-color:#3b3b3b;--control-text-color:#717171;--primary-color:#0078d4;--vscode-foreground:#3b3b3b;--vscode-descriptionForeground:#717171;--vscode-sideBar-background:#f8f8f8;--vscode-sideBar-foreground:#3b3b3b;--vscode-sideBarSectionHeader-background:#f3f3f3;--vscode-input-background:#fff;--vscode-input-foreground:#3b3b3b;--vscode-input-border:#cecece;--vscode-button-background:#0078d4;--vscode-button-foreground:#fff;--vscode-button-hoverBackground:#026ec1;--vscode-icon-foreground:#424242;--vscode-list-hoverBackground:#e8e8e8;--vscode-list-activeSelectionBackground:#d6ebff;--vscode-list-activeSelectionForeground:#1f1f1f;--vscode-badge-background:#0069cc;--vscode-badge-foreground:#fff;--vscode-gitDecoration-modifiedResourceForeground:#895503;--vscode-gitDecoration-addedResourceForeground:#18864b;--vscode-focusBorder:#0078d4}
    #sidebar-content{height:100%;width:320px;border-right:1px solid #d4d4d4;overflow:hidden}.linux-note-git-source-control{height:100%;width:100%}
  </style></head><body><div id="sidebar-content"></div></body></html>`);
  await test_window.loadFile(html);
  const bundle = await build({ stdin: { contents: 'export {git_source_control} from "./src/git_source_control"; export {INDEX,WORKTREE} from "./src/git_graph_repository";', resolveDir: path.join(__dirname, "..") }, bundle: true, loader: { ".css": "text", ".svg": "text" }, format: "iife", globalName: "scm_geometry_qa", write: false });
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(String.raw`(()=>{
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname, "../src/git_graph.css"), "utf8"))};document.head.append(style);
    window.panel={container:document.createElement('section'),disposed:false,pending:false,writing:false,root:'geometry-fixture',state:{root:'geometry-fixture',head:'0123456789abcdef',branch:'main',operation:'',refs:[],commits:[],more:false,changes:[],remotes:[]},branches:[],settings:{initial_count:50,history_toolbar_hidden:[],history_shortcuts:{}},host:{show_history(){},open_panel(){}},repo_select:document.createElement('select'),refresh(){},configured_menu(){},action_dialog(){},quick_action(){},report(){},switch_repo(){},manage_repositories(){}};
    panel.container.className='linux-note-git-graph';panel.container.dataset.state='ready';
    const option=document.createElement('option');option.value='geometry-fixture';panel.repo_select.append(option);
    window.scm=new scm_geometry_qa.git_source_control(panel);panel.workbench=scm;
    const shell=document.createElement('section');shell.className='linux-note-git-source-control';shell.append(scm.sidebar);document.querySelector('#sidebar-content').append(shell);window.shell=shell;

    scm.groups_state=[{id:'staged',title:'Staged Changes',from:'head',to:scm_geometry_qa.INDEX,files:[]},{id:'changes',title:'Changes',from:scm_geometry_qa.INDEX,to:scm_geometry_qa.WORKTREE,files:[{path:'knowledge/long folder name/source file with spaces.md',status:'M'},{path:'src/new file.ts',status:'??'}]}];scm.render_groups();

  })()`);

  const inspect = async width => {
    await evaluate(`document.querySelector('#sidebar-content').style.width='${width}px'`);
    await settle();
    return evaluate(`(()=>{
      const rect=node=>{const box=node.getBoundingClientRect();return{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height}},box=selector=>rect(document.querySelector(selector));
      const row=document.querySelector('.git-scm-file'),directory=row.querySelector('.git-scm-file-directory'),status=row.querySelector('.git-scm-file-status'),action=row.querySelector('.git-scm-inline-action'),badge=document.querySelector('[data-scm-group="changes"] .git-scm-badge'),row_box=row.getBoundingClientRect();
      return{width:${width},title:box('.git-scm-title'),title_tool:box('.git-scm-tools .git-icon-button'),input_heading:box('.git-scm-input-heading'),message:box('.git-scm-message'),commit:box('.git-scm-commit'),commit_options:box('.git-scm-commit-options'),group:box('[data-scm-group="changes"]>summary'),row:rect(row),label:rect(row.querySelector('.git-scm-file-label')),action:rect(action),badge:box('[data-scm-group="changes"] .git-scm-badge'),status:rect(status),history_header:box('.git-scm-history-header'),status_right_gap:row_box.right-status.getBoundingClientRect().right,row_overflow:row.scrollWidth-row.clientWidth,row_columns:getComputedStyle(row).gridTemplateColumns,directory_display:getComputedStyle(directory).display,action_opacity:getComputedStyle(action).opacity,commit_radius:getComputedStyle(document.querySelector('.git-scm-commit')).borderRadius,options_radius:getComputedStyle(document.querySelector('.git-scm-commit-options')).borderRadius,badge_radius:getComputedStyle(badge).borderRadius,sidebar_background:getComputedStyle(document.querySelector('.git-scm-sidebar')).backgroundColor,status_color:getComputedStyle(status).color};
    })()`);
  };

  const regular = await inspect(320);
  close_to(regular.title.height, 35, "SCM title");
  close_to(regular.title_tool.width, 28, "SCM title action width");
  close_to(regular.title_tool.height, 22, "SCM title action height");
  close_to(regular.input_heading.height, 22, "SCM section header");
  close_to(regular.message.height, 30, "commit message input");
  close_to(regular.commit.height, 26, "commit button");
  close_to(regular.commit_options.height, 26, "commit dropdown");
  assert(await evaluate("!document.querySelector('.git-scm-filter') && scm.changes_body.querySelector('.git-scm-inputs').nextElementSibling === scm.groups"), "SCM groups follow the commit section without a filter input");
  close_to(regular.group.height, 22, "change group header");
  close_to(regular.row.height, 22, "change row");
  close_to(regular.history_header.height, 22, "history pane header");
  close_to(regular.action.width, 22, "inline action target");
  close_to(regular.action.height, 22, "inline action target");
  close_to(regular.badge.width, 18, "count badge minimum width");
  close_to(regular.badge.height, 18, "count badge height");
  close_to(regular.status.width, 16, "status column");
  close_to(regular.status_right_gap, 8, "status column right inset");
  assert(regular.row_overflow <= 1, "regular SCM row must not overflow horizontally");
  assert.notEqual(regular.directory_display, "none", "regular sidebar keeps the path column");
  assert.equal(regular.action_opacity, "0", "row action is hidden until hover/focus");
  assert.equal(regular.row_columns.trim().split(/\s+/).length, 2, "normal row reserves only label and status columns");
  assert.equal(regular.commit_radius, "4px 0px 0px 4px");
  assert.equal(regular.options_radius, "0px 4px 4px 0px");
  assert.equal(regular.badge_radius, "11px");
  assert.equal(regular.sidebar_background, "rgba(0, 0, 0, 0)", "SCM retains the 59412a2 effective transparent surface");
  assert.equal(regular.status_color, "rgb(168, 121, 22)", "SCM retains the 59412a2 modified-file colour");
  assert(await evaluate(`[...document.querySelectorAll('.git-scm-badge')].every(node=>getComputedStyle(node).backgroundColor==='rgb(0, 105, 204)'&&getComputedStyle(node).color==='rgb(255, 255, 255)')`), "all SCM count badges use Light 2026 blue and white including zero");
  await evaluate(`document.documentElement.style.setProperty('--vscode-badge-background','#307e9f')`);
  assert(await evaluate(`[...document.querySelectorAll('.git-scm-badge')].every(node=>getComputedStyle(node).backgroundColor==='rgb(48, 126, 159)')`), "count badges honor a changed theme token");
  await evaluate(`document.documentElement.style.removeProperty('--vscode-badge-background')`);
  await capture("scm_regular");

  test_window.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(regular.row.left + 40), y: Math.round(regular.row.top + regular.row.height / 2) });
  await settle();
  const hovered = await inspect(320);
  assert.equal(hovered.action_opacity, "1", "row action appears on hover");
  assert.equal(hovered.row_columns.trim().split(/\s+/).length, 3, "visible row actions occupy a separate layout column");
  assert(hovered.label.width < regular.label.width, "hover adjusts only the shared text clipping boundary");
  assert(hovered.label.right <= hovered.action.left - 3, "filename never paints underneath the first action");
  close_to(hovered.status.right, regular.status.right, "hover preserves the status right edge");
  await capture("scm_hovered");

  test_window.webContents.sendInputEvent({ type: "mouseMove", x: 600, y: 680 });
  const narrow = await inspect(236);
  close_to(narrow.row.height, 22, "narrow change row");
  close_to(narrow.status_right_gap, 8, "narrow status column right inset");
  assert(narrow.row_overflow <= 1, "narrow SCM row must not overflow horizontally");
  assert.equal(narrow.directory_display, "none", "narrow sidebar releases the optional path column");
  await capture("scm_narrow");

  // Fixed upstream scm.css gives visible actions layout space inside the name
  // label. Cover the real two-action staged and three-action worktree rows,
  // including selection without hover and themes with translucent row colors.
  const file_checks = [];
  const file_metrics = () => evaluate(`(()=>{
    const box=node=>{const rect=node.getBoundingClientRect();return{left:rect.left,right:rect.right,top:rect.top,width:rect.width,height:rect.height}};
    const row=document.querySelector('.git-scm-file'),actions=row.querySelector('.git-scm-row-actions'),name=row.querySelector('.git-scm-file-name'),status=row.querySelector('.git-scm-file-status');
    return{row:box(row),label:box(row.querySelector('.git-scm-file-label')),name:box(name),name_overflow:getComputedStyle(row.querySelector(".git-scm-file-text")).textOverflow,actions:box(actions),background:getComputedStyle(actions).backgroundColor,status:box(status),status_text:status.textContent,overflow:row.scrollWidth-row.clientWidth,buttons:[...actions.querySelectorAll('button')].map(button=>{const rect=button.getBoundingClientRect(),hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return{box:box(button),icon:box(button.querySelector('svg')),opacity:getComputedStyle(button).opacity,hit:button===hit||button.contains(hit),action:button.dataset.scmFileAction}})};
  })()`);
  for (const theme of ["light", "dark"]) for (const width of [320, 236, 170]) for (const group of ["staged", "changes"]) {
    await evaluate(`document.querySelector('#sidebar-content').style.width='${width}px';document.documentElement.style.setProperty('--bg-color','${theme === "dark" ? "#202020" : "#ffffff"}');document.documentElement.style.setProperty('--text-color','${theme === "dark" ? "#eeeeee" : "#3b3b3b"}');document.documentElement.style.setProperty('--linux-note-shell-hover-background','#8882');document.documentElement.style.setProperty('--linux-note-shell-inactive-selection-background','#0078d426');window.file_invocation=null;window.row_open_count=0;scm.open_current_file=file=>{window.file_invocation={id:'open',files:[file.path]}};scm.open_default_file=()=>{window.row_open_count++};panel.quick_action=(id,files)=>{window.file_invocation={id,files}};panel.action_dialog=(id,_kind,file)=>{window.file_invocation={id,files:[file]}};scm.groups_state=[{id:'${group}',title:'${group}',from:'${group === "staged" ? "head" : "index"}',to:scm_geometry_qa.${group === "staged" ? "INDEX" : "WORKTREE"},files:[{path:'project-docs/long folder/very_long_中文文件名称_that_must_not_cover_the_actions.md',status:'M'}]}];scm.render_groups();document.querySelector('.git-scm-group').open=true;void 0`);
    for (const mode of ["hover", "selected", "focus"]) {
      test_window.webContents.sendInputEvent({ type: "mouseMove", x: 600, y: 680 });
      await evaluate("document.activeElement?.blur();document.querySelector('.git-scm-file').classList.remove('selected')");
      await settle();
      const idle = await file_metrics();
      close_to(idle.row.height,22,"name and smaller directory share a 22px row");
      if (mode === "hover") test_window.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(idle.row.left + 32), y: Math.round(idle.row.top + 11) });
      else await evaluate(`document.querySelector('.git-scm-file').${mode === "selected" ? "click" : "focus"}()`);
      await settle();
      const current = await file_metrics();
      close_to(current.name.left,idle.name.left,"hover keeps filename origin");
      close_to(current.name.width,idle.name.width,"filename glyph width does not shrink independently of directory");
      assert.equal(current.buttons.length, group === "staged" ? 2 : 3);
      assert.equal(current.status_text, "M");
      assert.equal(current.name_overflow, "ellipsis");
      assert(current.label.right <= current.actions.left - 1, `${theme}/${width}/${group}/${mode}: label must stop before actions`);
      assert(current.actions.right <= current.status.left - 1, "actions leave the status column clear");
      assert(current.label.width < idle.label.width, "visible actions reduce the shared clipping region, not filename glyph width");
      close_to(current.status.right, idle.status.right, "file status keeps its right edge");
      assert.equal(current.background, theme === "dark" ? "rgb(32, 32, 32)" : "rgb(255, 255, 255)", "action strip has an opaque theme surface under translucent highlights");
      assert(current.overflow <= 1, "file row does not overflow even at 170px");
      for (const button of current.buttons) {
        close_to(button.box.width, 22, "visible action hit width");close_to(button.box.height, 22, "visible action hit height");
        close_to(button.icon.width, 16, "visible icon width");close_to(button.icon.height, 16, "visible icon height");
        assert.equal(button.opacity, "1", `${mode}: each action is visible`);assert(button.hit, "filename cannot intercept an action hit");
      }
      file_checks.push({ theme, width, group, mode });
    }
    // Tab into the exposed buttons and invoke the final stage/unstage action.
    test_window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });test_window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
    await settle();
    assert(await evaluate("document.activeElement.matches('.git-scm-file .git-scm-inline-action')"), "keyboard reaches a visible file action");
    await evaluate("document.querySelector('.git-scm-file .git-scm-row-actions button:last-child').focus()");
    const opened_before = await evaluate("window.row_open_count");
    test_window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });test_window.webContents.sendInputEvent({ type: "char", keyCode: "\r" });test_window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await settle();
    assert(await evaluate(`window.file_invocation?.id==='${group === "staged" ? "unstage" : "stage"}'&&file_invocation.files[0]===document.querySelector('.git-scm-file').dataset.file&&window.row_open_count===${opened_before}`), "keyboard file action keeps its own command and never opens the row diff");
    if (width === 320 && group === "staged") await capture(`scm_file_actions_${theme}`);
  }
  await evaluate("for(const key of ['--bg-color','--text-color','--linux-note-shell-hover-background','--linux-note-shell-inactive-selection-background'])document.documentElement.style.removeProperty(key)");

  const group_checks=[];
  const group_metrics=()=>evaluate(`(()=>{const box=node=>{const rect=node.getBoundingClientRect();return{left:rect.left,right:rect.right,width:rect.width,height:rect.height,top:rect.top}};return [...document.querySelectorAll('.git-scm-group>summary')].map(node=>({heading:box(node),badge:box(node.querySelector('.git-scm-badge')),name:box(node.querySelector('.git-scm-group-label')),actions:box(node.querySelector('.git-scm-row-actions')),actions_display:getComputedStyle(node.querySelector('.git-scm-row-actions')).display,text:node.querySelector('.git-scm-badge').textContent,overflow:node.scrollWidth-node.clientWidth}));})()`);
  for(const width of [320,236,170])for(const counts of [[1,2],[12,3],[123,45]]){
    await evaluate(`document.querySelector('#sidebar-content').style.width='${width}px';document.activeElement?.blur();panel.quick_action=(id,files)=>{window.group_invocation={id,files}};scm.groups_state=[{id:'staged',title:'Staged Changes — very long group title',from:'head',to:scm_geometry_qa.INDEX,files:Array.from({length:${counts[0]}},(_,index)=>({path:'staged_'+index+'.ts',status:'M'}))},{id:'changes',title:'Changes',from:scm_geometry_qa.INDEX,to:scm_geometry_qa.WORKTREE,files:Array.from({length:${counts[1]}},(_,index)=>({path:'changed_'+index+'.ts',status:'M'}))}];scm.render_groups();document.querySelectorAll('.git-scm-group').forEach(group=>group.open=false);void 0`);
    test_window.webContents.sendInputEvent({type:'mouseMove',x:600,y:680});await settle();
    assert(await evaluate('(()=>{const label=document.querySelector(".git-scm-title-label"),tools=document.querySelector(".git-scm-title>.git-scm-tools"),style=getComputedStyle(label),range=document.createRange();range.selectNodeContents(label);return style.whiteSpace==="nowrap"&&style.textOverflow==="ellipsis"&&new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size===1&&label.getBoundingClientRect().right<=tools.getBoundingClientRect().left+1&&label.title===label.textContent&&document.querySelector(".git-scm-title").scrollWidth<=document.querySelector(".git-scm-title").clientWidth+1})()'),'SCM main title remains one ellipsized line without overlapping actions at every sidebar width');
    const idle=await group_metrics();close_to(idle[0].badge.right,idle[1].badge.right,'different group title/count lengths share right edge');
    for(const [index,item] of idle.entries()){
      assert.equal(item.text,String(counts[index]));close_to(item.heading.height,22,'group title stays single line');close_to(item.badge.height,18,'count height stays 18px');close_to(item.heading.right-item.badge.right,12,'upstream count right inset');assert(item.badge.width>=18);assert(item.overflow<=1);assert.equal(item.actions_display,'none');assert(item.name.right<=item.badge.left);
    }
    const first=idle[0];test_window.webContents.sendInputEvent({type:'mouseMove',x:40,y:Math.round(first.heading.top+11)});await settle();
    const hovered_groups=await group_metrics();assert.equal(hovered_groups[0].actions_display,'flex');close_to(hovered_groups[0].badge.right,first.badge.right,'hover count remains at fixed right edge');assert(hovered_groups[0].actions.right<=hovered_groups[0].badge.left);assert(hovered_groups[0].name.right<=hovered_groups[0].actions.left+1);assert(hovered_groups[0].name.width<first.name.width,'idle title uses space released by hidden actions');assert(hovered_groups[0].overflow<=1);
    test_window.webContents.sendInputEvent({type:'mouseMove',x:600,y:680});
    await evaluate('document.querySelector(".git-scm-group>summary").focus()');await settle();assert.equal((await group_metrics())[0].actions_display,'flex','keyboard summary focus reveals actions');
    test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await settle();
    assert(await evaluate('document.activeElement.matches(".git-scm-row-actions button")'),'Tab reaches a visible group action');
    test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await settle();
    test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});test_window.webContents.sendInputEvent({type:'char',keyCode:'\r'});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await settle();
    assert(await evaluate(`window.group_invocation?.id==='unstage'&&group_invocation.files.length===${counts[0]}&&!document.querySelector('.git-scm-group').open`),'keyboard group action receives every path without toggling collapse');
    await evaluate('document.querySelector(".git-scm-group>summary").focus()');test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});test_window.webContents.sendInputEvent({type:'char',keyCode:'\r'});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await settle();assert(await evaluate('document.querySelector(".git-scm-group").open'),'Enter expands focused group');
    test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});test_window.webContents.sendInputEvent({type:'char',keyCode:'\r'});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});await settle();assert(await evaluate('!document.querySelector(".git-scm-group").open'),'Enter collapses group');
    close_to((await group_metrics())[0].badge.right,first.badge.right,'collapse preserves count alignment');
    await evaluate('document.querySelectorAll(".git-scm-group>summary")[1].focus()');await settle();const focused_changes=(await group_metrics())[1];assert.equal(focused_changes.actions_display,'flex');close_to(focused_changes.badge.right,first.badge.right,'Changes focus shares the Staged count right edge');assert(focused_changes.actions.right<=focused_changes.badge.left&&focused_changes.name.right<=focused_changes.actions.left+1);assert(focused_changes.overflow<=1);group_checks.push({width,counts});
  }
  await evaluate('document.activeElement.blur()');await settle();await capture('scm_group_counts_narrow');
  console.log(JSON.stringify({status:"PASS",checks:["VS Code 35px view title, 28x22 title actions and 22px SCM rows","30px input and 26px split commit button","22px inline action target, 18px badge and 16px status column","visible file actions occupy an opaque independent column in hover, focus and selection","history pane header matches VS Code's 22px pane header","narrow sidebar hides only optional path text","59412a2 SCM surface and status colours without chrome injection"],group_checks,file_checks,regular,hovered,narrow,evidence,screenshots:[path.join(evidence,"scm_regular.png"),path.join(evidence,"scm_narrow.png"),path.join(evidence,"scm_hovered.png"),path.join(evidence,"scm_file_actions_light.png"),path.join(evidence,"scm_file_actions_dark.png")]}));
  test_window.destroy(); app.exit(0);
}).catch(async error => {
  console.error(error); console.error(evidence);
  if (test_window && !test_window.isDestroyed()) { try { await capture("scm_failure"); } catch {} test_window.destroy(); }
  app.exit(1);
});
