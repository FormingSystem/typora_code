const { app, BrowserWindow } = require('electron');
const { build } = require('esbuild');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_workspace_widgets_'));
app.setPath('userData', path.join(evidence, 'profile'));
app.disableHardwareAcceleration();
let test_window;
const checks = [];
const evaluate = source => test_window.webContents.executeJavaScript(source);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const key = async (key_code, modifiers = []) => {
  test_window.webContents.sendInputEvent({type: 'keyDown', keyCode: key_code, modifiers});
  test_window.webContents.sendInputEvent({type: 'keyUp', keyCode: key_code, modifiers});
  await delay(35);
};
const focus_is = async (selector, label) => {
  assert(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`), label);
  checks.push(label);
};

app.whenReady().then(async () => {
  const fixture = path.join(evidence, 'fixture.html');
  fs.writeFileSync(fixture, '<!doctype html><meta charset="utf-8"><style>.git-graph-dialog-shade{position:fixed;inset:0;background:#eee}.git-graph-dialog{padding:20px}.git-graph-dialog-content{display:grid;gap:8px}.css-hidden{display:none}</style><button id="opener">Open settings</button><button id="outside">Outside</button>');
  test_window = new BrowserWindow({show: false, width: 800, height: 600, webPreferences: {contextIsolation: false, backgroundThrottling: false}});
  await test_window.loadFile(fixture);
  const bundle = await build({stdin: {contents: 'export { workspace_dialog, workspace_menu, dispose_workspace_widgets } from "./src/workspace_widgets";', resolveDir: path.join(__dirname, '..')}, bundle: true, format: 'iife', globalName: 'widgets_qa', write: false, loader: {'.css': 'text'}});
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(`document.querySelector('#opener').focus();window.dialog=widgets_qa.workspace_dialog('Settings');dialog.content.innerHTML='<input type=hidden><input disabled><fieldset disabled><input></fieldset><section hidden><input></section><input class=css-hidden><input style="visibility:hidden"><section inert><input></section><input id=first aria-label=Search><input id=second aria-label=Value><section id=filtered hidden><input id=filtered-input></section>';dialog.footer.querySelector('button').id='close';`);
  await delay(60);
  await focus_is('#first', 'autofocus skips hidden, disabled, fieldset-disabled and inert controls');
  await key('Tab', ['shift']);
  await focus_is('#close', 'Shift Tab from first visible field reaches the visible close button');
  await key('Tab');
  await focus_is('#first', 'Tab at the end returns to the first visible control');
  await key('Tab');
  await focus_is('#second', 'native Tab traverses the next available field');
  await evaluate("document.querySelector('#second').disabled=true");
  await key('Tab');
  await focus_is('#first', 'disabling the focused input returns lost focus to the active modal');
  await evaluate("document.querySelector('#first').focus();document.querySelector('#first').hidden=true");
  await key('Tab', ['shift']);
  await focus_is('#close', 'filtering the focused field cannot move focus behind the modal');
  await evaluate("document.querySelector('#first').hidden=false;document.querySelector('#filtered').hidden=false;document.querySelector('#first').focus()");
  await key('Tab');
  await focus_is('#filtered-input', 'unfiltering a field immediately restores its keyboard accessibility');
  await evaluate("window.nested=widgets_qa.workspace_dialog('Nested');nested.content.innerHTML='<input id=nested-first>'");
  await delay(50);
  await focus_is('#nested-first', 'a nested modal owns initial focus');
  await key('Escape');
  assert.equal(await evaluate("document.querySelectorAll('.git-graph-dialog-shade').length"), 1);
  await focus_is('#filtered-input', 'Escape closes only the top dialog and restores its opener');
  await evaluate("dialog.root.querySelectorAll('input,button').forEach(node=>node.disabled=true)");
  await key('Tab');
  await focus_is('.git-graph-dialog', 'a dialog with no enabled controls retains focus on its panel');
  await key('Escape');
  await focus_is('#opener', 'closing an empty-control dialog restores the original page focus');
  await evaluate("document.querySelector('#outside').focus();dialog.close()");
  await focus_is('#outside', 'repeated close is idempotent and does not steal focus');
  await evaluate("window.pending=widgets_qa.workspace_dialog('Cancelled before focus');widgets_qa.dispose_workspace_widgets()");
  await delay(50);
  await focus_is('#outside', 'disposal cancels pending autofocus and restores prior focus');
  await key('Tab', ['shift']);
  await focus_is('#opener', 'disposal removes modal key handlers and restores ordinary Tab navigation');
  assert.equal(await evaluate("document.querySelectorAll('.git-graph-dialog-shade').length"), 0);
  await evaluate("window.close_counts={dialog:0,menu:0};window.owned=widgets_qa.workspace_dialog('Owned','Close',()=>close_counts.dialog++);owned.close();owned.close();window.close_menu=widgets_qa.workspace_menu(new MouseEvent('contextmenu'),[{title:'Item',action(){}}],'',()=>close_counts.menu++);window.dispatchEvent(new Event('blur'));close_menu();widgets_qa.dispose_workspace_widgets()");
  assert.deepEqual(await evaluate('close_counts'), {dialog:1,menu:1});
  assert.equal(await evaluate("document.querySelectorAll('.git-graph-dialog-shade,.git-graph-menu').length"),0);
  checks.push('dialog and menu notify their owner exactly once across close, blur and repeated disposal');
  // 真实 Chromium 指针手势：遮罩消失不能把剩余 mouseup/click 交给刚露出的正文。
  await evaluate(`window.pointer_events=[];document.querySelector('#outside').style.cssText='position:fixed;left:610px;top:460px;width:130px;height:35px';window.write=document.createElement('article');write.id='write';write.contentEditable='true';write.textContent='unchanged Markdown';write.style.cssText='position:fixed;left:510px;top:350px;width:240px;height:55px';document.body.append(write);for(const node of [write,document.querySelector('#outside')])for(const type of ['pointerdown','mousedown','pointerup','mouseup','click','auxclick','contextmenu','beforeinput','input'])node.addEventListener(type,event=>pointer_events.push({target:node.id,type:event.type}));`);
  const gesture = async (button='left',end={x:660,y:475}) => {
    test_window.webContents.sendInputEvent({type:'mouseMove',x:660,y:475});
    test_window.webContents.sendInputEvent({type:'mouseDown',x:660,y:475,button,clickCount:1});
    await delay(35);
    test_window.webContents.sendInputEvent({type:'mouseMove',...end});
    test_window.webContents.sendInputEvent({type:'mouseUp',...end,button,clickCount:1});
    await delay(45);
  };
  for(const button of ['left','right','middle']){
    await evaluate(`pointer_events=[];window.gesture_dialog=widgets_qa.workspace_dialog('Gesture shield');void 0;`);await delay(30);
    await gesture(button);
    assert.equal(await evaluate(`document.querySelectorAll('.git-graph-dialog-shade').length`),0);
    assert.deepEqual(await evaluate('pointer_events'),[],button+' outside gesture cannot leak any remaining pointer or mouse event');
    checks.push(button+' modal outside gesture is consumed through release and click');
  }
  await evaluate(`window.resume_input=document.createElement('input');resume_input.value='abcdef';document.body.append(resume_input);resume_input.focus();resume_input.setSelectionRange(2,4,'backward');window.resume_dialog=widgets_qa.workspace_dialog('Resume typing');void 0;`);await delay(30);await gesture();
  assert(await evaluate(`document.activeElement===resume_input&&resume_input.selectionStart===2&&resume_input.selectionEnd===4&&resume_input.selectionDirection==='backward'`));
  await test_window.webContents.insertText('XY');assert.equal(await evaluate('resume_input.value'),'abXYef');
  checks.push('consumed modal outside dismissal restores the exact input selection and immediate typing');
  await evaluate(`pointer_events=[];window.gesture_dialog=widgets_qa.workspace_dialog('Drag release');void 0;`);await delay(30);await gesture('left',{x:620,y:375});
  assert.deepEqual(await evaluate('pointer_events'),[]);
  assert.equal(await evaluate('write.textContent'),'unchanged Markdown');
  checks.push('modal outside press followed by release over contenteditable leaves events and text unchanged');
  await evaluate(`pointer_events=[];window.parent_dialog=widgets_qa.workspace_dialog('Parent');window.child_dialog=widgets_qa.workspace_dialog('Child');void 0;`);await delay(30);await gesture();
  assert.equal(await evaluate(`document.querySelectorAll('.git-graph-dialog-shade').length`),1);
  assert.deepEqual(await evaluate('pointer_events'),[]);
  await key('Escape');
  checks.push('one outside gesture closes only the top modal and cannot activate its parent or editor');
  await gesture();assert.equal(await evaluate(`pointer_events.filter(event=>event.target==='outside'&&event.type==='click').length`),1);
  await focus_is('#outside','the next independent click works normally after the modal gesture is consumed');
  await evaluate(`pointer_events=[];window.menu_cancel=widgets_qa.workspace_menu(new MouseEvent('contextmenu',{clientX:20,clientY:20}),[{title:'Menu item',action(){}}]);void 0;`);await delay(30);await gesture();
  assert.equal(await evaluate(`document.querySelectorAll('.git-graph-menu').length`),0);
  for(const type of ['mousedown','mouseup','click'])assert.equal(await evaluate(`pointer_events.filter(event=>event.target==='outside'&&event.type==='${type}').length`),1);
  checks.push('nonmodal menu outside click still dismisses the menu and activates the target in the same gesture');
  // 复现原生 Night 的正文 hr 规则，即使主题迟到加载也不能撑大共享菜单分组间距。
  await test_window.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'../src/git_graph.css'),'utf8'));
  await evaluate(`window.document_rule=document.createElement('hr');document.body.append(document_rule);window.theme_pollution=document.createElement('style');theme_pollution.textContent='hr{height:2px;margin:24px 0 !important}';document.head.append(theme_pollution);void 0;`);
  for(const dark of [false,true])for(const compact of [false,true]){
    await evaluate(`document.body.style.background='${dark?'#191a1b':'#fff'}';document.body.style.color='${dark?'#ddd':'#24292f'}';window.separator_close=widgets_qa.workspace_menu(new MouseEvent('contextmenu',{clientX:20,clientY:20}),[{title:'First',action(){}},{title:'Second',separator:true,action(){}}],${JSON.stringify(compact?'workspace-menu-compact':'')});void 0;`);await delay(35);
    const metrics=await evaluate(`(()=>{const menu=document.querySelector('.git-graph-menu'),line=menu.querySelector('hr'),style=getComputedStyle(line),buttons=menu.querySelectorAll('button'),native=getComputedStyle(document_rule);return{height:line.getBoundingClientRect().height,min_height:style.minHeight,padding:style.padding,border_top:style.borderTopWidth,border_bottom:style.borderBottomWidth,box_sizing:style.boxSizing,margin_top:style.marginTop,margin_bottom:style.marginBottom,gap:buttons[1].getBoundingClientRect().top-buttons[0].getBoundingClientRect().bottom,document_height:native.height,document_margin:native.marginTop,device_scale:devicePixelRatio}})()`);
    const {gap,border_top,device_scale,...fixed_metrics}=metrics;
    assert(Math.abs(gap-(compact?9:11))<0.02,JSON.stringify(metrics));
    assert(Math.abs(parseFloat(border_top)*device_scale-Math.max(1,Math.floor(device_scale)))<0.02,'one CSS pixel border snaps to the physical device grid');
    assert.deepEqual(fixed_metrics,{height:1,min_height:'0px',padding:'0px',border_bottom:'0px',box_sizing:'border-box',margin_top:compact?'4px':'5px',margin_bottom:compact?'4px':'5px',document_height:'2px',document_margin:'24px'});
    checks.push((dark?'Night':'light')+' '+(compact?'compact':'standard')+' menu separator preserves its one-pixel rule and group gap under global important hr margins');
    await evaluate('separator_close();void 0;');
  }
  await evaluate('theme_pollution.remove();document_rule.remove();void 0;');
  console.log(JSON.stringify({status: 'PASS', checks, evidence}));
  test_window.destroy(); app.exit(0);
}).catch(error => { console.error(error); console.error(evidence); test_window?.destroy(); app.exit(1); });
