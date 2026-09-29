'use strict';
const messages=require('./workspace_service_messages.json');
let selected_locale;
/** The renderer supplies its loaded window language; workers inherit it in their request. */
function set_workspace_service_locale(value){
 if(value!=='en'&&value!=='zh-cn')throw new Error('Unsupported service display language.');
 selected_locale=value;
}
function workspace_service_locale(){
 const runtime=globalThis;
 const value=selected_locale??runtime[Symbol.for('typora-code:workspace')]?.app?.i18n?.locale??runtime._options?.appLocale??'en';
 return /^zh(?:-|_|$)/i.test(value)?'zh-cn':'en';
}
function workspace_service_text(key,values={}){
 const message=messages[key];
 const template=(workspace_service_locale()==='zh-cn'?message?.zh_cn:message?.en)??message?.en??key;
 return template.replace(/\{([a-z][a-z0-9_]*)\}/gi,(match,name)=>Object.hasOwn(values,name)?String(values[name]):match);
}
module.exports={set_workspace_service_locale,workspace_service_locale,workspace_service_text};
