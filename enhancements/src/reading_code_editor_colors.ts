import themes from '../vendor/vscode_themes/resolved.json';

/** 固定VS Code 6807068 editorColorRegistry/editorColors默认值，主题显式颜色优先。 */
export function code_editor_state_css(mode:'light'|'dark'){
 const dark=mode==='dark',colors=themes[mode].colors as Record<string,string>;
 const color=(key:string,light:string,night=light)=>colors[key]||(dark?night:light);
 const prefix=`:root[data-workspace-code-theme=${mode}] #write .CodeMirror`;
 const cursor=color('editorCursor.foreground','#000000','#AEAFAD'),background=colors['editor.background'];
 const rules: string[]=[];
 const rule=(selector:string,body:string)=>rules.push(`${prefix}${selector}{${body}}`);
 rule('',`caret-color:${cursor}!important`);
 rule(' pre:is(.CodeMirror-line,.CodeMirror-line-like)','background-color:transparent!important');
 rule(' .CodeMirror-cursor',`border-left-color:${cursor}!important;border-right-color:${cursor}!important`);
 rule(' .CodeMirror-overwrite',`border-bottom-color:${cursor}!important`);
 rule('.cm-fat-cursor .CodeMirror-cursor',`background-color:${cursor}!important;color:${background}!important`);
 rule(' .CodeMirror-selected',`background-color:${color('editor.inactiveSelectionBackground','#E5EBF1','#3A3D41')}!important`);
 rule('.CodeMirror-focused .CodeMirror-selected',`background-color:${color('editor.selectionBackground','#ADD6FF','#264F78')}!important`);
 rule(' .CodeMirror-selectedtext','background-color:transparent!important;text-shadow:none!important');
 rule(' ::selection',`background-color:${color('editor.selectionBackground','#ADD6FF','#264F78')}!important`);
 rule(' :is(.CodeMirror-gutters,.CodeMirror-gutter-filler,.CodeMirror-scrollbar-filler)',`background-color:${background}!important;border-color:transparent!important`);
 rule(' .CodeMirror-activeline-gutter .CodeMirror-linenumber',`color:${colors['editorLineNumber.activeForeground']}!important`);
 rule(' .CodeMirror-activeline-background',`background-color:${color('editor.lineHighlightBackground','transparent')}!important;box-shadow:inset 0 0 0 1px ${color('editor.lineHighlightBorder','#EEEEEE','#282828')}`);
 rule(' .CodeMirror-matchingbracket',`background-color:${color('editorBracketMatch.background','#0064001A')}!important;outline:1px solid ${color('editorBracketMatch.border','#B9B9B9','#888888')};outline-offset:-1px`);
 rule(' .cm-searching',`background-color:${color('editor.findMatchHighlightBackground','#EA5C0055')}!important`);
 rule(' .CodeMirror-composing',`border-bottom-color:${color('editor.compositionBorder','#000000','#FFFFFF')}!important`);
 return rules.join('\n');
}
