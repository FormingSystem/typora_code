// 只在安装测试生成的临时窗口中运行；用桥接替身核对复制文本，保留系统剪贴板原内容。
(() => {
  const script_url = new URL(document.currentScript.src);
  const probe_root = decodeURIComponent(script_url.pathname).replace(/^\/(\w:)/u, '$1').replace(/\/file_path_native_test.js$/u, '');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const normalized = path => path?.replace(/\\/gu, '/').toLowerCase();
  const result = { checks: [] };
  const expect = (condition, message) => { if (!condition) throw new Error(message); result.checks.push(message); };
  const wait = async ready => {
    const started = Date.now();
    while (!ready()) { if (Date.now() - started > 12000) throw new Error('Timed out'); await delay(60); }
  };
  const key = (code, modifiers = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: code, code, ...modifiers, bubbles: true, cancelable: true }));
  const click = element => {
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
  };
  const run = async () => {
    await wait(() => window.File?.bundle?.filePath);
    if (normalized(File.bundle.filePath) !== normalized(probe_root + '/source.md')) return;
    const fs = window.reqnode('fs');
    const path = window.reqnode('path');
    const original_invoke = JSBridge.invoke;
    const original_mount = File.getMountFolder;
    let copied = null;
    let copy_count = 0;
    try {
      await wait(() => document.documentElement.getAttribute('data-linux-note-copy-path') === 'ready');
      JSBridge.invoke = function (command, ...args) {
        if (command === 'clipboard.write') { copied = JSON.parse(args[0]).text; copy_count++; return Promise.resolve(); }
        return original_invoke.call(this, command, ...args);
      };
      // 只替换此测试窗口的根目录查询，不改变实际挂载目录及用户设置。
      File.getMountFolder = () => probe_root;
      const app = window[Symbol.for('typora-plugin-core@v2')].app;
      const source_path = File.bundle.filePath;
      const source_leaf = app.workspace.activeLeaf;
      const target_path = path.join(probe_root, 'target.md');
      const content = document.querySelector('content');
      content.scrollTop = 620; await delay(500);
      const before_scroll = content.scrollTop;
      const before_cursor = JSON.stringify(editor.selection.buildUndo());
      key('KeyK', { ctrlKey: true }); key('KeyP'); await delay(100);
      expect(copied === source_path, 'Ctrl K then P copies absolute path');
      key('KeyK', { ctrlKey: true }); key('KeyC', { ctrlKey: true, shiftKey: true }); await delay(100);
      expect(copied === 'source.md', 'Ctrl K then Ctrl Shift C copies workspace-relative path');
      key('KeyC', { altKey: true, shiftKey: true }); await delay(100);
      expect(copied === source_path, 'Shift Alt C copies absolute path');
      expect(content.scrollTop === before_scroll && JSON.stringify(editor.selection.buildUndo()) === before_cursor, 'copy shortcuts preserve selection and reading position');
      app.commands.run('core.workspace:split-right', [target_path]); await delay(700);
      const preview_leaf = app.workspace.activeLeaf;
      key('KeyK', { ctrlKey: true }); key('KeyP'); await delay(100);
      expect(copied === target_path && File.bundle.filePath === source_path, 'shortcut copies active preview path instead of global native editor path');
      const source_tab = [...document.querySelectorAll('.typ-tab')].find(node => node.getAttribute('data-id') === source_path);
      const open_tab_menu = async () => {
        source_tab.dispatchEvent(new MouseEvent('contextmenu', { button: 2, clientX: 50, clientY: innerHeight - 20, bubbles: true, cancelable: true }));
        await delay(80);
        return [...document.querySelectorAll('.context-menu')].find(node => node.querySelector('[data-key="removeTab"]'));
      };
      let menu = await open_tab_menu();
      expect(menu.querySelectorAll('[data-linux-note-copy-path]').length === 2, 'tab menu contains both copy actions');
      expect(menu.getBoundingClientRect().bottom <= innerHeight, 'extended menu stays inside window');
      let count = copy_count;
      click(menu.querySelector('[data-linux-note-copy-path="relative"] a')); await delay(80);
      expect(copied === 'source.md' && copy_count === count + 1, 'right-click target is copied exactly once');
      expect(app.workspace.activeLeaf === preview_leaf && File.bundle.filePath === source_path, 'copying inactive tab does not activate it');
      menu = await open_tab_menu();
      expect(menu.querySelectorAll('[data-linux-note-copy-path]').length === 2, 'reopening menu does not duplicate actions');
      click(menu.querySelector('[data-linux-note-copy-path="absolute"] a')); await delay(80);
      expect(copied === source_path, 'tab absolute path action');
      const file_menu = document.querySelector('#file-menu');
      app.workspace.emit('file-menu', { menu: { containerEl: file_menu }, path: target_path });
      file_menu.style.display = 'block';
      count = copy_count;
      click(file_menu.querySelector('[data-linux-note-copy-path="relative"] a')); await delay(80);
      expect(copied === 'target.md' && copy_count === count + 1, 'file tree menu uses its event target path');
      File.getMountFolder = () => path.dirname(probe_root);
      app.commands.run('linux_note:copy_relative_path'); await delay(80);
      expect(copied === path.join(path.basename(probe_root), 'target.md'), 'changing folder updates relative base immediately');
      const previous_leaf = app.workspace.activeLeaf;
      const previous_path = previous_leaf.state.path;
      previous_leaf.state.path = '';
      count = copy_count;
      try { app.commands.run('linux_note:copy_absolute_path'); }
      finally { previous_leaf.state.path = previous_path; }
      await delay(80);
      expect(copy_count === count, 'unsaved document does not replace clipboard');
      app.workspace.activeLeaf = source_leaf;
      key('KeyK', { ctrlKey: true }); key('Backslash', { ctrlKey: true }); await delay(600);
      expect(document.querySelectorAll('.typ-workspace-tabs').length === 3, 'Ctrl K then Ctrl backslash still splits down');
      result.status = 'PASS';
    } catch (error) { result.status = 'FAIL'; result.error = String(error.stack); }
    finally {
      JSBridge.invoke = original_invoke;
      File.getMountFolder = original_mount;
      fs.writeFileSync(path.join(probe_root, 'result_1.json'), JSON.stringify(result, null, 2));
      window.close();
    }
  };
  void run();
})();
