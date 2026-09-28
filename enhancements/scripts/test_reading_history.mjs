import assert from "node:assert/strict";
import fs from "node:fs";
import { transform } from "esbuild";

const compiled = await transform(fs.readFileSync('src/reading_history.ts', 'utf8'), { loader: 'ts', format: 'esm' });
const { create_reading_history } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
const location = (file_path, scroll_top) => ({ file_path, scroll_top, scroll_left: 0, cursor: null });
const history = create_reading_history(3);
let current = location('chapter_a.md', 10);
const restore = async (target) => { current = target; return true; };
assert.equal(history.can_travel(-1), false);
assert.equal(history.can_travel(1), false);
assert.equal(await history.travel(-1, current, restore), false);
history.record_jump(current, location('chapter_a.md', 800));
assert.equal(history.can_travel(-1), true);
assert.equal(history.can_travel(1), false);
current = location('chapter_a.md', 920);
assert.equal(await history.travel(-1, current, restore), true);
assert.equal(history.can_travel(-1), false);
assert.equal(history.can_travel(1), true);
assert.equal(current.scroll_top, 10);
assert.equal(await history.travel(1, current, restore), true);
assert.equal(current.scroll_top, 920, '前进恢复离开目标时的阅读位置');
history.record_jump(current, location('chapter_b.md', 50));
current = location('chapter_b.md', 50);
assert.equal(await history.travel(-1, current, async () => false), false, '取消文件打开');
assert.equal(await history.travel(-1, current, restore), true, '取消后历史索引不变');
assert.equal(current.file_path, 'chapter_a.md');
history.record_jump(current, location('chapter_c.md', 70));
current = location('chapter_c.md', 70);
assert.equal(await history.travel(1, current, restore), false, '新跳转清除旧前进分支');
await assert.rejects(history.travel(-1, current, async () => { throw new Error('open failed'); }));
assert.equal(await history.travel(-1, current, restore), true, '打开异常后可再次导航');
history.record_jump(current, current);
let finish;
const pending = history.travel(-1, current, () => new Promise((resolve) => { finish = resolve; }));
assert.equal(history.can_travel(-1), false, '导航期间禁用历史按钮');
assert.equal(history.can_travel(1), false, '导航期间禁用前进按钮');
assert.equal(await history.travel(-1, current, restore), false, '导航期间不重复打开文件');
finish(false);
await pending;
const pane_history = create_reading_history();
const left_pane = { ...location('chapter_a.md', 80), view_id: 1 };
const right_pane = { ...left_pane, view_id: 2 };
pane_history.record_jump(left_pane, right_pane);
let restored_pane;
assert.equal(await pane_history.travel(-1, right_pane, async (target) => { restored_pane = target.view_id; return true; }), true);
assert.equal(restored_pane, 1, '同一文件同一滚动位置也要区分来源栏');
console.log('reading history: anchors, files, scroll restoration, branching, cancellation and reentrancy passed');
const source = (line, view_id = -1) => ({...location('code.c', line * 10), kind:'source', view_id, line, cursor:{startLineNumber:line,startColumn:1}});
const cursor_history = create_reading_history();
cursor_history.record_selection(source(1));
cursor_history.record_selection(source(5));
assert.equal(cursor_history.can_travel(-1),false,'普通光标近邻替换');
cursor_history.record_selection(source(6),true);
let selection;
assert(await cursor_history.travel(-1,source(6),async target=>{selection=target;return true;}));
assert.equal(selection.line,5,'明确定位即使相邻仍可返回');
cursor_history.record_selection(source(7));
assert(cursor_history.can_travel(1),'返回后普通近邻移动保留前进');
cursor_history.record_selection(source(25));
assert(!cursor_history.can_travel(1),'新的远距离移动截断前进');
const bounded=create_reading_history();for(let i=0;i<1000;i++)bounded.record_selection(source(i*10+1));
let count=0;while(await bounded.travel(-1,source(9991-count*10),async()=>true))count++;
assert.equal(count,49,'连续1000次定位只保留50项');
console.log('navigation selection: near/far, explicit, forward branch and 50-entry bound passed');
for(const count of [20,100,1000]){
  const switched=create_reading_history();
  for(let iteration=0;iteration<count;iteration++){
    switched.record_jump(location('old/a',0),location('old/b',0));
    let complete_old;
    const old=switched.travel(-1,location('old/b',0),()=>new Promise(resolve=>{complete_old=resolve;}));
    switched.clear();
    assert.equal(switched.can_travel(-1),false);
    switched.record_jump(location('new/a',0),location('new/b',0));
    let complete_new;
    const next=switched.travel(-1,location('new/b',0),()=>new Promise(resolve=>{complete_new=resolve;}));
    complete_old(true);assert.equal(await old,false);
    assert.equal(switched.is_navigating(),true,'old completion cannot unlock the new navigation');
    complete_new(true);assert.equal(await next,true);
    assert.equal(switched.can_travel(-1),false);
    switched.clear();
  }
  console.log(`workspace navigation invalidation: ${count} pending old/new callbacks passed`);
}

