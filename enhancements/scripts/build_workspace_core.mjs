import {build} from 'esbuild';
import * as sass from 'sass';
import fs from 'node:fs';
import path from 'node:path';
import {builtinModules} from 'node:module';
import {fileURLToPath} from 'node:url';
const base=path.resolve(import.meta.dirname,'../vendor/workspace_core');
// 固定已验收发布的层叠顺序；notice/modal 内部仍按上游导入 global。
// 新增组件样式必须显式登记，禁止依赖 esbuild 并行加载完成的顺序。
const core_style_entries = [
  "src/ui/layout/split/index.scss",
  "src/ui/editor/markdown-renderer.scss",
  "src/ui/components/notice.scss",
  "src/ui/layout/tabs/index.scss",
  "src/ui/global.scss",
  "src/ui/variables.scss",
  "src/ui/layout/workspace-node.scss",
  "src/ui/components/modal.scss",
  "src/ui/title-bar.scss",
  "src/ui/views/empty-view.scss",
  "src/ui/sidebar/file-explorer.scss",
  "src/ui/statusbar/statistics.scss",
  "src/ui/layout/tabs/file-tabs.scss",
  "src/ui/commands/command-modal.scss",
  "src/ui/views/markdown-view/index.scss",
  "src/ui/layout/floating/index.scss",
  "src/ui/layout/sidedock/index.scss",
  "src/ui/sidebar/sidebar.scss",
  "src/ui/ribbon/workspace-ribbon.scss",
  "src/ui/layout/floating/theme.scss",
  "src/ui/editor/suggestion/suggest.scss",
  "src/ui/components/menu.scss",
  "src/ui/components/draggable.scss",
  "src/ui/components/tabs.scss",
  "src/ui/layout/workspace-root.scss",
  "src/ui/editor/postprocessor/postprocessor.scss",
  "src/ui/sidebar/search/views/global-search-progressbar.scss",
  "src/ui/sidebar/search/views/advanced-search-mode.scss"
];
export async function build_workspace_core({outdir=path.resolve(import.meta.dirname,'../dist')}={}) {
const dist=path.resolve(outdir);fs.mkdirSync(dist,{recursive:true});
const css_files=new Set();
const modules={'lodash':'lowdb/node_modules/lodash','glob':'fs-plus/node_modules/glob','minimatch':'fs-plus/node_modules/minimatch','fs-extra':'fs-extra','iconv-lite':'iconv-lite'};
const result=await build({entryPoints:[path.join(base,'src/runtime.ts')],bundle:true,write:false,metafile:true,format:'iife',globalName:'workspace_core_module',target:'chrome120',tsconfigRaw:{compilerOptions:{experimentalDecorators:true}},define:{'process.env.CORE_NS':'"typora-code:workspace"','process.env.CORE_VERSION':'"2.10.15"','process.env.IS_PROD':'true','process.env.IS_DEV':'false','process.env.IS_TEST':'false'},plugins:[{name:'workspace-core-host',setup(ctx){
ctx.onResolve({filter:/^src\//},args=>({path:path.join(base,args.path)+ (path.extname(args.path)?'':fs.existsSync(path.join(base,args.path)+'.ts')?'.ts':'/index.ts')}));
ctx.onResolve({filter:/^[^./]/},args=>{if(builtinModules.includes(args.path)||modules[args.path])return{path:modules[args.path]||args.path,namespace:'host-module'};});
ctx.onLoad({filter:/.*/,namespace:'host-module'},args=>({contents:`module.exports=reqnode(${JSON.stringify(args.path)});`,loader:'js'}));
ctx.onLoad({filter:/\.ts$/},args=>{let contents=fs.readFileSync(args.path,'utf8');contents=contents.replace(/import (?!type)[^;\n]+ from ['"]typora['"];?/g,'').replace(/\brequire\(/g,'reqnode(');return{contents,loader:'ts'};});
ctx.onLoad({filter:/\.scss$/},args=>{css_files.add(args.path);return{contents:'',loader:'js'};});
}}],logLevel:'warning'});
const source=result.outputFiles[0].text;
const bootstrap=`(()=>{const key=Symbol.for('typora-code:workspace');if(window[key])return;let resolve_ready,reject_ready;const ready=new Promise((resolve,reject)=>{resolve_ready=resolve;reject_ready=reject});window[key]={ready};(async()=>{const started=Date.now();while(!window.File||!window.reqnode||!window._options||!window.editor||!window.$||!window.editor.writingArea?.isConnected||!document.querySelector('#sidebar-content')||!document.body||document.readyState==='loading'){if(Date.now()-started>15000)throw new Error('Typora Code host initialization timed out');await new Promise(resolve=>setTimeout(resolve,10));}for(const link of document.querySelectorAll('link[data-typora-code-style]')){while(!link.sheet){if(Date.now()-started>15000)throw new Error('Typora Code stylesheet failed: '+link.href);await new Promise(resolve=>setTimeout(resolve,10));}}\n${source}\nawait workspace_core_module.initialize();resolve_ready();})().catch(error=>{document.documentElement.dataset.typoraCodeStartup='error';console.error(error);reject_ready(error);});})();`;
const license='/*! Typora Code workspace core, derived from Typora Community Plugin 2.10.15.\n'+fs.readFileSync(path.join(base,'LICENSE.md'),'utf8')+'\n*/\n';
fs.writeFileSync(path.join(dist,'workspace_core.js'),license+bootstrap,'utf8');
const ordered_css=core_style_entries.map(name=>path.join(base,name));
if(ordered_css.length!==css_files.size||ordered_css.some(name=>!css_files.has(name)))throw new Error('Workspace core CSS closure differs from explicit style entries');
let css='';const style_inputs=new Set(ordered_css);for(const filename of ordered_css){const compiled=sass.compile(filename,{silenceDeprecations:['import','global-builtin','color-functions'],logger:{warn(){},debug(){}}});css+=compiled.css+'\n';for(const url of compiled.loadedUrls)style_inputs.add(fileURLToPath(url));}fs.writeFileSync(path.join(dist,'workspace_core.css'),license+css,'utf8');
fs.mkdirSync(path.join(dist,'locales'),{recursive:true});for(const name of fs.readdirSync(path.join(base,'src/locales')).filter(name=>/^lang\..+\.json$/.test(name)))fs.copyFileSync(path.join(base,'src/locales',name),path.join(dist,'locales',name));
fs.writeFileSync(path.join(base,'build_inputs.json'),JSON.stringify({inputs:Object.keys(result.metafile.inputs).map(name=>path.relative(base,path.resolve(name))),styles:[...style_inputs].map(name=>path.relative(base,name))},null,2)+'\n','utf8');
console.log('Workspace core: '+result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].bytes+' bytes');

}
if(process.argv[1]&&path.resolve(process.argv[1])===import.meta.filename)await build_workspace_core();
