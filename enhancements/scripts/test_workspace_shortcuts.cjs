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
    webPreferences: { contextIsolation: false, offscreen: true, backgroundThrottling: false },
  });
  const fixture = path.join(evidence, 'fixture.html');
  fs.writeFileSync(fixture, '<!doctype html><meta charset="utf-8"><input id="editor"><section class="linux-note-terminal"><input id="terminal"></section><section id="dialog" role="dialog" aria-modal="true" hidden></section>');
  await test_window.loadFile(fixture);
  const bundle = await build({
    stdin: { contents: 'export * from "./src/workspace_shortcuts";', resolveDir: path.join(__dirname, '..') },
    bundle: true,
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
    window.binding=shortcut_qa.install_workspace_shortcuts(host,runtime,()=>file_host);
    window.same_binding=shortcut_qa.install_workspace_shortcuts(host,runtime)===binding;
    window.send=(code,options={},selector='#editor')=>{
      const event=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,code,key:options.key||code.replace(/^Key/,''),...options});
      document.querySelector(selector).dispatchEvent(event);
      return event.defaultPrevented;
    };
    window.chord=(second_code,second_options={})=>{send('KeyK',{key:'k',ctrlKey:true});return send(second_code,second_options);};
  })()`);

  check(await evaluate('same_binding'), 'shortcut installation is idempotent');
  check(await evaluate(`calls=[];send('KeyB',{key:'b',ctrlKey:true});JSON.stringify(calls)==='[["sidebar"]]'`), 'Ctrl+B toggles the sidebar once');
  check(await evaluate(`calls=[];send('Backslash',{key:'\\\\',ctrlKey:true});calls[0][1]==='core.workspace:split-right'&&calls[0][2][0]==='folder/source.md'`), 'Ctrl+Backslash splits the active editor right');
  check(await evaluate(`calls=[];send('KeyC',{key:'c',altKey:true,shiftKey:true});calls[0][1]==='linux_note:copy_absolute_path'`), 'Shift+Alt+C copies the absolute path');
  check(await evaluate(`calls=[];chord('KeyP',{key:'p'});calls[0][1]==='linux_note:copy_absolute_path'`), 'Ctrl+K P copies the absolute path');
  check(await evaluate(`calls=[];chord('KeyC',{key:'c',ctrlKey:true,shiftKey:true});calls[0][1]==='linux_note:copy_relative_path'`), 'Ctrl+K Ctrl+Shift+C copies the relative path');
  check(await evaluate(`calls=[];chord('KeyO',{key:'o',ctrlKey:true});JSON.stringify(calls)==='[["open_folder"]]'`), 'Ctrl+K Ctrl+O opens a folder');
  check(await evaluate(`calls=[];chord('KeyS',{key:'s'});JSON.stringify(calls)==='[["workspace_save_all"]]'`), 'Ctrl+K S routes Save All through the workspace file host');
  check(await evaluate(`calls=[];file_host=undefined;chord('KeyS',{key:'s'});file_host={save_all(){calls.push(['workspace_save_all']);}};JSON.stringify(calls)==='[["save_all"]]'`), 'Ctrl+K S falls back to native Save All before the workspace file host is ready');
  check(await evaluate(`calls=[];chord('KeyW',{key:'w'});calls[0][1]==='linux_note:close_all_workspace_tabs'`), 'Ctrl+K W closes all editors');
  check(await evaluate(`calls=[];chord('Backslash',{key:'\\\\',ctrlKey:true});calls[0][1]==='core.workspace:split-down'&&calls[0][2][0]==='folder/source.md'`), 'Ctrl+K Ctrl+Backslash splits the active editor down');
  check(await evaluate(`calls=[];const prevented=chord('KeyQ',{key:'q'});!prevented&&calls.length===0`), 'an unknown chord is released to the active editor');
  const terminal_result = await evaluate(`(()=>{try{calls=[];const prevented=send('KeyB',{key:'b',ctrlKey:true},'#terminal');return {passed:!prevented&&calls.length===0};}catch(error){return {passed:false,error:String(error.stack||error)};}})()`);
  check(terminal_result.passed, `terminal focus keeps its own keyboard input${terminal_result.error ? `: ${terminal_result.error}` : ''}`);
  check(await evaluate(`(()=>{calls=[];const first=send('KeyK',{key:'k',ctrlKey:true},'#terminal');const second=send('KeyS',{key:'s'},'#terminal');return !first&&!second&&calls.length===0;})()`), 'terminal focus does not start or finish a workspace chord');
  check(await evaluate(`(()=>{const dialog=document.querySelector('#dialog');dialog.hidden=false;calls=[];const prevented=send('KeyB',{key:'b',ctrlKey:true});dialog.hidden=true;return !prevented&&calls.length===0;})()`), 'an open dialog keeps its own keyboard input');
  check(await evaluate(`(()=>{calls=[];const prevented=send('KeyB',{key:'b',ctrlKey:true});return prevented&&JSON.stringify(calls)==='[["sidebar"]]';})()`), 'a hidden dialog does not disable workspace shortcuts');
  check(await evaluate(`binding.dispose();calls=[];send('KeyB',{key:'b',ctrlKey:true});const quiet=calls.length===0;binding=shortcut_qa.install_workspace_shortcuts(host,runtime,()=>file_host);send('KeyB',{key:'b',ctrlKey:true});quiet&&calls.length===1`), 'dispose removes the listener and permits a clean reinstall');

  console.log(JSON.stringify({ status: 'PASS', checks, evidence }));
  test_window.destroy();
  app.exit(0);
}).catch(error => {
  console.error(JSON.stringify({ status: 'FAIL', checks, error: String(error.stack || error), evidence }));
  if (test_window && !test_window.isDestroyed()) test_window.destroy();
  app.exit(1);
});
