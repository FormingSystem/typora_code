const { app, BrowserWindow } = require('electron');
const { build } = require('esbuild');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_tabs_'));
app.setPath('userData', path.join(evidence, 'profile')); app.disableHardwareAcceleration();
let test_window; const checks = [];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const evaluate = source => test_window.webContents.executeJavaScript(source);
const wait = async source => { for (let index = 0; index < 160; index++) { if (await evaluate(source)) return; await delay(20); } throw new Error('Timed out: ' + source); };
app.whenReady().then(async () => {
  test_window = new BrowserWindow({ show: false, width: 800, height: 500, webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false } });
  const html = path.join(evidence, 'fixture.html');
  fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><style>.modal,.modal-backdrop{position:fixed;inset:0}.modal-dialog{width:320px;min-height:80px}</style><body><main id="root"><section id="group" class="typ-workspace-tabs"><div class="typ-workspace-tab-header"><div class="typ-tab" data-id="source.md">source.md</div><div class="typ-tab" data-id="target.md">target.md</div></div><div class="typ-workspace-tab-content"></div></section></main><section class="workspace-quick-open" role="dialog" aria-modal="false" hidden>常驻快速打开</section></body>');
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

  await evaluate(`(()=>{
    const header=group.containerEl.querySelector('.typ-workspace-tab-header');
    header.innerHTML='<div class="typ-tab" data-id="dirty.md">dirty.md</div><div class="typ-tab" data-id="clean.md">clean.md</div>';
    group.containerEl.classList.remove('linux-note-empty-group');window.close_events=[];window.close_finished=false;
    group.children=[{state:{path:'dirty.md'},parent:group},{state:{path:'clean.md'},parent:group}];
    group.removeTab=function(path){
      const leaf=this.children.find(item=>item.state.path===path);if(!leaf)return;
      if(path==='dirty.md'&&!leaf.confirmed){close_events.push('dirty-confirm');setTimeout(()=>{const backdrop=document.createElement('div');backdrop.className='modal-backdrop in';const modal=document.createElement('section');modal.className='modal in';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');const panel=document.createElement('div');panel.className='modal-dialog';const save=document.createElement('button');save.textContent='保存并关闭';save.onclick=()=>setTimeout(()=>{leaf.confirmed=true;this.children.splice(this.children.indexOf(leaf),1);header.querySelector('[data-id="dirty.md"]')?.remove();close_events.push('dirty-saved');backdrop.remove();modal.remove();},20);panel.append(save);modal.append(panel);document.body.append(backdrop,modal);},40);return;}
      this.children.splice(this.children.indexOf(leaf),1);header.querySelector('[data-id="'+CSS.escape(path)+'"]')?.remove();close_events.push(path==='clean.md'?'clean-closed':'closed');
    };
    host.core.app.workspace.activeLeaf=group.children[0];
    window.close_promise=tabs_qa.close_all_workspace_tabs(host,group).then(()=>close_finished=true);
  })()`);
  await wait('document.querySelector(".modal-dialog button")');
  await delay(2200);
  assert.equal(await evaluate('close_finished'), false, 'a visible native modal/backdrop clears the short appearance deadline while the user decides');
  assert.equal(await evaluate('group.children.length'), 2);
  checks.push('Close All Editors waits at each dirty editor instead of skipping its confirmation');
  await evaluate('document.querySelector(".modal-dialog button").click()');
  await wait('close_finished');
  assert.deepEqual(await evaluate('close_events'), ['dirty-confirm','dirty-saved','clean-closed']);
  checks.push('saving a dirty editor resumes Close All Editors in deterministic tab order');

  await evaluate(`(()=>{
    const header=group.containerEl.querySelector('.typ-workspace-tab-header');
    header.innerHTML='<div class="typ-tab" data-id="cancel.md">cancel.md</div><div class="typ-tab" data-id="untouched.md">untouched.md</div>';
    window.cancel_events=[];window.cancel_finished=false;
    group.children=[{state:{path:'cancel.md'},parent:group},{state:{path:'untouched.md'},parent:group}];
    const native_modal=document.createElement('section');native_modal.className='modal';native_modal.hidden=true;native_modal.setAttribute('aria-hidden','true');const panel=document.createElement('div');panel.className='modal-dialog';const cancel=document.createElement('button');cancel.textContent='取消';panel.append(cancel);native_modal.append(panel);document.body.append(native_modal);
    cancel.onclick=()=>{cancel_events.push('cancelled');native_modal.classList.remove('in');native_modal.hidden=true;native_modal.setAttribute('aria-hidden','true');};
    group.removeTab=function(path){
      const leaf=this.children.find(item=>item.state.path===path);if(!leaf)return;
      if(path==='cancel.md'){cancel_events.push('cancel-confirm');setTimeout(()=>{const quick=document.querySelector('.workspace-quick-open');quick.hidden=false;quick.setAttribute('aria-modal','true');native_modal.hidden=false;native_modal.removeAttribute('aria-hidden');native_modal.classList.add('in');},40);return;}
      cancel_events.push('unexpected-close');this.children.splice(this.children.indexOf(leaf),1);
    };
    host.core.app.workspace.activeLeaf=group.children[0];
    window.cancel_promise=tabs_qa.close_all_workspace_tabs(host,group).then(()=>cancel_finished=true);
  })()`);
  await wait('document.querySelector(".modal.in .modal-dialog button")');
  await delay(2200);
  assert.equal(await evaluate('cancel_finished'), false, 'an existing hidden native modal is recognized when it becomes visible');
  await evaluate('document.querySelector(".modal.in .modal-dialog button").click()');
  await wait('cancel_finished');
  assert.deepEqual(await evaluate('cancel_events'), ['cancel-confirm','cancelled']);
  assert.deepEqual(await evaluate('group.children.map(item=>item.state.path)'), ['cancel.md','untouched.md']);
  assert.equal(await evaluate('document.querySelector(".workspace-quick-open").hidden'), false);
  checks.push('a newly visible native modal cancellation aborts Close All Editors while a persistent quick-open dialog is ignored');

  await evaluate(`(()=>{
    const header=group.containerEl.querySelector('.typ-workspace-tab-header');
    header.innerHTML='<div class="typ-tab" data-id="role-cancel.md">role-cancel.md</div><div class="typ-tab" data-id="role-untouched.md">role-untouched.md</div>';
    window.role_events=[];window.role_finished=false;
    group.children=[{state:{path:'role-cancel.md'},parent:group},{state:{path:'role-untouched.md'},parent:group}];
    group.removeTab=function(path){
      const leaf=this.children.find(item=>item.state.path===path);if(!leaf)return;
      if(path==='role-cancel.md'){role_events.push('role-confirm');setTimeout(()=>{const dialog=document.createElement('section');dialog.className='native-role-confirm';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');const cancel=document.createElement('button');cancel.textContent='取消';cancel.onclick=()=>{role_events.push('role-cancelled');dialog.remove();};dialog.append(cancel);document.body.append(dialog);},40);return;}
      role_events.push('unexpected-close');this.children.splice(this.children.indexOf(leaf),1);
    };
    host.core.app.workspace.activeLeaf=group.children[0];
    window.role_promise=tabs_qa.close_all_workspace_tabs(host,group).then(()=>role_finished=true);
  })()`);
  await wait('document.querySelector(".native-role-confirm button")');
  await delay(2200);
  assert.equal(await evaluate('role_finished'), false, 'a new role=dialog remains tracked beyond the appearance deadline');
  await evaluate('document.querySelector(".native-role-confirm button").click()');
  await wait('role_finished');
  assert.deepEqual(await evaluate('role_events'), ['role-confirm','role-cancelled']);
  assert.deepEqual(await evaluate('group.children.map(item=>item.state.path)'), ['role-cancel.md','role-untouched.md']);
  checks.push('a new visible role dialog cancellation stops Close All while the still-visible quick-open remains excluded');
  console.log(JSON.stringify({ status: 'PASS', checks, evidence })); test_window.destroy(); app.exit(0);
}).catch(async error => { console.error(JSON.stringify({ status: 'FAIL', checks, error: String(error.stack || error), evidence })); if (test_window && !test_window.isDestroyed()) test_window.destroy(); app.exit(1); });
