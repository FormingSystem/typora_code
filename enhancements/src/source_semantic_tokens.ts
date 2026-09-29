/** Neutral semantic snapshot bridge: does not hold process or model life, historical models do not impersonate workspace results. */
export const SEMANTIC_TYPES=['namespace','type','class','enum','interface','struct','typeParameter','parameter','variable','property','enumMember','event','function','method','macro','keyword','modifier','comment','string','number','regexp','operator','decorator','label'];
export const SEMANTIC_MODIFIERS=['declaration','definition','readonly','static','deprecated','abstract','async','modification','documentation','defaultLibrary'];
export type semantic_tokens={data:number[];token_types:string[];token_modifiers:string[]};
const snapshots=new WeakMap<object,{version:number;tokens:semantic_tokens}>(),listeners=new Set<()=>void>();
export function set_source_semantics(model:any,tokens?:semantic_tokens){if(tokens)snapshots.set(model,{version:model.getVersionId(),tokens});else snapshots.delete(model);for(const listener of listeners)listener();}
export function observe_source_semantics(listener:()=>void){listeners.add(listener);return{dispose(){listeners.delete(listener);}};}
export function source_semantics(model:any){const value=snapshots.get(model);return value?.version===model.getVersionId()?value.tokens:undefined;}
export function convert_semantic_tokens(value:semantic_tokens):Uint32Array{
 const output:number[]=[];let line=0,column=0,previous_line=0,previous_column=0;
 if(value.data.length%5)return new Uint32Array();
 for(let index=0;index<value.data.length;index+=5){
  const [delta_line,delta_column,length,token,modifiers]=value.data.slice(index,index+5);
  if([delta_line,delta_column,length,token,modifiers].some(item=>!Number.isInteger(item)||item<0))return new Uint32Array();
  line+=delta_line;column=delta_line?delta_column:column+delta_column;
  const type=SEMANTIC_TYPES.indexOf(value.token_types[token]);if(type<0||!length)continue;
  let flags=0;for(let bit=0;bit<Math.min(value.token_modifiers.length,31);bit++)if(modifiers&(1<<bit)){const mapped=SEMANTIC_MODIFIERS.indexOf(value.token_modifiers[bit]);if(mapped>=0)flags|=1<<mapped;}
  output.push(line-previous_line,line===previous_line?column-previous_column:column,length,type,flags);previous_line=line;previous_column=column;
 }
 return new Uint32Array(output);
}
