import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const bundle=await build({entryPoints:[new URL('../src/workspace_quick_open_matcher.ts',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')],bundle:true,platform:'node',format:'cjs',write:false});
const module={exports:{}};new Function('module','exports','require',bundle.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url));
const {create_quick_matcher}=module.exports;
const file=relative_path=>({file_path:'C:\\work\\'+relative_path.replaceAll('/','\\'),relative_path,name:relative_path.split('/').at(-1),directory:relative_path.split('/').slice(0,-1).join('/')});
const paths=['samples/bringup/prj.conf','samples/bringup/README.md','samples/bringup/src/main.c','samples/bringup/tests.yaml','samples/bringup/CMakeLists.txt','samples/boards/st/bluetooth/interactive_gui/prj.conf','README.md','src/readModel.ts'].map(file);
const rank=query=>{const matcher=create_quick_matcher(query);return paths.map(matcher.match).filter(Boolean).sort(matcher.compare);};
const rounds=Number(process.env.TYPORA_STRESS_ITERATIONS||20);
for(let round=0;round<rounds;round++){
  // 固定上游基准：目录连续命中优先，再按路径长度、名称比较；不是词典顺序。
  assert.deepEqual(rank('samples/bringup').slice(0,5).map(item=>item.file.name),['prj.conf','README.md','main.c','tests.yaml','CMakeLists.txt']);
  assert.deepEqual(rank('samples\\bringup'),rank('samples/bringup'));
  assert.deepEqual(rank('samples/bringup')[0].score,{score:474,labelMatch:[],descriptionMatch:[{start:0,end:15}]});
  assert.equal(rank('read')[0].file.relative_path,'README.md');
  assert.equal(rank('read')[2].file.name,'readModel.ts');
  assert.equal(rank('main bringup')[0].file.name,'main.c');
  assert.deepEqual(rank('main bringup')[0].score.labelMatch,[{start:0,end:4}]);
  assert.deepEqual(rank('main bringup')[0].score.descriptionMatch,[{start:8,end:15}]);
  assert(!rank('"readme"').some(item=>item.file.name==='readModel.ts'),'quotes require contiguous matches');
  assert(rank('readme').some(item=>item.file.name==='readModel.ts'),'unquoted fuzzy matches survive');
  assert.equal(rank('no_such_result').length,0);
  const long=file('deep/'.repeat(100)+'samples/bringup/main.c');
  assert(create_quick_matcher('sbm').match(long),'late valid subsequence is not discarded by negative position score');
  assert(create_quick_matcher('教程 文件').match(file('学习/教程/文件.md')));
  const exact=create_quick_matcher(paths[0].file_path).match(paths[0]);assert.equal(exact.score.score,1<<18);
  // 不依赖目录读取顺序，比较器满足反对称性。
  const matcher=create_quick_matcher('read');const hits=paths.map(matcher.match).filter(Boolean);
  for(const left of hits)for(const right of hits)assert.equal(Math.sign(matcher.compare(left,right))+Math.sign(matcher.compare(right,left)),0);
}
console.log(JSON.stringify({status:'PASS',rounds,checks:['upstream score/order/highlights','slash and multiword','quoted match','Unicode and long paths','absolute path identity','comparison symmetry']}));
