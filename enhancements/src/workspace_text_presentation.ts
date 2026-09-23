/** 所有源码/只读文本共用软换行；迁移只触及本配置，不重置宿主或其他偏好。 */
export const TEXT_PRESENTATION_DEFAULTS=Object.freeze({word_wrap:true});
export const TEXT_PRESENTATION_SCHEMA=2026092403;
const key='typora-code:text-presentation',event_name='typora-code:text-presentation-changed';
let volatile_value:string|null=null,warned=false,volatile_pending=false;
const stored=()=>{if(volatile_pending)return volatile_value;try{return localStorage.getItem(key);}catch{return volatile_value;}};
const save=(value:string)=>{volatile_value=value;try{localStorage.setItem(key,value);volatile_pending=false;}catch{volatile_pending=true;if(!warned){warned=true;console.warn('文本呈现配置暂时无法持久化，本窗口继续使用当前设置。');}}};
export function read_text_presentation(){
  const raw=stored();let value:any;try{value=JSON.parse(raw||'null');}catch{/* 旧/无效配置采用本次默认。 */}
  if(!value||!Number.isInteger(value.schema)||value.schema<TEXT_PRESENTATION_SCHEMA){value={schema:TEXT_PRESENTATION_SCHEMA,...TEXT_PRESENTATION_DEFAULTS};save(JSON.stringify(value));}
  return {word_wrap:typeof value.word_wrap==='boolean'?value.word_wrap:true};
}
export function update_text_presentation(word_wrap:boolean){
  if(typeof word_wrap!=='boolean')throw Error('自动换行设置必须为布尔值。');
  read_text_presentation();const value=JSON.parse(stored()||'{}');
  save(JSON.stringify({...value,schema:Math.max(value.schema||0,TEXT_PRESENTATION_SCHEMA),word_wrap}));window.dispatchEvent(new Event(event_name));
}
export function observe_text_presentation(apply:(value:ReturnType<typeof read_text_presentation>)=>void){
  const refresh=()=>apply(read_text_presentation()),storage=(event:StorageEvent)=>{if(event.key===key||event.key===null)refresh();};
  window.addEventListener(event_name,refresh);window.addEventListener('storage',storage);
  return ()=>{window.removeEventListener(event_name,refresh);window.removeEventListener('storage',storage);};
}
