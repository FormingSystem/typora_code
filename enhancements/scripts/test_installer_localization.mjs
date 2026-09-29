import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'../..');
const messages=JSON.parse(fs.readFileSync(path.join(root,'scripts/lib/typora_messages.json'),'utf8'));
const placeholders=value=>[...value.matchAll(/\{[^}]+\}/g)].map(match=>match[0]).sort();
for(const [key,message] of Object.entries(messages)){
  assert.match(key,/^[a-z][a-z0-9_]*$/);
  assert.ok(!/\p{Script=Han}/u.test(message.en),key);
  assert.deepEqual(placeholders(message.en),placeholders(message.zh_cn),key);
}
if(process.platform!=='win32')throw Error('Windows PowerShell 5.1 is required for this fixture.');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'typora-installer-locale-'));
const script=path.join(temporary,'verify.ps1');
fs.writeFileSync(script,'\ufeff'+String.raw`
param([string]$root)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
if($PSVersionTable.PSVersion.Major -ne 5){throw 'PowerShell 5.1 required'}
. (Join-Path $root 'scripts/lib/typora_locale.ps1')
$dictionary=[IO.File]::ReadAllText((Join-Path $root 'scripts/lib/typora_messages.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
$result=@{}
foreach($language in @('en','zh-cn')){
 $env:TYPORA_CODE_LANGUAGE=$language
 $result[$language]=@{}
 foreach($entry in $dictionary.PSObject.Properties){$result[$language][$entry.Name]=get_typora_text $entry.Name @{value_0='C:\literal $& [1].txt';value_1=37}}
}
$syntax=@()
Get-ChildItem -LiteralPath (Join-Path $root 'scripts') -Filter '*.ps1' -Recurse | ForEach-Object {
 $tokens=$null;$errors=$null
 [void][System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$errors)
 $syntax+=@($errors|ForEach-Object {$_.Message})
}
if($syntax.Count){throw ($syntax -join '; ')}
$result|ConvertTo-Json -Depth 4 -Compress
`,'utf8');
const environment={...process.env};for(const key of Object.keys(environment))if(key.toLowerCase()==='psmodulepath')delete environment[key];
const output=execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,root],{encoding:'utf8',windowsHide:true,env:environment});
const actual=JSON.parse(output);
for(const [key,message] of Object.entries(messages))for(const [locale,field] of [['en','en'],['zh-cn','zh_cn']]){
  const expected=message[field].replaceAll('{value_0}',()=>String.raw`C:\literal $& [1].txt`).replaceAll('{value_1}','37');
  assert.equal(actual[locale][key],expected,key+' '+locale);
}
console.log(JSON.stringify({status:'PASS',messages:Object.keys(messages).length,engine:'Windows PowerShell 5.1',checks:'Language selection, literal interpolation, format placeholders, and installer syntax'}));
