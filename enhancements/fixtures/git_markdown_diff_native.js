// 原始Typora隔离副本：真实Git两端、实际比较页与当前正文主题。
(async()=>{
  const fs=reqnode('fs'),path=reqnode('path'),cp=reqnode('child_process'),base=__CASE_ROOT__,root=path.join(base,'workspace'),checks=[];
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async ready=>{for(let i=0;i<800;i++){if(ready())return;await pause(25);}throw Error('原生Markdown差异等待超时');},assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  try{
    const core=window[Symbol.for('typora-code:workspace')],app=core.app;
    await wait(()=>!File.isFileLoading());await pause(1800);
    const original=fs.readFileSync(path.join(root,'front.md'),'utf8'),filename='review.md';
    const before='# 审阅标题\n\n旧段落 **关键文字**\n\n| 名称 | 数值 |\n| --- | --- |\n| 温度 | 20 |\n\n- 保持\n- 旧项目\n\n```js\nconst value = 1;\n```\n\n结尾保持\n\n'+Array.from({length:180},(_,i)=>'段落 '+i+'\n\n').join('');
    const after=before.replace('旧段落','新段落').replace('| 20 |','| 30 |').replace('旧项目','新项目').replace('value = 1','value = 2').replace('段落 90','中间修改 90').replace('段落 170','末尾修改 170');
    fs.writeFileSync(path.join(root,filename),before);
    const git=args=>cp.execFileSync('git',['-c','user.name=Native QA','-c','user.email=native@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=.git/unused_hooks',...args],{cwd:root,windowsHide:true});
    git(['add','--',filename]);git(['commit','-m','test: markdown review fixture']);fs.writeFileSync(path.join(root,filename),after);
    app.commands.run('linux_note:git_graph');await wait(()=>app.workspace.activeLeaf?.view.panel?.loaded);
    const panel=app.workspace.activeLeaf.view.panel;await wait(()=>!panel.pending);await panel.refresh();
    await panel.workbench.open_file({path:filename,status:'M'},'INDEX','WORKTREE',[{path:filename,status:'M'}]);
    await wait(()=>app.workspace.activeLeaf?.view.editor?.markdown_preview?.container.dataset.ready==='true');
    const leaf=app.workspace.activeLeaf,diff=leaf.view.editor,preview=diff.markdown_preview,shadow=preview.shadow;
    assert(diff.rendered_markdown&&diff.body.hidden,'真实Git Markdown比较默认渲染');
    assert(shadow.querySelectorAll('h1').length===2&&shadow.querySelectorAll('table').length===2&&shadow.querySelectorAll('ul').length===2,'原生主题中两侧标题表格列表完整');
    assert(shadow.querySelector('[data-side=left]').textContent.includes('INDEX')||shadow.textContent.includes('原'),'比较版本标签可见');
    const changed=shadow.querySelector('[data-changed=true]');assert(!!changed,'实际Git改动进入着色块');
    assert(getComputedStyle(changed.children[0]).backgroundColor!==getComputedStyle(changed.children[1]).backgroundColor,'原始宿主左右实际差异色不同');
    assert(diff.toolbar.closest('.workspace-tab-strip'),'快捷动作位于所属标签工具栏');
    assert(!!diff.toolbar.querySelector('[data-diff-open-file]'),'保留打开原文件图标');
    const overview=preview.container.querySelector('.git-markdown-overview'),thumb=overview.querySelector('.git-markdown-overview-viewport');
    await wait(()=>overview.dataset.markCount==='3');
    assert(Math.abs(overview.getBoundingClientRect().width-30)<1,'原始宿主右侧30px概览常驻');
    const jump=()=>{const row=[...shadow.querySelectorAll('[data-changed=true]')][1],box=overview.getBoundingClientRect(),origin=shadow.querySelector('#write').getBoundingClientRect().top;overview.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:5,clientX:box.right-2,clientY:box.top+(row.getBoundingClientRect().top-origin+2)/preview.scroll.scrollHeight*box.height,bubbles:true}));};
    jump();await pause(50);assert(preview.scroll.scrollTop>1000,'原始宿主点击概览跳转中间变更');
    overview.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));await pause(50);assert(preview.scroll.scrollTop===0,'原始宿主概览键盘回到开头');
    const thumb_box=thumb.getBoundingClientRect();thumb.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:7,clientX:thumb_box.left+2,clientY:thumb_box.top+2,bubbles:true}));overview.dispatchEvent(new PointerEvent('pointermove',{pointerId:7,clientY:overview.getBoundingClientRect().bottom,bubbles:true}));overview.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}));await pause(50);
    assert(preview.scroll.scrollTop>=preview.scroll.scrollHeight-preview.scroll.clientHeight-2&&!overview.dataset.dragging,'原始宿主概览拖到底并停止');
    for(let i=0;i<20;i++){
      diff.toolbar.querySelector('[data-diff-action=markdown_preview]').click();assert(!diff.rendered_markdown&&!diff.body.hidden,'切回源码 '+i);
      diff.toolbar.querySelector('[data-diff-action=markdown_preview]').click();await wait(()=>preview.container.dataset.ready==='true');assert(diff.rendered_markdown&&shadow.querySelectorAll('table').length===2,'恢复排版 '+i);
    }
    for(const zoom of [0.8,1,1.25]){await reqnode('electron').webFrame.setZoomFactor(zoom);await pause(150);jump();await pause(50);const row=[...shadow.querySelectorAll('[data-changed=true]')][1].getBoundingClientRect(),box=preview.scroll.getBoundingClientRect();assert(row.top>=box.top-1&&row.top<box.bottom,'原生缩放概览准确定位 '+zoom);assert([...shadow.querySelectorAll('.markdown-diff-row')].every(row=>Math.abs(row.children[0].getBoundingClientRect().top-row.children[1].getBoundingClientRect().top)<1),'缩放对应块对齐 '+zoom);}
    await reqnode('electron').webFrame.setZoomFactor(1);
    diff.navigate('next');assert(shadow.activeElement?.dataset.changed==='true','下一处更改定位渲染行');
    diff.container.dispatchEvent(new KeyboardEvent('keydown',{key:'F7',bubbles:true}));assert(shadow.activeElement?.dataset.changed==='true','F7继续定位渲染行');
    const newest=after.replace('新段落','刷新后的段落');fs.writeFileSync(path.join(root,filename),newest);
    await diff.extra_menu().find(entry=>entry.id==='refresh_diff').action();await wait(()=>shadow.textContent.includes('刷新后的段落'));
    assert(app.workspace.activeLeaf===leaf,'刷新保持当前比较标签');
    assert(fs.readFileSync(path.join(root,'front.md'),'utf8')===original&&fs.readFileSync(path.join(root,filename),'utf8')===newest,'阅读和比较未改写源文件');
    assert(!shadow.querySelector('[contenteditable=true]')&&diff.editor.getOriginalEditor().getRawOptions().readOnly,'排版比较只读');
    fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,limits:'原始Typora1.14.10/Win11，真实Git；renderer点击/键盘，不是物理鼠标或Win10现场。'},null,2));
  }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(error),stack:error.stack},null,2));}
})();
