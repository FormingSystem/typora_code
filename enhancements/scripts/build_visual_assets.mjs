import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';

/** Bundle upstream renderers separately so opening a document does not load every engine. */
export async function build_visual_assets(){
 const root=path.resolve('dist/assets/visual');fs.mkdirSync(root,{recursive:true});
 const adapters={
  svg:`import purify from 'dompurify';globalThis.render_visual=async(p,r)=>{r.innerHTML=purify.sanitize(p.source,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['script','foreignObject','image','a'],FORBID_ATTR:['onload','onclick']});if(!r.querySelector('svg'))throw Error('No SVG element');};`,
  html:`import purify from 'dompurify';globalThis.render_visual=async(p,r)=>{r.innerHTML=purify.sanitize(p.source,{ADD_TAGS:['style'],FORBID_TAGS:['iframe','object','embed','form','base','meta','link'],FORBID_ATTR:['src','href','srcset']});};`,
  mermaid:`import mermaid from 'mermaid';globalThis.render_visual=async(p,r)=>{mermaid.initialize({...p.theme,startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true});r.innerHTML=(await mermaid.render('diagram',p.source)).svg;};`,
  graphviz:`import {instance} from '@viz-js/viz';globalThis.render_visual=async(p,r)=>{r.append((await instance()).renderSVGElement(p.source));};`,
  wavedrom:`import wave from 'wavedrom';import json5 from 'json5';globalThis.render_visual=async(p,r)=>{wave.renderWaveElement(0,json5.parse(p.source),r,wave.waveSkin);};`,
  vega:`import * as vega from 'vega';import json5 from 'json5';globalThis.render_visual=async(p,r)=>{const view=new vega.View(vega.parse(json5.parse(p.source)),{renderer:'svg',container:r,hover:true});await view.runAsync();};`,
  vega_lite:`import embed from 'vega-embed';import json5 from 'json5';globalThis.render_visual=async(p,r)=>{await embed(r,json5.parse(p.source),{mode:'vega-lite',renderer:'svg',actions:false});};`,
  echarts:`import * as echarts from 'echarts';import json5 from 'json5';globalThis.render_visual=async(p,r)=>{r.style.height='400px';const chart=echarts.init(r,p.dark?'dark':undefined,{renderer:'svg'});chart.setOption(json5.parse(p.source));new ResizeObserver(()=>chart.resize()).observe(r);};`,
  plantuml:`import * as viz from '@viz-js/viz';import {renderToString} from '@plantuml/core';import '@plantuml/core/themes.js';globalThis.PLANTUML_VIZ=viz;globalThis.render_visual=async(p,r)=>{r.innerHTML=await new Promise((resolve,reject)=>renderToString(p.source.split('\\n'),resolve,reject,{dark:p.dark}));};`,
  math:`import katex from 'katex';globalThis.render_visual=async(p,r)=>{katex.render(p.source,r,{displayMode:true,throwOnError:true,trust:false});};`,
  flow:`import flowchart from 'flowchart.js';globalThis.render_visual=async(p,r)=>{flowchart.parse(p.source).drawSVG(r,{ 'font-color':p.foreground,'line-color':p.foreground,'element-color':p.foreground,fill:p.background });};`,
  react:`import React from 'react';import * as ReactDOM from 'react-dom/client';import * as runtime from 'react/jsx-runtime';import * as Babel from '@babel/standalone';globalThis.render_visual=async(p,r)=>{const module={exports:{}};const code=Babel.transform(p.source,{filename:'diagram.tsx',presets:['react','typescript'],plugins:['transform-modules-commonjs']}).code;const require=name=>{if(name==='react')return React;if(name==='react-dom/client'||name==='react-dom')return ReactDOM;if(name==='react/jsx-runtime')return runtime;throw Error('Offline import unavailable: '+name);};new Function('React','ReactDOM','require','module','exports','document',code+';if(typeof App!=="undefined"&&!module.exports.default)module.exports.default=App;')(React,ReactDOM,require,module,module.exports,document);if(module.exports.default)ReactDOM.createRoot(r).render(React.createElement(module.exports.default));else if(!r.childNodes.length)throw Error('Export a default React component or define App');};`,
  html_live:`globalThis.render_visual=async(p,r)=>{r.innerHTML=p.source;for(const old of [...r.querySelectorAll('script')]){const script=document.createElement('script');script.textContent=old.textContent;old.replaceWith(script);}};`,
  javascript_live:`globalThis.render_visual=async(p,r)=>{new Function('root',p.source)(r);};`
 };
 const inputs=new Set();
 for(const [name,contents] of Object.entries(adapters)){
  const result=await build({stdin:{contents,resolveDir:process.cwd()},bundle:true,minify:name!=='plantuml',format:'iife',platform:'browser',target:'chrome120',define:{'process.env.NODE_ENV':'"production"'},metafile:true,legalComments:'inline',outfile:path.join(root,name+'.js'),loader:{'.wasm':'dataurl'}});
  Object.keys(result.metafile.inputs).forEach(file=>inputs.add(file));
 }
 const sequence=fs.readFileSync('node_modules/webfontloader/webfontloader.js','utf8')+'\n'+fs.readFileSync('node_modules/snapsvg/dist/snap.svg-min.js','utf8')+'\n'+fs.readFileSync('node_modules/underscore/underscore-umd-min.js','utf8')+'\n'+fs.readFileSync('vendor/js_sequence/sequence-diagram-min.js','utf8')+`\nglobalThis.render_visual=async(p,r)=>{await new Promise((resolve,reject)=>{const observer=new MutationObserver(()=>{if(r.querySelector('svg text')){observer.disconnect();clearTimeout(timer);resolve();}});observer.observe(r,{childList:true,subtree:true});const timer=setTimeout(()=>{observer.disconnect();reject(Error('Sequence rendering timed out'));},8000);try{Diagram.parse(p.source).drawSVG(r,{theme:'simple','font-family':'Arial'});}catch(error){observer.disconnect();clearTimeout(timer);reject(error);}});};`;
 fs.writeFileSync(path.join(root,'sequence.js'),sequence);
 const katex_css=fs.readFileSync('node_modules/katex/dist/katex.min.css','utf8').replace(/url\(([^)]+)\)/g,(_all,file)=>`url(data:font/woff2;base64,${fs.readFileSync(path.join('node_modules/katex/dist',file)).toString('base64')})`);
 fs.writeFileSync(path.join(root,'math.css'),katex_css);
 const packages=new Set([...inputs].flatMap(file=>{const match=file.replaceAll('\\','/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);return match?[match[1]]:[];}));
 for(const name of ['snapsvg','underscore','webfontloader'])packages.add(name);
 const manifest=[];fs.mkdirSync('dist/licenses/visual',{recursive:true});
 for(const name of [...packages].sort()){
  const directory=path.join('node_modules',name),pkg=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  const license=fs.readdirSync(directory).find(file=>/^licen[cs]e(?:\.|$)/i.test(file));
  if(!license&&name!=='@viz-js/viz')throw Error('Visual dependency license missing: '+name);
  const target=name.replace(/^@/,'').replaceAll('/','_')+'.txt';fs.copyFileSync(license?path.join(directory,license):'vendor/viz_licenses/LICENSE',path.join('dist/licenses/visual',target));
  manifest.push({name,version:pkg.version,license:pkg.license,notice:target});
 }
 fs.copyFileSync('vendor/js_sequence/LICENSE','dist/licenses/visual/js_sequence.txt');
 manifest.push({name:'js-sequence-diagrams',version:'2.0.1',license:'BSD-2-Clause',notice:'js_sequence.txt'});
 for(const [name,version,license,source] of [['graphviz','16.1.0','EPL-2.0','https://gitlab.com/api/v4/projects/4207231/packages/generic/graphviz-releases/16.1.0/graphviz-16.1.0.tar.gz'],['expat','2.8.5','MIT','https://github.com/libexpat/libexpat/releases/tag/R_2_8_5']]){fs.copyFileSync('vendor/viz_licenses/'+name+'.txt','dist/licenses/visual/'+name+'.txt');manifest.push({name,version,license,notice:name+'.txt',source});}
 fs.writeFileSync(path.join(root,'libraries.json'),JSON.stringify(manifest,null,2)+'\n');
}
