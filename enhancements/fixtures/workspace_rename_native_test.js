// 仅在启动器的临时目录中检查重命名、真实核心标签与未保存源码模型。
(() => {
  const script_url = new URL(document.currentScript.src);
  const root = decodeURIComponent(script_url.pathname).replace(/^\/(\w:)/u, '$1').replace(/\/workspace_rename_native_test.js$/u, '');
  const result = {checks: []}, delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value).replace(/\\/gu, '/').toLowerCase();
  const wait = async (ready, message) => { const start = Date.now(); while (!ready()) { if (Date.now() - start > 14000) throw new Error(message); await delay(40); } };
  const expect = (value, message) => { if (!value) throw new Error(message); result.checks.push(message); };
  const within = (promise, message) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), 14000))]);
  const run = async () => {
    await wait(() => window.File?.bundle?.filePath && norm(File.bundle.filePath) === norm(root + '/source.md'), '原生测试文档未切换到启动路径');
    const fs = reqnode('fs'), path = reqnode('path'), original_mount = File.getMountFolder;
    const original_source = fs.readFileSync(path.join(root, 'source.md')); let app;
    const leaf_list = () => { const leaves = []; app.workspace.eachLeaves(leaf => { leaves.push(leaf); }); return leaves; };
    const row = filename => [...document.querySelectorAll('.workspace-explorer-row')].find(node => norm(node.dataset.path) === norm(path.join(root, filename)));
    const key = (target, value) => target.dispatchEvent(new KeyboardEvent('keydown', {key: value, bubbles: true, cancelable: true}));
    const refresh = async () => { document.querySelector('[aria-label="刷新资源管理器"]').click(); await delay(250); };
    const rename = async (filename, next, method = 'key') => {
      if (!document.querySelector('.linux-note-workspace-explorer')) app.workspace.ribbon.clickButton('core.file-explorer');
      await wait(() => document.querySelector('.linux-note-workspace-explorer'), '资源管理器未显示');
      await refresh(); await wait(() => row(filename), '找不到待改名行 ' + filename);
      const selected = row(filename); selected.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}));
      const item = [...document.querySelectorAll('[role="menu"] button')].find(button => button.textContent === '重命名（F2）');
      if (method === 'menu') item.click();
      else { key(document.querySelector('[role="menu"]'), 'Escape'); document.querySelector('[role="menu"]')?.remove(); key(document.querySelector('.workspace-explorer-tree'), 'F2'); }
      await wait(() => document.querySelector('.workspace-explorer-rename'), '重命名输入框未显示');
      const input = document.querySelector('.workspace-explorer-rename'); input.value = next; key(input, 'Enter');
      await wait(() => !document.querySelector('.workspace-explorer-rename') || document.querySelector('.workspace-explorer-rename[aria-invalid="true"]'), '重命名未结束');
      if (document.querySelector('.workspace-explorer-rename')) throw new Error(document.querySelector('.workspace-explorer-status').textContent);
    };
    try {
      await wait(() => document.documentElement.dataset.linuxNoteWorkspaceBrowser === 'ready', '工作区未就绪');
      app = window[Symbol.for('typora-code:workspace')].app; File.getMountFolder = () => root;
      fs.writeFileSync(path.join(root, 'rename.md'), '# Rename\n\n' + Array.from({length: 80}, (_, index) => `Paragraph ${index}.\n\n`).join(''));
      fs.writeFileSync(path.join(root, 'draft.ts'), '\ufeffconst value = 1;\r\n');
      fs.mkdirSync(path.join(root, 'a')); fs.mkdirSync(path.join(root, 'abc'));
      fs.writeFileSync(path.join(root, 'a', 'inside.md'), '# Inside\n\ncontent\n'); fs.writeFileSync(path.join(root, 'abc', 'inside.md'), '# Prefix sibling\n');
      await app.openFile(path.join(root, 'rename.md')); await wait(() => norm(File.bundle.filePath) === norm(path.join(root, 'rename.md')), 'Markdown 未打开');
      const native_leaf = app.workspace.activeLeaf; document.querySelector('content').scrollTop = 500; await delay(350); const original_top = document.querySelector('content').scrollTop, native_markdown = File.editor.getMarkdown();
      app.workspace.ribbon.clickButton('core.file-explorer'); await wait(() => row('rename.md'), '资源管理器未显示');
      await rename('rename.md', 'renamed.md'); await wait(() => norm(File.bundle.filePath) === norm(path.join(root, 'renamed.md')), '原生 bundle 未改名');
      expect(app.workspace.activeLeaf === native_leaf && norm(native_leaf.state.path) === norm(path.join(root, 'renamed.md')), 'Markdown 改名复用现有原生标签，不切换文档');
      expect(File.editor.getMarkdown() === native_markdown && !File.changeCounter.isDocumentEdited() && Math.abs(document.querySelector('content').scrollTop - original_top) < 3, 'Markdown 改名保留正文、阅读位置和保存状态');
      expect(!fs.existsSync(path.join(root, 'rename.md')) && fs.existsSync(path.join(root, 'renamed.md')), 'F2 确认后只修改临时文件名称');
      await app.openFile(path.join(root, 'draft.ts')); await wait(() => app.workspace.activeLeaf.view.loaded && app.workspace.activeLeaf.view.file_path?.endsWith('draft.ts'), '源码未加载');
      const source_leaf = app.workspace.activeLeaf, source_view = source_leaf.view, editor = source_view.editor.focused_editor(), model = editor.getModel();
      editor.pushUndoStop(); editor.setPosition({lineNumber: 1, column: 1}); editor.trigger('keyboard', 'type', {text: '// draft\n'}); editor.pushUndoStop(); await delay(40);
      const draft = model.getValue(); expect(source_view.dirty(), '建立未保存源码草稿');
      await rename('draft.ts', 'renamed_draft.ts', 'menu');
      expect(source_leaf === app.workspace.activeLeaf && source_view.editor.focused_editor().getModel() === model && model.getValue() === draft && source_view.dirty(), '右键改名保留同一 Monaco 模型、未保存草稿和活跃标签');
      expect(source_view.file_path === path.join(root, 'renamed_draft.ts') && source_view.text_document.file_path === source_view.file_path && decodeURIComponent(source_leaf.state.path).endsWith(source_view.file_path), '源码标签 URI、保存服务和显示路径全部迁移');
      expect(await source_view.save(), '改名后的草稿可以保存到新文件');
      expect(!fs.existsSync(path.join(root, 'draft.ts')) && fs.readFileSync(source_view.file_path).equals(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(draft.replace(/\r?\n/gu, '\r\n'))])), '保存保留 BOM/CRLF，未重建旧路径');
      await model.undo(); await delay(40); expect(source_view.dirty() && model.getValue() !== draft, '改名与保存不清空编辑器撤销栈'); await model.redo(); await delay(40);
      await app.openFile(path.join(root, 'abc', 'inside.md')); await wait(() => norm(File.bundle.filePath) === norm(path.join(root, 'abc', 'inside.md')), '同名前缀标签未打开'); const sibling = app.workspace.activeLeaf;
      await app.openFile(path.join(root, 'a', 'inside.md')); await wait(() => norm(File.bundle.filePath) === norm(path.join(root, 'a', 'inside.md')), '目录内 Markdown 未打开'); const child = app.workspace.activeLeaf;
      const before_directory_rename = leaf_list();
      result.before_directory_rename = before_directory_rename.map(leaf => ({path: leaf.state.path, original_native: leaf === native_leaf, source: leaf === source_leaf, sibling: leaf === sibling, child: leaf === child}));
      await rename('a', 'b', 'menu'); await wait(() => norm(File.bundle.filePath) === norm(path.join(root, 'b', 'inside.md')), '目录改名未迁移原生路径');
      expect(norm(child.state.path) === norm(path.join(root, 'b', 'inside.md')) && app.workspace.activeLeaf === child, '目录改名更新已打开子文件并保留原生标签');
      expect(norm(sibling.state.path) === norm(path.join(root, 'abc', 'inside.md')) && fs.existsSync(path.join(root, 'abc', 'inside.md')), '目录 a 改名不会误改同名前缀 abc 的文件和标签');
      result.after_directory_rename = leaf_list().map(leaf => ({path: leaf.state.path, original_native: leaf === native_leaf, source: leaf === source_leaf, sibling: leaf === sibling, child: leaf === child}));
      expect(leaf_list().filter(leaf => leaf === child || leaf === sibling || leaf === source_leaf || leaf === native_leaf).length === 4, '全部既有原生和源码标签保持对象身份');
      const held_path = path.join(root, 'held_target.ts'), candidate_path = path.join(root, 'rename_candidate.ts'), filler_path = path.join(root, 'guard_filler.ts');
      fs.writeFileSync(held_path, 'const held = 1;\n'); fs.writeFileSync(candidate_path, 'const candidate = 2;\n'); fs.writeFileSync(filler_path, 'const filler = 3;\n');
      await within(app.openFile(held_path), '打开冲突目标源码超时'); await wait(() => app.workspace.activeLeaf.view.loaded && app.workspace.activeLeaf.view.file_path === held_path, '冲突目标源码未打开');
      const held_leaf = app.workspace.activeLeaf, held_editor = held_leaf.view.editor.focused_editor(), held_model = held_editor.getModel();
      held_editor.pushUndoStop(); held_editor.setPosition({lineNumber: 1, column: 1}); held_editor.trigger('keyboard', 'type', {text: '// held draft\n'}); held_editor.pushUndoStop(); await delay(40);
      const held_draft = held_model.getValue(); fs.unlinkSync(held_path);
      await within(app.openFile(filler_path), '打开分栏填充源码超时'); await wait(() => app.workspace.activeLeaf.view.loaded && app.workspace.activeLeaf.view.file_path === filler_path, '旧组末尾填充标签未就绪');
      const candidate_uri = `typ://linux_note.source_file/${encodeURIComponent(candidate_path)}`;
      app.commands.run('core.workspace:split-right', [candidate_uri]);
      await wait(() => app.workspace.activeLeaf.view.loaded && app.workspace.activeLeaf.view.file_path === candidate_path, '右侧候选源码未打开');
      const candidate_leaf = app.workspace.activeLeaf, candidate_model = candidate_leaf.view.editor.focused_editor().getModel(), candidate_text = candidate_model.getValue();
      expect(candidate_leaf.parent !== held_leaf.parent && held_leaf.parent.children.at(-1) !== held_leaf && held_leaf.view.dirty(), '冲突草稿位于另一编辑组的非末尾标签，不能被短路枚举漏过');
      let conflict_message = ''; try { await rename('rename_candidate.ts', 'held_target.ts', 'menu'); } catch (error) { conflict_message = String(error.message); }
      result.conflict_message = conflict_message;
      expect(conflict_message.includes('目标名称已有打开的文档标签'), '磁盘目标虽不存在，仍拒绝覆盖后台打开的目标草稿路径');
      key(document.querySelector('.workspace-explorer-rename'), 'Escape');
      expect(leaf_list().includes(held_leaf) && held_leaf.view.editor.focused_editor().getModel() === held_model && held_model.getValue() === held_draft && held_leaf.view.dirty()
        && app.workspace.activeLeaf === candidate_leaf && candidate_model.getValue() === candidate_text && candidate_leaf.state.path === candidate_uri
        && !fs.existsSync(held_path) && fs.readFileSync(candidate_path, 'utf8') === 'const candidate = 2;\n', '多组路径冲突保留两个标签、两份内存内容及原磁盘文件');
      await within(held_model.undo(), '撤销冲突目标草稿超时');
      await delay(40);
      held_leaf.parent.removeTab(held_leaf.state.path);
      expect(fs.readFileSync(path.join(root, 'source.md')).equals(original_source), '原始测试来源文档没有写入');
      result.status = 'PASS';
    } catch (error) { result.status = 'FAIL'; result.error = String(error.stack); result.active = app?.workspace.activeLeaf?.state.path; result.native = File.bundle.filePath; result.explorer = document.querySelector('.linux-note-workspace-explorer')?.outerHTML; }
    finally {
      // 测试窗口直接释放临时源码模型；逐组 removeTab 会并发触发多个关闭确认并使夹具自身互锁。
      if (app) {
        for (const leaf of leaf_list()) {
          if (leaf.view.file_path && norm(leaf.view.file_path).startsWith(norm(root) + '/') && typeof leaf.view.release_source === 'function') {
            leaf.view.release_source();
          }
        }
      }
      File.getMountFolder = original_mount;
      fs.writeFileSync(path.join(root, 'result_1.json'), JSON.stringify(result, null, 2));
      window.close();
    }
  }; void run();
})();
