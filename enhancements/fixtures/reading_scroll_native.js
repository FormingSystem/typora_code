// R071.5/R083: native performance transitions and shared Markdown presentation.
(async () => {
 const fs = reqnode('fs'), path = reqnode('path'), base = __CASE_ROOT__;
 const core = window[Symbol.for('typora-code:workspace')];
 const files = core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const events = [], samples = [], checks = [], cleanups = [], transitions=[];
 const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
 const wait = async (test, label) => { for (let index = 0; index < 300; index++) { if (test()) return; await pause(30); } throw Error(label); };
 const assert = (value, label) => { if (!value) throw Error(label); checks.push(label); };
 let owner, phase = 'opening', input_id = 0, last_input = 0, frame = 0;
 const record = (kind, detail = {}) => { if (events.length < 2000) events.push({time: performance.now(), phase, kind, top: owner?.scrollTop, ...detail}); };
 try {
  reqnode(path.join(_options.userDataPath, 'typora_code/assets/update/workspace_update_service.cjs')).check_update = async () => undefined;
  await wait(() => fs.existsSync(path.join(base, 'window_bounds_ready.json')), 'native window ready');
  const source = path.join(base, 'workspace/reading_scroll.md');
  const generated_text = '# Reading scroll investigation\n\n' + 'Initial paragraph with a retained native selection.\n\n'.repeat(12)
   + Array.from({length: 160}, (_, block) => '## Section ' + block + '\n\n```c\n'
     + Array.from({length: block < 2 ? 60 : 6}, (_, line) => 'int example_' + block + '_' + line + ' = ' + line + ';').join('\n')
     + '\n```\n\n' + 'Reading paragraph after this code block.\n\n'.repeat(block < 2 ? 18 : 1)).join('\n');
  const reproduction = path.join(base, 'workspace/repro.md');
  const text = fs.existsSync(reproduction) ? fs.readFileSync(reproduction, 'utf8') : generated_text;
  const dismiss_guide = () => Array.from(document.querySelectorAll('.workspace-onboarding button')).find(node => /^(跳过|Skip)$/.test(node.textContent.trim()))?.click();
  dismiss_guide();
  fs.writeFileSync(source, text, 'utf8');
  await files.open_file(source);
  await wait(() => document.querySelector('#write .md-fences'), 'native code fence');
  await pause(1600); dismiss_guide(); await pause(150);
  owner = document.querySelector('content');
  const original_text = File.editor.getMarkdown();
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  Object.defineProperty(Element.prototype, 'scrollTop', {...descriptor, set(value) {
   if (this === owner && Math.abs(value - descriptor.get.call(this)) > .5) record('scroll_write', {requested: value, stack: new Error().stack});
   descriptor.set.call(this, value);
  }});
  cleanups.push(() => Object.defineProperty(Element.prototype, 'scrollTop', descriptor));
  for (const [prototype, name] of [[Element.prototype, 'scrollIntoView'], [Element.prototype, 'scrollIntoViewIfNeeded'], [HTMLElement.prototype, 'focus']]) {
   const original = prototype[name]; if (!original) continue;
   prototype[name] = function (...args) { if (this === owner || owner.contains(this)) record(name, {target: this.outerHTML.slice(0, 180), stack: new Error().stack}); return original.apply(this, args); };
   cleanups.push(() => { prototype[name] = original; });
  }
  const selection = File.editor.selection, original_adjust = selection.scrollAdjust;
  selection.scrollAdjust = function (...args) { record('native_scroll_adjust', {stack: new Error().stack}); return original_adjust.apply(this, args); };
  cleanups.push(() => { selection.scrollAdjust = original_adjust; });
  const busy_original=File.editor.tryEnterBusyMode;
  File.editor.tryEnterBusyMode=function(...args){const before=owner.scrollTop, mode=File.inBusyMode;const result=busy_original.apply(this,args);if(mode!==File.inBusyMode)transitions.push({phase,before,after:owner.scrollTop,busy:File.inBusyMode});return result;};
  cleanups.push(()=>{File.editor.tryEnterBusyMode=busy_original;});
  const input = event => { if (event.isTrusted) { last_input = performance.now(); record(event.type, {target: event.target?.className, delta: event.deltaY}); } };
  document.addEventListener('wheel', input, true); document.addEventListener('click', input, true);
  cleanups.push(() => { document.removeEventListener('wheel', input, true); document.removeEventListener('click', input, true); });
  let prior = owner.scrollTop;
  const sample = () => { if (Math.abs(owner.scrollTop - prior) > .5) { samples.push({time: performance.now(), phase, top: owner.scrollTop, delta: owner.scrollTop - prior, input_age: performance.now() - last_input}); prior = owner.scrollTop; } frame = requestAnimationFrame(sample); };
  frame = requestAnimationFrame(sample); cleanups.push(() => cancelAnimationFrame(frame));
  const native_input = async (kind, target, delta) => {
   const rect = target.getBoundingClientRect(), viewport = owner.getBoundingClientRect(), id = ++input_id;
   const x = kind === 'click' ? rect.left + rect.width / 2 : viewport.left + 12;
   const y = kind === 'click' ? rect.top + rect.height / 2 : viewport.top + viewport.height / 2;
   fs.writeFileSync(path.join(base, 'native_input_request.json'), JSON.stringify({id, kind, delta, x, y, width: innerWidth, height: innerHeight}));
   await wait(() => { try { return JSON.parse(fs.readFileSync(path.join(base, 'native_input_result.json'), 'utf8').replace(/^\uFEFF/, '')).id === id; } catch { return false; } }, 'native input receipt');
   await pause(130);
  };
  phase = 'initial_selection';
  const fence = Array.from(document.querySelectorAll('#write .md-fences')).find(node => node.textContent.includes('Level 0') && node.textContent.includes('Level 4')) || document.querySelector('#write .md-fences');
  const paragraph = fence.previousElementSibling; paragraph.scrollIntoView({block:'center'}); await pause(250);
  await native_input('click', paragraph);
  await wait(() => fence.querySelector('.linux-note-code-toggle'), 'target fence button');
  const button = fence.querySelector('.linux-note-code-toggle');
  phase = 'position_button'; owner.scrollTop += button.getBoundingClientRect().top - owner.getBoundingClientRect().top - 180; await pause(250);
  phase = 'expand'; await native_input('click', button);
  assert(fence.classList.contains('is-code-expanded'), 'trusted click expands native code');
  phase = 'wheel_down'; for (let index = 0; index < 35; index++) await native_input('wheel', owner, -120);
  phase = 'idle_after_down'; record('idle_start'); await pause(15000); record('idle_end');
  phase = 'wheel_up'; for (let index = 0; index < 12; index++) await native_input('wheel', owner, 120);
  phase = 'idle_after_up'; record('idle_start'); await pause(7000); record('idle_end');
  phase = 'lazy_native_fences';
  File.editor.useIMEKeyboard = true;
  File.option.showLineNumbersForFence = true;
  record('native_cost_before', {busy:File.inBusyMode, html:File.editor.writingArea.innerHTML.length, cm:document.querySelectorAll('#write .CodeMirror').length});
  for (const node of document.querySelectorAll('#write .md-fences[cid]')) File.editor.fences.addCodeBlock(node.getAttribute('cid'));
  await pause(3000);
  record('native_cost_after', {busy:File.inBusyMode, html:File.editor.writingArea.innerHTML.length, cm:document.querySelectorAll('#write .CodeMirror').length});
  assert(File.inBusyMode===true,'native DOM threshold enters performance mode');
  assert(transitions.some(item=>item.phase==='lazy_native_fences'&&item.busy),'automatic delayed performance transition observed');
  assert(transitions.every(item=>Math.abs(item.before-item.after)<1),'passive native transitions preserve the current viewport');
  phase = 'native_busy_transition';
  File.editor.tryEnterBusyMode(undefined, undefined, false); await pause(100);
  File.editor.tryEnterBusyMode(undefined, undefined, true); await pause(500);
  assert(transitions.every(item=>Math.abs(item.before-item.after)<1),'explicit performance transition probes also retain viewport');
  phase = 'source_switch';
  const sidebar = core.app.workspace.sidebar;
  const outline_panel = sidebar.panels.find(panel => panel.ribbonButton?.id === 'core.outline');
  if (outline_panel) sidebar.switch(outline_panel.constructor); sidebar.show(); await pause(200);
  const fence_cm=fence.querySelector('.CodeMirror').CodeMirror, fence_line=Math.min(30,fence_cm.lineCount()-1);
  const center=()=>{const rect=owner.getBoundingClientRect();return rect.top+rect.height/2;};
  owner.scrollTop+=fence_cm.charCoords({line:fence_line,ch:0},'window').top-center();await pause(250);
  const expected_line=text.replace(/\r\n?/g,'\n').slice(0,text.replace(/\r\n?/g,'\n').indexOf(fence_cm.getValue().replace(/\r\n?/g,'\n'))).split('\n').length-1+fence_line;
  File.editor.sourceView.prep();
  const source_scroll=File.editor.sourceView.cm.scrollTo;
  File.editor.sourceView.cm.scrollTo=function(...args){record('source_scroll',{args,stack:new Error().stack});return source_scroll.apply(this,args);};
  cleanups.push(()=>{File.editor.sourceView.cm.scrollTo=source_scroll;});
  record('before_source', {focus_cid: File.editor.focusCid, active: document.activeElement?.outerHTML.slice(0, 300), center: document.elementFromPoint(owner.getBoundingClientRect().left + owner.clientWidth / 2, innerHeight / 2)?.outerHTML.slice(0, 500)});
  record('line_mapping_input',{expected_line,fence_line,serialized:File.editor.getNode(fence.getAttribute('cid')).toMark(),code:fence_cm.getValue(),rect:fence.getBoundingClientRect().toJSON()});
  File.toggleSourceMode(); await pause(1500);
  const cm = File.editor.sourceView.cm;
  assert(document.body.classList.contains('pin-outline')&&getComputedStyle(document.querySelector('.typ-ribbon')).display!=='none','source mode retains the activity bar and outline sidebar');
  const source_box=document.querySelector('#typora-source').getBoundingClientRect(),owner_box=owner.getBoundingClientRect();
  assert(['left','top','width','height'].every(key=>Math.abs(source_box[key]-owner_box[key])<1),'source and rendered modes share the editor group rectangle');
  record('line_mapping_result',{expected_line,actual_line:cm.coordsChar({left:0,top:cm.getScrollInfo().top+cm.getScrollInfo().clientHeight/2},'local').line,scroll:cm.getScrollInfo(),cursor:cm.getCursor()});
  assert(Math.abs(cm.coordsChar({left:0,top:cm.getScrollInfo().top+cm.getScrollInfo().clientHeight/2},'local').line-expected_line)<=2,'source viewport maps the currently visible fence line instead of the old cursor');
  const bounds = selector => {const node = document.querySelector(selector), r = node?.getBoundingClientRect(); return {rect:r?.toJSON(),display:node&&getComputedStyle(node).display,padding:node&&getComputedStyle(node).padding};};
  record('source_position', {cursor: cm.getCursor(), scroll: cm.getScrollInfo(), center_line: cm.coordsChar({left: 0, top: cm.getScrollInfo().top + cm.getScrollInfo().clientHeight / 2}, 'local').line, body_class: document.body.className, geometry: Object.fromEntries(['content','#typora-source','.typ-ribbon','#typora-sidebar','#toggle-sourceview-btn','#toggle-sourceview-btn svg'].map(selector=>[selector,bounds(selector)]))});
  File.toggleSourceMode(); await pause(1500); record('after_source');
  assert(Math.abs(fence_cm.charCoords({line:fence_line,ch:0},'window').top-center())<70,'return to rendered Markdown preserves the visible code line');
  for(let index=0;index<20;index++){File.toggleSourceMode();await pause(30);File.toggleSourceMode();await pause(30);assert(document.body.classList.contains('pin-outline'),'mode cycle '+(index+1)+' retains sidebar');}
  File.toggleSourceMode();await pause(300);
  await wait(()=>document.querySelectorAll('.workspace-source-outline .workspace-source-symbol-label').length>0,'source outline titles');
  const heading=document.querySelectorAll('.workspace-source-outline .workspace-source-symbol-label')[2];
  heading.click();await pause(50);assert(cm.getLine(cm.getCursor().line).includes(heading.textContent.trim()),'shared outline navigates the native source editor');
  const first_line=cm.getCursor().line;
  document.querySelectorAll('.workspace-source-outline .workspace-source-symbol-label')[12].click();await pause(100);
  const second_line=cm.getCursor().line;
  window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:-1}}));await pause(600);
  assert(cm.getCursor().line===first_line,'shared history returns to the previous native source heading');
  window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:1}}));await pause(600);
  assert(cm.getCursor().line===second_line,'shared history advances to the native source heading');
  const original_source=cm.getValue();cm.replaceRange('\n\n# Native outline edit probe\n',{line:cm.lineCount()-1,ch:cm.getLine(cm.lineCount()-1).length});await pause(250);
  assert([...document.querySelectorAll('.workspace-source-symbol-label')].some(node=>node.textContent==='Native outline edit probe'),'source outline reads current memory after editing');
  cm.undo();await pause(250);assert(cm.getValue()===original_source,'source edit undo preserved');
  for(const theme of ['vscode2026_dark.css','vscode2026_light.css']){
   ClientCommand.setTheme(theme,theme);await pause(600);
   for(const zoom of [1,1.25]){
    reqnode('electron').webFrame.setZoomFactor(zoom);await pause(250);
    const button=document.querySelector('#toggle-sourceview-btn'),icon=button.querySelector('svg'),b=button.getBoundingClientRect(),i=icon.getBoundingClientRect();
    assert(b.width>0&&i.width>0&&i.left>=b.left&&i.right<=b.right&&Math.abs((i.left+i.right-b.left-b.right)/2)<.6&&Math.abs((i.top+i.bottom-b.top-b.bottom)/2)<.6,theme+' '+zoom+' source icon complete and centered');
    const s=document.querySelector('#typora-source').getBoundingClientRect(),c=owner.getBoundingClientRect();
    assert(['left','top','width','height'].every(key=>Math.abs(s[key]-c[key])<1),theme+' '+zoom+' shared source frame');
   }
   const stage=theme.includes('dark')?'source_dark':'source_light';
   fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage}));
   await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage===stage;}catch{return false;}},'source screenshot');
  }
  sidebar.hide();await pause(80);assert(!document.body.classList.contains('pin-outline'),'explicit sidebar hiding works in source mode');
  File.toggleSourceMode();await pause(100);File.toggleSourceMode();await pause(100);
  assert(!document.body.classList.contains('pin-outline'),'native command keeps an explicitly hidden sidebar hidden');
  sidebar.show();await pause(80);assert(document.body.classList.contains('pin-outline'),'explicit sidebar reopening works in source mode');
  assert(document.querySelector('.workspace-source-outline-toolbar button').getBoundingClientRect().width===0,'native Markdown outline does not expose unrelated parser configuration');
  const current_leaf=core.app.workspace.activeLeaf,current_group=current_leaf.parent;
  const destination=core.split_workspace_group(current_leaf,'right');core.move_workspace_leaf(current_leaf,destination,0);await pause(300);
  const split_source=document.querySelector('#typora-source').getBoundingClientRect(),split_owner=owner.getBoundingClientRect();
  assert(File.editor.sourceView.inSourceMode&&['left','top','width','height'].every(key=>Math.abs(split_source[key]-split_owner[key])<1),'source frame follows the actual split group');
  core.move_workspace_leaf(current_leaf,current_group,current_group.children.length);await pause(250);
  document.querySelector('#toggle-sourceview-btn').click();await pause(100);assert(!File.editor.sourceView.inSourceMode,'native footer uses the common presentation command');
  document.querySelector('#toggle-sourceview-btn').click();await pause(100);assert(File.editor.sourceView.inSourceMode,'native footer returns to source without hiding the sidebar');
  File.toggleSourceMode();await pause(400);
  const rendered_heading=document.querySelectorAll('#write h1,#write h2,#write h3')[2];
  rendered_heading.scrollIntoView({block:'center'});await pause(100);await native_input('click',rendered_heading);await pause(200);
  window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:-1}}));await pause(700);
  assert(File.editor.sourceView.inSourceMode,'history restores the source presentation from rendered Markdown');
  window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:1}}));await pause(700);
  assert(!File.editor.sourceView.inSourceMode,'history restores rendered Markdown from source without waiting on a hidden view');
  assert(events.filter(event => event.kind === 'wheel').length >= 47, 'trusted wheel events received');
  assert(File.editor.getMarkdown() === original_text && fs.readFileSync(source, 'utf8') === text, 'document unchanged');
  fs.writeFileSync(path.join(base, 'checks.json'), JSON.stringify({status: 'PASS', checks, events, samples,transitions}, null, 2));
 } catch (error) {
  fs.writeFileSync(path.join(base, 'checks.json'), JSON.stringify({status: 'ERROR', error: String(error.stack || error), checks, events, samples,transitions}, null, 2));
 } finally { for (const cleanup of cleanups.reverse()) cleanup(); }
})();
