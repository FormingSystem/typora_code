// Hidden-Electron geometry regression for the Source Control sidebar. Values
// mirror VS Code 1.136.1's workbench CSS: 22px list rows, 22px actions, 18px
// count badges, 30px single-line input and a 26px split commit button.
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { build } = require("esbuild");

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
    html{--bg-color:#fff;--side-bar-bg-color:#f8f8f8;--text-color:#3b3b3b;--control-text-color:#717171;--primary-color:#0078d4;--vscode-foreground:#3b3b3b;--vscode-descriptionForeground:#717171;--vscode-sideBar-background:#f8f8f8;--vscode-sideBar-foreground:#3b3b3b;--vscode-sideBarSectionHeader-background:#f3f3f3;--vscode-input-background:#fff;--vscode-input-foreground:#3b3b3b;--vscode-input-border:#cecece;--vscode-button-background:#0078d4;--vscode-button-foreground:#fff;--vscode-button-hoverBackground:#026ec1;--vscode-icon-foreground:#424242;--vscode-list-hoverBackground:#e8e8e8;--vscode-list-activeSelectionBackground:#d6ebff;--vscode-list-activeSelectionForeground:#1f1f1f;--vscode-badge-background:#c4c4c4;--vscode-badge-foreground:#333;--vscode-gitDecoration-modifiedResourceForeground:#895503;--vscode-gitDecoration-addedResourceForeground:#18864b;--vscode-focusBorder:#0078d4}
    #sidebar-content{height:100%;width:320px;border-right:1px solid #d4d4d4;overflow:hidden}.linux-note-git-source-control{height:100%;width:100%}
  </style></head><body><div id="sidebar-content"></div></body></html>`);
  await test_window.loadFile(html);
  const bundle = await build({ stdin: { contents: 'export {git_source_control} from "./src/git_source_control";export {install_workspace_chrome} from "./src/workspace_chrome";', resolveDir: path.join(__dirname, "..") }, bundle: true, loader: { ".css": "text", ".svg": "text" }, format: "iife", globalName: "scm_geometry_qa", write: false });
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(String.raw`(()=>{
    const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(__dirname, "../src/git_graph.css"), "utf8"))};document.head.append(style);
    window.panel={root:'geometry-fixture',state:{root:'geometry-fixture',head:'0123456789abcdef',branch:'main',operation:'',refs:[],commits:[],more:false,changes:[]},settings:{initial_count:50},host:{show_history(){},open_panel(){}},repo_select:document.createElement('select'),refresh(){},configured_menu(){},action_dialog(){},quick_action(){},report(){},switch_repo(){},manage_repositories(){}};
    const option=document.createElement('option');option.value='geometry-fixture';panel.repo_select.append(option);
    window.scm=new scm_geometry_qa.git_source_control(panel);panel.workbench=scm;
    const shell=document.createElement('section');shell.className='linux-note-git-source-control';shell.append(scm.sidebar);document.querySelector('#sidebar-content').append(shell);window.shell=shell;
    scm.branch.replaceChildren(document.createTextNode('main'));
    scm.groups_state=[{id:'staged',title:'Staged Changes',from:'head',to:'index',files:[]},{id:'changes',title:'Changes',from:'index',to:'worktree',files:[{path:'knowledge/long folder name/source file with spaces.md',status:'M'},{path:'src/new file.ts',status:'??'}]}];scm.render_groups();
    window.chrome_binding=scm_geometry_qa.install_workspace_chrome();
  })()`);

  const inspect = async width => {
    await evaluate(`document.querySelector('#sidebar-content').style.width='${width}px'`);
    await settle();
    return evaluate(`(()=>{
      const rect=node=>{const box=node.getBoundingClientRect();return{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height}},box=selector=>rect(document.querySelector(selector));
      const row=document.querySelector('.git-scm-file'),directory=row.querySelector('.git-scm-file-directory'),status=row.querySelector('.git-scm-file-status'),action=row.querySelector('.git-scm-inline-action'),badge=document.querySelector('[data-scm-group="changes"] .git-scm-badge'),row_box=row.getBoundingClientRect();
      return{width:${width},title:box('.git-scm-title'),title_tool:box('.git-scm-tools .git-icon-button'),input_heading:box('.git-scm-input-heading'),message:box('.git-scm-message'),commit:box('.git-scm-commit'),commit_options:box('.git-scm-commit-options'),filter:box('.git-scm-filter'),group:box('[data-scm-group="changes"]>summary'),row:rect(row),label:rect(row.querySelector('.git-scm-file-label')),action:rect(action),badge:box('[data-scm-group="changes"] .git-scm-badge'),status:rect(status),history_header:box('.git-scm-history-header'),status_right_gap:row_box.right-status.getBoundingClientRect().right,row_overflow:row.scrollWidth-row.clientWidth,row_columns:getComputedStyle(row).gridTemplateColumns,directory_display:getComputedStyle(directory).display,action_opacity:getComputedStyle(action).opacity,commit_radius:getComputedStyle(document.querySelector('.git-scm-commit')).borderRadius,options_radius:getComputedStyle(document.querySelector('.git-scm-commit-options')).borderRadius,badge_radius:getComputedStyle(badge).borderRadius,sidebar_background:getComputedStyle(document.querySelector('.git-scm-sidebar')).backgroundColor,status_color:getComputedStyle(status).color};
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
  close_to(regular.filter.height, 26, "file filter");
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
  assert.equal(regular.sidebar_background, "rgb(248, 248, 248)", "SCM uses the VS Code sidebar surface token");
  assert.equal(regular.status_color, "rgb(137, 85, 3)", "SCM status uses gitDecoration token");
  await capture("scm_regular");

  test_window.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(regular.row.left + 40), y: Math.round(regular.row.top + regular.row.height / 2) });
  await settle();
  const hovered = await inspect(320);
  assert.equal(hovered.action_opacity, "1", "row action appears on hover");
  assert.equal(hovered.row_columns, regular.row_columns, "hover does not insert an action column");
  close_to(hovered.label.width, regular.label.width, "hover keeps label/status column geometry");
  assert(hovered.action.right <= hovered.status.left - 3, "hover action overlays before the status without moving it");

  test_window.webContents.sendInputEvent({ type: "mouseMove", x: 600, y: 680 });
  const narrow = await inspect(236);
  close_to(narrow.row.height, 22, "narrow change row");
  close_to(narrow.status_right_gap, 8, "narrow status column right inset");
  assert(narrow.row_overflow <= 1, "narrow SCM row must not overflow horizontally");
  assert.equal(narrow.directory_display, "none", "narrow sidebar releases the optional path column");
  await capture("scm_narrow");

  console.log(JSON.stringify({status:"PASS",checks:["VS Code 35px view title, 28x22 title actions and 22px SCM rows","30px input and 26px split commit button","22px inline action target, 18px badge and 16px status column","normal and hovered rows reserve no action column","history pane header matches VS Code's 22px pane header","narrow sidebar hides only optional path text","VS Code sidebar and gitDecoration theme tokens applied"],regular,hovered,narrow,evidence,screenshots:[path.join(evidence,"scm_regular.png"),path.join(evidence,"scm_narrow.png")]}));
  test_window.destroy(); app.exit(0);
}).catch(async error => {
  console.error(error); console.error(evidence);
  if (test_window && !test_window.isDestroyed()) { try { await capture("scm_failure"); } catch {} test_window.destroy(); }
  app.exit(1);
});
