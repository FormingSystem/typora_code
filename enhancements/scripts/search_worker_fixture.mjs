import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';

/** 与浏览器同一份 Worker 源码，使用真实 worker_threads 隔离 CPU 匹配。 */
export async function build_search_test_api(source_ref) {
  const project_root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source_plugins=source_ref?[{name:'search-benchmark-baseline',setup(build){build.onLoad({filter:/workspace_search(?:_engine|_matcher|_worker|_worker_client)\.ts$/},args=>({contents:execFileSync('git',['show',`${source_ref}:enhancements/src/${path.basename(args.path)}`],{cwd:project_root,encoding:'utf8',windowsHide:true}),loader:'ts'}));}}]:[];
  const worker_code = (await build({entryPoints: [path.join(project_root, 'src/workspace_search_worker.ts')], bundle: true, format: 'iife', write: false,plugins:source_plugins})).outputFiles[0].text;
  const compiled = await build({stdin: {contents: "export * from './src/workspace_search_engine.ts';", resolveDir: project_root}, bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{
    name: 'injected-search-worker', setup(build) {
      build.onResolve({filter: /^linux_note_search_worker$/}, () => ({path: 'injected', namespace: 'search-worker-test'}));
      build.onLoad({filter: /.*/, namespace: 'search-worker-test'}, () => ({contents: 'export default "";', loader: 'js'}));
    },
  },...source_plugins]});
  const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  const workers = new Set();
  const matcher_factory = () => {
    const worker = new Worker("const {parentPort}=require('node:worker_threads');globalThis.postMessage=value=>parentPort.postMessage(value);parentPort.on('message',data=>globalThis.onmessage({data}));\n"+worker_code, {eval: true});
    workers.add(worker); worker.on('exit', () => workers.delete(worker)); worker.on('error', () => {});
    const wrappers = new Map();
    return {
      postMessage: value => worker.postMessage(value),
      addEventListener: (type, listener) => { const wrapper = value => listener(type === 'message' ? {data: value} : {message: value.message}); wrappers.set(listener, wrapper); worker.on(type, wrapper); },
      removeEventListener: (type, listener) => { const wrapper = wrappers.get(listener); if (wrapper) { worker.off(type, wrapper); wrappers.delete(listener); } },
      terminate: () => { void worker.terminate(); },
    };
  };
  return {api, matcher_factory, dispose_all: () => Promise.all([...workers].map(worker => worker.terminate()))};
}
