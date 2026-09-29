import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

const compiled=await build({stdin:{contents:'export * from "./src/workspace_locale";export * from "./src/workspace_i18n";export * from "./src/git_graph_i18n";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const api=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const namespace=Symbol.for('typora-code:workspace');
const environment=Symbol.for('typora-code:workspace:env');
const saved={core:globalThis[namespace],environment:globalThis[environment],options:globalThis._options};
let checks=0;
function equal(actual,expected){assert.deepEqual(actual,expected);checks++;}
try {
  for(const [input,expected] of [['zh','zh-cn'],['zh-CN','zh-cn'],['zh_TW','zh-cn'],['en-US','en'],['fr-FR','en']])equal(api.resolve_workspace_locale(input),expected);
  globalThis._options={appLocale:'zh-CN'};
  equal(api.resolve_workspace_locale(),'zh-cn');
  globalThis[namespace]={app:{i18n:{locale:'en'}}};
  globalThis[environment]={userLang:'zh-cn'};
  equal(api.resolve_workspace_locale(),'en');
  equal(api.resolve_git_graph_locale(),'en');
  equal(api.workspace_text('language_section'),'Display Language');
  equal(api.git_graph_text('scm.settings'),api.git_graph_dictionary('en')['scm.settings']);
  equal(api.workspace_language_tag(),'en-US');
  equal(api.workspace_text('search_found_results_in_files',{value_0:2,value_1:17}),'Found 17 results in 2 files');
  equal(api.workspace_text('search_replace_files_with_matches',{value_0:2,value_1:17}),'Replace 17 matches in 2 files.');
  let persisted;
  const settings={get:()=>persisted,set_and_save:(_key,value)=>{persisted=value;}};
  equal(api.read_workspace_language_preference(settings),'auto');
  api.save_workspace_language_preference(settings,'zh-cn');
  equal(persisted,'zh-cn');
  equal(api.read_workspace_language_preference(settings),'zh-cn');
  equal(api.resolve_workspace_locale(),'en');
  globalThis[namespace].app.i18n.locale='zh-cn';
  equal(api.resolve_workspace_locale(),'zh-cn');
  equal(api.workspace_text('language_section'),'显示语言');
  assert.throws(()=>api.save_workspace_language_preference(settings,'de'));checks++;
  equal(persisted,'zh-cn');
  assert.throws(()=>api.save_workspace_language_preference({set_and_save(){throw Error('disk unavailable');}},'en'));checks++;
  equal(persisted,'zh-cn');
  api.save_workspace_language_preference(settings,'auto');equal(persisted,undefined);
  for(const invalid of [null,{},42,'damaged'])equal(api.read_workspace_language_preference({get:()=>invalid}),'auto');
  const messages=JSON.parse(fs.readFileSync('src/workspace_messages.json','utf8'));
  const placeholders=value=>[...value.matchAll(/\{([a-z][a-z0-9_]*)\}/giu)].map(match=>match[1]).sort();
  for(const [key,message] of Object.entries(messages)){
    assert.match(key,/^[a-z][a-z0-9_]*$/u);
    assert.ok(message.en.trim()&&message.zh_cn.trim(),key);
    assert.ok(!/\p{Script=Han}/u.test(message.en),key);
    equal(placeholders(message.en),placeholders(message.zh_cn));
  }
  for(let index=0;index<1000;index++){
    const locale=index%2?'en':'zh-cn';
    equal(api.workspace_text('language_section',{},locale),api.workspace_dictionary(locale).language_section);
  }
  const require=createRequire(import.meta.url),service=require('../src/workspace_service_i18n.cjs');
  const service_messages=JSON.parse(fs.readFileSync('src/workspace_service_messages.json','utf8'));
  for(const [key,message] of Object.entries(service_messages)){
    equal(placeholders(message.en),placeholders(message.zh_cn));
    assert.ok(!/\p{Script=Han}/u.test(message.en),key);
    for(const locale of ['en','zh-cn']){
      service.set_workspace_service_locale(locale);
      equal(service.workspace_service_text(key),locale==='en'?message.en:message.zh_cn);
    }
  }
  assert.throws(()=>service.set_workspace_service_locale('unsupported'));checks++;
  const releases=JSON.parse(fs.readFileSync('release.json','utf8'));
  for(const release of releases.releases){equal(release.notes_en.length,release.notes.length);assert.ok(release.notes_en.every(note=>!/[\u3400-\u9fff]/u.test(note)&&note.trim()),release.version);}
  console.log(JSON.stringify({status:'PASS',checks,messages:Object.keys(messages).length,scope:'Shared locale, persistence, window language isolation, dictionary placeholders and repeated reads'}));
} finally {
  for(const [key,value] of [[namespace,saved.core],[environment,saved.environment],['_options',saved.options]])if(value===undefined)delete globalThis[key];else globalThis[key]=value;
}
