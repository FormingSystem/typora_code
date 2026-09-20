// 在真实 core 模型和 Chromium DOM 上运行；宿主编辑 API 由拖动夹具提供。
(async () => {
  const report = {failures: [], idle: {}, tiers: [], layout: {}};
  const verify = (condition, message) => { if (!condition) report.failures.push(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const workspace = runtime.app.workspace;
  const root = workspace.rootSplit;
  const original_raf = window.requestAnimationFrame;
  let frames = 0;
  window.requestAnimationFrame = callback => original_raf.call(window, time => { frames++; callback(time); });
  try {
    begin(group.tabHeader.getTabById('two.c'));
    for (const position of ['body', 'center', 'limit']) {
      const header = group.tabHeader.containerEl;
      if (position === 'limit') header.scrollLeft = header.scrollWidth;
      const box = header.getBoundingClientRect();
      fire('dragover', position === 'body' ? group.tabContentEl : header,
        position === 'body' ? {} : {clientX: position === 'limit' ? box.right - 2 : box.left + box.width / 2});
      await wait(80);
      const before = frames;
      await wait(240);
      report.idle[position] = frames - before;
      verify(frames === before, 'idle animation remains active: ' + position);
    }
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  } finally { window.requestAnimationFrame = original_raf; }

  // 不等宽三栏删除前两栏分别验证，DOM 比例必须对应仍存活的节点。
  const Split = Object.getPrototypeOf(Object.getPrototypeOf(root)).constructor;
  for (const removed_index of [0, 1]) {
    const split = new Split('vertical');
    const nodes = [new group.constructor(), new group.constructor(), new group.constructor()];
    nodes.forEach(node => split.appendChild(node));
    split.sizes = [.5, .3, .2]; split.updatePaneSizes();
    split.removeChild(nodes[removed_index]);
    const expected = [.5, .3, .2].filter((_, i) => i !== removed_index).map(value => value + [.5, .3][removed_index] / 2);
    const actual = split.children.map(node => parseFloat(node.containerEl.style.flexBasis) / 100);
    report.layout['remove_' + removed_index] = actual;
    verify(actual.every((value, i) => Math.abs(value - expected[i]) < 1e-8), 'removed pane redistributes another pane size: ' + removed_index);
    const before = [...split.children];
    split.removeChild(nodes[removed_index]);
    verify(split.children.length === before.length && split.children.every((node, i) => node === before[i]), 'repeated pane removal mutates survivors');
  }

  for (const direction of ['vertical', 'horizontal']) {
    const split = new Split(direction);
    const nodes = [new group.constructor(), new group.constructor(), new group.constructor(), new group.constructor()];
    split.containerEl.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:1000px;display:flex;z-index:500000;flex-direction:' + (direction === 'vertical' ? 'row' : 'column');
    document.body.append(split.containerEl);
    nodes.forEach(node => { node.containerEl.style.setProperty('width','auto','important'); split.appendChild(node); });
    split.sizes = [.4,.3,.2,.1]; split.updatePaneSizes();
    const initial = [...split.sizes];
    split.onChildResizeStart(nodes[1], new MouseEvent('mousedown', {clientX:400,clientY:400}));
    for (const delta of [-2000, 100, 2000]) {
      document.dispatchEvent(new MouseEvent('mousemove', {clientX:400+delta,clientY:400+delta}));
      verify(split.sizes[2] === initial[2] && split.sizes[3] === initial[3], 'resize changed non-adjacent panes: ' + direction);
      verify(split.sizes.every(value => value > 0) && Math.abs(split.sizes.reduce((a,b) => a+b,0)-1) < 1e-8, 'resize produces invalid weights: ' + direction);
    }
    document.dispatchEvent(new MouseEvent('mouseup'));
    const replacement = new group.constructor(); split.replaceChild(nodes[0], replacement);
    report.layout['replacement_' + direction] = {basis: replacement.containerEl.style.flexBasis, weight: split.sizes[0]};
    verify(Math.abs(parseFloat(replacement.containerEl.style.flexBasis)/100-split.sizes[0]) < 1e-5, 'nested replacement lost parent allocation');
    split.containerEl.remove();
  }

  const leaf = second, editor = leaf.view, content = leaf.containerEl, draft = editor.draft;
  let open_count = 0, close_count = 0;
  const original_open = editor.open, original_close = editor.close;
  editor.open = function (...args) { open_count++; return original_open.apply(this, args); };
  editor.close = function (...args) { close_count++; return original_close.apply(this, args); };
  group.toggleTab(leaf.state.path); workspace.activeLeaf = leaf;
  open_count = close_count = 0;
  const initial_nodes = root.containerEl.querySelectorAll('*').length;
  try {
    for (const rounds of [20, 100, 1000]) {
      const times = [], start = performance.now(), open_before = open_count, close_before = close_count;
      for (let i = 0; i < rounds; i++) {
        const tick = performance.now();
        // 四方向拆出再并回；保留一个稳定的原组，不制造 1000 个并发窗口。
        const target = runtime.split_workspace_group(leaf, ['right', 'down', 'left', 'up'][i % 4]);
        runtime.move_workspace_leaf(leaf, target, 0, workspace);
        runtime.move_workspace_leaf(leaf, group, i % 2 ? 0 : group.children.length, workspace);
        if (leaf.parent !== group || leaf.view !== editor || leaf.containerEl !== content || editor.draft !== draft)
          throw Error('Split/merge changed leaf, editor or draft');
        const ids = group.children.map(node => node.state.path).join();
        if ([...group.tabHeader.container.children].map(node => node.dataset.id).join() !== ids ||
            group.children.some((node, index) => group.tabContentEl.children[index] !== node.containerEl))
          throw Error('Model/header/content order diverged');
        times.push(performance.now() - tick);
        // 每次事务之后让事件循环处理观察器、绘制及取消，不把 1000 次挤入同一个长任务。
        await wait(0);
      }
      times.sort((a, b) => a - b);
      report.tiers.push({rounds, elapsed_ms: performance.now() - start, max_round_ms: times.at(-1), p95_round_ms: times[Math.floor(rounds * .95)],
        opens: open_count - open_before, closes: close_count - close_before, dom_nodes: root.containerEl.querySelectorAll('*').length});
      verify(root.containerEl.querySelectorAll('*').length === initial_nodes, 'split/merge leaks DOM at tier ' + rounds);
      verify(root.children.length === 2 && root.children.includes(group) && root.children.includes(other), 'split/merge leaks groups at tier ' + rounds);
    }
    // 仅重排活动标签不应关闭/重开编辑器，更不能重载正文。
    open_count = close_count = 0;
    for (let i = 0; i < 1000; i++) runtime.move_workspace_leaf(leaf, group, i % 2 ? 0 : group.children.length, workspace);
    report.reorder = {rounds: 1000, opens: open_count, closes: close_count};
    verify(!open_count && !close_count, 'active reorder reopens the editor');
  } finally { editor.open = original_open; editor.close = original_close; }
  return report;
})()
