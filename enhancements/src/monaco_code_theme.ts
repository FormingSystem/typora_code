import "monaco-editor/editor/contrib/semanticTokens/browser/documentSemanticTokens";
import {SEMANTIC_TYPES,SEMANTIC_MODIFIERS,source_semantics,observe_source_semantics,convert_semantic_tokens} from "./source_semantic_tokens";
import * as monaco from 'monaco-editor/editor/editor.api';
import {INITIAL,type StateStack} from 'vscode-textmate';
import {load_code_themes,workspace_code_theme} from './reading_code_theme';
import themes from '../vendor/vscode_themes/resolved.json';
import {observe_workspace_theme} from './workspace_theme';

let ready:Awaited<ReturnType<typeof load_code_themes>>|undefined,loading:Promise<void>|undefined,current='';
const providers:monaco.IDisposable[]=[];
class grammar_state implements monaco.languages.IState {
 constructor(readonly stack:StateStack=INITIAL){}
 clone(){return this;}
 equals(other:monaco.languages.IState){return other instanceof grammar_state&&this.stack.equals(other.stack);}
}
/** 所有Monaco表面共用主题；提供器重新登记使主题色表改变后旧token失效。 */
export function sync_monaco_code_theme(){
 const mode=workspace_code_theme();
 if(!ready)return;
 if(current===mode)return;
 current=mode;const profile=ready.profiles[mode];
 for(const provider of providers.splice(0))provider.dispose();
 for(const language of ['c','cpp'] as const){
  const grammar=profile[language],language_id=monaco.languages.getEncodedLanguageId(language);
  providers.push(monaco.languages.setTokensProvider(language,{getInitialState:()=>new grammar_state(),tokenizeEncoded(line,state){
   const result=grammar.tokenizeLine2(line,(state as grammar_state).stack),tokens=result.tokens.slice();
   // TextMate注册表不持有Monaco语言ID；其余标准token元数据保留。
   for(let index=1;index<tokens.length;index+=2)tokens[index]=(tokens[index]&~255)|language_id;
   return {tokens,endState:new grammar_state(result.ruleStack)};
  }}));
 }
 monaco.editor.setTheme('typora-code-'+mode.replace('_','-'));
}
export function initialize_monaco_code_theme(){
 return loading??=(async()=>{
  // 首帧先使用同一官方表面色，语法和WASM异步就绪后补充token规则。
  for(const mode of ['light','dark','light_2026','dark_2026'] as const)monaco.editor.defineTheme('typora-code-'+mode.replace('_','-'),{base:mode.startsWith('dark')?'vs-dark':'vs',inherit:true,colors:themes[mode].colors,rules:[]});
  monaco.editor.setTheme('typora-code-'+workspace_code_theme().replace('_','-'));
  // 先让Monaco懒加载完成，防止其Monarch后到覆盖官方语法。
  await Promise.all(monaco.languages.getLanguages().filter(item=>['c','cpp'].includes(item.id)).map(item=>item.loader?.()));
  ready=await load_code_themes();
  monaco.languages.registerDocumentSemanticTokensProvider('*',{
   getLegend:()=>({tokenTypes:SEMANTIC_TYPES,tokenModifiers:SEMANTIC_MODIFIERS}),
   onDidChange:observe_source_semantics,
   provideDocumentSemanticTokens(model){const value=source_semantics(model);return value?{data:convert_semantic_tokens(value)}:null;},
   releaseDocumentSemanticTokens(){}
  });
  for(const mode of ['light','dark','light_2026','dark_2026'] as const){
   const profile=ready.profiles[mode];
   monaco.editor.defineTheme('typora-code-'+mode.replace('_','-'),{base:mode.startsWith('dark')?'vs-dark':'vs',inherit:true,colors:themes[mode].colors,rules:profile.rules,encodedTokensColors:profile.colors.slice(1)});
  }
  sync_monaco_code_theme();observe_workspace_theme(sync_monaco_code_theme);
 })().catch(error=>{loading=undefined;console.error('代码主题加载失败，保留基础着色',error);});
}
