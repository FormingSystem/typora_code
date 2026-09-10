// 由 test_reading_native.ps1 注入专用测试窗口；仅访问该次测试的临时文件。
(() => {
  const script_url = new URL(document.currentScript.src);
  const probe_root = decodeURIComponent(script_url.pathname).replace(/^\/(\w:)/u, '$1').replace(/\/reading_native_test.js$/u, '');
  const phase = script_url.searchParams.get('phase');
  const expected_file = probe_root + (phase === '1' ? '/source.md' : '/target.md');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const normalized = path => path?.replace(/\\/gu, '/').toLowerCase();
  const result = { checks: [], errors: [] };
  const expect = (condition, message) => { if (!condition) throw new Error(message); result.checks.push(message); };
  const wait = async ready => {
    const started = Date.now();
    while (!ready()) { if (Date.now() - started > 12000) throw new Error('Timed out'); await delay(60); }
  };
  const visible = (scroller, root) => {
    const top = scroller.getBoundingClientRect().top;
    const node = [...root.children].find(child => child.getBoundingClientRect().bottom > top + 16);
    return { text: node?.textContent, offset: node?.getBoundingClientRect().top - top };
  };
  const same_position = (left, right) => left.text === right.text && Math.abs(left.offset - right.offset) < 3;
  const run = async () => {
    await wait(() => window.File?.bundle?.filePath);
    if (normalized(File.bundle.filePath) !== normalized(expected_file)) return;
    const fs = window.reqnode('fs');
    const path = window.reqnode('path');
    const crypto = window.reqnode('crypto');
    const digest = name => crypto.createHash('sha256').update(fs.readFileSync(path.join(probe_root, name))).digest('hex');
    const hashes = [digest('source.md'), digest('target.md')];
    try {
      await wait(() => document.documentElement.getAttribute('data-linux-note-reading-positions') === 'ready');
      const app = window[Symbol.for('typora-code:workspace')].app;
      const content = document.querySelector('content');
      const write = document.querySelector('#write');
      if (phase === '2') {
        // 模拟宿主延迟恢复选区：正文高度未变，但滚动再次回到 0；不能把它覆盖为新的阅读位置。
        await delay(80); const height = write.getBoundingClientRect().height;
        content.scrollTop = 0;
        expect(write.getBoundingClientRect().height === height, 'host scroll reset leaves document height unchanged');
      }
      await delay(700);
      if (phase === '1') {
        // 大纲通过正式命令打开独立原生视图，不依赖测试窗口遗留的侧栏状态。
        app.commands.run('linux_note:outline');
        await wait(() => { const pane=document.querySelector('#outline-content');return app.workspace.sidebar.isShown&&app.workspace.sidebar.activePanel?.ribbonButton?.id==='core.outline'&&pane&&pane.getBoundingClientRect().height>0&&pane.querySelector('.outline-label'); });
        const source = app.workspace.activeLeaf;
        await wait(() => document.querySelector('content > .linux-note-reading-minimap[data-ready=true]'));
        const minimap = document.querySelector('content > .linux-note-reading-minimap');
        expect(!write.contains(minimap) && minimap.querySelector('canvas').width > 0, 'native reading minimap is rendered outside saved document');
        minimap.dispatchEvent(new KeyboardEvent('keydown', {key:'End',bubbles:true,cancelable:true}));
        expect(content.scrollTop > content.scrollHeight - content.clientHeight - 3, 'native minimap can jump to document end');
        File.editor.sourceView.show();
        await wait(() => document.querySelector('.CodeMirror > .linux-note-reading-minimap[data-ready=true]'));
        const source_editor = File.editor.sourceView.cm;
        const source_text = source_editor.getValue(); const source_cursor = JSON.stringify(source_editor.getCursor());
        document.querySelector('.CodeMirror > .linux-note-reading-minimap').dispatchEvent(new KeyboardEvent('keydown', {key:'End',bubbles:true,cancelable:true}));
        expect(source_editor.getScrollInfo().top > 100, 'source mode minimap scrolls full CodeMirror document');
        expect(source_editor.getValue() === source_text && JSON.stringify(source_editor.getCursor()) === source_cursor, 'source minimap preserves text and cursor');
        File.editor.sourceView.hide();
        await wait(() => document.querySelector('content > .linux-note-reading-minimap[data-ready=true]') && !document.querySelector('.CodeMirror > .linux-note-reading-minimap'));
        await delay(500);
        content.scrollTop = 720; await delay(450);
        const source_position = visible(content, write);
        app.commands.run('core.workspace:split-right', [File.bundle.filePath]); await delay(700);
        const right_source = app.workspace.activeLeaf;
        await wait(() => document.querySelectorAll('.linux-note-reading-minimap[data-ready=true]').length === 2);
        expect(document.querySelectorAll('.linux-note-reading-minimap[data-ready=true]').length === 2, 'split reading panes have independent minimaps');
        right_source.containerEl.scrollTop = 300; await delay(450);
        const from_position = visible(right_source.containerEl, right_source.view.containerEl);
        const link = right_source.view.containerEl.querySelector('a');
        link.setAttribute('href', 'target.md#' + encodeURIComponent('13.7_目标_标题'));
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await wait(() => normalized(File.bundle.filePath) === normalized(path.join(probe_root, 'target.md'))); await delay(850);
        const heading = [...write.querySelectorAll('h2')].find(node => node.textContent === '13.7_目标_标题');
        expect(window.getSelection()?.focusNode?.parentElement?.closest('h2') === heading, 'link places cursor at destination heading');
        expect(heading.getBoundingClientRect().top >= content.getBoundingClientRect().top
          && heading.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom, 'destination heading is visible');
        await wait(() => document.querySelector('#outline-content .outline-active')?.getAttribute('data-ref') === heading.getAttribute('cid'));
        expect(document.querySelector('#outline-content .outline-active')?.getAttribute('data-ref') === heading.getAttribute('cid'), 'visible native Outline selects destination heading');
        expect(document.querySelector('#outline-content')?.textContent.includes('Destination'), 'outline belongs to destination document');
        expect(same_position(source_position, visible(source.containerEl, source.view.containerEl)), 'source pane keeps the same paragraph and offset');
        window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:-1}}));await delay(1000);
        expect(app.workspace.activeLeaf===right_source&&same_position(from_position,visible(content,write)),'Back navigation restores the exact prior pane and reading position');
        window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:1}}));await delay(1000);
        expect(normalized(File.bundle.filePath)===normalized(path.join(probe_root,'target.md')),'Forward navigation returns to the destination');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
        await delay(1000);
        expect(app.workspace.activeLeaf === right_source, 'Alt Left returns to the original pane and tab');
        expect(same_position(from_position, visible(content, write)), 'Alt Left restores original reading position');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
        await delay(1000);
        expect(normalized(File.bundle.filePath) === normalized(path.join(probe_root, 'target.md')), 'Alt Right returns to destination');
        content.scrollTop = 890; await delay(450);
        const resumed_position = visible(content, write);
        const target = app.workspace.activeLeaf;
        target.state.cursorOffset = 1e9;
        target.parent.removeTab(target.state.path); await delay(650);
        app.workspace.activeEditor.openFile(path.join(probe_root, 'target.md')); await delay(1200);
        expect(same_position(resumed_position, visible(content, write)), 'closing and reopening a tab resumes reading without stale cursor scroll');
        result.resumed_position = visible(content, write);
      } else {
        const prior = JSON.parse(fs.readFileSync(path.join(probe_root, 'result_1.json'), 'utf8'));
        // ready 表示事件已接入；排版及异步位置恢复可能仍在进行，等待可观察的阅读位置。
        await wait(() => same_position(prior.resumed_position, visible(content, write)));
        await delay(350);
        result.resume = { expected: prior.resumed_position, actual: visible(content, write), scroll_top: content.scrollTop,
          stored: localStorage.getItem('linux-note-reading-position:v1:' + encodeURIComponent(normalized(File.bundle.filePath))) };
        expect(same_position(prior.resumed_position, visible(content, write)), 'new window resumes persisted reading position');
        // 仅移除本次测试两个临时文件的键，保留用户所有实际文档的阅读记录。
        for (const name of ['source.md', 'target.md']) localStorage.removeItem('linux-note-reading-position:v1:' + encodeURIComponent(normalized(path.join(probe_root, name))));
      }
      expect(hashes[0] === digest('source.md') && hashes[1] === digest('target.md'), 'Markdown sources remain unchanged');
      result.status = 'PASS';
    } catch (error) {
      result.status = 'FAIL'; result.error = String(error.stack);
      result.outline_debug = {native:document.querySelector('#outline-content')?.getBoundingClientRect().toJSON(),document_active:document.querySelector('#typora-sidebar')?.dataset.documentOutline,active:document.querySelector('#outline-content .outline-active')?.outerHTML,labels:document.querySelectorAll('#outline-content .outline-label').length,sidebar:document.querySelector('#typora-sidebar')?.className};
      result.resume_debug = { phase, actual: visible(document.querySelector('content'), document.querySelector('#write')),
        scroll_top: document.querySelector('content').scrollTop,
        stored: localStorage.getItem('linux-note-reading-position:v1:' + encodeURIComponent(normalized(File.bundle.filePath))) };
    }
    finally {
      fs.writeFileSync(path.join(probe_root, `result_${phase}.json`), JSON.stringify(result, null, 2));
      window.close();
    }
  };
  void run();
})();
