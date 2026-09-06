import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transform } from 'esbuild';

const compiled = await transform(fs.readFileSync('src/reading_positions.ts', 'utf8'), { loader: 'ts', format: 'esm' });
const { create_position_store } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
  key: (index) => [...values.keys()][index],
  get length() { return values.size; },
};
const position = (scroll_top) => ({ scroll_top, scroll_left: 0 });
const first_window = create_position_store(storage, 3);
first_window.set('C:\\notes\\a.md', position(720));
const second_window = create_position_store(storage, 3);
assert.equal(second_window.get('c:/notes/a.md').scroll_top, 720, '重开窗口与路径分隔符变化仍读取原位置');
second_window.set('/notes/b.md', position(380));
first_window.set('C:\\notes\\a.md', position(760));
assert.equal(second_window.get('/notes/b.md').scroll_top, 380, '窗口 A 写入不覆盖窗口 B 的文件');
values.set('unrelated-setting', 'untouched');
first_window.set('/notes/c.md', position(20));
first_window.set('/notes/d.md', position(40));
assert.equal(values.size, 4, '只保留限定数量的阅读位置');
assert.equal(first_window.get('/notes/d.md').scroll_top, 40, '同一毫秒写入的最新记录也必须保留');
assert.equal(values.get('unrelated-setting'), 'untouched', '不清理其他配置');
storage.setItem('linux-note-reading-position:v1:broken.md', '{');
assert.equal(first_window.get('broken.md'), null, '损坏的记录不阻止打开文件');
storage.setItem('linux-note-reading-position:v1:invalid.md', JSON.stringify({ updated_at: 1, position: { scroll_top: -1, scroll_left: 0 } }));
assert.equal(first_window.get('invalid.md'), null, '非法位置被忽略');
console.log('reading positions: reopen, Windows path identity, independent windows, bounds and corrupt records passed');
