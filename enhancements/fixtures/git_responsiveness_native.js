// 独立Typora副本与真实万文件仓库；不使用用户仓库或用户文档。
(async () => {
  const fs = reqnode('fs'), path = reqnode('path'), base = __CASE_ROOT__, checks = [], refresh_ms = [], intervals = [], long_intervals = [];
  let phase = "idle";
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async ready => { for (let i = 0; i < 600; i++) { if (ready()) return; await pause(25); } throw Error('等待状态超时'); };
  const assert = (value, label) => { if (!value) throw Error(label); checks.push(label); };
  let timer;
  try {
    const core = window[Symbol.for('typora-code:workspace')], app = core.app;
    await wait(() => !File.isFileLoading()); await pause(2000);
    const reading = app.workspace.activeLeaf, original = fs.readFileSync(path.join(base, 'workspace/front.md'), 'utf8');
    app.commands.run('linux_note:git_graph');
    await wait(() => app.workspace.activeLeaf?.view.panel?.loaded);
    const graph = app.workspace.activeLeaf, panel = graph.view.panel;
    await wait(() => !panel.pending);
    assert(panel.state.changes.length === 10000, '真实Git识别一万未跟踪文件');

    app.commands.run('linux_note:terminal_toggle');
    await wait(() => document.querySelector('.linux-note-terminal')?.dataset.state === 'running');
    const terminal = document.querySelector('.linux-note-terminal'), pid = terminal.dataset.pid;
    await pause(800);
    let last = performance.now(); timer = setInterval(() => { const now = performance.now(); intervals.push(now - last); if (now - last > 50) long_intervals.push({phase, duration_ms: now - last}); last = now; }, 8);
    for (let round = 0; round < 20; round++) {
      phase = "refresh_" + round;
      const start = performance.now(), operation = panel.refresh(false);
      // 独立原生阅读叶子切换与终端输入表面，在Git读取尚未结束时操作。
      if (round % 2 === 0) {
        app.workspace.activeLeaf = reading.parent.toggleTab(reading.state.path);
        assert(app.workspace.activeLeaf === reading, '刷新期间阅读切换 ' + round);
        const input = terminal.querySelector('.xterm-helper-textarea'); input.focus();
        assert(document.activeElement === input, '刷新期间终端可获焦 ' + round);
        app.workspace.activeLeaf = graph.parent.toggleTab(graph.state.path);
      }
      await operation; refresh_ms.push(performance.now() - start); await pause(30);
      assert(panel.workbench.groups.querySelectorAll('[data-file]').length < 150, '刷新保留有界DOM ' + round);
    }
    for (const zoom of [0.8, 1, 1.25]) {
      phase = "zoom_" + zoom;
      reqnode('electron').webFrame.setZoomFactor(zoom); await pause(150);
      panel.workbench.groups.scrollTop = panel.workbench.groups.scrollHeight; await pause(80);
      assert(!!panel.workbench.groups.querySelector('[data-file="large/file-09999.md"]'), '缩放后可访问最后文件 ' + zoom);
    }
    assert(terminal.dataset.pid === pid, 'Git刷新和缩放保留终端进程');
    assert(fs.readFileSync(path.join(base, 'workspace/front.md'), 'utf8') === original, '阅读正文未修改');
    clearInterval(timer); intervals.sort((a, b) => a - b);
    const metrics = {max_ms: intervals.at(-1), p95_ms: intervals[Math.floor(intervals.length * .95)], samples: intervals.length, refresh_ms, long_intervals};
    assert(metrics.p95_ms < 100 && metrics.max_ms < 500, '宿主事件循环P95小于100ms且最大间隔小于500ms');
    app.commands.run('linux_note:terminal_kill');
    fs.writeFileSync(path.join(base, 'checks.json'), JSON.stringify({status: 'PASS', checks, metrics, limits: 'Typora 1.14.10 / 当前Windows；真实Git和Shell，renderer发起切换与焦点，非物理鼠标与Win10验收'}, null, 2));
  } catch (error) { clearInterval(timer); fs.writeFileSync(path.join(base, 'checks.json'), JSON.stringify({status: 'ERROR', error: String(error.stack || error), checks, refresh_ms, intervals}, null, 2)); }
})();
