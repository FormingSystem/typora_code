const { app, BrowserWindow } = require('electron');
const { build } = require('esbuild');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_tabs_'));
app.setPath('userData', path.join(evidence, 'profile')); app.disableHardwareAcceleration();
let test_window; const checks = [];
const evaluate = source => test_window.webContents.executeJavaScript(source);
const wait = async source => { for (let index = 0; index < 160; index++) { if (await evaluate(source)) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error('Timed out: ' + source); };
app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show: false, width: 800, height: 500, webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false } });
  const html = path.join(evidence, 'fixture.html');
  fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><body><main id="root"><section id="group" class="typ-workspace-tabs"><div class="typ-workspace-tab-header"><div class="typ-tab" data-id="source.md">source.md</div><div class="typ-tab" data-id="target.md">target.md</div></div><div class="typ-workspace-tab-content"></div></section></main></body>');
  await test_window.loadFile(html);
  const bundle = await build({ entryPoints: [path.join(__dirname, '../src/workspace_tabs.ts')], bundle: true, write: false, format: 'iife', globalName: 'tabs_qa' });
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(`(()=>{
    const containerEl=document.querySelector('#group');
    window.group={containerEl,children:[],removeTab(path){
      const leaf=this.children.find(item=>item.state.path===path);if(!leaf)return;
      this.children.splice(this.children.indexOf(leaf),1);
      containerEl.querySelector('.typ-tab[data-id="'+CSS.escape(path)+'"]')?.remove();
      if(!this.children.length){const placeholder={state:{path:''},parent:this};this.children.push(placeholder);const tab=document.createElement('div');tab.className='typ-tab';tab.dataset.id='';tab.textContent='New tab';containerEl.querySelector('.typ-workspace-tab-header').append(tab);}
      window.host.core.app.workspace.activeLeaf=this.children[0]||null;
    }};
    group.children=[{state:{path:'source.md'},parent:group},{state:{path:'target.md'},parent:group}];
    window.host={core:{app:{workspace:{rootSplit:{containerEl:document.querySelector('#root')},activeLeaf:group.children[0],eachLeaves(callback){group.children.forEach(callback);}}}}};
    tabs_qa.bind_workspace_tab_actions(host);
  })()`);
  await evaluate(`(()=>{const tab=document.querySelector('.typ-tab[data-id="source.md"]');tab.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,button:2}));const menu=document.createElement('ul');menu.className='context-menu';menu.innerHTML='<li data-key="removeTab">Close</li><li data-key="removeOthers">Others</li><li data-key="removeRight">Right</li>';document.body.append(menu)})()`);
  await wait('document.querySelector(".linux-note-close-all-tabs")');
  assert.equal(await evaluate('document.querySelector(".linux-note-close-all-tabs").textContent'), '关闭所有标签');
  checks.push('tab context menu receives an independent Close All Tabs command');
  await evaluate('document.querySelector(".linux-note-close-all-tabs").click()');
  await wait('group.children.length===1 && group.children[0].state.path==="" && document.querySelector("#group").classList.contains("linux-note-empty-group")');
  assert.equal(await evaluate('document.querySelectorAll(".typ-tab[data-id]").length'), 1);
  assert.equal(await evaluate('document.querySelector(".typ-tab").textContent'), 'New tab');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".typ-workspace-tab-header")).display'), 'none');
  checks.push('closing all real tabs leaves only the hidden host placeholder and a true empty editor group');
  console.log(JSON.stringify({ status: 'PASS', checks, evidence })); test_window.destroy(); app.exit(0);
}).catch(async error => { console.error(JSON.stringify({ status: 'FAIL', checks, error: String(error.stack || error), evidence })); if (test_window && !test_window.isDestroyed()) test_window.destroy(); app.exit(1); });
