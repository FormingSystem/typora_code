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
    const files=app[Symbol.for('linux-note.workspace-files@v1')].host;
    const active=()=>app.workspace.activeLeaf.view;
    const standalone=()=>[...active().containerEl.querySelectorAll('.workspace-image-pane img')];
    const widths=()=>standalone().map(node=>node.naturalWidth).join(',');
    await panel.workbench.open_file({path:asset,status:'M'},'INDEX','WORKTREE');
    await wait('Standalone Git image diff shows the two correct versions',()=>widths()==='210,290');
    await wait('Both images fit the actual editor viewport',()=>standalone().every(image=>image.clientWidth>0&&image.clientWidth<=image.closest('.workspace-image-pane').clientWidth));
    const [index_image,worktree_image]=standalone();
    const surface=index_image.closest('.workspace-preview-image');
    const toolbar=surface.querySelector('.reading-media-toolbar');
    const action=name=>toolbar.querySelector('[data-action="'+name+'"]').click();
    const rect=image=>image.getBoundingClientRect();
    const near=(a,b)=>Math.abs(a-b)<1;
    action('zoom-in');
    await wait('Zoom button enlarges only the index image',()=>near(rect(index_image).width,262.5)&&near(rect(worktree_image).width,290));
    const before=rect(index_image), x=Math.round(before.left+before.width/4), y=Math.round(before.top+before.height/2);
    index_image.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-160,clientX:x,clientY:y}));
    await wait('Plain wheel preserves a fully visible image and the other Git pane',()=>near(rect(index_image).width,before.width)&&near(rect(index_image).top,before.top)&&near(rect(worktree_image).width,290));
    index_image.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-160,clientX:x,clientY:y}));
    await wait('Ctrl+wheel zoom keeps the detail under the pointer',()=>{
      const after=rect(index_image);
      return after.width>before.width && near(after.left+(x-before.left)*after.width/before.width,x) && near(rect(worktree_image).width,290);
    });
    action('reset');
    await wait('Actual size restores source pixels',()=>near(rect(index_image).width,210));
    action('zoom-out');
    await wait('Zoom out renders a smaller image',()=>near(rect(index_image).width,168));
    action('fit');
    await wait('Fit restores the pane overview',()=>near(rect(index_image).width,210));
    fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'standalone_git_images'}));
    await wait('Captured the standalone side-by-side image view',()=>{
      try{return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage==='standalone_git_images';}catch{return false;}
    });
    await panel.workbench.open_file({path:asset,status:'D'},commit,'INDEX');
    await wait('A deletion displays only the original version',()=>widths()==='170');
    await panel.workbench.open_default_file({path:asset,status:'A'},commit,'INDEX',[]);
    await wait('Staged addition opens the index, independently of the worktree',()=>widths()==='210');
    const canvas=document.createElement('canvas');canvas.width=37;canvas.height=2400;
    const png=reqnode('buffer').Buffer.from(canvas.toDataURL('image/png').split(',')[1],'base64');
    const untracked='assets/new #图.png';write(untracked,png);
    await panel.workbench.open_default_file({path:untracked,status:'??'},'INDEX','WORKTREE',[]);
    await wait('An untracked PNG opens in a document tab',()=>widths()==='37'&&!active().editor);
    if(!active().menu_entries().some(entry=>entry.title==='使用系统程序打开'||entry.title.toLowerCase().includes('system')))throw Error('System open command missing');
    if(files.can_save_active())throw Error('Image tab exposed text save');
    const tall=standalone()[0], surface_tall=tall.closest('.workspace-preview-image'), scroll_canvas=tall.closest('.reading-media-canvas');
    surface_tall.querySelector('[data-action=reset]').click();
    const tall_bounds=rect(tall);
    const scroll=(deltaY,deltaMode=0)=>tall.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY,deltaMode}));
    scroll(120);
    await wait('Plain wheel scrolls down the PNG at actual size',()=>near(rect(tall).top,tall_bounds.top-120)&&near(rect(tall).height,2400));
    scroll(-120);
    await wait('Reverse wheel returns to the same image position',()=>near(rect(tall).top,tall_bounds.top));
    scroll(100,WheelEvent.DOM_DELTA_PAGE);
    await wait('Page scrolling stops at the lower edge',()=>near(rect(tall).bottom,rect(scroll_canvas).bottom));
    scroll(-100,WheelEvent.DOM_DELTA_PAGE);
    await wait('Page scrolling stops at the upper edge',()=>near(rect(tall).top,rect(scroll_canvas).top));
    surface_tall.querySelector('[data-action=fit]').click();

    await pause(80);standalone()[0].dispatchEvent(new MouseEvent('dblclick',{button:0,bubbles:true}));
    await wait('Standalone PNG opens the shared fullscreen viewer',()=>document.querySelector('.reading-media-viewer img')?.naturalWidth===37);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await files.open_file(path.join(root,asset),{preview:true});
    await wait('Explorer preview decodes SVG',()=>widths()==='290');
    await files.open_file(path.join(root,asset),{source:true});
    await wait('Explicit SVG source still opens its original text',()=>active().editor?.models[0].getValue().includes('Version 290'));
    await files.open_file(path.join(root,asset));
    await wait('Opening the image after editing source returns to its picture',()=>widths()==='290');
    write('assets/bad.png','no image data');await files.open_file(path.join(root,'assets/bad.png'));
    await wait('A broken local image retains its error and system-open action',()=>!!active().containerEl.querySelector('.workspace-image-pane .workspace-file-notice')&&!!active().containerEl.querySelector('.workspace-image-pane button'));
    if(!fs.readFileSync(path.join(root,untracked)).equals(png))throw Error('PNG bytes changed');
    fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks},null,2));
  } catch (error) {
    fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(error),stack:error.stack},null,2));
  }
})();
