// Hidden-Electron visual and computed-style regression for the shared workbench
// palette.  It never launches Typora or reads a user workspace.
const { app, BrowserWindow, nativeTheme } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { build } = require("esbuild");

const evidence = process.env.TYPORA_THEME_EVIDENCE_DIR
  ? path.resolve(process.env.TYPORA_THEME_EVIDENCE_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "typora_workspace_chrome_theme_"));
fs.mkdirSync(evidence, { recursive: true });
app.setPath("userData", path.join(evidence, "user_data"));
app.disableHardwareAcceleration();

let test_window;
const check = (value, label, checks) => { assert(value, label); checks.push(label); };
const evaluate = source => test_window.webContents.executeJavaScript(source);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const settle = async () => { await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))"); await delay(100); };
const capture = async name => fs.writeFileSync(path.join(evidence, `${name}.png`), (await test_window.webContents.capturePage()).toPNG());

const fixture = `<!doctype html><html class="palette-light"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;font:13px "Segoe UI",sans-serif}
html.palette-light{--bg-color:#fff;--side-bar-bg-color:#fff;--text-color:#202124;--control-text-color:#61666b;--blur-text-color:#6c7075;--primary-color:#0078d4;--active-file-border-color:#0078d4;--active-file-bg-color:#cce8ff;--item-hover-bg-color:#e8e8e8;--search-select-bg-color:#f3c94b66;--window-border-color:#d4d4d4}
html.palette-dark{--bg-color:#1e1e1e;--side-bar-bg-color:#1e1e1e;--text-color:#d4d4d4;--control-text-color:#a5a5a5;--blur-text-color:#8c8c8c;--primary-color:#3794ff;--active-file-border-color:#3794ff;--active-file-bg-color:#04395e;--item-hover-bg-color:#2a2d2e;--search-select-bg-color:#ea5c0055;--window-border-color:#454545}
button,input,select{font:inherit}.icon{width:16px;height:16px;fill:currentColor}.activity-icon{width:24px;height:24px;fill:currentColor}
#top-titlebar{position:absolute;inset:0 0 auto;height:35px;display:flex;align-items:center;border-bottom:1px solid;padding:0 8px;gap:8px}.app-mark{font-weight:800}.menu{padding:5px 8px}.workspace-titlebar-command-area{position:absolute;left:50%;transform:translateX(-50%);width:520px}.workspace-titlebar-quick-open{width:100%;height:22px;border:1px solid;border-radius:5px}.window-actions{margin-left:auto}
.typ-ribbon{position:absolute;left:0;top:35px;bottom:24px;width:48px;border-right:1px solid;display:flex;flex-direction:column}.typ-ribbon .group{display:flex;flex-direction:column}.typ-ribbon .top{flex:1}.typ-ribbon-item{height:48px;display:grid;place-items:center;border-left:3px solid transparent}.typ-ribbon-item[data-activity-active=true]{border-left-color:var(--workspace-activity-active-border)}
#typora-sidebar{position:absolute;left:48px;top:35px;bottom:24px;width:310px;border-right:1px solid;overflow:hidden}.linux-note-workspace-search{position:absolute;inset:0;display:flex;flex-direction:column}.workspace-search-heading{height:35px;display:flex;align-items:center;padding:0 12px;font-weight:600}.workspace-search-query-box{margin:5px 10px;height:27px;border:1px solid;border-radius:3px;display:flex;align-items:center}.workspace-search-query-box input{width:100%;height:100%;border:0;padding:0 6px}.workspace-search-status{padding:6px 12px;color:var(--control-text-color)}.workspace-search-results{height:230px;border-bottom:1px solid}.workspace-search-file>summary,.workspace-search-match{height:24px;display:flex;align-items:center;gap:6px;padding:0 10px;border:0;width:100%}.workspace-search-match{padding-left:34px}.workspace-search-preview-section{flex:1;display:flex;flex-direction:column}.workspace-search-preview-heading{height:28px;display:flex;align-items:center;padding:0 8px;border-bottom:1px solid}.workspace-lookup-preview{flex:1;padding:12px 16px}.workspace-search-preview mark{padding:0 2px}.workspace-search-file-count{margin-left:auto;border-radius:10px;padding:1px 6px}
.typ-workspace-root{position:absolute;left:358px;right:0;top:35px;bottom:24px;display:flex;flex-direction:column}.typ-workspace-tab-header{height:35px;display:flex;border-bottom:1px solid}.typ-tab{height:35px;min-width:170px;padding:0 12px;display:flex;align-items:center;gap:8px;border-right:1px solid}.typ-workspace-tab-content{flex:1;min-height:0;display:grid;grid-template-columns:minmax(400px,1.05fr) minmax(410px,.95fr)}.document-stage{min-width:0;overflow:auto;padding:38px;background:var(--bg-color)}
#write{max-width:680px;margin:0 auto;padding:34px 42px;border-radius:3px;background:#fffdf7;color:#3c3027;font:18px/1.72 Georgia,"Microsoft YaHei",serif;box-shadow:0 0 0 1px #6f5c4622}html.palette-dark #write{background:#20242a;color:#e6dfd4;box-shadow:0 0 0 1px #fff2}#write h1{font:700 30px/1.3 Georgia,"Microsoft YaHei",serif;color:#275f95}html.palette-dark #write h1{color:#78b7e8}#write code{font:15px Consolas,monospace;background:#7f7f7f18;padding:2px 5px}
.linux-note-git-graph{position:relative;display:flex;flex-direction:column;min-width:0;border-left:1px solid}.git-graph-toolbar{height:40px;display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid}.git-graph-toolbar button,.git-graph-toolbar select{height:24px;border:1px solid;border-radius:3px;background:transparent}.git-graph-columns,.git-graph-row{display:grid;grid-template-columns:58px 1fr 105px 90px 70px;align-items:center}.git-graph-columns{height:30px;border-bottom:1px solid;font-weight:600}.git-graph-row{height:26px;padding:0 7px}.git-graph-row[aria-pressed=true]{height:28px}.git-graph-details{height:230px;margin-left:58px;display:grid;grid-template-columns:1fr 1fr;border-left:1px solid;border-bottom:1px solid}.git-graph-detail-info,.git-graph-detail-files{padding:14px;border-right:1px solid}.git-ref-branch{padding:1px 5px;border:1px solid #2684d4;border-radius:5px;color:#2684d4}
footer.ty-footer{position:absolute;left:0;right:0;bottom:0;height:24px;border-top:1px solid;display:flex;align-items:center;padding:0 9px;gap:18px}.footer-right{margin-left:auto}
</style></head><body class="unibody-window">
<div id="top-titlebar" data-workspace-titlebar><span class="app-mark">T</span><span class="menu">文件</span><span class="menu">编辑</span><span class="menu">视图</span><div class="workspace-titlebar-command-area"><button class="workspace-titlebar-quick-open"><svg class="icon" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4" fill="none" stroke="currentColor"/><path d="m10 10 4 4" stroke="currentColor"/></svg>workspace</button></div><span class="window-actions">—　□　×</span></div>
<aside class="typ-ribbon" data-workspace-activity="ready"><div class="group top"><div class="typ-ribbon-item"><svg class="activity-icon" viewBox="0 0 24 24"><path d="M4 3h13l3 3v15H4z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></div><div class="typ-ribbon-item" data-activity-active="true"><svg class="activity-icon" viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m15 15 5 5" stroke="currentColor" stroke-width="1.5"/></svg></div><div class="typ-ribbon-item"><svg class="activity-icon" viewBox="0 0 24 24"><path d="M5 5h14M5 12h14M5 19h14" stroke="currentColor" stroke-width="1.5"/></svg></div></div><div class="group"><div class="typ-ribbon-item"><svg class="activity-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4" stroke="currentColor"/></svg></div></div></aside>
<aside id="typora-sidebar"><section class="linux-note-workspace-search"><div class="workspace-search-heading"><strong>搜索</strong></div><div class="workspace-search-query-box"><input value="workspace_theme"></div><div class="workspace-search-status">在 2 个文件中找到 4 个结果</div><div class="workspace-search-results"><details class="workspace-search-file" open><summary class="is-selected"><svg class="icon" viewBox="0 0 16 16"><path d="M3 1h7l3 3v11H3z" fill="none" stroke="currentColor"/></svg><span>workspace_chrome.css</span><span class="workspace-search-file-count">3</span></summary><button class="workspace-search-match is-selected">--linux-note-shell-<mark>theme</mark></button><button class="workspace-search-match">VS Code <mark>theme</mark> token</button></details><details class="workspace-search-file" open><summary><svg class="icon" viewBox="0 0 16 16"><path d="M3 1h7l3 3v11H3z" fill="none" stroke="currentColor"/></svg><span>README.md</span><span class="workspace-search-file-count">1</span></summary></details></div><section class="workspace-search-preview-section"><div class="workspace-search-preview-heading">⌄　预览 <span style="margin-left:auto">80%</span></div><div class="workspace-lookup-preview"><h3>Workbench theme</h3><p>The selected result is shown here without opening another editor.</p><pre><code>--linux-note-shell-theme</code></pre></div></section></section></aside>
<main class="typ-workspace-root"><div class="typ-workspace-tab-header"><div class="typ-tab active"><svg class="icon" viewBox="0 0 16 16"><path d="M3 1h7l3 3v11H3z" fill="none" stroke="currentColor"/></svg>README.md</div><div class="typ-tab"><svg class="icon" viewBox="0 0 16 16"><path d="M3 1h7l3 3v11H3z" fill="none" stroke="currentColor"/></svg>workspace_chrome.css</div></div><div class="typ-workspace-tab-content"><section class="document-stage"><article id="write"><h1>Typora Markdown</h1><p>The document keeps its own theme, type scale and spacing.</p><p>Only the surrounding <code>workbench chrome</code> uses the VS Code colour hierarchy.</p><h2>Content remains readable</h2><p>Background and typography here are deliberately independent.</p></article></section><section class="linux-note-git-graph"><div class="git-graph-toolbar"><label>Branches: <select><option>Show All</option></select></label><button>Refresh</button><span style="margin-left:auto">⌕　⚙</span></div><div class="git-graph-columns"><b>Graph</b><b>Description</b><b>Date</b><b>Author</b><b>Commit</b></div><div class="git-graph-row"><span>●</span><span><span class="git-ref-branch">master</span> feat: workbench colours</span><span>Sep 9</span><span>author</span><code>a1b2c3d</code></div><div class="git-graph-row" aria-pressed="true"><span>●</span><span>fix: source preview palette</span><span>Sep 8</span><span>author</span><code>b2c3d4e</code></div><div class="git-graph-details"><div class="git-graph-detail-info"><b>Commit:</b> b2c3d4e<br><b>Author:</b> author<br><br>fix: source preview palette</div><div class="git-graph-detail-files">▾ tools / typora / enhancements<br>　M workspace_chrome.css<br>　A test_workspace_chrome_theme.cjs</div></div></section></div></main>
<footer class="ty-footer"><span>master*</span><span>↻</span><span>Git Graph</span><span class="footer-right">Ln 12, Col 5　UTF-8　Markdown</span></footer>
</body></html>`;

