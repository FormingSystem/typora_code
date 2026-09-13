// 只能由独立窗口站启动器运行；核验继承关系后才允许写测试剪贴板。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build} from 'esbuild';
const [evidence,station]=process.argv.slice(2),checks=[];
if(process.platform!=='win32'||!evidence||!station||station.toLowerCase()==='winsta0'||!/^[a-z0-9_$-]+$/iu.test(station))throw Error('Run run_file_clipboard_windows.ps1; never run on the user clipboard.');
const execute=promisify(execFile),program=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
const guard=String.raw`
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;using System.Text;using System.Runtime.InteropServices;
public class station_probe {
 [DllImport("user32.dll")] public static extern IntPtr GetProcessWindowStation();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder value,uint length,out uint needed);
 public static string name(){var value=new StringBuilder(1024);uint needed;if(!GetUserObjectInformation(GetProcessWindowStation(),2,value,2048,out needed))throw new Exception("Window station name unavailable");return value.ToString();}
}
'@
if([station_probe]::name() -ne '${station}'){throw 'STOP: child process did not inherit isolated clipboard station.'}
`;
const shell=async source=>JSON.parse((await execute(program,['-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(guard+source,'utf16le').toString('base64')],{windowsHide:true,shell:false,timeout:10000,encoding:'utf8'})).stdout);
let adapter;
try{
 assert.equal(await shell('[station_probe]::name()|ConvertTo-Json -Compress'),station);checks.push('helper inherits the private window station before clipboard access');
 const bundle=await build({stdin:{contents:'export {create_windows_file_clipboard} from "./src/file_clipboard_windows";export {create_workspace_file_clipboard} from "./src/workspace_file_clipboard";export * from "./src/workspace_file_operations";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 adapter=api.create_windows_file_clipboard(createRequire(import.meta.url));
 const root=path.join(evidence,'workspace'),outside=path.join(evidence,'outside'),target=path.join(root,'target');fs.mkdirSync(root);fs.mkdirSync(outside);fs.mkdirSync(target);
 const unicode=path.join(root,'中文 空格.bin'),folder=path.join(root,'folder');fs.writeFileSync(unicode,Buffer.from([0,128,255]));fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'child.txt'),'child');
 const written=await adapter.write([unicode,folder]),reread=await adapter.read();assert.deepEqual(reread.paths,[unicode,folder]);assert.equal(reread.version,written.version);assert.equal(reread.move_requested,false);
 const independent=await shell('Add-Type -AssemblyName System.Windows.Forms; @{files=@([Windows.Forms.Clipboard]::GetFileDropList());contains=[Windows.Forms.Clipboard]::ContainsFileDropList()}|ConvertTo-Json -Compress');assert.equal(independent.contains,true);assert.deepEqual(independent.files,[unicode,folder]);checks.push('CF_HDROP Unicode multi-file and folder list is readable by independent Shell consumer; copy effect and version stable');
 assert.equal(await adapter.clear('invalid'),false);assert.deepEqual((await adapter.read()).paths,[unicode,folder]);checks.push('conditional clear retains a newer clipboard');
 const external=path.join(outside,'external 中文.bin');fs.writeFileSync(external,Buffer.from([255,0,127]));
 // 输入由JSON编码为UTF-16数据读取，文件路径不插入可执行脚本。
 const payload=Buffer.from(JSON.stringify([external]),'utf16le').toString('base64');
 await shell(`Add-Type -AssemblyName System.Windows.Forms
 $paths=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${payload}'))|ConvertFrom-Json
 $data=New-Object Windows.Forms.DataObject
 $list=New-Object Collections.Specialized.StringCollection
 $list.AddRange([string[]]$paths)
 $data.SetFileDropList($list)
 $effect=New-Object IO.MemoryStream(,[BitConverter]::GetBytes(2))
 $data.SetData('Preferred DropEffect',$effect)
 [Windows.Forms.Clipboard]::SetDataObject($data,$true,5,50)
 $true|ConvertTo-Json -Compress`);
 const incoming=await adapter.read();assert.deepEqual(incoming.paths,[external]);assert.equal(incoming.move_requested,true);checks.push('independent native writer and external cut effect are decoded');
 const service=api.create_workspace_file_clipboard(adapter,{validate:(base,paths)=>api.validate_workspace_entries({fs,path_api:path},base,paths),transfer:(base,paths,destination,move,external)=>api.transfer_workspace_entries({fs,path_api:path},base,paths,destination,move?async(_base,source,target)=>{await fs.promises.rename(source,target);return target}:undefined,external)});
 assert.match((await service.paste(root,target)).message,/源文件保留/);assert.deepEqual(fs.readFileSync(path.join(target,path.basename(external))),Buffer.from([255,0,127]));assert(fs.existsSync(external));checks.push('native clipboard external binary paste preserves source');
 await service.copy(root,[unicode],true);assert(service.is_cut(unicode));await service.paste(root,target);assert(!fs.existsSync(unicode));assert.deepEqual(fs.readFileSync(path.join(target,path.basename(unicode))),Buffer.from([0,128,255]));assert.deepEqual((await adapter.read()).paths,[]);checks.push('version-bound internal cut moves and clears matching native clipboard');
 await service.copy(root,[folder],true);await adapter.write([external]);await service.refresh();assert(!service.is_cut(folder));checks.push('external replacement invalidates native cut marker');
 service.dispose();fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({status:'PASS',station,checks,evidence},null,2));
}catch(error){adapter?.dispose();fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({status:'FAIL',checks,error:String(error.stack||error),evidence},null,2));process.exitCode=1;}
