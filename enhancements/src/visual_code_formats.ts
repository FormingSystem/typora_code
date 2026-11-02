/** These names select bundled renderers, never executable paths or remote URLs. */
const aliases:Record<string,string>={svg:'svg',mermaid:'mermaid',dot:'graphviz',graphviz:'graphviz',wavedrom:'wavedrom',vega:'vega','vega-lite':'vega_lite',vegalite:'vega_lite',echarts:'echarts',plantuml:'plantuml',puml:'plantuml',html:'html','html-live':'html_live',javascript_live:'javascript_live','javascript-live':'javascript_live',jsx:'react',tsx:'react',react:'react',math:'math',latex:'math',tex:'math',flow:'flow',flowchart:'flow',sequence:'sequence'};
export function visual_code_format(language:string):string|undefined{return aliases[language.trim().toLowerCase()];}
export function visual_code_language(code:HTMLElement):string{return code.className.match(/language-([^\s]+)/u)?.[1]||'';}
export function interactive_visual(format:string):boolean{return ['html_live','javascript_live','react'].includes(format);}
