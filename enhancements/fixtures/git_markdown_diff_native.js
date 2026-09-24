// 原始Typora隔离副本：真实Git两端、实际比较页与当前正文主题。
(async()=>{
  const fs=reqnode('fs'),path=reqnode('path'),cp=reqnode('child_process'),base=__CASE_ROOT__,root=path.join(base,'workspace'),checks=[];
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async ready=>{for(let i=0;i<800;i++){if(ready())return;await pause(25);}throw Error('原生Markdown差异等待超时');},assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  try{
    const core=window[Symbol.for('typora-code:workspace')],app=core.app;
    await wait(()=>!File.isFileLoading());await pause(1800);
    const original=fs.readFileSync(path.join(root,'front.md'),'utf8'),filename='review.md';
    const before='# 审阅标题\n\n[回到标题](#审阅标题)\n\n旧段落 **关键文字**\n\n| 名称 | 数值 |\n| --- | --- |\n| 温度 | 20 |\n\n- 保持\n- 旧项目\n\n```js\nconst value = 1;\n```\n\n结尾保持\n\n'+Array.from({length:180},(_,i)=>'段落 '+i+'\n\n').join('');
    const after=before.replace('旧段落','新段落').replace('| 20 |','| 30 |').replace('旧项目','新项目').replace('value = 1','value = 2').replace('段落 90','中间修改 90').replace('段落 170','末尾修改 170');
    fs.writeFileSync(path.join(root,filename),before);
    const git=args=>cp.execFileSync('git',['-c','user.name=Native QA','-c','user.email=native@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=.git/unused_hooks',...args],{cwd:root,windowsHide:true});
    git(['add','--',filename]);git(['commit','-m','test: markdown review fixture']);fs.writeFileSync(path.join(root,filename),after);
    app.commands.run('linux_note:git_graph');await wait(()=>app.workspace.activeLeaf?.view.panel?.loaded);
    const panel=app.workspace.activeLeaf.view.panel;await wait(()=>!panel.pending);await panel.refresh();
    await panel.workbench.open_file({path:filename,status:'M'},'INDEX','WORKTREE',[{path:filename,status:'M'}]);
    await panel.host.reveal_diff_source(panel.host.diff_source());assert(document.querySelector('.git-scm-file[data-git-source-selected=true]')?.dataset.path===filename||document.querySelector('.git-scm-file[data-git-source-selected=true]')?.dataset.file===filename,'工作区比较定位对应变更文件');
    await wait(()=>app.workspace.activeLeaf?.view.editor?.markdown_preview?.container.dataset.ready==='true');
    const leaf=app.workspace.activeLeaf,diff=leaf.view.editor,preview=diff.markdown_preview,shadow=preview.shadow;
    assert(diff.rendered_markdown&&diff.body.hidden,'真实Git Markdown比较默认渲染');
    assert(shadow.querySelectorAll('h1').length===2&&shadow.querySelectorAll('table').length===2&&shadow.querySelectorAll('ul').length===2,'原生主题中两侧标题表格列表完整');
    assert(shadow.querySelector('[data-side=left]').textContent.includes('INDEX')||shadow.textContent.includes('原'),'比较版本标签可见');
    const changed=shadow.querySelector('[data-changed=true]');assert(!!changed,'实际Git改动进入着色块');
    assert(getComputedStyle(changed.children[0].querySelector('[data-source-line]>p')).backgroundColor!==getComputedStyle(changed.children[1].querySelector('[data-source-line]>p')).backgroundColor,'原始宿主左右实际差异色不同');
    assert(diff.toolbar.closest('.workspace-tab-strip'),'快捷动作位于所属标签工具栏');
    assert(!!diff.toolbar.querySelector('[data-diff-open-file]'),'保留打开原文件图标');
    const alt=key=>window.dispatchEvent(new KeyboardEvent('keydown',{key,altKey:true,bubbles:true,cancelable:true}));
    const settled=async()=>{await pause(700);await wait(()=>!File.isFileLoading());};
    preview.scroll.scrollTop=700;await pause(100);const remembered=preview.scroll.scrollTop;
    diff.toolbar.querySelector('[data-diff-open-file]').click();await wait(()=>app.workspace.activeLeaf!==leaf&&File.bundle.filePath.replace(/\\/g,'/').endsWith('/review.md'));await settled();
    alt('ArrowLeft');await wait(()=>app.workspace.activeLeaf===leaf);await settled();
    assert(diff.rendered_markdown&&Math.abs(preview.scroll.scrollTop-remembered)<2,'打开工作树Markdown后Alt后退恢复比较模式和位置');
    alt('ArrowRight');await wait(()=>app.workspace.activeLeaf!==leaf);await settled();assert(File.bundle.filePath.replace(/\\/g,'/').endsWith('/review.md'),'Alt前进重新激活工作树文件');
    alt('ArrowLeft');await wait(()=>app.workspace.activeLeaf===leaf);await settled();
    for(const [theme,name] of [['github.css','Github'],['night.css','Night'],['cpp_github-consolas.css','Cpp Github Consolas']]){
      await JSBridge.invoke('setting.setCurTheme',theme,name);File.setTheme(theme);await pause(700);document.querySelector('#ty-suppress-mode-warning-close-btn')?.click();
      const native=document.querySelector('content > #write'), rendered=shadow.querySelector('#write');
      for(const property of ['fontFamily','fontSize','lineHeight','color'])assert(getComputedStyle(rendered)[property]===getComputedStyle(native)[property],'主题正文继承 '+name+' '+property+' '+getComputedStyle(rendered)[property]+'/'+getComputedStyle(native)[property]);
      for(const [selector,properties] of [['h1',['fontFamily','fontSize','color']],['th',['fontFamily','fontSize','backgroundColor']]])for(const property of properties)assert(getComputedStyle(rendered.querySelector(selector))[property]===getComputedStyle(native.querySelector(selector))[property],'主题块属性 '+name+' '+selector+' '+property);
    }
    await diff.set_markdown_mode(false);const code=diff.editor.getModifiedEditor();code.setPosition({lineNumber:120,column:2});code.revealLineInCenter(120);code.focus();await settled();const code_top=code.getScrollTop();
    diff.toolbar.querySelector('[data-diff-open-file]').click();await wait(()=>app.workspace.activeLeaf!==leaf);await settled();alt('ArrowLeft');await wait(()=>app.workspace.activeLeaf===leaf);await settled();
    assert(!diff.rendered_markdown&&code.getPosition().lineNumber===120&&Math.abs(code.getScrollTop()-code_top)<2,'源码比较返回保留选区和滚动');
    // 快捷键从Monaco的textarea发出时仍由同一个导航服务处理。
    code.focus();code.getDomNode().querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true,cancelable:true}));await wait(()=>app.workspace.activeLeaf!==leaf);await settled();
    leaf.parent.removeTab(leaf.state.path);await pause(100);alt('ArrowLeft');await wait(()=>app.workspace.activeLeaf?.state.path===leaf.state.path);await settled();
    const restored=app.workspace.activeLeaf.view.editor;assert(restored!==diff&&!restored.rendered_markdown&&restored.editor.getModifiedEditor().getPosition().lineNumber===120,'关闭比较标签后导航重开只读快照 '+JSON.stringify({same:restored===diff,mode:restored.rendered_markdown,line:restored.editor.getModifiedEditor().getPosition(),scroll:restored.editor.getModifiedEditor().getScrollTop()}));
    // 后续概览回归继续使用最初实例，重开验证单独结束，避免测试持有已销毁引用。
    app.workspace.activeLeaf.parent.removeTab(app.workspace.activeLeaf.state.path);await pause(100);
    await panel.workbench.open_file({path:filename,status:'M'},'INDEX','WORKTREE',[{path:filename,status:'M'}]);await wait(()=>app.workspace.activeLeaf?.view.editor?.markdown_preview?.container.dataset.ready==='true');
    return await finish_comparison(app.workspace.activeLeaf);
    async function finish_comparison(current_leaf){
    const leaf=current_leaf,diff=leaf.view.editor,preview=diff.markdown_preview,shadow=preview.shadow;
    const overview=preview.container.querySelector('.git-markdown-overview'),thumb=overview.querySelector('.git-markdown-overview-viewport');
    await wait(()=>Number(overview.dataset.markCount)>=3);
    assert(Math.abs(overview.getBoundingClientRect().width-30)<1,'原始宿主右侧30px概览常驻');
    const jump=()=>{const row=[...shadow.querySelectorAll('[data-changed=true]')].find(row=>row.textContent.includes('中间修改 90')),box=overview.getBoundingClientRect(),origin=shadow.querySelector('#write').getBoundingClientRect().top;overview.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:5,clientX:box.right-2,clientY:box.top+(row.getBoundingClientRect().top-origin+2)/preview.scroll.scrollHeight*box.height,bubbles:true}));};
    jump();await pause(50);assert(preview.scroll.scrollTop>1000,'原始宿主点击概览跳转中间变更');
    overview.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));await pause(50);assert(preview.scroll.scrollTop===0,'原始宿主概览键盘回到开头');
    const thumb_box=thumb.getBoundingClientRect();thumb.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:7,clientX:thumb_box.left+2,clientY:thumb_box.top+2,bubbles:true}));overview.dispatchEvent(new PointerEvent('pointermove',{pointerId:7,clientY:overview.getBoundingClientRect().bottom,bubbles:true}));overview.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}));await pause(50);
    assert(preview.scroll.scrollTop>=preview.scroll.scrollHeight-preview.scroll.clientHeight-2&&!overview.dataset.dragging,'原始宿主概览拖到底并停止');
    for(let i=0;i<20;i++){
      diff.toolbar.querySelector('[data-diff-action=markdown_preview]').click();assert(!diff.rendered_markdown&&!diff.body.hidden,'切回源码 '+i);
      diff.toolbar.querySelector('[data-diff-action=markdown_preview]').click();await wait(()=>preview.container.dataset.ready==='true');assert(diff.rendered_markdown&&shadow.querySelectorAll('table').length===2,'恢复排版 '+i);
    }
    for(const zoom of [0.8,1,1.25]){await reqnode('electron').webFrame.setZoomFactor(zoom);await pause(150);jump();await pause(50);const row=[...shadow.querySelectorAll('[data-changed=true]')].find(row=>row.textContent.includes('中间修改 90')).getBoundingClientRect(),box=preview.scroll.getBoundingClientRect();assert(row.top>=box.top-1&&row.top<box.bottom,'原生缩放概览准确定位 '+zoom);assert([...shadow.querySelectorAll('.markdown-diff-row')].every(row=>Math.abs(row.children[0].getBoundingClientRect().top-row.children[1].getBoundingClientRect().top)<1),'缩放对应块对齐 '+zoom);}
    await reqnode('electron').webFrame.setZoomFactor(1);
    diff.navigate('next');assert((shadow.activeElement?.dataset.changed==='true'||!!shadow.activeElement?.dataset.diffFragment),'下一处更改定位渲染行');
    diff.container.dispatchEvent(new KeyboardEvent('keydown',{key:'F7',bubbles:true}));assert((shadow.activeElement?.dataset.changed==='true'||!!shadow.activeElement?.dataset.diffFragment),'F7继续定位渲染行');
    const newest=after.replace('新段落','刷新后的段落');fs.writeFileSync(path.join(root,filename),newest);
    await diff.extra_menu().find(entry=>entry.id==='refresh_diff').action();await wait(()=>shadow.textContent.includes('刷新后的段落'));
    assert(app.workspace.activeLeaf===leaf,'刷新保持当前比较标签');
    assert(fs.readFileSync(path.join(root,'front.md'),'utf8')===original&&fs.readFileSync(path.join(root,filename),'utf8')===newest,'阅读和比较未改写源文件');
    assert(!shadow.querySelector('[contenteditable=true]')&&diff.editor.getOriginalEditor().getRawOptions().readOnly,'排版比较只读');
    git(['add','--',filename]);git(['commit','-m','test: second historical snapshot']);await panel.refresh();await wait(()=>!panel.pending);
    const first=git(['rev-parse','HEAD~1']).toString().trim(),second=git(['rev-parse','HEAD']).toString().trim();
    await panel.workbench.open_file({path:filename,status:'M'},first,second,[{path:filename,status:'M'}]);await wait(()=>app.workspace.activeLeaf?.view.editor?.markdown_preview?.container.dataset.ready==='true');
    const historical=app.workspace.activeLeaf;historical.view.editor.markdown_preview.scroll.scrollTop=500;
    await wait(()=>historical.parent.containerEl.querySelector('[data-git-diff-reveal]'));
    historical.parent.containerEl.querySelector('[data-git-diff-reveal]').click();
    await wait(()=>document.querySelector('.git-scm-history [data-git-source-selected=true]'));
    const source_row=document.querySelector('.git-scm-history [data-git-source-selected=true]');
    assert(source_row.dataset.historyFile===filename&&source_row.closest('[data-commit]').dataset.commit===second,'定位入口展开准确提交与文件');
    assert(app.workspace.activeLeaf===historical,'定位来源不切换比较正文');
    assert(getComputedStyle(source_row).backgroundColor!=='rgba(0, 0, 0, 0)','Git历史来源有实际选中底色');
    const history_scope=source_row.closest('.git-scm-history');
    const commit_row=history_scope.querySelector('.git-scm-history-commit[aria-expanded=true]');
    assert(getComputedStyle(commit_row).backgroundColor==='rgba(0, 0, 0, 0)','父提交只展开，不添加第二条选中底色');
    assert(Math.abs(source_row.getBoundingClientRect().left-document.querySelector('.git-scm-history-list').getBoundingClientRect().left)<1,'原生来源选中背景覆盖完整历史行');
    historical.view.containerEl.tabIndex=-1;historical.view.containerEl.focus();
    assert(source_row.dataset.gitSourceSelected==='true','焦点离开提交图仍保留比较文件选中');

    commit_row.click();await pause(150);
    let selected_commit=document.querySelector('.git-scm-history-commit[data-workspace-selected=true]');
    assert(selected_commit&&!document.querySelector('.git-scm-history [data-history-file][data-workspace-selected=true]'),'原生点击提交将选择从文件移交');
    history_scope.querySelector('.git-scm-history-commit[data-head=true]').click();await pause(150);
    selected_commit=history_scope.querySelector('.git-scm-history-commit[data-workspace-selected=true]');
    assert(selected_commit.querySelectorAll('.git-history-node circle').length===2&&selected_commit.querySelector('circle').getAttribute('r')==='7','原生HEAD使用7px外圈与2px内圈 '+JSON.stringify({hash:selected_commit.dataset.hash,head:selected_commit.dataset.head,svg:selected_commit.querySelector('svg.git-scm-history-topology')?.outerHTML}));
    assert(getComputedStyle(selected_commit.querySelector('circle')).stroke==='rgba(0, 0, 0, 0)','原生选中HEAD描边透明形成放大实心效果');
    historical.parent.containerEl.querySelector('[data-git-diff-reveal]').click();await wait(()=>document.querySelector('.git-scm-history [data-history-file][data-workspace-selected=true]'));
    assert(!document.querySelector('.git-scm-history-commit[data-workspace-selected=true]'),'原生定位文件清除父提交选择');

    historical.view.editor.toolbar.querySelector('[data-diff-open-file]').click();await wait(()=>!!app.workspace.activeLeaf?.view.document?.options.navigation);await settled();
    assert(!document.querySelector('.git-scm-history [data-git-source-selected=true]'),'历史单版本不沿用旧比较选中');
    const revision_leaf=app.workspace.activeLeaf,revision_article=revision_leaf.view.containerEl.querySelector('.git-revision-markdown').shadowRoot.querySelector('#write');
    assert(getComputedStyle(revision_article).fontFamily===getComputedStyle(document.querySelector('content > #write')).fontFamily,'历史单版本正文沿用当前主题字体');
    revision_leaf.view.document.options.navigation.restore({scroll_top:600,scroll_left:0});await settled();
    [...revision_article.querySelectorAll('a')].find(node=>node.textContent==='回到标题').click();await pause(100);assert(revision_leaf.view.document.options.navigation.capture().scroll_top<100,'历史阅读文内链接定位标题');
    alt('ArrowLeft');await settled();assert(app.workspace.activeLeaf===revision_leaf&&Math.abs(revision_leaf.view.document.options.navigation.capture().scroll_top-600)<2,'历史阅读显式文内跳转也可后退');
    document.querySelectorAll('.workspace-titlebar-history')[0].click();await wait(()=>app.workspace.activeLeaf===historical);await settled();
    assert(Math.abs(historical.view.editor.markdown_preview.scroll.scrollTop-500)<2,'历史版本打开原文后主顶栏后退恢复原比较');assert(document.querySelector('.git-scm-history [data-git-source-selected=true]')?.dataset.historyFile===filename,'后退返回比较同步来源选中');
    document.querySelectorAll('.workspace-titlebar-history')[1].click();await wait(()=>app.workspace.activeLeaf===revision_leaf);await settled();assert(revision_leaf.state.path.includes(encodeURIComponent(second)),'主顶栏前进返回正确提交版本');
    alt('ArrowLeft');await wait(()=>app.workspace.activeLeaf===historical);await settled();
    historical.view.editor.toolbar.querySelector('[data-diff-action=split_editor]').click();await wait(()=>app.workspace.activeLeaf!==historical&&app.workspace.activeLeaf?.view.editor);await settled();
    const split_leaf=app.workspace.activeLeaf;assert(split_leaf.parent!==historical.parent,'同版本比较可进入独立编辑组');
    split_leaf.view.editor.toolbar.querySelector('[data-diff-open-file]').click();await wait(()=>app.workspace.activeLeaf!==split_leaf);await settled();alt('ArrowLeft');await wait(()=>app.workspace.activeLeaf===split_leaf);await settled();assert(app.workspace.activeLeaf.parent===split_leaf.parent,'跨组导航恢复来源组实例');

    const probe=new diff.constructor({title:'wrap.cpp',file:'wrap.cpp',left:Array.from({length:100},(_,i)=>'int value_'+i+' = '+('123456789 + '.repeat(40))+'0;').join('\n')});
    Object.assign(probe.container.style,{position:'fixed',inset:'100px 80px 80px 400px',zIndex:'10000'});document.body.append(probe.container);await pause(150);
    assert(probe.wrapped&&probe.models[0].getLineCount()===100,'原生C++默认软换行保持逻辑行数');
    probe.editor.setScrollTop(probe.editor.getTopForPosition(40,140));const anchor=probe.capture_content_anchor();
    probe.context_menu(new MouseEvent('contextmenu',{clientX:500,clientY:200}));document.querySelector('[data-action=word_wrap]').click();await pause(100);
    assert(!probe.wrapped&&!historical.view.editor.wrapped&&Math.abs(probe.capture_content_anchor().line-anchor.line)<=1,'菜单关闭换行跨现有编辑器同步并保持内容 '+JSON.stringify({wrapped:probe.wrapped,other:historical.view.editor.wrapped,anchor,after:probe.capture_content_anchor(),height:probe.container.clientHeight,scroll:probe.editor.getScrollTop()} ));
    probe.context_menu(new MouseEvent('contextmenu',{clientX:500,clientY:200}));document.querySelector('[data-action=word_wrap]').click();probe.dispose();
    const sample='# 未修改标题\n\n原段落\n\n'+Array.from({length:100},(_,i)=>'## 章节 '+i+'\n\n正文 '+i+'\n\n').join('');
    const sample_diff=new diff.constructor({title:'mapping.md',file:'mapping.md',left:sample,right:sample.replace('原段落','插入段落\n\n原段落')});
    Object.assign(sample_diff.container.style,{position:'fixed',inset:'100px 80px 80px 400px',zIndex:'10000'});document.body.append(sample_diff.container);await wait(()=>sample_diff.markdown_preview.container.dataset.ready==='true');
    assert([...sample_diff.markdown_preview.shadow.querySelectorAll('h1')].every(node=>node.closest('[data-changed]').dataset.changed==='false'),'原生新增段落不误染未修改标题');
    for(let i=0;i<20;i++){
      const preview=sample_diff.markdown_preview;preview.restore({side:i%2?'left':'right',line:125+i*4,fraction:0});const before=sample_diff.capture_content_anchor();
      await sample_diff.set_markdown_mode(false);assert(Math.abs(sample_diff.capture_content_anchor().line-before.line)<=2,'原生渲染切源码保持当前内容 '+i);
      const editor=sample_diff.focused_editor();editor.setScrollTop(editor.getTopForLineNumber(61+i*4));const current=sample_diff.capture_content_anchor();
      await sample_diff.set_markdown_mode(true);await wait(()=>preview.container.dataset.ready==='true');assert(Math.abs(sample_diff.capture_content_anchor().line-current.line)<=2,'原生源码滚动后切渲染采用新位置 '+i);
    }
    const inline_diff=new diff.constructor({title:'inline.md',file:'inline.md',left:'# 保持标题\n\n这一段包含旧链接和 old 文字，其他内容保持。',right:'# 保持标题\n\n这一段包含新链接和 new 文字，其他内容保持。'});
    Object.assign(inline_diff.container.style,{position:'fixed',inset:'100px 80px 80px 400px',zIndex:'10001'});document.body.append(inline_diff.container);await wait(()=>inline_diff.markdown_preview.container.dataset.ready==='true');
    const inline_shadow=inline_diff.markdown_preview.shadow;
    assert([...inline_shadow.querySelectorAll('h1')].every(node=>node.closest('[data-changed]').dataset.changed==='false'),'原生行内修改不误标共同标题');
    assert([...inline_shadow.querySelectorAll('[data-diff-inline=left]')].map(n=>n.textContent).join('')==='旧old','原生行内精确标记中英文变化');
    assert([...inline_shadow.querySelectorAll('.markdown-diff-cell')].every(n=>getComputedStyle(n).backgroundColor==='rgba(0, 0, 0, 0)'),'原生对齐空白不着色');
    assert(getComputedStyle(inline_shadow.querySelector('[data-diff-inline=left]')).backgroundColor==='rgba(173, 7, 7, 0.15)','原生正式资产使用浅红透明色');
    assert([...inline_shadow.querySelectorAll('[data-side=right] p')].some(n=>getComputedStyle(n).boxShadow.includes('-4px')),'原生修改段落有4px定位侧线');
    fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'inline_diff_light'}));await pause(450);inline_diff.dispose();
    sample_diff.dispose();
    fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,limits:'原始Typora1.14.10/Win11，真实Git；renderer点击/键盘，不是物理鼠标或Win10现场。'},null,2));
    }
  }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'FAIL',checks,error:String(error),stack:error.stack},null,2));}
})();
