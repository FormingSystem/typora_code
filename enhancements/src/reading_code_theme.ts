import {Registry,INITIAL,parseRawGrammar,type StateStack,type IRawTheme} from 'vscode-textmate';
import {loadWASM,OnigScanner,OnigString} from 'vscode-oniguruma';
import wasm from 'vscode-oniguruma/release/onig.wasm';
import c from '../vendor/vscode_cpp/syntaxes/c.tmLanguage.json';
import cpp from '../vendor/vscode_cpp/syntaxes/cpp.tmLanguage.json';
import macro from '../vendor/vscode_cpp/syntaxes/cpp.embedded.macro.tmLanguage.json';
import platform from '../vendor/vscode_cpp/syntaxes/platform.tmLanguage.json';
import themes from '../vendor/vscode_themes/resolved.json';
import {observe_workspace_theme,workspace_theme_mode} from './workspace_theme';

const modes=['light','dark'] as const;
export type code_stack=[StateStack,StateStack];
export const initial_code_stack=():code_stack=>[INITIAL,INITIAL];
type code_token={startIndex:number;endIndex:number;style:string};
export type themed_grammar={tokenizeLine(line:string,stack:code_stack):{tokens:code_token[];ruleStack:code_stack}};
let loading:Promise<{c:themed_grammar;cpp:themed_grammar;css:string}>|undefined;
const fallback_scopes:Record<string,string>={comment:'comment',string:'string',number:'constant.numeric',keyword:'keyword',def:'entity.name.function',type:'entity.name.type',variable:'variable',property:'variable.other.property',operator:'keyword.operator',atom:'constant.language',meta:'meta.preprocessor',builtin:'support.function',tag:'entity.name.tag',attribute:'entity.other.attribute-name',regexp:'string.regexp'};
function metadata_class(mode:string,metadata:number){return `vsc-${mode}-fg-${(metadata>>>15)&511} vsc-${mode}-bg-${(metadata>>>24)&255} vsc-${mode}-style-${(metadata>>>11)&15}`;}
/** 两套独立token元数据，切换明暗只切CSS，不复用另一主题的ruleStack/colorMap。 */
export function load_code_themes(){return loading ||= (async()=>{
 await loadWASM(wasm.buffer);
 const sources=new Map([['source.c',c],['source.cpp',cpp],['source.cpp.embedded.macro',macro],['source.c.platform',platform]].map(([scope,value])=>[scope as string,parseRawGrammar(JSON.stringify(value),'grammar.json')]));
 const fallback={scopeName:'source.code-fallback',patterns:Object.entries(fallback_scopes).map(([key,name])=>({match:`\\b${key}\\b`,name}))};
 sources.set(fallback.scopeName,parseRawGrammar(JSON.stringify(fallback),'fallback.json'));
 const registries=modes.map(mode=>new Registry({theme:{settings:[{settings:{foreground:themes[mode].colors['editor.foreground'],background:themes[mode].colors['editor.background']}},...themes[mode].tokenColors.filter(rule=>rule.scope)]} as IRawTheme,onigLib:Promise.resolve({createOnigScanner:patterns=>new OnigScanner(patterns),createOnigString:text=>new OnigString(text)}),loadGrammar:async scope=>sources.get(scope)||null}));
 const grammars=await Promise.all(registries.map(async registry=>({c:(await registry.loadGrammar('source.c'))!,cpp:(await registry.loadGrammar('source.cpp'))!,fallback:(await registry.loadGrammar(fallback.scopeName))!})));
 const css:string[]=[];
 modes.forEach((mode,index)=>{
  const prefix=`:root[data-workspace-code-theme=${mode}] #write`,colors=themes[mode].colors;
  css.push(`${prefix} :is(.md-fences,.CodeMirror,pre,pre code){color:${colors['editor.foreground']}!important;background-color:${colors['editor.background']}!important}`,`${prefix} .CodeMirror-linenumber{color:${colors['editorLineNumber.foreground']}!important}`);
  css.push(`${prefix} :where(.CodeMirror-line span,pre code span){color:${colors['editor.foreground']}!important}`);
  // 先映射宿主后备token；真实TextMate的精确metadata规则排列在其后。
  for(const key of Object.keys(fallback_scopes)){
   const aliases:Record<string,string[]>={variable:['variable-2'],type:['variable-3','qualifier'],string:['string-2'],meta:['metatag'],def:['function']};
   const metadata=grammars[index].fallback.tokenizeLine2(key,INITIAL).tokens[1],color=registries[index].getColorMap()[(metadata>>>15)&511];
   css.push(`${prefix} :is(.cm-${key},.lookup-code-${key}${(aliases[key]||[]).map(alias=>',.cm-'+alias+',.lookup-code-'+alias).join('')}){color:${color}!important}`);
  }
  registries[index].getColorMap().forEach((color,id)=>{if(color)css.push(`${prefix} :is(.cm-vsc-${mode}-fg-${id},.vsc-${mode}-fg-${id}){color:${color}!important}`,`${prefix} :is(.cm-vsc-${mode}-bg-${id},.vsc-${mode}-bg-${id}){background-color:${color}!important}`);});
  for(let style=0;style<16;style++)css.push(`${prefix} :is(.cm-vsc-${mode}-style-${style},.vsc-${mode}-style-${style}){font-style:${style&1?'italic':'normal'}!important;font-weight:${style&2?'bold':'normal'}!important;text-decoration:${[style&4?'underline':'',style&8?'line-through':''].filter(Boolean).join(' ')||'none'}!important}`);
 });
 const pair=(language:'c'|'cpp'):themed_grammar=>({tokenizeLine(line,stack){
  const results=grammars.map((grammar,index)=>grammar[language].tokenizeLine2(line,stack[index]));
  const boundaries=[...new Set([0,line.length,...results.flatMap(result=>Array.from(result.tokens).filter((_,index)=>index%2===0))])].filter(n=>n<=line.length).sort((a,b)=>a-b),positions=[0,0];
  return {ruleStack:results.map(result=>result.ruleStack) as code_stack,tokens:boundaries.slice(0,-1).map((start,index)=>({startIndex:start,endIndex:boundaries[index+1],style:results.map((result,side)=>{while(positions[side]+2<result.tokens.length&&result.tokens[positions[side]+2]<=start)positions[side]+=2;return metadata_class(modes[side],result.tokens[positions[side]+1]);}).join(' ')}))};
 }});
 return {c:pair('c'),cpp:pair('cpp'),css:css.join('\n')};
})().catch(error=>{loading=undefined;throw error;});}

export async function bind_code_theme(){
 const data=await load_code_themes(),style=document.createElement('style');style.id='typora-code-official-code-theme';style.textContent=data.css;document.head.append(style);
 const root=document.documentElement,previous=root.getAttribute('data-workspace-code-theme');
 const refresh=()=>{const mode=root.dataset.workspaceColors||workspace_theme_mode();if(root.dataset.workspaceCodeTheme!==mode)root.dataset.workspaceCodeTheme=mode;};
 refresh();const release=observe_workspace_theme(refresh);
 return ()=>{release();style.remove();if(previous===null)root.removeAttribute('data-workspace-code-theme');else root.setAttribute('data-workspace-code-theme',previous);};
}
