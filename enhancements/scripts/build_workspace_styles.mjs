import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {editor_plugins} from './editor_bundle.cjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const normalize=value=>value.replace(/\r\n?/g,'\n');
// Shadow DOM无法使用head预载样式；显式后缀声明独立作用域，禁止污染全局CSS。
const shadow_style=file=>file.endsWith('_shadow.css');
/** 扫描真实入口经 tree shaking 后仍使用的 CSS，未启用模块不贡献样式。 */
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
/** 正式bundle必须将本插件放在editor_plugins前；样式仅由同步head资产提供。 */
export function static_workspace_css_plugin() {
 return {name:'typora-code-static-workspace-styles',setup(context){context.onLoad({filter:/\.css$/},args=>{
  const known=args.path.startsWith(path.join(root,'src')+path.sep)||args.path.startsWith(path.join(root,'node_modules')+path.sep);
  if(!known)throw new Error('CSS missing from static workspace manifest: '+args.path);
  if(shadow_style(args.path))return {contents:'export default '+JSON.stringify(inline_css_assets(args.path)),loader:'js'};
  return {contents:'export default "";',loader:'js'};
 });}};
}
/** 由总构建入口调用；测试传入自己的临时outdir，不触碰正式dist。 */
export async function build_workspace_styles({outdir=path.join(root,'dist'),prepend_paths=[],entry_points}={}) {
 const files=[...prepend_paths.map(file=>path.resolve(file)),...await collect_workspace_styles({entry_points})];
 const css='/*! Typora Code static workspace styles. Monaco Editor and xterm.js: MIT. */\n'+files.map(file=>'/* '+path.basename(file)+' */\n'+inline_css_assets(file)).join('\n');
 fs.mkdirSync(outdir,{recursive:true});fs.writeFileSync(path.join(outdir,'workspace.css'),css,'utf8');
 return {css_path:path.join(outdir,'workspace.css'),style_inputs:files};
}
