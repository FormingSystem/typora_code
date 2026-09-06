import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { transform } from 'esbuild';

const compiled = await transform(fs.readFileSync('src/file_paths.ts', 'utf8'), { loader: 'ts', format: 'esm' });
const { format_file_path } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
const cases = [
  [path.win32, 'c:/notes/topic/中文 空格%20#1.md', 'C:\\notes', false, 'C:\\notes\\topic\\中文 空格%20#1.md'],
  [path.win32, 'c:/notes/topic/中文 空格%20#1.md', 'C:\\notes', true, 'topic\\中文 空格%20#1.md'],
  [path.win32, 'C:\\notes_other\\a.md', 'C:\\notes', true, 'C:\\notes_other\\a.md'],
  [path.win32, 'D:\\notes\\a.md', 'C:\\notes', true, 'D:\\notes\\a.md'],
  [path.win32, '\\\\server\\share\\notes\\a.md', '\\\\server\\share', true, 'notes\\a.md'],
  [path.win32, '\\\\server\\other\\a.md', '\\\\server\\share', true, '\\\\server\\other\\a.md'],
  [path.win32, 'C:\\notes\\a.md', undefined, true, 'C:\\notes\\a.md'],
  [path.posix, '/notes/topic/a.md', '/notes', true, 'topic/a.md'],
  [path.posix, '/notes/A.md', '/Notes', true, '/notes/A.md'],
  [path.posix, '/notes/a\\b.md', '/notes', true, 'a\\b.md'],
  [path.posix, '/notes', '/notes', true, ''],
  [path.win32, '', 'C:\\notes', false, null],
  [path.win32, 'typ://empty/1', 'C:\\notes', false, null],
  [path.posix, 'untitled.md', '/notes', false, null],
];
for (const [api, target, root, relative, expected] of cases) assert.equal(format_file_path(api, target, root, relative), expected);
console.log(`file paths: ${cases.length} Windows, UNC, Linux, workspace boundaries and unsaved cases passed`);
