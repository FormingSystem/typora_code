import {createHash} from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');const output=fs.readFileSync(path.join(root,'dist/workspace_core.js'),'utf8');
for(const forbidden of ['PluginManager','InternalPluginManager','loadFromVault','internalPlugin.enabledPlugins','plugins/loader.json','settings:open','core.settings','PLUGIN_CORE_PATH'])assert(!output.includes(forbidden),'Retired plugin path: '+forbidden);
assert(output.includes('typora-code:workspace'));assert(output.includes('workspace mount failed'));assert(!output.includes('insertAdjacentHTML("beforeend", `<link'));
for(const name of ['workspace_core.js','workspace_core.css','locales/lang.en.json','locales/lang.zh-cn.json','locales/lang.de.json'])assert(fs.statSync(path.join(root,'dist',name)).size>0);
const metadata=JSON.parse(fs.readFileSync(path.join(root,'vendor/workspace_core/build_inputs.json'),'utf8'));
for(const name of metadata.inputs.filter(name=>!name.startsWith('..')))assert(fs.existsSync(path.join(root,'vendor/workspace_core',name)),'Missing input: '+name);
const core_manifest=JSON.parse(fs.readFileSync(path.join(root,'vendor/workspace_core/source_manifest.json'),'utf8'));
const seti_manifest=JSON.parse(fs.readFileSync(path.join(root,'vendor/vscode_seti/source_manifest.json'),'utf8'));
assert.deepEqual(Object.keys(seti_manifest.files).sort(),['ThirdPartyNotices.txt','icon_theme.json','package.json','seti.woff'].sort(),'Seti source manifest must cover all four original files');
const source_assets=[...core_manifest.files.map(item=>({directory:'workspace_core',name:item.path,sha256:item.sha256})),...Object.entries(seti_manifest.files).map(([name,sha256])=>({directory:'vscode_seti',name,sha256}))];
const source_errors=[];
for(const asset of source_assets){
  const directory=path.join(root,'vendor',asset.directory),filename=path.resolve(directory,asset.name);
  assert(filename.startsWith(directory+path.sep),'Source asset escapes vendor directory: '+asset.name);
  assert(/^[a-f0-9]{64}$/.test(asset.sha256),'Invalid source SHA-256: '+asset.name);
  if(!fs.existsSync(filename)){source_errors.push(asset.directory+'/'+asset.name+': missing');continue;}
  const actual=createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  if(actual!==asset.sha256)source_errors.push(asset.directory+'/'+asset.name+': expected '+asset.sha256+', actual '+actual);
}
assert.equal(source_errors.length,0,'Vendor source SHA-256 mismatch:\n'+source_errors.join('\n'));
console.log('PASS: standalone core assets, '+core_manifest.files.length+' core source hashes, four Seti hashes and no plugin startup paths');
