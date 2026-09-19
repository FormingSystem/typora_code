import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const package_root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const repository_root=path.dirname(package_root);
export function read_test_catalog() {
  const catalog=JSON.parse(fs.readFileSync(path.join(package_root,'tests/test_catalog.json'),'utf8'));
  if(catalog.schema!==1||!Array.isArray(catalog.suites)||!catalog.suites.length)throw Error('测试目录schema或套件列表无效');
  const ids=new Set(),covered=new Set();
  const index=fs.readFileSync(path.join(repository_root,'docs/requirements_design.md'),'utf8');
  for(const entry of catalog.suites) {
    if(typeof entry.id!=='string'||!/^TC-[a-z0-9-]+$/.test(entry.id))throw Error('无效用例编号');
    if(ids.has(entry.id))throw Error('重复用例编号：'+entry.id);ids.add(entry.id);
    if(!['unit','functional','system'].includes(entry.level)||!['implementation','stress'].includes(entry.purpose))throw Error('测试分类无效：'+entry.id);
    for(const field of ['requirements','implementation','related_modules','steps','expected'])if(!entry[field]?.length)throw Error('缺少'+field+'：'+entry.id);
    for(const requirement of entry.requirements)if(!index.includes('| '+requirement+' |'))throw Error('无需求关联：'+requirement);
    for(const relative of [entry.script,entry.design,...entry.implementation,...(entry.runner?[entry.runner]:[])]) {
      const target=path.resolve(repository_root,relative.split('#')[0]);
      if(!target.startsWith(repository_root+path.sep)||!fs.existsSync(target))throw Error('失效路径：'+relative);
      const anchor=relative.split('#')[1];
      if(anchor){
        const headings=fs.readFileSync(target,'utf8').split(/\r?\n/).filter(line=>/^#{1,6} /.test(line)).map(line=>line.replace(/^#+ /,'').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s/g,'-'));
        if(!headings.includes(decodeURIComponent(anchor)))throw Error('失效设计锚点：'+relative);
      }
    }
    if(!entry.environment||!entry.preconditions||!Number.isInteger(entry.timeout_ms)||entry.timeout_ms<=0)throw Error('缺少环境/超时：'+entry.id);
    covered.add(path.basename(entry.script));
  }
  const missing=fs.readdirSync(path.join(package_root,'scripts')).filter(name=>/^test_.*\.(mjs|cjs|ps1|py|sh)$/.test(name)&&name!=='test_ui.mjs'&&!covered.has(name));
  if(missing.length)throw Error('未分类测试：'+missing.join(', '));
  return catalog;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify({status:'PASS',suites:read_test_catalog().suites.length}));
