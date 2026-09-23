const { app, BrowserWindow } = require('electron');
const { build } = require('esbuild');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'typora_workspace_shortcuts_'));
app.setPath('userData', path.join(evidence, 'profile'));
app.disableHardwareAcceleration();
let test_window;
const checks = [];
const evaluate = source => test_window.webContents.executeJavaScript(source);
const check = (condition, label) => { assert(condition, label); checks.push(label); };

app.whenReady().then(async () => {
  test_window = new BrowserWindow({
    show: false,
    width: 760,
    height: 480,
    webPreferences: { contextIsolation: false, nodeIntegration: true, offscreen: true, backgroundThrottling: false },
  });
  const fixture = path.join(evidence, 'fixture.html');
  fs.writeFileSync(fixture, '<!doctype html><meta charset="utf-8"><input id="editor"><section class="linux-note-terminal"><input id="terminal"></section><section id="dialog" role="dialog" aria-modal="true" hidden></section>');
  await test_window.loadFile(fixture);
  const bundle = await build({
    plugins:require("./editor_bundle.cjs").editor_plugins(),
    stdin: { contents: 'export * from "./src/workspace_shortcuts";export * from "./src/workspace_quick_open";', resolveDir: path.join(__dirname, '..') },
    bundle: true,
    loader: {'.css':'text'},
    format: 'iife',
    globalName: 'shortcut_qa',
    write: false,
  });
  await evaluate(bundle.outputFiles[0].text);
  await evaluate(`(()=>{
    window.calls=[];
    window.host={
      commands:{run(id,args){calls.push(['command',id,args]);}},
      workspace:{sidebar:{toggle(){calls.push(['sidebar']);}},activeFile:'fallback.md',activeLeaf:{state:{path:'folder/source.md'}}}
    };
    window.file_host={save_all(){calls.push(['workspace_save_all']);}};
    window.runtime={ClientCommand:{openFolder(){calls.push(['open_folder']);},saveAll(){calls.push(['save_all']);}}};
    window.binding=shortcut_qa.install_workspace_shortcuts(host,runtime);
    window.same_binding=shortcut_qa.install_workspace_shortcuts(host,runtime)===binding;
    window.send=(code,options={},selector='#editor')=>{
      const event=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,code,key:options.key||code.replace(/^Key/,''),...options});
      document.querySelector(selector).dispatchEvent(event);
      return event.defaultPrevented;
    };
    window.chord=(second_code,second_options={})=>{send('KeyK',{key:'k',ctrlKey:true});return send(second_code,second_options);};
  })()`);

  check(await evaluate('same_binding'), 'shortcut installation is idempotent');
  check(await evaluate(`calls=[];send('KeyB',{key:'b',ctrlKey:true})&&calls[0][0]==='sidebar'`), 'Ctrl+B toggles the workspace sidebar');
  check(await evaluate(`calls=[];send('Backslash',{key:'\\\\',ctrlKey:true});calls[0][1]==='linux_note:editor_split_right'`), 'Ctrl+Backslash splits the active editor right');
  check(await evaluate(`calls=[];send('KeyC',{key:'c',altKey:true,shiftKey:true});calls[0][1]==='linux_note:copy_absolute_path'`), 'Shift+Alt+C copies the absolute path');
  check(await evaluate(`calls=[];chord('KeyP',{key:'p'});calls[0][1]==='linux_note:copy_absolute_path'`), 'Ctrl+K P copies the absolute path');
  check(await evaluate(`calls=[];chord('KeyO',{key:'o',ctrlKey:true});calls[0][1]==='linux_note:open_folder'`), 'Ctrl+K Ctrl+O opens the existing workspace folder dialog');
  for(const [code,options,command] of [['KeyW',{key:'w',ctrlKey:true},'close_all'],['KeyU',{key:'u'},'close_saved'],['KeyO',{key:'o'},'copy_window'],['Enter',{key:'Enter'},'keep_open'],['Enter',{key:'Enter',shiftKey:true},'pin']])check(await evaluate(`calls=[];chord('${code}',${JSON.stringify(options)});calls.length===1&&calls[0][1]==='linux_note:editor_${command}'`),`editor chord ${command} routes once to shared actions`);
  check(await evaluate(`calls=[];chord('KeyS',{key:'s'});calls[0][1]==='linux_note:save_all'`),'Ctrl+K S uses shared Save All');
  check(await evaluate(`calls=[];chord('KeyF',{key:'f'});calls[0][1]==='linux_note:close_folder'`),'Ctrl+K F closes the folder through the shared command');
  check(await evaluate(`calls=[];send('KeyS',{key:'S',ctrlKey:true,shiftKey:true});calls[0][1]==='linux_note:save_as'`),'Ctrl+Shift+S uses shared Save As');
  check(await evaluate(`calls=[];send('F4',{key:'F4',ctrlKey:true});calls[0][1]==='linux_note:close_editor'`),'Ctrl+F4 uses shared guarded editor close');
  check(await evaluate(`calls=[];chord('KeyC',{key:'c',ctrlKey:true,shiftKey:true});calls[0][1]==='linux_note:copy_relative_path'`), 'Ctrl+K Ctrl+Shift+C copies the relative path');
  check(await evaluate(`calls=[];chord('Backslash',{key:'\\\\',ctrlKey:true});calls[0][1]==='linux_note:editor_split_down'`), 'Ctrl+K Ctrl+Backslash splits the active editor down');
  check(await evaluate(`calls=[];const prevented=chord('KeyQ',{key:'q'});!prevented&&calls.length===0`), 'an unknown chord is released to the active editor');
  const terminal_result = await evaluate(`(()=>{try{calls=[];const prevented=send('KeyB',{key:'b',ctrlKey:true},'#terminal');return {passed:!prevented&&calls.length===0};}catch(error){return {passed:false,error:String(error.stack||error)};}})()`);
  check(terminal_result.passed, `terminal focus keeps its own keyboard input${terminal_result.error ? `: ${terminal_result.error}` : ''}`);
  check(await evaluate(`(()=>{calls=[];const first=send('KeyK',{key:'k',ctrlKey:true},'#terminal');const second=send('KeyS',{key:'s'},'#terminal');return !first&&!second&&calls.length===0;})()`), 'terminal focus does not start or finish a workspace chord');
  check(await evaluate(`(()=>{const dialog=document.querySelector('#dialog');dialog.hidden=false;calls=[];const prevented=send('KeyB',{key:'b',ctrlKey:true});dialog.hidden=true;return !prevented&&calls.length===0;})()`), 'an open dialog keeps its own keyboard input');
  check(await evaluate(`(()=>{calls=[];const prevented=send('KeyC',{key:'c',altKey:true,shiftKey:true});return prevented&&calls[0][1]==='linux_note:copy_absolute_path';})()`), 'a hidden dialog does not disable workspace shortcuts');
  check(await evaluate(`binding.dispose();calls=[];send('KeyC',{key:'c',altKey:true,shiftKey:true});const quiet=calls.length===0;binding=shortcut_qa.install_workspace_shortcuts(host,runtime);send('KeyC',{key:'c',altKey:true,shiftKey:true});quiet&&calls.length===1`), 'dispose removes the listener and permits a clean reinstall');

  check(await evaluate(`calls=[];send('KeyP',{key:'P',ctrlKey:true,shiftKey:true})&&calls[0][1]==='command:open'`), 'Ctrl+Shift+P opens the registered command panel');
  check(await evaluate(`calls=[];send('KeyX',{key:'X',ctrlKey:true,shiftKey:true})&&calls.length===1&&calls[0][1]==='typora_code:community_plugins'`), 'Ctrl+Shift+X opens extensions through the shared command');
  check(await evaluate(`calls=[];!send('KeyX',{key:'X',ctrlKey:true,shiftKey:true,isComposing:true})&&calls.length===0`), 'extensions shortcut respects IME composition');
  check(await evaluate(`calls=[];!send('KeyX',{key:'X',ctrlKey:true,shiftKey:true},'#terminal')&&calls.length===0`), 'extensions shortcut respects terminal input');
  check(await evaluate(`calls=[];send('KeyF',{key:'F',ctrlKey:true,shiftKey:true})&&calls[0][1]==='linux_note:search'`), 'Ctrl+Shift+F opens workspace search');
  await evaluate(`(()=>{const parent=document.createElement('div');parent.innerHTML='<div class="typ-workspace-tab-header"><div class="typ-tab" data-id="folder/source.md"><i class="typ-close"></i></div><div class="typ-tab" data-id="other.md"></div></div>';document.body.append(parent);host.workspace.activeLeaf.parent={containerEl:parent};parent.querySelector('.typ-close').onclick=()=>calls.push(['close_existing_tab']);parent.querySelector('[data-id="other.md"]').onclick=()=>calls.push(['activate_existing_tab']);})()`);
  check(await evaluate(`calls=[];send('KeyW',{key:'w',ctrlKey:true})&&calls[0][1]==='linux_note:close_editor'`), 'Ctrl+W uses the same guarded close command as Ctrl+F4 and the File menu');
  for(const code of ['PageUp','PageDown']) check(await evaluate(`calls=[];send('${code}',{key:'${code}',ctrlKey:true})&&calls[0][0]==='activate_existing_tab'`), `Ctrl+${code} navigates existing group tabs`);
  await evaluate(`(()=>{const group=document.createElement('div');group.innerHTML='<div class="typ-workspace-tab-header"><div class="typ-tab" data-id="folder/source.md"></div><div class="typ-tab" data-id="third.md"></div><div class="typ-tab" data-id="typ://core.empty/fixture" style="display:none"></div></div>';document.body.append(group);group.querySelector('[data-id="third.md"]').onclick=()=>calls.push(['activate_other_group']);group.querySelector('[data-id^="typ://core.empty/"]').onclick=()=>calls.push(['activate_hidden_empty']);window.original_group=host.workspace.activeLeaf.parent;window.other_group={containerEl:group};})()`);
  check(await evaluate(`calls=[];send('PageUp',{key:'PageUp',ctrlKey:true})&&calls.length===1&&calls[0][0]==='activate_existing_tab'`), 'Ctrl+PageUp wraps within the active group without activating another group');
  await evaluate(`host.workspace.activeLeaf.parent=other_group;void 0`);
  for(const code of ['PageUp','PageDown']) check(await evaluate(`calls=[];send('${code}',{key:'${code}',ctrlKey:true})&&calls.length===1&&calls[0][0]==='activate_other_group'`), `Ctrl+${code} resolves duplicate file paths in the active group and skips its hidden empty placeholder`);
  await evaluate(`host.workspace.activeLeaf.parent=original_group;void 0`);
  check(await evaluate(`(()=>{let leaked=false;const listener=()=>leaked=true;window.addEventListener('keyup',listener);send('KeyB',{key:'b',ctrlKey:true});document.querySelector('#editor').dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,cancelable:true,key:'b',code:'KeyB',ctrlKey:true}));window.removeEventListener('keyup',listener);return !leaked;})()`), 'handled key releases do not invoke the core keyup bindings a second time');
  const tree=path.join(evidence,'workspace');fs.mkdirSync(path.join(tree,'nested'),{recursive:true});fs.mkdirSync(path.join(tree,'.git'));fs.writeFileSync(path.join(tree,'alpha.md'),'# Alpha');fs.writeFileSync(path.join(tree,'nested','beta.txt'),'Beta');fs.writeFileSync(path.join(tree,'.git','secret'),'Excluded');
  await evaluate(`(()=>{window.current_root=${JSON.stringify(tree)};window.opened_files=[];window.quick=shortcut_qa.create_workspace_quick_open({fs:require('fs'),path_api:require('path'),context_root:()=>current_root,open_file:async file=>opened_files.push(file)});})()`);
  const wait=async expression=>{const start=Date.now();while(!await evaluate(expression)){if(Date.now()-start>5000)throw Error('Timed out '+expression);await new Promise(r=>setTimeout(r,20));}};
  check(await evaluate(`send('KeyP',{key:'p',ctrlKey:true})&&!quick.root.hidden&&document.activeElement===quick.input`), 'Ctrl+P opens and focuses the restored file picker');
  await wait(`document.querySelectorAll('.workspace-quick-open-result').length===2`);
  check(await evaluate(`(()=>{const before=quick.input.value;const selected=quick.root.querySelector('.is-selected');const ignored=['Enter','ArrowDown','ArrowUp','Escape'].every(key=>!send(key,{key,isComposing:true},'.workspace-quick-open input'));return ignored&&!quick.root.hidden&&opened_files.length===0&&quick.input.value===before&&quick.root.querySelector('.is-selected')===selected;})()`), 'Chinese IME composition keeps Enter, arrows and Escape without opening a result or closing the picker');
  check(await evaluate(`!send('Enter',{key:'Enter',keyCode:229},'.workspace-quick-open input')&&!quick.root.hidden&&opened_files.length===0`), 'IME confirmation reported as keyCode 229 does not open a file');
  check(await evaluate(`!quick.root.textContent.includes('secret')`), 'picker reads real nested directory entries and excludes Git internals');
  await test_window.webContents.insertText('beta');await wait(`document.querySelectorAll('.workspace-quick-open-result').length===1`);
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
  await wait('opened_files.length===1');
  check(await evaluate(`quick.root.hidden&&opened_files[0]===${JSON.stringify(path.join(tree,'nested','beta.txt'))}`), 'typing and Enter route the selected real file to open_file');
  await evaluate(`quick.open()`);await wait(`document.querySelectorAll('.workspace-quick-open-result').length===2`);
  check(await evaluate(`send('KeyP',{key:'p',ctrlKey:true},'.workspace-quick-open input')&&!quick.root.hidden`), 'repeated Ctrl+P remains in the same picker');
  test_window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});test_window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait('quick.root.hidden');
  await evaluate(`(()=>{quick.dispose();let release;window.pending_scan=new Promise(resolve=>release=resolve);window.release_scan=release;quick=shortcut_qa.create_workspace_quick_open({fs:{promises:{readdir:()=>pending_scan}},path_api:require('path'),context_root:()=>current_root,open_file:async()=>{}});quick.open();quick.close();release_scan([{name:'stale.md',isFile:()=>true,isDirectory:()=>false}]);})()`);
  await new Promise(r=>setTimeout(r,30));
  check(await evaluate(`quick.root.hidden&&quick.root.querySelectorAll('.workspace-quick-open-result').length===0`), 'closed picker ignores a late directory scan');
  await evaluate(`quick.dispose();binding.dispose()`);
  check(await evaluate(`!document.querySelector('.workspace-quick-open')&&!document.getElementById('typora-code-quick-open-style')`), 'picker disposal removes DOM, styles and active interface');
  console.log(JSON.stringify({ status: 'PASS', checks, evidence }));
  test_window.destroy();
  app.exit(0);
}).catch(error => {
  console.error(JSON.stringify({ status: 'FAIL', checks, error: String(error.stack || error), evidence }));
  if (test_window && !test_window.isDestroyed()) test_window.destroy();
  app.exit(1);
});
