// 在启动器临时目录中验证真正的 Typora Markdown 行列映射、选区和阅读历史。
(() => {
  const script_url = new URL(document.currentScript.src);
  const root = decodeURIComponent(script_url.pathname).replace(/^\/(\w:)/u, '$1').replace(/\/workspace_markdown_location_native_test.js$/u, '');
  const result = {checks: []}; const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value).replace(/\\/gu, '/').toLowerCase();
  const expect = (value, message) => { if (!value) throw new Error(message); result.checks.push(message); };
  const wait = async (ready, message) => { const started = Date.now(); while (!ready()) { if (Date.now() - started > 16000) throw new Error(message); await delay(50); } };
  const run = async () => {
    await wait(() => window.File?.bundle?.filePath, '原生文档未就绪'); if (norm(File.bundle.filePath) !== norm(root + '/source.md')) return;
    const fs = reqnode('fs'), path = reqnode('path'), original_mount = File.getMountFolder;
    const source_path = path.join(root, 'source.md'), target_path = path.join(root, 'location.md'), code_path = path.join(root, 'location.ts');
    const original_source = fs.readFileSync(source_path); let app, panel;
    const target_text = '# Native location\n\n' + Array.from({length: 80}, (_, index) => `Paragraph ${index}.\n\n`).join('')
      + '## native_heading_probe\n\nFirst **native_paragraph_probe** occurrence.\n\nSecond native_paragraph_probe occurrence.\n\n```c\nvoid demo(void) {\n\tnative_code_probe(); native_code_probe();\n}\n```\n';
    fs.writeFileSync(target_path, target_text); fs.writeFileSync(code_path, 'const source_location = 1;\n');
    const leaves = () => { const all = []; app.workspace.eachLeaves(leaf => { all.push(leaf); }); return all; };
    const selection = () => document.activeElement?.closest('.CodeMirror')?.CodeMirror?.getSelection() ?? window.getSelection()?.toString();
    const request = async query => {
      window.dispatchEvent(new CustomEvent('linux-note-search-selection', {detail: {query, source_path}}));
      await wait(() => panel.dataset.state === 'ready' && panel.querySelector('[aria-label="搜索内容"]').value === query, '跳转查找未完成');
      return [...panel.querySelectorAll('.workspace-search-match')];
    };
    const double_click = node => { node.click(); node.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, cancelable: true})); };
    const native_target = () => norm(File.bundle.filePath) === norm(target_path) && norm(app.workspace.activeLeaf?.state.path) === norm(target_path) && app.workspace.activeLeaf?.view.isEditor?.();
    const key = direction => window.dispatchEvent(new KeyboardEvent('keydown', {key: direction, code: direction, altKey: true, bubbles: true, cancelable: true}));
    try {
      await wait(() => document.documentElement.dataset.linuxNoteWorkspaceBrowser === 'ready', '工作区未就绪');
      app = window[Symbol.for('typora-code:workspace')].app; File.getMountFolder = () => root;
      app.workspace.ribbon.clickButton('core.search');
      await wait(() => document.querySelector('.linux-note-workspace-search #linux-note-search-include'), '搜索包含输入框未就绪');
      panel = document.querySelector('.linux-note-workspace-search'); panel.querySelector('#linux-note-search-include').value = 'location.md';
      const source_leaf = app.workspace.activeLeaf, content = document.querySelector('content'); content.scrollTop = 700; await delay(350); const source_top = content.scrollTop;
      let rows = await request('native_heading_probe');
      expect(rows.length === 1 && app.workspace.activeLeaf === source_leaf && content.scrollTop === source_top, '唯一 Markdown 命中只预览，保留来源标签和阅读位置');
      double_click(rows[0]);
      await wait(() => native_target() && selection() === 'native_heading_probe', '标题双击没有在原生 Markdown 中精确选中；' + panel.querySelector('.workspace-search-status').textContent);
      expect(!File.editor.sourceView.inSourceMode && !app.workspace.activeLeaf.view.editor?.models, 'Markdown 双击使用原生渲染视图，不创建 Monaco 源码模型');
      expect(window.getSelection().anchorNode.parentElement.closest('h2')?.textContent.includes('native_heading_probe'), '标题匹配在原生 h2 中选中');
      const target_leaf = app.workspace.activeLeaf; await delay(350); key('ArrowLeft');
      await wait(() => app.workspace.activeLeaf === source_leaf && norm(File.bundle.filePath) === norm(source_path), 'Alt 左箭头未回到来源 Markdown'); await delay(450);
      expect(Math.abs(content.scrollTop - source_top) < 3, '原生跳转后退恢复来源阅读位置');
      key('ArrowRight'); await wait(() => native_target() && selection() === 'native_heading_probe', 'Alt 右箭头未恢复标题命中');
      expect(app.workspace.activeLeaf === target_leaf, '前进复用既有 Markdown 标签和选区');
      rows = await request('native_paragraph_probe'); expect(rows.length === 2, '相同正文关键词的两个出现位置均列出');
      double_click(rows[1]); await wait(() => native_target() && selection() === 'native_paragraph_probe', '第二处正文命中未选中');
      expect(window.getSelection().anchorNode.parentElement.closest('p')?.textContent.startsWith('Second '), '相同关键词按行列选中第二个段落');
      double_click(rows[0]); await wait(() => window.getSelection().anchorNode?.parentElement?.closest('p')?.textContent.startsWith('First ') && selection() === 'native_paragraph_probe', '粗体中的第一处正文命中未选中');
      const strong = window.getSelection().anchorNode.parentElement.closest('p').querySelector('strong');
      expect(Boolean(strong) && window.getSelection().getRangeAt(0).intersectsNode(strong) && selection() === strong.textContent, '粗体正文使用原生隐藏标记映射且精确选择内容');
      rows = await request('native_code_probe'); expect(rows.length === 2, '围栏同行两个代码命中均列出'); double_click(rows[1]);
      await wait(() => native_target() && selection() === 'native_code_probe' && document.activeElement?.closest('.CodeMirror'), '围栏第二处关键词未定位到原生 CodeMirror');
      const cm = document.activeElement.closest('.CodeMirror').CodeMirror;
      expect(cm.getCursor('from').line === 1 && cm.getCursor('from').ch === '\tnative_code_probe(); '.length, '原生代码围栏保留制表符，精确选中同行第二次出现');
      expect(leaves().filter(leaf => norm(leaf.state.path) === norm(target_path)).length === 1 && app.workspace.activeLeaf === target_leaf, '多次正文及围栏跳转始终复用同一个原生标签');
      await app.openFile(code_path); await wait(() => app.workspace.activeLeaf.view.loaded && norm(app.workspace.activeLeaf.view.file_path) === norm(code_path), '普通源码标签未打开');
      expect(norm(File.bundle.filePath) === norm(target_path), '工具标签激活时原生 bundle 仍保存 Markdown 路径');
      await app.openFile(target_path); await wait(() => native_target(), '相同 bundle 路径未能从工具标签激活既有 Markdown');
      expect(app.workspace.activeLeaf === target_leaf, '从源码工具标签打开相同 Markdown 路径会激活既有原生标签');
      const source_uri = `typ://linux_note.source_file/${encodeURIComponent(target_path)}`;
      const source_view_leaf = app.workspace.createLeaf({type: 'linux_note.source_file', state: {path: source_uri, git_cwd: root}});
      target_leaf.parent.appendChild(source_view_leaf); app.workspace.activeLeaf = source_view_leaf;
      await wait(() => source_view_leaf.view.loaded, 'Markdown 源码草稿用例未加载');
      const source_editor = source_view_leaf.view.editor.focused_editor(); source_editor.pushUndoStop(); source_editor.setPosition({lineNumber: 1, column: 1}); source_editor.trigger('keyboard', 'type', {text: 'X'}); source_editor.pushUndoStop(); await delay(50);
      rows = await request('native_heading_probe'); double_click(rows[0]);
      await wait(() => panel.querySelector('.workspace-search-status').textContent.includes('源码标签有未保存修改'), '未保存 Markdown 源码没有阻止打开旧磁盘渲染');
      expect(app.workspace.activeLeaf === source_view_leaf && source_view_leaf.view.dirty() && source_editor.getModel().getValue().startsWith('X# Native location'), '打开原生 Markdown 前保护源码标签草稿，保留活跃模型和输入');
      await source_editor.getModel().undo(); await delay(50); expect(!source_view_leaf.view.dirty(), '撤销测试输入恢复原有源码保存点');
      source_view_leaf.parent.removeTab(source_uri); await app.openFile(target_path); await wait(native_target, '草稿清理后未恢复原生 Markdown');
      expect(fs.readFileSync(target_path, 'utf8') === target_text && fs.readFileSync(source_path).equals(original_source) && !File.changeCounter.isDocumentEdited(), '所有定位保留正文磁盘字节且不制造未保存修改');
      result.status = 'PASS';
    } catch (error) {
      result.status = 'FAIL'; result.error = String(error.stack); result.active = app?.workspace.activeLeaf?.state.path; result.status_text = panel?.querySelector('.workspace-search-status')?.textContent;
      result.selection = selection(); result.cursor = File.editor.selection.buildUndo(); result.markdown = File.editor.getMarkdown();
      fs.writeFileSync(path.join(root, 'sidebar_failure.html'), document.querySelector('#sidebar-content')?.outerHTML || '', 'utf8');
      fs.writeFileSync(path.join(root, 'location_failure.html'), document.querySelector('#write')?.outerHTML || '', 'utf8');
    } finally {
      if (app) for (const leaf of leaves()) if (norm(leaf.view.file_path) === norm(target_path)) {
        leaf.parent.removeTab(leaf.state.path);
        const dialog = [...document.querySelectorAll('.git-graph-dialog-shade')].find(node => node.getAttribute('aria-label') === '保存文件修改');
        [...dialog?.querySelectorAll('button') || []].find(button => button.textContent === '不保存并关闭')?.click();
      }
      File.getMountFolder = original_mount; fs.writeFileSync(path.join(root, 'result_1.json'), JSON.stringify(result, null, 2)); window.close();
    }
  }; void run();
})();
