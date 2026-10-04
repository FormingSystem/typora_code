import type {Node} from 'web-tree-sitter';
import type {language_range} from './language_locations';

export type cmake_definition={name:string;kind:'variable'|'function';range:language_range;value?:string;absolute?:boolean};
export type cmake_reference={name:string;kind:'variable'|'function'|'file';start:number;end:number;directory?:boolean};
export type cmake_document={definitions:cmake_definition[];references:cmake_reference[]};

/** Static syntax facts only: never evaluate CMake or treat a reference as a declaration. */
export function extract_cmake_document(root:Node,text:string):cmake_document{
 const definitions:cmake_definition[]=[],references:cmake_reference[]=[];
 const position=(offset:number)=>{const before=text.slice(0,offset);return {line:before.split('\n').length-1,character:offset-before.lastIndexOf('\n')-1};};
 const unquote=(value:string)=>value.startsWith('"')&&value.endsWith('"')?value.slice(1,-1):value;
 const declare=(node:Node|undefined,kind:'variable'|'function',value?:string,absolute=false)=>{if(!node)return;const name=unquote(node.text);if(!/^[\w.-]+$/.test(name))return;definitions.push({name,kind,range:{start:position(node.startIndex+(node.text.startsWith('"')?1:0)),end:position(node.endIndex-(node.text.endsWith('"')?1:0))},value,absolute});};
 const visit=(node:Node)=>{
  if(node.isError||node.isMissing||node.type.includes('comment'))return;
  if(node.type==='variable')references.push({name:node.text,kind:'variable',start:node.startIndex,end:node.endIndex});
  if(node.type==='function_command'||node.type==='macro_command'){
   const args=node.namedChildren.find(child=>child.type==='argument_list')?.namedChildren||[];declare(args[0],'function');
  }
  if(node.type==='normal_command'){
   const command_node=node.namedChildren.find(child=>child.type==='identifier'),command=command_node?.text.toLowerCase(),args=node.namedChildren.find(child=>child.type==='argument_list')?.namedChildren||[];
   if(command_node)references.push({name:command_node.text,kind:'function',start:command_node.startIndex,end:command_node.endIndex});
   if(command==='set')declare(args[0],'variable',args.length===2?unquote(args[1].text):undefined);
   if(command&&['option','find_program','find_file','find_path','find_library','get_property','get_directory_property','get_target_property','math'].includes(command)){
    const output=command==='math'?args[1]:args[0];declare(output,'variable');
   }
   if(command==='get_filename_component'){const direct=args.length===3&&args[2]?.text.toUpperCase()==='ABSOLUTE';declare(args[0],'variable',direct?unquote(args[1]?.text||''):undefined,direct);}
   if(command==='execute_process')for(let index=0;index<args.length-1;index++)if(['OUTPUT_VARIABLE','ERROR_VARIABLE','RESULT_VARIABLE','RESULTS_VARIABLE'].includes(args[index].text))declare(args[index+1],'variable');
   if((command==='include'||command==='add_subdirectory')&&args[0])references.push({name:unquote(args[0].text),kind:'file',start:args[0].startIndex,end:args[0].endIndex,directory:command==='add_subdirectory'});
  }
  for(const child of node.namedChildren)visit(child);
 };
 visit(root);return {definitions,references};
}
