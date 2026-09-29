import {workspace_text} from "./workspace_i18n";
/** Source and read-only text share word wrap; migration changes only this setting without resetting host or other preferences. */
export const TEXT_PRESENTATION_DEFAULTS=Object.freeze({word_wrap:true});
export const TEXT_PRESENTATION_SCHEMA=2026092403;
const key='typora-code:text-presentation',event_name='typora-code:text-presentation-changed';
let volatile_value:string|null=null,warned=false,volatile_pending=false;
const stored=()=>{if(volatile_pending)return volatile_value;try{return localStorage.getItem(key);}catch{return volatile_value;}};
const save=(value:string)=>{volatile_value=value;try{localStorage.setItem(key,value);volatile_pending=false;}catch{volatile_pending=true;if(!warned){warned=true;console.warn(workspace_text("text_presentation_the_text_presentation_configuration_cannot_be_persisted_temp"));}}};
export function read_text_presentation(){
  const raw=stored();let value:any;try{value=JSON.parse(raw||'null');}catch{/* Old/invalid configurations use the current default. */}
  if(!value||!Number.isInteger(value.schema)||value.schema<TEXT_PRESENTATION_SCHEMA){value={schema:TEXT_PRESENTATION_SCHEMA,...TEXT_PRESENTATION_DEFAULTS};save(JSON.stringify(value));}
  return {word_wrap:typeof value.word_wrap==='boolean'?value.word_wrap:true};
}
export function update_text_presentation(word_wrap:boolean){
  if(typeof word_wrap!=='boolean')throw Error(workspace_text("text_presentation_the_automatic_line_wrapping_setting_must_be_a_boolean_value"));
  read_text_presentation();const value=JSON.parse(stored()||'{}');
  save(JSON.stringify({...value,schema:Math.max(value.schema||0,TEXT_PRESENTATION_SCHEMA),word_wrap}));window.dispatchEvent(new Event(event_name));
}
export function observe_text_presentation(apply:(value:ReturnType<typeof read_text_presentation>)=>void){
  const refresh=()=>apply(read_text_presentation()),storage=(event:StorageEvent)=>{if(event.key===key||event.key===null)refresh();};
  window.addEventListener(event_name,refresh);window.addEventListener('storage',storage);
  return ()=>{window.removeEventListener(event_name,refresh);window.removeEventListener('storage',storage);};
}
