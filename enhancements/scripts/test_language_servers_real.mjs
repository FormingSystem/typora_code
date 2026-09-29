import './fixture_locale.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
// Provided by test runner installed services and dedicated workspace; do not download components or read user project configuration.
const manifest_path=process.env.TYPORA_LANGUAGE_TEST_MANIFEST;
if(!manifest_path)throw Error('请设置TYPORA_LANGUAGE_TEST_MANIFEST，提供专属测试目录与真实语言服务配置。');
const manifest=JSON.parse(await fs.readFile(manifest_path,'utf8')),node=createRequire(import.meta.url);
const bundle=await build({entryPoints:['src/language_analysis_service.ts'],bundle:true,platform:'node',format:'esm',write:false});
const api=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const results=[],flatten=items=>items.flatMap(item=>[item,...flatten(item.children)]);
const semantic_items=(response,text)=>{
 const tokens=response.semantic_tokens,lines=text.split('\n'),items=[];let line=0,column=0;
 for(let index=0;tokens&&index<tokens.data.length;index+=5){const data=tokens.data;line+=data[index];column=data[index]?data[index+1]:column+data[index+1];items.push({text:lines[line]?.slice(column,column+data[index+2]),type:tokens.token_types[data[index+3]]});}
 return items;
};
for(const item of manifest.languages){
 const root=path.resolve(manifest.work,item.language);await fs.mkdir(root,{recursive:true});
 const file=path.join(root,item.file);await fs.writeFile(file,item.text,'utf8');
 for(const [name,text] of Object.entries(item.project_files||{}))await fs.writeFile(path.join(root,name),text,'utf8');
 const children=[];
 const test_node=name=>name==='child_process'?{...node(name),spawn(...args){const child=node(name).spawn(...args);children.push(child);child.stdout.on('data',data=>{void fs.appendFile(path.join(manifest.evidence,item.language+'.stdout.log'),data);});child.stderr.on('data',data=>{void fs.appendFile(path.join(manifest.evidence,item.language+'.stderr.log'),data);});return child;}}:node(name);
 const service=api.create_language_analysis_service(test_node),start=performance.now();
 try{
  const request={workspace_root:root,file_path:file,language:item.language,text:item.text,server:item.server};
  let response;
  for(let attempt=0;attempt<30;attempt++){response=await service.parse(request,new AbortController().signal);if(flatten(response.symbols).some(symbol=>symbol.name.includes(item.symbol))&&(item.semantic_expectations||[]).every(expected=>semantic_items(response,item.text).some(token=>token.text===expected.text&&token.type===expected.type)))break;await new Promise(resolve=>setTimeout(resolve,1000));}
  assert(flatten(response.symbols).some(symbol=>symbol.name.includes(item.symbol)),`${item.language}: 缺少符号 ${item.symbol}: ${JSON.stringify(response.symbols)}`);
  const semantic=semantic_items(response,item.text);
  for(const expected of item.semantic_expectations||[])assert(semantic.some(token=>token.text===expected.text&&token.type===expected.type),`${item.language}: 未解析语义 ${JSON.stringify(expected)}: ${JSON.stringify(semantic)}`);
  const next=await service.parse({...request,text:item.text.replaceAll(item.symbol,item.changed_symbol)},new AbortController().signal);
  assert(flatten(next.symbols).some(symbol=>symbol.name.includes(item.changed_symbol)),item.language+': 内存修改未进入语言服务');
  assert.equal(await fs.readFile(file,'utf8'),item.text,'分析不得改写磁盘正文');
  const controller=new AbortController();controller.abort();await assert.rejects(service.parse(request,controller.signal),error=>error.name==='AbortError');
  results.push({language:item.language,status:'PASS',symbols:flatten(response.symbols).map(item=>item.name),semantic_tokens:response.semantic_tokens?.data.length||0,semantic_expectations:item.semantic_expectations||[],notice:response.notice,elapsed_ms:Math.round(performance.now()-start)});
 }catch(error){results.push({language:item.language,status:'FAIL',message:String(error.message||error),elapsed_ms:Math.round(performance.now()-start)});}
 finally{await service.dispose();await new Promise(resolve=>setTimeout(resolve,1200));results.at(-1).processes_released=children.every(child=>child.exitCode!==null||child.signalCode!==null);}
 console.log(JSON.stringify(results.at(-1)));
 await fs.writeFile(path.join(manifest.evidence,'real_language_results.json'),JSON.stringify(results,null,2),'utf8');
}
if(results.some(item=>item.status!=='PASS'||!item.processes_released))process.exitCode=1;
