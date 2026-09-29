import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {editor_plugins} from './editor_bundle.cjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const normalize=value=>value.replace(/\r\n?/g,'\n');
// The Shadow DOM cannot use head preloaded styles; explicitly declare the independent scope with a suffix, prohibiting pollution of the global CSS.
const shadow_style=file=>file.endsWith('_shadow.css');
/** Scan the real entry after tree shaking still uses CSS; unused modules do not contribute styles. */
export async function collect_workspace_styles({entry_points=[path.join(root,'src/workspace_entry.ts')]}={}) {
 const discovered=new Map();
 const result=await build({entryPoints:entry_points,absWorkingDir:root,bundle:true,write:false,metafile:true,format:'iife',platform:'browser',target:['chrome120'],loader:{'.wasm':'binary'},plugins:[{name:'workspace-style-dependencies',setup(context){context.onLoad({filter:/\.css$/},args=>{if(shadow_style(args.path))return {contents:'export default '+JSON.stringify(inline_css_assets(args.path)),loader:'js'};const token='typora_style_'+Buffer.from(path.relative(root,args.path)).toString('hex');discovered.set(args.path,token);return {contents:'export default '+JSON.stringify(token),loader:'js'};});}},...editor_plugins()]});
 const output=result.outputFiles.map(file=>file.text).join('\n');
 const files=[...discovered].filter(([,token])=>output.includes(token)).map(([file])=>file).sort();
 const active_inputs=Object.values(result.metafile.outputs).flatMap(item=>Object.entries(item.inputs).filter(([,info])=>info.bytesInOutput>0).map(([name])=>name));
 if(active_inputs.some(name=>name.replaceAll('\\','/').includes('node_modules/monaco-editor/')))files.unshift(path.join(root,'node_modules/monaco-editor/min/vs/editor/editor.main.css'));
 return [...new Set(files)];
}
function inline_css_assets(file) {
 return normalize(fs.readFileSync(file,'utf8')).replace(/url\(["']?([^)'" ]+)["']?\)/gu,(match,value)=>{
  if(value.startsWith('data:')||value.startsWith('#'))return match;
  if(/^[a-z]+:/i.test(value))throw new Error('Network CSS asset is not permitted: '+value);
  const asset=path.resolve(path.dirname(file),value);const mime=value.endsWith('.ttf')?'font/ttf':value.endsWith('.woff')?'font/woff':value.endsWith('.svg')?'image/svg+xml':'application/octet-stream';
  return `url("data:${mime};base64,${fs.readFileSync(asset).toString('base64')}")`;
 });
}
/** The official bundle must place this plugin before editor_plugins; styles are only provided by the synchronized head assets. */
export function static_workspace_css_plugin() {
 return {name:'typora-code-static-workspace-styles',setup(context){context.onLoad({filter:/\.css$/},args=>{
  const known=args.path.startsWith(path.join(root,'src')+path.sep)||args.path.startsWith(path.join(root,'node_modules')+path.sep);
  if(!known)throw new Error('CSS missing from static workspace manifest: '+args.path);
  if(shadow_style(args.path))return {contents:'export default '+JSON.stringify(inline_css_assets(args.path)),loader:'js'};
  return {contents:'export default "";',loader:'js'};
 });}};
}
/** Called by the total build entry; test passes in its own temporary outdir, without touching the official dist. */
export async function build_workspace_styles({outdir=path.join(root,'dist'),prepend_paths=[],entry_points}={}) {
 const files=[...prepend_paths.map(file=>path.resolve(file)),...await collect_workspace_styles({entry_points})];
 const css='/*! Typora Code static workspace styles. Monaco Editor and xterm.js: MIT. */\n'+files.map(file=>'/* '+path.basename(file)+' */\n'+inline_css_assets(file)).join('\n');
 fs.mkdirSync(outdir,{recursive:true});fs.writeFileSync(path.join(outdir,'workspace.css'),css,'utf8');
 return {css_path:path.join(outdir,'workspace.css'),style_inputs:files};
}
