export type language_position={line:number;character:number};
export type language_range={start:language_position;end:language_position};
export type language_location={file_path:string;range:language_range};
export type language_navigation_kind="definition"|"declaration"|"implementation"|"references";
export type language_diagnostic={range:language_range;message:string;severity:number;source?:string};
export function valid_language_range(range:any):range is language_range{
 const valid=(p:any)=>Number.isSafeInteger(p?.line)&&p.line>=0&&Number.isSafeInteger(p?.character)&&p.character>=0;
 return valid(range?.start)&&valid(range?.end)&&(range.end.line>range.start.line||range.end.line===range.start.line&&range.end.character>=range.start.character);
}
/** 只接受真实文件位置；协议结果不作为外部URL或命令执行。 */
export function language_locations(value:any,node:(name:string)=>any):language_location[]{
 const url=node("url"),path=node("path"),windows=node("process").platform==="win32",seen=new Set<string>();
 return (Array.isArray(value)?value:value?[value]:[]).flatMap((item:any)=>{
  const uri=item?.targetUri??item?.uri,range=item?.targetSelectionRange??item?.range;
  if(typeof uri!=="string"||!valid_language_range(range))return [];
  try{const parsed=new URL(uri);if(parsed.protocol!=="file:"||parsed.search||parsed.hash||parsed.username||parsed.password)return [];
   const file_path=url.fileURLToPath(parsed);if(!path.isAbsolute(file_path)||file_path.includes("\0"))return [];
   const key=JSON.stringify([windows?file_path.toLowerCase():file_path,range]);if(seen.has(key))return [];seen.add(key);return [{file_path,range}];
  }catch{return [];}
 });
}
