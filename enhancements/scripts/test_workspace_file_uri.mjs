import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';

const compiled = await build({entryPoints:['src/workspace_file_uri.ts'],bundle:true,platform:'node',format:'esm',write:false});
const uri = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

const windows_file = 'C:\\Notes\\Source Reading\\draft #1 [review] 100%.test.ts';
const source_uri = uri.source_file_uri(windows_file);
const unc_file = '\\\\Server\\Share Name\\Source Reading\\draft #1 [review] 100%.markdown';
const unc_source_uri = uri.source_file_uri(unc_file);
assert.equal(uri.SOURCE_FILE_VIEW_ID, 'linux_note.source_file');
assert.equal(uri.is_source_file_uri(source_uri), true);
assert.equal(uri.source_file_path(source_uri), windows_file, 'source URI round-trips every path character');
assert.equal(uri.source_file_path(unc_source_uri, path.win32), unc_file, 'UNC source URI round-trips every path character');
assert.equal(uri.source_file_path('typ://linux_note.source_file/%E0%A4%A'), undefined, 'malformed source URI is rejected');
assert.equal(uri.source_file_path('typ://linux_note.source_file/relative.ts'), undefined, 'relative source URI is rejected');
assert.equal(uri.source_file_path('typ://linux_note.source_file/..%5Coutside.ts'), undefined, 'traversing source URI is rejected');
assert.throws(() => uri.source_file_uri('relative.ts'), /绝对文件路径/u, 'source URI encoder rejects relative paths');
assert.equal(uri.file_key(windows_file), uri.file_key('c:/notes/source reading/DRAFT #1 [REVIEW] 100%.TEST.TS'), 'Windows drive identity ignores slash and case differences');
assert.equal(uri.file_key('\\\\Server\\Share\\Folder\\A.md'), uri.file_key('//server/share/folder/a.md'), 'UNC identity ignores slash and case differences');
assert.notEqual(uri.file_key('/notes/A.md'), uri.file_key('/notes/a.md'), 'POSIX identity remains case-sensitive');

const root = 'C:\\Notes\\Workspace';
assert.equal(uri.resolve_workspace_file(path.win32, root, 'src\\space #1 100%.ts'), 'C:\\Notes\\Workspace\\src\\space #1 100%.ts');
assert.equal(uri.resolve_workspace_file(path.win32, root, source_uri), windows_file);
assert.equal(uri.resolve_workspace_file(path.win32, root, 'typ://linux_note.search_results/1/results'), undefined);
assert.equal(uri.resolve_workspace_file(path.win32, '', 'relative.ts'), undefined, 'missing context root cannot fall back to the process cwd');
assert.equal(uri.resolve_workspace_file(path.win32, '.', 'relative.ts'), undefined, 'relative context root cannot fall back to the process cwd');
const tool_uri = 'typ://linux_note.git_graph/repository?branch=feature%2Fspace#head';
assert.equal(uri.resolve_host_open_file_target(path.win32, path.win32.join(root, 'notes', 'source.md'), tool_uri), tool_uri, 'registered tool URIs pass through unchanged');
assert.equal(uri.resolve_host_open_file_target(path.win32, path.win32.join(root, 'notes', 'source.md'), 'target #1 100%.md'), path.win32.join(root, 'notes', 'target #1 100%.md'), 'relative host files use the active Markdown directory');

assert.deepEqual(uri.parse_markdown_file_target('notes/reading #1 [draft] 100%.md'), {file_path:'notes/reading #1 [draft] 100%.md'});
assert.deepEqual(uri.parse_markdown_file_target('notes/reading #1 [draft] 100%.md#目标 标题'), {file_path:'notes/reading #1 [draft] 100%.md',hash:'#目标 标题'});
assert.deepEqual(uri.parse_markdown_file_target('notes/reading #1.md#README.md'), {file_path:'notes/reading #1.md',hash:'#README.md'});
assert.deepEqual(uri.parse_markdown_file_target('notes/reading #1.markdown#chapter.markdown'), {file_path:'notes/reading #1.markdown',hash:'#chapter.markdown'});
assert.deepEqual(uri.parse_markdown_file_target('<notes/space name.markdown#Heading%201>'), {file_path:'notes/space name.markdown',hash:'#Heading%201'});
assert.equal(uri.parse_markdown_file_target(source_uri), undefined, 'explicit source views are never mistaken for rendered Markdown targets');
assert.deepEqual(uri.resolve_markdown_file_target(path.win32, root, 'docs\\reading #2 50%.md#part'), {file_path:'C:\\Notes\\Workspace\\docs\\reading #2 50%.md',hash:'#part'});

console.log('workspace file URI: source identity, context-root resolution, Windows keys and complex Markdown anchors passed');
