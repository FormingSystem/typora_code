// Monaco 的样式、图标和浏览器 Worker 全部装入同一离线脚本，不依赖 CDN 或安装目录。
const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
exports.editor_plugins = () => [{
  name: 'offline-monaco',
  setup(build) {
    build.onLoad({filter:/[\\/]vscode-oniguruma[\\/]release[\\/]onig\.wasm$/},args=>({contents:fs.readFileSync(args.path),loader:"binary"}));
    build.onResolve({filter: /^linux_note_search_worker$/}, () => ({path: 'worker', namespace: 'search-worker'}));
    build.onLoad({filter: /.*/, namespace: 'search-worker'}, () => {
      const worker = buildSync({entryPoints: [path.resolve(__dirname, '../src/workspace_search_worker.ts')], bundle: true, write: false, format: 'iife', target: 'chrome120', minify: true});
      return {contents: `export default ${JSON.stringify(worker.outputFiles[0].text)}`, loader: 'js'};
    });
    build.onResolve({filter: /^linux_note_monaco_worker$/}, () => ({path: 'worker', namespace: 'monaco-worker'}));
    build.onLoad({filter: /.*/, namespace: 'monaco-worker'}, () => {
      const worker = buildSync({entryPoints: [require.resolve('monaco-editor/editor/editor.worker')], bundle: true, write: false, format: 'iife', target: 'chrome120', minify: true});
      return {contents: `export default ${JSON.stringify(worker.outputFiles[0].text)}`, loader: 'js'};
    });
    build.onLoad({filter: /[\\/]monaco-editor[\\/].*\.css$/}, args => {
      const css = fs.readFileSync(args.path, 'utf8').replace(/url\(["']?([^)'" ]+)["']?\)/gu, (match, file) => {
        if (file.startsWith('data:')) return match;
        const target = path.resolve(path.dirname(args.path), file);
        const mime = file.endsWith('.ttf') ? 'font/ttf' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
        return `url("data:${mime};base64,${fs.readFileSync(target).toString('base64')}")`;
      });
      return {contents: `const style = document.createElement('style'); style.textContent = ${JSON.stringify(css)}; document.head.append(style);`, loader: 'js'};
    });
  },
}];
