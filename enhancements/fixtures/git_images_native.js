// Exercise the installed Git comparison and the shared image viewer in an isolated Typora window.
(async () => {
  const fs = reqnode('fs'), path = reqnode('path'), cp = reqnode('child_process');
  const base = __CASE_ROOT__, root = path.join(base, 'workspace'), checks = [];
  const write = (name, value) => fs.writeFileSync(path.join(root, name), value);
  const git = (...args) => cp.execFileSync('git', ['-c','user.name=Image Test','-c','user.email=test@example.invalid','-c','core.hooksPath=.git/unused','-c','commit.gpgsign=false',...args], {cwd:root,windowsHide:true});
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (label, test) => {
    for (let count=0; count<240; count++) { if (test()) { checks.push(label); return; } await pause(50); }
    throw Error(label);
  };
  try {
    const app = window[Symbol.for('typora-code:workspace')].app;
    const file = 'reference/guide.md', asset = 'assets/diagram.svg';
    const svg = width => '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="56"><text x="8" y="32">Version '+width+'</text></svg>';
    const markdown = '# Review\n\n![Version diagram](../assets/diagram.svg)\n\n';
    fs.mkdirSync(path.join(root, 'reference')); fs.mkdirSync(path.join(root, 'assets'));
    write(file, markdown+'Commit'); write(asset, svg(170));
    git('add','--',file,asset); git('commit','-m','test: commit image');
    const commit = git('rev-parse','HEAD').toString().trim();
    write(file, markdown+'Index'); write(asset, svg(210)); git('add','--',file,asset);
    write(file, markdown+'Worktree'); write(asset, svg(290));
    app.commands.run('linux_note:git_graph');
    await wait('Opened the real Git panel', () => app.workspace.activeLeaf?.view.panel?.loaded);
    const panel = app.workspace.activeLeaf.view.panel;
    await panel.refresh();
    async function compare(from,to,left_width,right_width) {
      await panel.workbench.open_file({path:file,status:'M'},from,to);
      const editor = app.workspace.activeLeaf.view.editor;
      const image = side => editor?.markdown_preview.shadow.querySelector('[data-side='+side+'] img');
      await wait(from+' and '+to+' decoded their own SVG bytes', () => image('left')?.naturalWidth===left_width && image('right')?.naturalWidth===right_width);
      return image('left');
    }
    const left = await compare('INDEX','WORKTREE',210,290);
    await wait('Image fits its own column', () => left.clientWidth>0 && left.clientWidth<=left.closest('.markdown-diff-cell').clientWidth);
    await pause(200);
    left.dispatchEvent(new MouseEvent('dblclick',{button:0,bubbles:true,composed:true}));
    await wait('Shared fullscreen viewer opens the index image', () => document.querySelector('.reading-media-viewer img')?.naturalWidth===210);
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await compare(commit,'INDEX',170,210);
    write(file,'# Review\n\n```mermaid\nsequenceDiagram\nA->>B: Hello\n```\n');
    await panel.workbench.open_file({path:file,status:'M'},'INDEX','WORKTREE');
    const shadow = app.workspace.activeLeaf.view.editor.markdown_preview.shadow;
    await wait('Index SVG and worktree Mermaid render together', () => shadow.querySelector('[data-side=left] img')?.naturalWidth===210 && !!shadow.querySelector('[data-side=right] .lookup-diagram,[data-side=right] [data-visual-state=ready]'));
    fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'git_version_images'}));
    await pause(700);
    fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks},null,2));
  } catch (error) {
    fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(error),stack:error.stack},null,2));
  }
})();