// 返回正文后，工具栏/外部浏览器带来的选区丢失不能创建新分支。
for (const kind of [undefined,'source','git']) {
 const h=create_reading_history(),a={...location('a',120),kind,view_id:1,cursor:{id:'n2',start:3}},b={...location('b',230),kind,view_id:2,cursor:{id:'n4',start:0}};
 assert.equal(h.checkpoint(a),false,'尚无当前位置不能吞掉首项');
 h.record_jump(a,b);assert(await h.travel(-1,b,async()=>true));
 assert.equal(h.checkpoint({...a,kind:'other'}),false,'其他编辑器不能被当成焦点恢复');
 h.record_selection({...a,cursor:null});
 assert(h.can_travel(1),'失焦缺失选区保留前进 '+kind);
 h.checkpoint({...a,scroll_top:125,cursor:null});
 assert(h.can_travel(1),'工具栏检查点不截断前进 '+kind);
 assert(await h.travel(1,a,async target=>{assert.equal(target.file_path,'b');return true;}));
 assert(await h.travel(-1,b,async target=>{assert.equal(target.cursor.id,'n2');return true;}));
 h.checkpoint({...a,cursor:{id:'rebuilt',start:3}});
 h.record_selection({...a,cursor:{id:'rebuilt',start:3}});
 assert(h.can_travel(1),'恢复后的新cid不新增历史 '+kind);
 h.record_selection({...a,cursor:{id:'new-selection',start:9}},true);
 assert(!h.can_travel(1),'真正的新定位仍截断前进 '+kind);
}
console.log('navigation checkpoints: blur, toolbar, restored selection and explicit branching passed');

for (const kind of [undefined, 'source', 'git']) {
 const h=create_reading_history(),a={...location('closed',120),kind,view_id:1},b={...location('other',230),kind,view_id:2};
 h.record_jump(a,b);
 const reopened={...a,view_id:3};
 assert(await h.travel(-1,b,async()=>reopened));
 h.record_selection(reopened);
 assert(h.can_travel(1),'关闭重开后的选区通知必须保留前进 '+kind);
 assert(await h.travel(1,reopened,async()=>b));
 assert(await h.travel(-1,null,async target=>{assert.equal(target.view_id,3);return reopened;}),'空编辑区仍可返回');
}
// 同一资源的多个历史位置随原视图重绑定；独立分栏不能一起改变身份。
for (const kind of [undefined,'source','git']) {
 const h=create_reading_history();
 const a={...location('same',10),kind,view_id:1},far={...a,scroll_top:800},pane={...far,view_id:2};
 h.record_jump(a,far);h.record_jump(far,pane);
 assert(await h.travel(-1,pane,async target=>({...target,view_id:3})));
 assert(await h.travel(-1,null,async target=>{assert.equal(target.view_id,3);assert.equal(target.scroll_top,10);return target;}));
 assert(await h.travel(1,null,async target=>{assert.equal(target.view_id,3);assert.equal(target.scroll_top,800);return target;}));
 assert(await h.travel(1,null,async target=>{assert.equal(target.view_id,2);return target;}));
}
for (const rounds of [20,100,1000]) {
 for (const kind of [undefined,'source','git']) {
  const h=create_reading_history();
  let a={...location('a',120),kind,view_id:1},b={...location('b',230),kind,view_id:2};
  h.record_jump(a,b);
  for(let i=0;i<rounds;i++) {
   assert.equal(await h.travel(-1,null,async target=>({...target,file_path:'wrong',view_id:999})),false,'错误资源不能提交');
   assert.equal(await h.travel(-1,null,async()=>false),false,'文件删除/取消不消费历史');
   assert(await h.travel(-1,null,async target=>{a={...target,view_id:3+i*2};return a;}));
   h.record_selection(a);assert(h.can_travel(1));assert(!h.can_travel(-1));
   assert(await h.travel(1,null,async target=>{b={...target,view_id:4+i*2};return b;}));
   h.record_selection(b);assert(h.can_travel(-1));assert(!h.can_travel(1));
   assert.equal(a.scroll_top,120);assert.equal(b.scroll_top,230);
  }
 }
 console.log(`closed views: ${rounds} reopen/back/forward rounds per Markdown/source/Git, missing/invalid targets and empty editor passed`);
}
const stale=create_reading_history();stale.record_jump(source(10),source(30));
let complete_stale;
const stale_travel=stale.travel(-1,null,()=>new Promise(resolve=>complete_stale=resolve));
stale.clear();stale.record_jump(source(50,5),source(70,7));
complete_stale(source(10,100));assert.equal(await stale_travel,false);
assert(await stale.travel(-1,null,async target=>{assert.equal(target.view_id,5);return target;}),'迟到重开身份不能污染新工程');
