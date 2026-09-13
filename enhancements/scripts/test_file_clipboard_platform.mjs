// 生产模块只连接内存 Electron 替身；不加载 Electron、不访问系统剪贴板。
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import * as crypto from 'node:crypto';
import {fileURLToPath as file_url_to_path,pathToFileURL as path_to_file_url} from 'node:url';
import {build} from 'esbuild';
const built=await build({stdin:{contents:'export {create_platform_file_clipboard} from "./src/file_clipboard_platform";export {create_workspace_file_clipboard} from "./src/workspace_file_clipboard";',resolveDir:file_url_to_path(new URL('../',import.meta.url))},bundle:true,platform:'node',format:'esm',write:false});
const {create_platform_file_clipboard,create_workspace_file_clipboard}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const checks=[];
let contents=new Map(),after_write,clear_calls=0;
const set_contents=values=>{contents=new Map(Object.entries(values).map(([format,raw])=>[format,Buffer.from(raw,'utf8')]));};
const current_contents=()=>[...contents].map(([format,raw])=>[format,raw.toString('utf8')]);
const clipboard={
  availableFormats:()=>[...contents.keys()],
  readBuffer:format=>Buffer.from(contents.get(format)||Buffer.alloc(0)),
  writeBuffer:(format,value)=>{contents=new Map([[format,Buffer.from(value)]]);after_write?.();},
  clear:()=>{clear_calls++;contents.clear();}
};
// 在 Windows 测试主机上也使用 Node 的真实 POSIX 文件 URI 转换规则。
const platform_url={fileURLToPath:value=>file_url_to_path(value,{windows:false}),pathToFileURL:value=>path_to_file_url(value,{windows:false})};
const create_adapter=(platform='linux')=>create_platform_file_clipboard(name=>{
  if(name==='process')return {platform};
  if(name==='electron')return {clipboard};
  if(name==='buffer')return {Buffer};
  if(name==='url')return platform_url;
  if(name==='crypto')return crypto;
  throw Error('Unexpected native dependency: '+name);
});
const adapter=create_adapter();
set_contents({});
assert.deepEqual((await adapter.read()).paths,[]);
set_contents({'text/uri-list':'# copied files\r\nfile:///workspace/%E4%B8%AD%E6%96%87%20name.bin\r\n\r\nfile://localhost/workspace/hash%23name.txt\r\n'});
assert.deepEqual((await adapter.read()).paths,['/workspace/中文 name.bin','/workspace/hash#name.txt']);
assert.equal((await adapter.read()).move_requested,false);
checks.push('URI lists decode Unicode, spaces, localhost, comments and blank lines');
set_contents({'text/uri-list':'file:///ignored\r\n','x-special/gnome-copied-files':'cut\nfile:///workspace/a\nfile:///workspace/folder\n'});
assert.deepEqual((await adapter.read()).paths,['/workspace/a','/workspace/folder']);
assert.equal((await adapter.read()).move_requested,true);
set_contents({'x-special/gnome-copied-files':'copy\nfile:///workspace/a\n'});
assert.equal((await adapter.read()).move_requested,false);
checks.push('GNOME copy and cut lists retain their effect and take format precedence');
for(const raw of ['https://example.com/file\r\n','file://remote.example/share/file\r\n','relative/file\r\n','/absolute/raw/path\r\n','file:///workspace/bad%2Fseparator\r\n','file:///workspace/bad%ZZ\r\n']){
  set_contents({'text/uri-list':raw});
  await assert.rejects(adapter.read());
}
checks.push('remote hosts, non-file schemes, plain paths and malformed file URIs are rejected');
const paths=['/workspace/中文 name.bin','/workspace/hash#name.txt'];
const written=await adapter.write(paths),reread=await adapter.read();
assert.deepEqual(reread.paths,paths);
assert.equal(reread.version,written.version);
assert.equal(reread.move_requested,false);
paths[0]='/mutated/caller';
assert.equal(written.paths[0],'/workspace/中文 name.bin');
const repeated=await adapter.write(written.paths);
assert.notEqual(repeated.version,written.version);
checks.push('write snapshot round-trips and each identical copy receives a distinct version');
const copied=['/workspace/same.txt'];
after_write=()=>set_contents({'text/uri-list':'# another application\r\nfile:///workspace/same.txt\r\n'});
const raced=await adapter.write(copied),replacement=await adapter.read();
assert.deepEqual(replacement.paths,copied);
assert.deepEqual(raced.paths,copied);
assert.notEqual(raced.version,replacement.version);
let transfer;
const service=create_workspace_file_clipboard(adapter,{validate:async()=>{},transfer:async(...args)=>{transfer=args;return ['/workspace/target/same.txt'];}});
await service.copy('/workspace',copied,true);
await service.paste('/workspace','/workspace/target');
assert.deepEqual(transfer.slice(3),[false,true]);
assert(!service.is_cut(copied[0]));
checks.push('same-path external replacement after write is never claimed as a local cut version');
after_write=undefined;
const owned=await adapter.write(['/workspace/keep.txt']);
const owned_contents=current_contents();
assert.equal(await adapter.clear(owned.version),false);
assert.deepEqual(current_contents(),owned_contents);
set_contents({'text/plain':'new user content','text/uri-list':'file:///outside/new.txt\r\n'});
const external_contents=current_contents();
assert.equal(await adapter.clear(owned.version),false);
assert.deepEqual(current_contents(),external_contents);
assert.equal(clear_calls,0);
checks.push('conservative clear preserves both owned and newer external clipboard content');
const unsupported=create_adapter('darwin');
await assert.rejects(unsupported.read(),/尚未提供/);
await assert.rejects(unsupported.write(['/workspace/a']),/尚未提供/);
unsupported.dispose();
service.dispose();
console.log(JSON.stringify({status:'PASS',checks}));
