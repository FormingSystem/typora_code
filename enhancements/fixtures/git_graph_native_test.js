// 仅对脚本生成的临时仓库窗口生效，不读取或修改用户仓库。
(() => {
  const script_url = new URL(document.currentScript.src);
  const probe_root = decodeURIComponent(script_url.pathname).replace(/^\/(\w:)/u, '$1').replace(/\/git_graph_native_test.js$/u, '');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const normalized = value => value?.replace(/\\/gu, '/').toLowerCase();
  const result = { checks: [] };
  const expect = (value, message) => { if (!value) throw new Error(message); result.checks.push(message); };
  const wait = async (ready, message = 'Timed out') => {
    const start = Date.now(); while (!ready()) { if (Date.now() - start > 15000) throw new Error(message); await delay(60); }
  };
  const run = async () => {
    await wait(() => window.File?.bundle?.filePath);
    if (normalized(File.bundle.filePath) !== normalized(probe_root + '/source.md')) return;
    const fs = reqnode('fs'); const path = reqnode('path');
    try {
      await wait(() => document.documentElement.getAttribute('data-linux-note-git-graph') === 'ready');
      const app = window[Symbol.for('typora-plugin-core@v2')].app;
      const source_leaf = app.workspace.activeLeaf;
      const source_bytes = fs.readFileSync(path.join(probe_root, 'source.md'));
      const index_bytes = fs.readFileSync(path.join(probe_root, '.git/index'));
      const content = document.querySelector('content');
      await delay(1200);
      content.scrollTop = 620; await delay(600); const original_scroll = content.scrollTop;
      expect(original_scroll > 500, 'source starts at a nonzero reading position');
      app.workspace.ribbon.clickButton('linux_note:git_graph');
      await wait(() => document.querySelector('.linux-note-git-graph')?.dataset.state === 'ready', 'Graph did not load');
      const graph = document.querySelector('.linux-note-git-graph'); const graph_leaf = app.workspace.activeLeaf;
      expect(normalized(graph.querySelector('.git-graph-root').textContent) === normalized(probe_root), 'repository discovered from active document');
      expect(graph.querySelectorAll('.git-graph-row').length === 4, 'real commit history rendered in workspace tab');
      expect(graph.querySelectorAll('.git-graph-row svg circle').length === 4, 'one graph node per commit');
      expect(graph.querySelector('.git-graph-row svg').querySelectorAll('path').length === 2, 'merge node has two parent edges');
      expect(!graph.querySelector('img') && graph.textContent.includes('<img src=x onerror=alert(1)>'), 'commit text is displayed without interpreting HTML');
      expect(File.bundle.filePath === source_leaf.state.path, 'opening graph does not switch native document');
      app.commands.run('linux_note:git_graph');
      expect(document.querySelectorAll('.linux-note-git-graph').length === 1, 'reopening active graph does not duplicate tab');
      graph.querySelector('.git-graph-row').click();
      await wait(() => graph.querySelector('.git-graph-file'));
      expect(graph.querySelectorAll('.git-graph-parent option').length === 2, 'merge exposes both parents');
      expect(graph.querySelector('.git-graph-file').textContent.includes('中文 #%.md'), 'first parent changed file preserves Unicode and punctuation');
      graph.querySelector('.git-graph-file').click();
      await wait(() => graph.querySelector('.git-graph-patch').textContent.includes('+branch'));
      expect([...graph.querySelectorAll('.git-diff-add')].some(node => node.textContent.includes('+branch')), 'selected file displays colored patch');
      const parent = graph.querySelector('.git-graph-parent'); parent.selectedIndex = 1; parent.dispatchEvent(new Event('change'));
      await wait(() => graph.querySelector('.git-graph-file')?.textContent.includes('target.md'));
      expect(true, 'switching merge parent updates comparison files');
      const branch = graph.querySelector('.git-graph-branch'); branch.value = 'refs/heads/feature'; branch.dispatchEvent(new Event('change'));
      await wait(() => graph.dataset.state === 'ready' && graph.querySelectorAll('.git-graph-row').length === 2);
      expect(true, 'branch selector narrows topology');
      const search = graph.querySelector('.git-graph-search'); search.value = 'Initial';
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await wait(() => graph.querySelector('.git-graph-commit-title')?.textContent.includes('Initial'));
      expect(true, 'search selects matching loaded commit');
      app.workspace.activeLeaf = source_leaf.parent.toggleTab(source_leaf.state.path);
      await wait(() => { result.source_scroll = { expected: original_scroll, actual: content.scrollTop }; return Math.abs(content.scrollTop - original_scroll) < 1; }, 'Source reading position changed');
      expect(true, 'returning to source preserves reading position');
      app.workspace.activeLeaf = graph_leaf.parent.toggleTab(graph_leaf.state.path);
      await delay(350);
      graph.querySelector('.git-graph-toolbar button').click();
      await wait(() => graph.dataset.state === 'ready');
      expect(graph.querySelectorAll('.git-graph-row').length === 2, 'refresh retains selected branch');
      expect(fs.readFileSync(path.join(probe_root, 'source.md')).equals(source_bytes), 'uncommitted Markdown remains byte-identical');
      expect(fs.readFileSync(path.join(probe_root, '.git/index')).equals(index_bytes), 'Git index remains byte-identical');
      const bounds = graph.getBoundingClientRect();
      result.layout = { viewport: [innerWidth, innerHeight], bounds: bounds.toJSON() };
      expect(bounds.width > 300 && bounds.height > 200 && bounds.bottom <= innerHeight, 'graph fits editor viewport');
      app.commands.run('core.workspace:split-right', [graph_leaf.state.path]);
      await wait(() => [...document.querySelectorAll('.linux-note-git-graph')].filter(node => node.dataset.state === 'ready').length === 2);
      const split_graph = app.workspace.activeLeaf.view.containerEl;
      expect(normalized(split_graph.querySelector('.git-graph-root').textContent) === normalized(probe_root), 'split graph retains repository context');
      const list_bounds = split_graph.querySelector('.git-graph-list').getBoundingClientRect();
      const details_bounds = split_graph.querySelector('.git-graph-details').getBoundingClientRect();
      expect(list_bounds.width > 100 && list_bounds.height > 50 && details_bounds.height > 100 && details_bounds.top >= list_bounds.bottom - 1,
        'narrow split stacks readable history and details inside its viewport');
      // 非仓库错误保留工具入口；恢复目录后可以继续刷新。
      const split_leaf = app.workspace.activeLeaf;
      split_leaf.state.git_cwd = path.dirname(probe_root);
      split_graph.querySelector('.git-graph-toolbar button').click();
      await wait(() => split_graph.dataset.state === 'error');
      expect(split_graph.querySelector('.git-graph-status').textContent.includes('not a git repository'), 'non-repository error is visible in graph');
      split_leaf.state.git_cwd = probe_root;
      split_graph.querySelector('.git-graph-toolbar button').click();
      await wait(() => split_graph.dataset.state === 'ready');
      expect(split_graph.querySelectorAll('.git-graph-row').length === 4, 'refresh recovers after a repository error');
      result.status = 'PASS';
    } catch (error) {
      result.status = 'FAIL'; result.error = String(error.stack);
      result.graph = document.querySelector('.linux-note-git-graph')?.innerText.slice(0, 3000);
    } finally {
      fs.writeFileSync(path.join(probe_root, 'result_1.json'), JSON.stringify(result, null, 2));
      window.close();
    }
  };
  void run();
})();
