import {acquire_workspace_directories} from './workspace_directory_service';
import type {cmake_document,cmake_definition} from './cmake_syntax';
import type {language_location,language_position} from './language_locations';

/** Supplement empty LSP definitions with grammar-confirmed project candidates. */
export function create_cmake_navigation(fs:any,path:any,parse:(text:string,signal:AbortSignal)=>Promise<{cmake?:cmake_document}>) {
 const directories=acquire_workspace_directories(fs,path);let disposed=false;
 const equal=(left:string,right:string)=>(path.sep==='\\'?path.resolve(left).toLowerCase()===path.resolve(right).toLowerCase():path.resolve(left)===path.resolve(right));
 return {
  async definition(root:string,file:string,text:string,position:language_position,signal:AbortSignal):Promise<language_location[]>{
   const check=()=>{signal.throwIfAborted();if(disposed)throw new DOMException('CMake navigation disposed','AbortError');};check();
   const offset=text.split('\n').slice(0,position.line).reduce((size,line)=>size+line.length+1,0)+position.character;
   const current=(await parse(text,signal)).cmake;check();if(!current)return [];
   const matches=current.references.filter(item=>item.start<=offset&&offset<item.end),reference=matches.find(item=>item.kind==='variable')||matches[0];if(!reference)return [];
   if(reference.kind!=='file'){
    const local=current.definitions.filter(item=>item.kind===reference.kind&&(item.kind==='function'?item.name.toLowerCase()===reference.name.toLowerCase():item.name===reference.name));
    if(local.length)return local.map(definition=>({file_path:file,range:definition.range}));
   }
   const catalogue=await directories.service.catalogue(root);check();
   const files=catalogue.files.filter(item=>/\.cmake$/i.test(item.name)||item.name.toLowerCase()==='cmakelists.txt').map(item=>item.file_path);
   const contents=new Map<string,Promise<string>>(),documents=new Map<string,Promise<cmake_document|undefined>>();
   contents.set(file,Promise.resolve(text));documents.set(file,Promise.resolve(current));
   const read=(target:string)=>{if(equal(target,file))return Promise.resolve(text);let value=contents.get(target);if(!value){value=fs.promises.stat(target).then((stat:any)=>stat.size<=4194304?fs.promises.readFile(target,'utf8'):'').catch((error:any)=>{if(['ENOENT','EACCES','EPERM'].includes(error.code))return '';throw error;});contents.set(target,value);}return value;};
   const document=async(target:string,source:string)=>{if(equal(target,file))return current;let value=documents.get(target);if(!value){value=parse(source,signal).then(result=>result.cmake);documents.set(target,value);}return value;};
   const find=async(name:string,kind:'variable'|'function')=>{
    const results:{file:string;definition:cmake_definition}[]=[],targets=[file,...files.filter(target=>!equal(target,file))];let next=0;
    await Promise.all(Array.from({length:Math.min(8,targets.length)},async()=>{while(next<targets.length){check();const target=targets[next++],source=await read(target);check();if(!(kind==='function'?source.toLowerCase().includes(name.toLowerCase()):source.includes(name)))continue;const parsed=await document(target,source);check();for(const definition of parsed?.definitions||[])if(definition.kind===kind&&(kind==='function'?definition.name.toLowerCase()===name.toLowerCase():definition.name===name))results.push({file:target,definition});}}));
    return results.sort((a,b)=>a.file.localeCompare(b.file)||a.definition.range.start.line-b.definition.range.start.line);
   };
   if(reference.kind!=='file'){
    const definitions=await find(reference.name,reference.kind);check();
    return definitions.map(item=>({file_path:item.file,range:item.definition.range}));
   }
   const expand=async(value:string,origin:string,seen=new Set<string>()):Promise<string|undefined>=>{
    if(seen.size>8)return;let expanded=value;
    for(const match of value.matchAll(/\$\{([\w.-]+)\}/g)){
     const name=match[1];if(seen.has(name))return;let replacement:string|undefined;
     if(name==='CMAKE_CURRENT_LIST_DIR')replacement=path.dirname(origin);
     else if(name==='CMAKE_SOURCE_DIR'||name==='PROJECT_SOURCE_DIR')replacement=root;
     else{
      const values=new Set<string>();
      for(const item of await find(name,'variable'))if(item.definition.value!==undefined){const candidate=await expand(item.definition.value,item.file,new Set([...seen,name]));if(candidate!==undefined)values.add(item.definition.absolute?path.resolve(path.dirname(item.file),candidate):candidate);}
      if(values.size===1)replacement=[...values][0];
     }
     if(replacement===undefined)return;expanded=expanded.replaceAll(match[0],replacement);
    }
    return /\$|[;\r\n]/.test(expanded)?undefined:expanded;
   };
   const expanded=await expand(reference.name,file);check();if(!expanded)return [];
   const target=path.resolve(path.dirname(file),expanded,reference.directory?'CMakeLists.txt':'');
   const candidates=reference.directory||path.extname(target)?[target]:[target,target+'.cmake'];
   for(const candidate of candidates){const exists=await fs.promises.stat(candidate).then((stat:any)=>stat.isFile(),()=>false);check();if(exists)return [{file_path:candidate,range:{start:{line:0,character:0},end:{line:0,character:0}}}];}
   return [];
  },
  dispose(){disposed=true;directories.dispose();}
 };
}
