import {prepareQuery, scoreItemFuzzy, compareItemsByFuzzyScore, type IItemScore, type FuzzyScorerCache} from "../vendor/vscode_quick_open/fuzzyScorer";

export type quick_file = {file_path:string;relative_path:string;name:string;directory:string};
export type quick_match = {file:quick_file;score:IItemScore};
const file_accessor = {
  getItemLabel:(file:quick_file)=>file.name,
  getItemDescription:(file:quick_file)=>file.directory,
  getItemPath:(file:quick_file)=>file.file_path,
};

/** 查询、排序和高亮共用上游算法；缓存仅存活于一次筛选，避免逐次输入无限增长。 */
export function create_quick_matcher(value:string) {
  const query=prepareQuery(value.trim());
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
