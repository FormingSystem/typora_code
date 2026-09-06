// 只控制本脚本创建的临时窗口；真实 ConPTY 操作仅作用于临时仓库。
(() => {
  const script_url = new URL(document.currentScript.src);
  const root = decodeURIComponent(script_url.pathname).replace(/^\/(\w:)/u, '$1').replace(/\/terminal_native_test.js$/u, '');
  const normalize = value => value?.replace(/\\/gu, '/').toLowerCase();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = { checks: [] };
  const expect = (value, message) => { if (!value) throw new Error(message); result.checks.push(message); };
  const wait = async (check, message) => { const start = Date.now(); while (!check()) { if (Date.now() - start > 12000) throw new Error(message); await delay(80); } };
  const run = async () => {
    await wait(() => window.File?.bundle?.filePath, 'No document');
    if (normalize(File.bundle.filePath) !== normalize(root + '/source.md')) return;
    const fs = reqnode('fs'); let app; let terminal_leaf; const settings_key = 'linux-note-terminal:v1:'; const previous_settings = localStorage.getItem(settings_key);
    try {
      await wait(() => document.documentElement.getAttribute('data-linux-note-terminal') === 'ready', 'Terminal integration not ready');
      window.resizeTo(1400, 950); await delay(300);
      result.runtime = reqnode('process').versions;
      app = window[Symbol.for('typora-plugin-core@v2')].app;
      const source_leaf = app.workspace.activeLeaf;
      localStorage.setItem(settings_key, JSON.stringify({ profile: 'cmd', location: 'active' }));
      app.commands.run('linux_note:terminal');
      await wait(() => app.workspace.activeLeaf?.view.containerEl.classList.contains('linux-note-terminal'), 'Terminal tab missing');
      terminal_leaf = app.workspace.activeLeaf; const view = terminal_leaf.view;
      await wait(() => view.containerEl.dataset.state === 'running' || view.containerEl.dataset.state === 'error', 'PTY startup timed out');
      expect(view.containerEl.dataset.state === 'running', 'Native ConPTY starts: ' + view.status.textContent);
      const text = () => { let source = ''; for (let i = 0; i < view.term.buffer.active.length; i++) source += view.term.buffer.active.getLine(i)?.translateToString() + (view.term.buffer.active.getLine(i+1)?.isWrapped ? '' : '\n'); return source; };
      await wait(() => text().includes('Microsoft Windows'), 'Shell prompt missing');
      view.term.paste('echo TERMINAL_NATIVE_OK'); view.pty.write('\r');
      await wait(() => (text().match(/TERMINAL_NATIVE_OK/gu) || []).length >= 2, 'Interactive shell input or output failed');
      expect(normalize(view.root) === normalize(root), 'Terminal starts at repository root');
      const pid = view.pty.pid; const cols = view.term.cols;
      result.resize_before = {cols, active:view.active, bounds:view.viewport.getBoundingClientRect().toJSON()}; view.viewport.style.maxWidth = Math.max(120, view.viewport.clientWidth / 2) + 'px'; await delay(600); result.resize_after = {cols:view.term.cols, active:view.active, bounds:view.viewport.getBoundingClientRect().toJSON()}; expect(view.term.cols < cols, 'Terminal columns follow viewport resize'); view.viewport.style.maxWidth = ''; await delay(250);
      app.workspace.activeLeaf = source_leaf.parent.toggleTab(source_leaf.state.path); await delay(300);
      expect(view.pty.pid === pid, 'Hiding terminal preserves running process');
      app.workspace.activeLeaf = terminal_leaf.parent.toggleTab(terminal_leaf.state.path); await delay(300);
      expect(view.pty.pid === pid && text().includes('TERMINAL_NATIVE_OK'), 'Returning preserves process and output');
      view.pty.write('ping -t 127.0.0.1\r'); await delay(800); view.pty.write('\x03'); await delay(600);
      view.pty.write('echo CTRL_C_RETURNED\r'); await wait(() => (text().match(/CTRL_C_RETURNED/gu) || []).length >= 2, 'Ctrl+C did not return to shell');
      expect(true, 'Ctrl+C interrupts foreground command');
      view.containerEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 150 }));
      expect(Boolean(document.querySelector('[data-action="terminal_admin"]')), 'Terminal right-click includes administrator root launcher');
      expect(Boolean(document.querySelector('[data-action="terminal_paste"]')), 'Terminal right-click includes paste');
      document.querySelector('.git-graph-menu')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      terminal_leaf.parent.removeTab(terminal_leaf.state.path); await delay(500);
      expect(view.disposed && !view.pty, 'Closing terminal tab disposes session');
      localStorage.setItem(settings_key, JSON.stringify({ profile: 'powershell', location: 'down' }));
      app.commands.run('linux_note:terminal');
      await wait(() => app.workspace.activeLeaf?.view.containerEl.classList.contains('linux-note-terminal'), 'Downward terminal missing');
      terminal_leaf = app.workspace.activeLeaf; const second = terminal_leaf.view;
      await wait(() => second.containerEl.dataset.state === 'running', 'PowerShell did not start');
      expect(second.leaf.parent !== source_leaf.parent, 'New terminal opens in a separate downward editor group');
      expect(second.containerEl.getBoundingClientRect().top >= source_leaf.parent.containerEl.getBoundingClientRect().bottom - 1, 'Terminal is laid out below the document group');
      const second_text = () => { let value = ''; for (let i=0;i<second.term.buffer.active.length;i++) value += second.term.buffer.active.getLine(i)?.translateToString() + '\n'; return value; };
      await wait(() => second_text().includes('>'), 'PowerShell prompt missing');
      second.term.paste("Write-Output ('中文' + '_POWERSHELL')"); second.pty.write('\r');
      await wait(() => second_text().includes('中文_POWERSHELL'), 'PowerShell Unicode output missing');
      expect(true, 'Default PowerShell supports Unicode input and output');
      terminal_leaf.parent.removeTab(terminal_leaf.state.path); await delay(1600);
      expect(second.disposed, 'Split terminal is disposed on close');
      result.status = 'PASS';
    } catch (error) { result.status = 'FAIL'; result.error = String(error.stack || error); result.body = document.body.innerText.slice(-6000); }
    finally {
      if (terminal_leaf && !terminal_leaf.view.disposed) terminal_leaf.view.dispose();
      if (previous_settings == null) localStorage.removeItem(settings_key); else localStorage.setItem(settings_key, previous_settings);
      fs.writeFileSync(root + '/result_1.json', JSON.stringify(result, null, 2)); window.close();
    }
  };
  run();
})();
