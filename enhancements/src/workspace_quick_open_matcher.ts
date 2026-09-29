import {prepareQuery, scoreItemFuzzy, compareItemsByFuzzyScore, type IItemScore, type FuzzyScorerCache} from "../vendor/vscode_quick_open/fuzzyScorer";

export type quick_file = {file_path:string;relative_path:string;name:string;directory:string};
export type quick_match = {file:quick_file;score:IItemScore};
const file_accessor = {
  getItemLabel:(file:quick_file)=>file.name,
  getItemDescription:(file:quick_file)=>file.directory,
  getItemPath:(file:quick_file)=>file.file_path,
};

/** Align workspace-qualified queries with relative item descriptions before scoring. */
function relative_query(value:string,root:string):string {
  const input=value.trim().replaceAll('\\','/');
  const base=root.replaceAll('\\','/').replace(/\/+$/u,'');
  if(root==='/'&&input.startsWith('/'))return input.slice(1);
  const windows_root=/^(?:[a-z]:|\/\/)/iu.test(base);
  const comparable=windows_root?input.toLowerCase():input;
  const prefix=windows_root?base.toLowerCase():base;
  if(base&&(comparable===prefix||comparable.startsWith(prefix+'/')))return input.slice(base.length).replace(/^\//u,'');
  return input.startsWith('./')?input.slice(2):value.trim();
}

/** Share upstream scoring, ordering and highlights; keep the cache query-local. */
export function create_quick_matcher(value:string,root='') {
  const query=prepareQuery(relative_query(value,root));
  const cache:FuzzyScorerCache=Object.create(null);
  return {
    match(file:quick_file):quick_match|undefined {
      const score=query.normalized?scoreItemFuzzy(file,query,true,file_accessor,cache):{score:0};
      return !query.normalized||score.score>0?{file,score}:undefined;
    },
    compare(left:quick_match,right:quick_match):number {
      return compareItemsByFuzzyScore(left.file,right.file,query,true,file_accessor,cache);
    },
  };
}

/** 上游偏移为UTF-16索引。文本节点保留文件名原文，避免HTML与样式注入。 */
export function append_quick_highlights(node:HTMLElement,value:string,ranges:{start:number;end:number}[]=[]){
  let offset=0;
  for(const range of ranges){
    const start=Math.max(offset,Math.min(value.length,range.start)),end=Math.max(start,Math.min(value.length,range.end));
    node.append(document.createTextNode(value.slice(offset,start)));
    if(end>start){const mark=document.createElement("span");mark.className="workspace-quick-open-highlight";mark.textContent=value.slice(start,end);node.append(mark);}
    offset=end;
  }
  node.append(document.createTextNode(value.slice(offset)));
}
