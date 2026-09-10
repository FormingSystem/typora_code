import {Parser,Language} from "web-tree-sitter";
import {extract_source_symbols} from "./source_symbols";
let initialized:Promise<void>|undefined;
const languages=new Map<string,Language>();
let queue=Promise.resolve();
self.onmessage=event=>{
  const request=event.data;
  queue=queue.then(async()=>{
    let parser:Parser|undefined,tree:ReturnType<Parser["parse"]>=null;
    try{
      initialized??=Parser.init({wasmBinary:request.runtime,locateFile:()=>"tree-sitter.wasm"});await initialized;
      let language=languages.get(request.language);if(!language){language=await Language.load(request.grammar);languages.set(request.language,language);}
      parser=new Parser();parser.setLanguage(language);const started=performance.now();
      tree=parser.parse(request.text,null,{progressCallback:()=>performance.now()-started>750});if(!tree)throw new Error("文件语法解析超时。");
      self.postMessage({id:request.id,symbols:extract_source_symbols(tree.rootNode,request.language),incomplete:tree.rootNode.hasError});
    }catch(error){self.postMessage({id:request.id,error:String(error)});}
    finally{tree?.delete();parser?.delete();}
  });
};
