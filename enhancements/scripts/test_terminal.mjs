import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';
import { build } from 'esbuild';
if (process.platform !== 'win32') { console.log('terminal: Windows ConPTY test skipped on this platform'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), "typora_terminal_'中文 & $()_"));
const output = await build({ entryPoints: ['src/terminal_runtime.ts', 'src/terminal_pty_client.ts'], bundle: true, platform: 'node', format: 'esm', outdir: root, outExtension: { '.js': '.mjs' }, write: true });
const { terminal_environment, administrator_launch } = await import('file:///' + path.join(root, 'terminal_runtime.mjs').replaceAll('\\', '/'));
const { start_terminal_pty } = await import('file:///' + path.join(root, 'terminal_pty_client.mjs').replaceAll('\\', '/'));
const environment = terminal_environment({ PATH: 'kept', GIT_DIR: 'wrong', ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--inspect' });
assert.equal(environment.PATH, 'kept'); assert.equal(environment.GIT_DIR, undefined); assert.equal(environment.NODE_OPTIONS, undefined);
const launch = administrator_launch(root, process, path);
const script = Buffer.from(launch.args.at(-1), 'base64').toString('utf16le');
assert(script.includes('-Verb RunAs')); assert(script.includes(root.replaceAll("'", "''")));
const inner = /'-EncodedCommand','([A-Za-z0-9+/=]+)'/u.exec(script)[1];
assert.equal(Buffer.from(inner, 'base64').toString('utf16le'), "Set-Location -LiteralPath '" + root.replaceAll("'", "''") + "'");
// 启动未就绪时撤销，必须关闭 broker，晚到消息不能继续写入 UI。
const cancelled_broker = new EventEmitter(); cancelled_broker.connected = true;
const broker_messages = []; let disconnected = false; let cancelled_data = false;
cancelled_broker.send = message => broker_messages.push(message);
cancelled_broker.disconnect = () => { disconnected = true; cancelled_broker.connected = false; };
const cancellation = new AbortController();
const pending_start = start_terminal_pty({signal:cancellation.signal,child_process:{fork:()=>cancelled_broker},process_api:process,broker:'fixture',executable:process.execPath},{}, {data(){cancelled_data=true;},exit(){},error(){}});
cancellation.abort();
await assert.rejects(pending_start, /取消/u);
cancelled_broker.emit('message',{type:'ready',pid:42});cancelled_broker.emit('message',{type:'data',data:'late'});
assert.equal(cancelled_data,false);assert.equal(broker_messages.filter(message=>message.type==='close').length,1);
await new Promise(resolve=>setTimeout(resolve,1550));assert.equal(disconnected,true);
let terminal; let text = ''; let exited = false;
const wait = async predicate => { for (let i = 0; i < 180; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Terminal test timed out: ' + text.slice(-1000)); };
try {
  terminal = await start_terminal_pty({ child_process, process_api: process, executable: process.execPath, broker: path.resolve('dist/terminal_runtime/1.1.0/terminal_broker.cjs') }, {
    executable: process.env.ComSpec, args: [], options: { cwd: root, cols: 90, rows: 25, env: terminal_environment(process.env), useConpty: true },
  }, { data(value) { text += value; terminal?.acknowledge(value.length); }, exit() { exited = true; }, error(message) { throw new Error(message); } });
  await wait(() => text.includes('Microsoft Windows'));
  terminal.write('echo BROKER_' + 'ROUNDTRIP\r'); await wait(() => (text.match(/BROKER_ROUNDTRIP/gu) || []).length >= 2);
  terminal.resize(50, 15); terminal.write('echo %CD%\r'); await wait(() => text.includes("typora_terminal_'中文 & $()_"));
  terminal.write('exit\r'); await wait(() => exited);
  console.log('terminal: broker round trip, special-character cwd, resize, process exit, environment and UAC quoting passed (no elevation requested)');
} finally { terminal?.kill(); }