app.whenReady().then(async () => {
  const checks = [];
  test_window = new BrowserWindow({ show: false, width: 1440, height: 900, backgroundColor: "#1e1e1e", webPreferences: { offscreen: true, contextIsolation: false, backgroundThrottling: false } });
  const html = path.join(evidence, "fixture.html");
  fs.writeFileSync(html, fixture);
  await test_window.loadFile(html);
  await test_window.webContents.insertCSS(fs.readFileSync(path.join(__dirname,"../src/workspace_search.css"),"utf8"));
  test_window.webContents.debugger.attach("1.3");
  await test_window.webContents.debugger.sendCommand("Emulation.setFocusEmulationEnabled", {enabled:true});
  const bundle = await build({ stdin: { contents: 'export {install_workspace_chrome} from "./src/workspace_chrome";', resolveDir: path.join(__dirname, "..") }, bundle: true, loader: { ".css": "text" }, format: "iife", globalName: "chrome_theme_qa", write: false });
  await evaluate(bundle.outputFiles[0].text);

  await evaluate(`window.markdown_style=()=>{const write=getComputedStyle(document.querySelector('#write')),heading=getComputedStyle(document.querySelector('#write h1')),code=getComputedStyle(document.querySelector('#write code'));return{background:write.backgroundColor,color:write.color,font:write.font,padding:write.padding,heading_font:heading.font,heading_color:heading.color,code_font:code.font,code_background:code.backgroundColor}};window.surface=selector=>getComputedStyle(document.querySelector(selector)).backgroundColor;window.pixel=value=>{const canvas=document.createElement('canvas'),context=canvas.getContext('2d');canvas.width=canvas.height=1;context.fillStyle=value;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data]};window.brightness=selector=>{const [r,g,b]=pixel(surface(selector));return .2126*r+.7152*g+.0722*b};window.light_markdown_before=markdown_style();window.binding=chrome_theme_qa.install_workspace_chrome();void 0`);
  check(await evaluate("JSON.stringify(markdown_style())===JSON.stringify(light_markdown_before)"), "light palette leaves #write background, font, spacing, headings and code untouched", checks);
  const light = await evaluate(`({editor:surface('.typ-workspace-tab-content'),title:surface('#top-titlebar'),activity:surface('.typ-ribbon'),sidebar:surface('#typora-sidebar'),toolbar:surface('.git-graph-toolbar'),toolbar_border:getComputedStyle(document.querySelector('.git-graph-toolbar')).borderBottomColor,tab_active:surface('.typ-tab.active'),tab_inactive:surface('.typ-tab:not(.active)'),selected:surface('.git-graph-row[aria-pressed=true]'),details:surface('.git-graph-details'),editor_luma:brightness('.typ-workspace-tab-content'),title_luma:brightness('#top-titlebar'),activity_luma:brightness('.typ-ribbon'),sidebar_luma:brightness('#typora-sidebar'),inactive_icon:getComputedStyle(document.querySelector('.typ-ribbon-item:not([data-activity-active]) svg')).color,active_icon:getComputedStyle(document.querySelector('[data-activity-active] svg')).color})`);
  check(light.title_luma < light.editor_luma && light.activity_luma < light.editor_luma && light.sidebar_luma < light.editor_luma, "light palette separates titlebar, activity bar and sidebar from the editor canvas", checks);
  check(light.tab_active === light.editor && light.tab_inactive !== light.tab_active, "active tab joins the editor while inactive tabs stay on the tab strip", checks);
  check(light.toolbar === light.editor && light.toolbar_border !== "rgba(0, 0, 0, 0)" && light.details !== light.editor && light.selected !== light.editor, "Git Graph uses the classic editor canvas, bordered controls and tinted detail states", checks);
  check(light.active_icon !== light.inactive_icon, "light activity icons distinguish active and inactive foregrounds", checks);
  check(await evaluate("document.documentElement.dataset.linuxNoteShellTheme==='light'&&surface('.workspace-search-match.is-selected')==='rgb(228, 230, 241)'"), "light inactive selection has a stable visible neutral background", checks);
  await evaluate("document.querySelector('.workspace-search-match.is-selected').focus()");
  check(await evaluate("surface('.workspace-search-match.is-selected')==='rgb(0, 96, 192)'&&getComputedStyle(document.querySelector('.workspace-search-match.is-selected')).color==='rgb(255, 255, 255)'"), "focused light selection uses readable active foreground and background", checks);
  await evaluate("document.activeElement.blur()");
  check(await evaluate("document.querySelector('.typ-workspace-tab-header').getBoundingClientRect().height===35&&document.querySelector('footer.ty-footer').getBoundingClientRect().height===22"), "tabs and status bar use 35px and 22px workbench geometry", checks);
  nativeTheme.themeSource = "light";
  await settle();
  await capture("workspace_chrome_light");

  await evaluate(`binding.dispose();document.documentElement.className='palette-dark';window.dark_markdown_before=markdown_style();window.binding=chrome_theme_qa.install_workspace_chrome();void 0`);
  check(await evaluate("JSON.stringify(markdown_style())===JSON.stringify(dark_markdown_before)"), "dark palette leaves #write background, font, spacing, headings and code untouched", checks);
  const dark = await evaluate(`({editor:surface('.typ-workspace-tab-content'),title:surface('#top-titlebar'),activity:surface('.typ-ribbon'),sidebar:surface('#typora-sidebar'),toolbar:surface('.git-graph-toolbar'),toolbar_border:getComputedStyle(document.querySelector('.git-graph-toolbar')).borderBottomColor,tab_active:surface('.typ-tab.active'),tab_inactive:surface('.typ-tab:not(.active)'),selected:surface('.git-graph-row[aria-pressed=true]'),details:surface('.git-graph-details'),editor_luma:brightness('.typ-workspace-tab-content'),title_luma:brightness('#top-titlebar'),activity_luma:brightness('.typ-ribbon'),sidebar_luma:brightness('#typora-sidebar'),inactive_icon:getComputedStyle(document.querySelector('.typ-ribbon-item:not([data-activity-active]) svg')).color,active_icon:getComputedStyle(document.querySelector('[data-activity-active] svg')).color})`);
  check(dark.title_luma > dark.editor_luma && dark.activity_luma > dark.editor_luma && dark.sidebar_luma > dark.editor_luma, "dark palette separates titlebar, activity bar and sidebar from the editor canvas", checks);
  check(dark.tab_active === dark.editor && dark.tab_inactive !== dark.tab_active, "dark active and inactive tabs retain the VS Code surface hierarchy", checks);
  check(dark.toolbar === dark.editor && dark.toolbar_border !== "rgba(0, 0, 0, 0)" && dark.details !== dark.editor && dark.selected !== dark.editor, "dark Git Graph surfaces follow the classic extension without a white fallback", checks);
  check(dark.active_icon !== dark.inactive_icon, "dark activity icons distinguish active and inactive foregrounds", checks);
  check(await evaluate("document.documentElement.dataset.linuxNoteShellTheme==='dark'&&surface('.workspace-search-match.is-selected')==='rgb(55, 55, 61)'"), "dark inactive selection stays distinct from the sidebar", checks);
  await evaluate("document.documentElement.className='palette-light'"); await settle();
  check(await evaluate("document.documentElement.dataset.linuxNoteShellTheme==='light'"), "live host theme changes refresh the palette without reinstalling", checks);
  await evaluate("document.documentElement.className='palette-dark'"); await settle();
  nativeTheme.themeSource = "dark";
  await settle();
  await capture("workspace_chrome_dark");

  await evaluate(`document.documentElement.style.setProperty('--vscode-sideBar-background','#102030');document.documentElement.style.setProperty('--vscode-icon-foreground','#abcdee');document.documentElement.style.setProperty('--vscode-list-activeSelectionBackground','#304860');void 0`);
  check(await evaluate("surface('#typora-sidebar')==='rgb(16, 32, 48)'"), "explicit VS Code sideBar token overrides the derived Typora fallback", checks);
  check(await evaluate("getComputedStyle(document.querySelector('.typ-ribbon-item:not([data-activity-active]) svg')).color==='rgb(171, 205, 238)'"), "explicit VS Code icon.foreground token reaches shell icons", checks);
  await evaluate("document.querySelector('.workspace-search-match.is-selected').focus()");
  check(await evaluate("surface('.workspace-search-match.is-selected')==='rgb(48, 72, 96)'"), "explicit VS Code list selection token reaches workbench lists", checks);

  console.log(JSON.stringify({ status: "PASS", checks, light, dark, evidence, screenshots: [path.join(evidence, "workspace_chrome_light.png"), path.join(evidence, "workspace_chrome_dark.png")] }));
  test_window.destroy();
  app.exit(0);
}).catch(async error => {
  console.error(error);
  console.error(evidence);
  if (test_window && !test_window.isDestroyed()) test_window.destroy();
  app.exit(1);
});
