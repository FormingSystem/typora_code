// 只操作启动器的临时样例；验证已安装插件在原生 Typora 中的交互接线。
(() => {
  const script_url = new URL(document.currentScript.src);
  const root = decodeURIComponent(script_url.pathname).replace(/^\/(\w:)/u, '$1').replace(/\/workspace_interaction_native_test.js$/u, '');
  const result = {checks: []};
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value).replace(/\\/gu, '/').toLowerCase();
  const expect = (value, message) => { if (!value) throw new Error(message); result.checks.push(message); };
  const wait = async (ready, message) => { const start = Date.now(); while (!ready()) { if (Date.now() - start > 16000) throw new Error(message); await delay(60); } };
  const key = (target, name, code, modifiers = {}) => {
    const options = {key: name, code: name.length === 1 ? `Key${name.toUpperCase()}` : name, keyCode: code, which: code, bubbles: true, cancelable: true, ...modifiers};
    const event = new KeyboardEvent('keydown', options); target.dispatchEvent(event); target.dispatchEvent(new KeyboardEvent('keyup', options)); return event;
  };
  const dialog = title => [...document.querySelectorAll('.git-graph-dialog-shade')].find(node => node.getAttribute('aria-label') === title);
  const dialog_button = (node, label) => [...node.querySelectorAll('.git-graph-dialog-footer button')].find(button => button.textContent === label);
  const run = async () => {
    await wait(() => window.File?.bundle?.filePath, '原生文件未就绪');
    if (norm(File.bundle.filePath) !== norm(root + '/source.md')) return;
    const fs = reqnode('fs'), path = reqnode('path');
    const original_mount = File.getMountFolder;
    const original_source = fs.readFileSync(path.join(root, 'source.md'));
    const original_target = fs.readFileSync(path.join(root, 'target.md'));
    const scale_key = 'linux-note:lookup:preview-scale:v1';
    const original_scale = localStorage.getItem(scale_key);
    let app, original_width, sample_root;
    const focus_events=[];
    const record_focus=event=>{const target=event.target;focus_events.push({time:Date.now(),tag:target?.tagName,id:target?.id,class_name:target?.className,aria:target?.getAttribute?.('aria-label'),document_focused:document.hasFocus(),active_path:app?.workspace.activeLeaf?.state.path});};
    document.addEventListener('focusin',record_focus,true);
    const leaves = () => { const nodes = []; app.workspace.eachLeaves(leaf => { nodes.push(leaf); }); return nodes; };
    const present = leaf => leaves().includes(leaf);
    const close_tab = leaf => {
      const tab = [...leaf.parent.containerEl.querySelectorAll('.typ-tab[data-id]')].find(node => node.dataset.id === leaf.state.path);
      const close = tab?.querySelector('.typ-close');
      if (!close) throw new Error('未找到原生标签关闭按钮');
      close.click();
    };
    const open_code = async file_path => {
      await app.openFile(file_path);
      await wait(() => norm(app.workspace.activeLeaf?.view.file_path) === norm(file_path) && app.workspace.activeLeaf.view.loaded, `源码未加载：${path.basename(file_path)}`);
      await wait(() => app.workspace.activeLeaf.view.editor.focused_editor().hasTextFocus(), `打开源码后未自动获得文本焦点：${path.basename(file_path)}`);
      expect(true, `通过应用打开 ${path.basename(file_path)} 后自动获得源码键盘焦点`);
      return app.workspace.activeLeaf;
    };
    const replace_text = async (view, text) => {
      const editor = view.editor.focused_editor(); editor.focus(); editor.setSelection(editor.getModel().getFullModelRange());
      // 通过 Monaco 的输入命令验证可编辑状态，不能用 model.setValue 绕过只读限制。
      editor.trigger('keyboard', 'type', {text});
      await Promise.resolve();
      expect(editor.getModel().getValue().replace(/\r\n?/gu, '\n') === text.replace(/\r\n?/gu, '\n'), 'Monaco 输入命令可编辑普通文件');
    };
    const ctrl = (view, letter) => {
      const editor = view.editor.focused_editor(); editor.focus();
      // Monaco 0.56 的 Chromium 路径使用 native-edit-context；旧路径才是 textarea.inputarea。
      const editor_dom = editor.getDomNode(), focused = editor_dom.ownerDocument.activeElement;
      const input = editor_dom.contains(focused) && focused.matches('.native-edit-context,textarea.inputarea,textarea.ime-text-area') ? focused : editor_dom.querySelector('.native-edit-context,textarea.inputarea');
      if (!input) throw new Error('未找到 Monaco 文本输入区');
      return key(input, letter, letter.toUpperCase().charCodeAt(0), {ctrlKey: true});
    };
    try {
      await wait(() => document.documentElement.dataset.linuxNoteWorkspaceBrowser === 'ready' && document.documentElement.dataset.linuxNoteSourceEditing === 'ready', '工作区编辑集成未就绪');
      app = window[Symbol.for('typora-plugin-core@v2')].app;
      File.getMountFolder = () => root; window.resizeTo(1400, 950); await delay(350);
      await wait(() => document.body.classList.contains('unibody-window') && document.querySelector('#top-titlebar[data-workspace-titlebar="ready"]'), '新窗口未采用原生 Unibody 单行标题栏');
      const titlebar=document.querySelector('#top-titlebar'), titlebar_icon=titlebar.querySelector('.workspace-titlebar-icon');
      await wait(() => titlebar_icon?.complete && titlebar_icon.naturalWidth>0 && Math.abs(titlebar.getBoundingClientRect().width-window.innerWidth)<=1, '标题栏原生图标或全宽布局未就绪');
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const titlebar_bounds=titlebar.getBoundingClientRect();
      expect(Math.abs(titlebar_bounds.height-32)<=1 && Math.abs(titlebar_bounds.left)<=1 && Math.abs(titlebar_bounds.right-window.innerWidth)<=1, 'Unibody 顶栏保持 32 像素单行并横跨整个窗口');
      const titlebar_menus=[...titlebar.querySelectorAll('.workspace-titlebar-menu button')];
      expect(titlebar_menus.length===7 && titlebar_menus.every(node=>node.getBoundingClientRect().top>=titlebar_bounds.top && node.getBoundingClientRect().bottom<=titlebar_bounds.bottom), '七个中文主菜单与窗口标题处于同一行');
      expect(Math.abs(titlebar_icon.getBoundingClientRect().width-24)<=1 && titlebar_icon.currentSrc.includes('/assets/icon/') && titlebar_icon.complete && titlebar_icon.naturalWidth>0, '标题栏使用已加载的原生 Typora 图标并显示为 24 像素');
      await wait(()=>document.querySelector('.typ-workspace-root')?.getBoundingClientRect().top>=31, '编辑工作区未避开单行标题栏');
      expect(document.querySelector('.typ-workspace-root').getBoundingClientRect().top>=31, '中央编辑工作区排列在单行标题栏下方');
      const native_actions=document.querySelector('#ty-sidebar-footer'), native_status=document.querySelector('footer.ty-footer');
      expect(native_actions?.parentElement===native_status && !document.querySelector('#typora-sidebar > #ty-sidebar-footer'), '原生文件与大纲操作整组移到中央底部，侧栏不再留操作栏');
      expect(native_actions.querySelector('#sidebar-files-menu') && native_actions.querySelector('#sidebar-new-file-btn') && native_actions.querySelector('#switch-file-list-btn'), '原生文件菜单、新建和列表树切换仍保留原节点');
      original_width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'));
      sample_root = path.join(root, 'workspace_samples'); fs.mkdirSync(sample_root);
      const edit_path = path.join(sample_root, 'editable.test.ts');
      fs.writeFileSync(edit_path, 'const initial = 1;\r\n// 初始文本\r\n', 'utf8');

      if (!app.workspace.sidebar.isShown || !document.querySelector('#typora-sidebar').classList.contains('active-tab-outline')) app.workspace.ribbon.clickButton('core.outline');
      await wait(() => document.querySelector('#typora-sidebar').classList.contains('active-tab-outline') && app.workspace.sidebar.isShown, '原生大纲未展开');
      await delay(350);
      const sidebar_bounds=document.querySelector('#typora-sidebar').getBoundingClientRect();
      expect(sidebar_bounds.top>=31 && sidebar_bounds.bottom<=window.innerHeight+1, '主侧栏避开单行标题栏且底部不超出窗口');
      const outline = File.editor.library.outline;
      expect(typeof outline.showSearch === 'function', '原生大纲过滤接口存在');
      outline.showSearch();
      await wait(() => !document.querySelector('#typora-sidebar').classList.contains('ty-show-outline-filter') && !document.querySelector('#typora-sidebar').classList.contains('ty-on-outline-filter'), '大纲过滤状态未清理');
      expect(getComputedStyle(document.querySelector('#file-library-search')).display === 'none' && document.querySelector('#file-library-search-input').value === '', '大纲强制开启过滤后无重复查找框或旧查询残留');
      expect(getComputedStyle(document.querySelector('#outline-content')).paddingLeft === '0px' && getComputedStyle(document.querySelector('#outline-content')).paddingRight === '0px', '大纲外层左右多余缩进已移除');

      const sash = document.querySelector('#typora-sidebar-resizer[data-workspace-sidebar-sash="ready"]');
      expect(Boolean(sash) && sash.getAttribute('aria-label') === '调整主侧栏宽度', '原生分界线接入统一键盘和中文无障碍说明');
      const active_panel = app.workspace.sidebar.activePanel;
      const outline_content = document.querySelector('#outline-content');
      key(sash, 'End', 35); await delay(350);
      const maximum_width = Number(sash.getAttribute('aria-valuemax'));
      expect(Math.abs(Number(sash.getAttribute('aria-valuenow')) - maximum_width) <= 1, 'End 将主侧栏扩到保留编辑空间的最大宽度');
      expect(document.documentElement.clientWidth - Number(sash.getAttribute('aria-valuenow')) - document.querySelector('.typ-ribbon').getBoundingClientRect().width >= 219, '最大侧栏仍保留至少 220 像素编辑空间');
      key(sash, 'Home', 36); await delay(350);
      expect(Number(sash.getAttribute('aria-valuenow')) === 170, 'Home 将侧栏缩到 VS Code 的 170 像素最小展开宽度');
      key(sash, 'Enter', 13); await wait(() => !app.workspace.sidebar.isShown, 'Enter 未收起侧栏');
      expect(Number(sash.getAttribute('aria-valuenow')) === 0 && document.querySelector('.typ-ribbon').getBoundingClientRect().width > 0, '收起主侧栏后保留活动栏');
      key(sash, 'Enter', 13); await wait(() => app.workspace.sidebar.isShown, 'Enter 未恢复侧栏'); await delay(350);
      expect(app.workspace.sidebar.activePanel === active_panel && Number(sash.getAttribute('aria-valuenow')) === 170, 'Enter 恢复同一面板和上次有效宽度');
      app.workspace.ribbon.clickButton('core.outline'); await wait(() => !app.workspace.sidebar.isShown, '活动按钮未收起当前大纲');
      app.workspace.ribbon.clickButton('core.outline'); await wait(() => app.workspace.sidebar.isShown, '活动按钮未恢复当前大纲');
      // 核心启动时原生大纲可能可见而 activePanel 未初始化；首次真实活动按钮会校正它。
      expect(app.workspace.sidebar.activePanel?.ribbonButton?.id === 'core.outline' && document.querySelector('#outline-content') === outline_content && document.querySelector('#typora-sidebar').classList.contains('active-tab-outline'), '活动按钮往返恢复同一原生大纲内容与正确活动状态');
      // 后续预览测试使用较舒适的侧栏；最终恢复用户原宽度设置。
      for (let count = 0; count < 4; count++) key(sash, 'ArrowRight', 39, {shiftKey: true});
      await delay(350);

      let leaf = await open_code(edit_path); let view = leaf.view;
      const editor = view.editor.focused_editor();
      expect(!view.containerEl.querySelector('.monaco-diff-editor'), '普通文件在当前组使用单个源码编辑区');
      expect(getComputedStyle(view.containerEl.querySelector('.git-diff-toolbar')).display === 'none' && getComputedStyle(view.containerEl.querySelector('.git-diff-labels')).display === 'none', '普通文件不显示差异工具栏和只读标题两排控件');
      const global_status=document.querySelector('.linux-note-editor-status');
      expect(global_status?.parentElement===native_status&&view.status_controls.parentElement===global_status&&!view.containerEl.querySelector('.workspace-editor-status-controls,.workspace-file-footer'), '语言、编码、行尾只显示在全局底栏，源码编辑组没有局部状态行');
      expect(view.language_button.textContent === 'typescript' && view.encoding_button.textContent === 'UTF-8' && view.eol_button.textContent === 'CRLF', '底部显示真实 TypeScript、UTF-8 和 CRLF');
      const changed = 'const changed = 2;\n// 已保存中文\n'; await replace_text(view, changed);
      expect(view.dirty() && view.containerEl.dataset.modified === 'true', '输入后标记普通文件未保存状态');
      const draft_model = editor.getModel(), draft_view = view, initial_group = leaf.parent;
      const show_native = async () => {
        // 切换已有文档按用户的标签点击路径；app.openFile 在 open_code 中单独验收。
        const target = leaves().find(node => norm(node.state.path) === norm(path.join(root, 'source.md')));
        const tab = target && [...target.parent.containerEl.querySelectorAll('.typ-tab[data-id]')].find(node => node.dataset.id === target.state.path);
        if (!tab) throw new Error('未找到原生 Markdown 标签');
        tab.click();
        await wait(() => norm(app.workspace.activeLeaf?.state.path) === norm(path.join(root, 'source.md')), '未切回原生 Markdown 标签');
      };
      await show_native();
      await wait(()=>global_status.hidden&&!global_status.firstChild,'切换到 Markdown 后仍显示旧源码状态');
      expect(present(leaf) && !draft_model.isDisposed() && draft_view.dirty(), '切换到 Markdown 后后台源码模型和草稿仍存在');
      await open_code(edit_path);
      expect(app.workspace.activeLeaf === leaf && leaf.view === draft_view && leaf.view.editor.models[0] === draft_model && draft_model.getValue().replace(/\r\n?/gu, '\n') === changed, '切回源码保留同一模型与未保存文本');
      expect(global_status.firstChild===draft_view.status_controls&&!global_status.hidden,'切回源码后全局底栏恢复当前编辑器的原控件');

      const previous_leaves = new Set(leaves());
      app.commands.run('core.workspace:split-right', [path.join(root, 'source.md')]);
      await wait(() => leaves().some(node => !previous_leaves.has(node) && node.parent !== initial_group), '真实向右分栏命令未创建另一编辑组');
      const split_leaf = leaves().find(node => !previous_leaves.has(node) && node.parent !== initial_group);
      const split_group = split_leaf.parent;
      expect(leaf.view.editor.models[0] === draft_model && !draft_model.isDisposed() && draft_view.dirty(), '创建分栏不替换原源码模型或草稿');
      // 社区核心真实鼠标拖动使用 detach + insertChild，再激活原 leaf；不创建文件副本。
      leaf.detach(); split_group.insertChild(split_group.children.length, leaf); app.workspace.activeLeaf = leaf;
      await delay(100);
      expect(global_status.firstChild===draft_view.status_controls&&document.querySelectorAll('.linux-note-editor-status').length===1&&!document.querySelector('.linux-note-source-file .workspace-editor-status-controls'),'移动标签或创建分屏后仍只有一个全局源码状态栏');
      expect(!dialog('保存文件修改') && leaf.parent === split_group && !initial_group.children.includes(leaf) && split_group.children.filter(node => node === leaf).length === 1 && leaf.view === draft_view && leaf.view.editor.models[0] === draft_model && !draft_model.isDisposed() && draft_view.dirty(), '按真实拖动流程迁移未保存标签，保持同一模型且旧组无残留、不误弹关闭确认');
      await wait(() => leaf.view.editor.focused_editor().hasTextFocus(), '拖动后活跃源码未自动恢复键盘焦点');
      expect(true, '移动后的活跃源码自动获得键盘焦点');
      // keyboard type 会逐字解释换行，并在 Enter 前另分撤销组；这里用单字验证一个步骤。
      const moved_editor = leaf.view.editor.focused_editor(); moved_editor.focus(); moved_editor.pushUndoStop(); moved_editor.setPosition({lineNumber: 1, column: 1}); moved_editor.trigger('keyboard', 'type', {text: 'X'}); moved_editor.pushUndoStop();
      expect(draft_model.getValue().startsWith('Xconst changed'), '移动后的目标组保留正常源码输入能力');
      await draft_model.undo();
      expect(draft_model.getValue().replace(/\r\n?/gu, '\n') === changed, '移动后的同一模型撤销栈可恢复原草稿');
      moved_editor.pushUndoStop(); moved_editor.setPosition({lineNumber: 1, column: 1}); moved_editor.trigger('keyboard', 'type', {text: 'Y'}); moved_editor.pushUndoStop();
      expect(draft_model.getValue().startsWith('Yconst changed'), 'Ctrl+Z 用例创建独立单字编辑');
      const undo_event = ctrl(view, 'z');
      result.undo_key = {default_prevented: undo_event.defaultPrevented, editor_focused: moved_editor.hasTextFocus(), initial_text: draft_model.getValue().slice(0, 120)};
      await wait(() => draft_model.getValue().replace(/\r\n?/gu, '\n') === changed, 'Monaco 文本区 Ctrl+Z 未撤销独立编辑');
      expect(undo_event.defaultPrevented, '源码文本区 Ctrl+Z 经真实键盘绑定撤销到原草稿');
      leaf.detach(); initial_group.insertChild(initial_group.children.length, leaf); app.workspace.activeLeaf = leaf;
      await delay(100); close_tab(split_leaf); await wait(() => !present(split_leaf), '临时分栏未关闭');
      expect(leaf.parent === initial_group && draft_model.getValue().replace(/\r\n?/gu, '\n') === changed && draft_view.dirty(), '拖回原编辑组仍保留完整草稿');

      // 必须先确认已安装生产 guard；不替换原生属性处理器，也不发起真正 window.close。
      // 真实 close/原生回调顺序由独立 Electron lifecycle 套件验证；此处验证已安装接线。
      expect(window.onbeforeunload?.linux_note_source_guard === true && draft_view.dirty(), '原生退出回调已包装源码草稿保护，当前存在可验证的草稿');
      const close_event = new Event('beforeunload', {cancelable: true}); window.dispatchEvent(close_event);
      expect(close_event.defaultPrevented && Boolean(document.querySelector('[data-workspace-save-close]')), '已安装源码保护拦截退出事件并展示草稿确认');
      dialog_button(document.querySelector('[data-workspace-save-close]'), '关闭').click(); await delay(50);
      expect(present(leaf) && draft_view.dirty() && !draft_model.isDisposed(), '取消窗口关闭后保持源码标签和草稿');
      view.encoding_button.focus();
      expect(key(view.encoding_button,'s',83,{ctrlKey:true}).defaultPrevented, '焦点在全局状态栏时 Ctrl+S 仍被当前源码保存入口处理');
      await wait(() => !view.saving && !view.dirty(), 'Ctrl+S 未完成保存');
      expect(fs.readFileSync(edit_path).equals(Buffer.from(changed.replace(/\n/gu, '\r\n'), 'utf8')), 'Ctrl+S 实际写入 UTF-8 中文并保留 CRLF 字节');
      ctrl(view, 'f');
      await wait(() => view.containerEl.querySelector('.find-widget.visible'), 'Ctrl+F 未展开 Monaco 查找浮层');
      expect(Boolean(view.containerEl.querySelector('.find-widget.visible .monaco-findInput :is(input,textarea)')), 'Ctrl+F 在源码编辑器内显示查找输入框');
      key(document.activeElement, 'Escape', 27); await delay(80);

      const draft = 'const unsaved = 3;\n// 待处理草稿\n'; await replace_text(view, draft);
      const external = Buffer.from('const external = 4;\r\n// 外部进程内容\r\n', 'utf8'); fs.writeFileSync(edit_path, external);
      ctrl(view, 's');
      await wait(() => !view.saving && view.status.textContent.includes('其他进程'), '磁盘冲突未显示明确错误');
      expect(fs.readFileSync(edit_path).equals(external) && view.dirty() && editor.getModel().getValue().replace(/\r\n?/gu, '\n') === draft, '磁盘冲突拒绝覆盖外改并保留编辑草稿');
      close_tab(leaf); await wait(() => dialog('保存文件修改'), '关闭未保存文件未提示');
      dialog_button(dialog('保存文件修改'), '关闭').click(); await delay(80);
      expect(present(leaf) && view.dirty(), '取消关闭保留文件标签与草稿');

      await show_native(); app.workspace.ribbon.clickButton('core.search');
      await wait(() => document.querySelector('.linux-note-workspace-search'), '未显示搜索面板');
      const search = document.querySelector('.linux-note-workspace-search');
      search.querySelector('[aria-label="包含的文件"]').value = 'workspace_samples/editable.test.ts';
      const search_query = search.querySelector('[aria-label="搜索内容"]'); search_query.value = 'external'; search_query.dispatchEvent(new Event('input', {bubbles: true}));
      await wait(() => search.querySelectorAll('.workspace-search-match').length === 1, '后台写权限用例未得到唯一搜索结果');
      if (search.querySelector('.workspace-search-replace').hidden) search.querySelector('.workspace-search-replace-toggle').click();
      search.querySelector('[aria-label="替换"]').value = 'restored_after_close';
      search.querySelector('[aria-label="全部替换（先预览）"]').click();
      await wait(() => dialog('替换预览') && dialog_button(dialog('替换预览'), '确认替换'), '后台源码替换预览未就绪');
      dialog_button(dialog('替换预览'), '确认替换').click();
      await wait(() => dialog('替换预览')?.textContent.includes('相关文档有未保存修改'), '后台未保存源码没有阻止搜索写入');
      expect(fs.readFileSync(edit_path).equals(external) && present(leaf) && view.dirty(), '后台源码草稿经 can_write 阻止搜索替换，不改磁盘');
      dialog_button(dialog('替换预览'), '关闭').click();
      close_tab(leaf); await wait(() => dialog('保存文件修改'), '再次关闭未提示');
      dialog_button(dialog('保存文件修改'), '不保存并关闭').click(); await wait(() => !present(leaf), '不保存关闭未移除标签');
      expect(fs.readFileSync(edit_path).equals(external), '不保存关闭保留磁盘外部版本');
      search.querySelector('[aria-label="全部替换（先预览）"]').click();
      await wait(() => dialog('替换预览') && dialog_button(dialog('替换预览'), '确认替换'), '关闭后台标签后的替换预览未就绪');
      dialog_button(dialog('替换预览'), '确认替换').click();
      await wait(() => !dialog('替换预览') && fs.readFileSync(edit_path, 'utf8').includes('restored_after_close'), '后台源码关闭后仍被旧草稿写权限阻塞');
      expect(!present(leaf) && fs.readFileSync(edit_path).equals(Buffer.from(external.toString('utf8').replace('external', 'restored_after_close'), 'utf8')), '后台源码不保存关闭后 can_write 恢复，搜索替换按预览成功写入');

      leaf = await open_code(edit_path); view = leaf.view;
      const close_saved = 'const saved_on_close = 5;\n'; await replace_text(view, close_saved);
      close_tab(leaf); await wait(() => dialog('保存文件修改'), '保存关闭未提示');
      dialog_button(dialog('保存文件修改'), '保存并关闭').click(); await wait(() => !present(leaf), '保存并关闭未完成');
      expect(fs.readFileSync(edit_path).equals(Buffer.from(close_saved.replace(/\n/gu, '\r\n'), 'utf8')), '保存并关闭先保存正确编码和行尾再移除标签');
      await open_code(edit_path);

      const lookup_code = path.join(sample_root, 'lookup.test.ts'), lookup_markdown = path.join(sample_root, 'lookup.md');
      fs.writeFileSync(lookup_code, 'const header = 1;\n// 位置用例\nexport const workspace_probe_shared = 1;\nconst text = "workspace_probe_unique";\n// workspace_probe_shared tail\n', 'utf8');
      fs.writeFileSync(lookup_markdown, '# 临时预览\n\n**workspace_probe_shared**\n', 'utf8');
      const central = app.workspace.activeLeaf, central_selection = JSON.stringify(central.view.editor.focused_editor().getSelection());
      const original_leaves = leaves().length;
      if(!document.querySelector('.linux-note-workspace-search'))document.querySelector('.typ-ribbon-item[data-id="core.search"]').click(); await wait(() => document.querySelector('.linux-note-workspace-search'), '跳转侧栏未打开');
      const lookup = document.querySelector('.linux-note-workspace-search'); lookup.querySelector('[aria-label="包含的文件"]').value = 'workspace_samples/lookup*';
      const request = async query => {
        window.dispatchEvent(new CustomEvent('linux-note-search-selection', {detail: {query, source_path: edit_path, line: 1, column: 1}}));
        await wait(() => lookup.dataset.state === 'ready' && lookup.querySelector('[aria-label="搜索内容"]').value === query, '搜索查询未完成');
      };
      const preview_body = lookup.querySelector('.workspace-lookup-preview-body');
      await request('workspace_probe_shared');
      await wait(() => lookup.querySelectorAll('.workspace-search-match').length === 3 && preview_body.dataset.previewPath, '多处命中未展示预览');
      expect(lookup.querySelectorAll('.workspace-search-file').length === 2 && app.workspace.activeLeaf === central && leaves().length === original_leaves, '多文件查询只显示跳转列表和预览，不创建中央标签');
      expect(!document.querySelector('.typ-ribbon-item[data-id="linux_note:lookup"]') && !document.querySelector('.linux-note-workspace-lookup'), '手动搜索和选中文字只使用一个搜索侧栏与活动按钮');
      const group = file_path => [...lookup.querySelectorAll('.workspace-search-file')].find(node => norm(node.dataset.path) === norm(file_path));
      const markdown_match = group(lookup_markdown).querySelector('.workspace-search-match'); markdown_match.click();
      await wait(() => norm(preview_body.dataset.previewPath) === norm(lookup_markdown) && preview_body.querySelector('.workspace-lookup-markdown')?.shadowRoot.querySelector('strong'), 'Markdown 命中未渲染到侧栏预览');
      expect(app.workspace.activeLeaf === central && JSON.stringify(central.view.editor.focused_editor().getSelection()) === central_selection, '单击 Markdown 结果保留中央文档与精确选区');
      lookup.querySelector('[aria-label="收起预览"]').click();expect(lookup.querySelector('.workspace-search-preview-section').classList.contains('is-collapsed'), '搜索结果下方预览支持收起');markdown_match.click();
      expect(!lookup.querySelector('.workspace-search-preview-section').classList.contains('is-collapsed') && app.workspace.activeLeaf===central, '再次单击结果展开预览，中央文档保持不变');
      const code_match = group(lookup_code).querySelectorAll('.workspace-search-match')[1]; code_match.click();
      await wait(() => norm(preview_body.dataset.previewPath) === norm(lookup_code) && preview_body.querySelector('.monaco-editor'), '源码命中未进入侧栏预览');
      expect(app.workspace.activeLeaf === central, '单击源码命中只更新预览');
      const preview_heading=lookup.querySelector('.workspace-search-preview-heading'), search_heading=lookup.querySelector('.workspace-search-heading');
      const heading_bounds=preview_heading.getBoundingClientRect(), split_bounds=lookup.querySelector('.workspace-search-split').getBoundingClientRect(), query_bounds=lookup.querySelector('[aria-label="搜索内容"]').getBoundingClientRect();
      expect(preview_heading.tagName==='DIV'&&search_heading.tagName==='DIV'&&heading_bounds.top>=split_bounds.bottom-1&&query_bounds.top>=search_heading.getBoundingClientRect().bottom-1&&query_bounds.height>=20,'原生全局 header 样式不影响搜索与下方预览工具栏，搜索输入框完整可见');
      const slider = preview_heading.querySelector('[aria-label="预览字号比例"]');
      expect(slider.type === 'range' && slider.min === '50' && slider.max === '150', '预览比例使用 50% 到 150% 滑块');
      slider.value = '92'; slider.dispatchEvent(new Event('input', {bubbles: true}));
      await wait(()=>preview_heading.querySelector('output').value==='92%','预览工具栏百分比未同步');
      expect(lookup.querySelector('.workspace-lookup-preview').dataset.previewScale === '92'&&!dialog('跳转预览设置'), '直接拖动下方预览滑块更新比例，无须打开配置弹窗');
      const slider_bounds=slider.getBoundingClientRect();expect(slider_bounds.width>=48&&slider_bounds.top>=heading_bounds.top&&slider_bounds.bottom<=heading_bounds.bottom+1,'预览缩放滑块位于下方预览栏右上角');
      code_match.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, cancelable: true}));
      await wait(() => norm(app.workspace.activeLeaf.view.file_path) === norm(lookup_code) && app.workspace.activeLeaf.view.loaded, '双击未打开命中源码');
      const selected_editor = app.workspace.activeLeaf.view.editor.focused_editor();
      await wait(() => selected_editor.getSelection()?.startLineNumber === 5, '双击未定位第二个命中行');
      const selection = selected_editor.getSelection();
      expect(selection.startColumn === 4 && selected_editor.getModel().getValueInRange(selection) === 'workspace_probe_shared', '双击按精确行列打开第二个命中并选中匹配文本');
      const unique_central = app.workspace.activeLeaf, unique_selection = JSON.stringify(selection), unique_count = leaves().length;
      await request('workspace_probe_unique'); await wait(() => lookup.querySelectorAll('.workspace-search-match').length === 1, '唯一命中查询失败');
      await delay(150);
      expect(app.workspace.activeLeaf === unique_central && leaves().length === unique_count && JSON.stringify(selected_editor.getSelection()) === unique_selection, '唯一命中同样仅预览，不自动跳转或更改中央选区');

      const long_path = path.join(sample_root, 'preview_long.md');
      const long_lines = Array.from({length: 2500}, (_, index) => index % 2 ? '' : `第 ${index + 1} 行：用于验证长文档预览位置的独立段落。`);
      long_lines[0] = '# 长文档预览用例'; long_lines[2400] = '## 接近末尾的标题'; long_lines[2450] = '**workspace_preview_late_token**';
      fs.writeFileSync(long_path, long_lines.join('\n'), 'utf8');
      lookup.querySelector('[aria-label="包含的文件"]').value = 'workspace_samples/preview_long.md';
      await request('workspace_preview_late_token');
      const late_mark = () => preview_body.querySelector('.workspace-lookup-markdown')?.shadowRoot.querySelector('mark');
      const mark_visible = () => {
        const mark = late_mark(); if (!mark) return false;
        const bounds = mark.getBoundingClientRect(), viewport = preview_body.getBoundingClientRect();
        return bounds.top >= viewport.top && bounds.bottom <= viewport.bottom;
      };
      await wait(() => norm(preview_body.dataset.previewPath) === norm(long_path) && late_mark()?.textContent === 'workspace_preview_late_token' && mark_visible(), '长 Markdown 的末尾命中未定位到预览可见区域');
      expect(preview_body.scrollTop > 1000 && lookup.querySelectorAll('.workspace-search-match').length === 1, '2500 行 Markdown 自动滚动到第 2451 行命中');
      expect(!lookup.querySelector('.workspace-lookup-preview-title') && preview_body.parentElement.children.length === 1 && preview_body.getAttribute('aria-label').includes('preview_long.md'), '预览只保留正文区域，路径和行列通过无障碍标签说明');
      const preview_scroll = preview_body.scrollTop;
      const preview_reader = preview_body.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('#write');
      try {
        document.body.classList.add('workspace-native-theme-probe'); await delay(180);
        expect(Math.abs(preview_body.scrollTop - preview_scroll) < 2 && mark_visible() && preview_body.querySelector('.workspace-lookup-markdown').shadowRoot.querySelector('#write') === preview_reader, 'body 主题状态变化不重挂预览正文、不将末尾命中拉回文件开头');
      } finally { document.body.classList.remove('workspace-native-theme-probe'); }
      await delay(100);
      const preview = preview_body.parentElement, scale_before = Number(preview.dataset.previewScale);
      const central_scroll = selected_editor.getScrollTop(), central_font = getComputedStyle(document.querySelector('#write')).fontSize;
      const zoom_in = new WheelEvent('wheel', {deltaY: -120, ctrlKey: true, bubbles: true, composed: true, cancelable: true}); late_mark().dispatchEvent(zoom_in);
      await wait(() => Number(preview.dataset.previewScale) === Math.min(150, scale_before + 5) && mark_visible(), '预览 Ctrl+向上滚轮未按 5% 放大并保持命中可见');
      expect(zoom_in.defaultPrevented, '预览捕获 Ctrl+滚轮并阻止页面默认缩放');
      const scale_larger = Number(preview.dataset.previewScale);
      const zoom_out = new WheelEvent('wheel', {deltaY: 120, ctrlKey: true, bubbles: true, composed: true, cancelable: true}); late_mark().dispatchEvent(zoom_out);
      await wait(() => Number(preview.dataset.previewScale) === Math.max(50, scale_larger - 5) && mark_visible(), '预览 Ctrl+向下滚轮未按 5% 缩小');
      expect(zoom_out.defaultPrevented && Number(preview.dataset.previewScale) === scale_before && preview_body.scrollTop > 1000, '预览滚轮缩放往返保持字号与末尾阅读位置');
      expect(app.workspace.activeLeaf === unique_central && JSON.stringify(selected_editor.getSelection()) === unique_selection && selected_editor.getScrollTop() === central_scroll && getComputedStyle(document.querySelector('#write')).fontSize === central_font, '预览滚轮不改变中央文档、选区、滚动位置或正文字号');
      result.preview_position = {file_lines: 2500, match_line: 2451, scroll_before: preview_scroll, scroll_after: preview_body.scrollTop, scale_before, scale_larger, scale_after: Number(preview.dataset.previewScale), match_visible: mark_visible()};
      const graphics_path=path.join(sample_root,'preview_graphics.md');
      fs.writeFileSync(graphics_path,'# 代码和图表预览\n\n```c\nconst int workspace_preview_color_token = 42;\n```\n\n```mermaid\nflowchart LR\nA[开始] --> B[结束]\n```\n','utf8');
      lookup.querySelector('[aria-label="包含的文件"]').value='workspace_samples/preview_graphics.md';await request('workspace_preview_color_token');
      const preview_shadow=()=>preview_body.querySelector('.workspace-lookup-markdown')?.shadowRoot;
      await wait(()=>norm(preview_body.dataset.previewPath)===norm(graphics_path)&&preview_shadow()?.querySelector('.lookup-code-keyword')&&preview_shadow()?.querySelector('.lookup-diagram svg'),'原生 Markdown 预览没有实际代码颜色或 Mermaid SVG');
      const code_keyword=preview_shadow().querySelector('.lookup-code-keyword'), code_block=preview_shadow().querySelector('code.language-c');
      expect(getComputedStyle(code_keyword).color!==getComputedStyle(code_block).color&&preview_shadow().querySelector('mark').textContent==='workspace_preview_color_token','Markdown 围栏代码有真实关键字配色，命中标记仍精确');
      expect(preview_shadow().querySelector('.lookup-diagram svg').getBoundingClientRect().width>0&&app.workspace.activeLeaf===unique_central,'原生 Mermaid 渲染为可见 SVG，预览不切换中央文件');
      result.preview_graphics={keyword_color:getComputedStyle(code_keyword).color,text_color:getComputedStyle(code_block).color,svg_count:preview_shadow().querySelectorAll('.lookup-diagram svg').length};
      expect(norm(File.bundle.filePath) === norm(path.join(root, 'source.md')), '源码编辑和跳转预览没有切换原生 Markdown 文件');
      expect(fs.readFileSync(path.join(root, 'source.md')).equals(original_source) && fs.readFileSync(path.join(root, 'target.md')).equals(original_target), '原始 source.md 和 target.md 的磁盘字节保持不变');
      // 截图由主代理用已授权的原生窗口工具完成；夹具只发出就绪信号，不猜测宿主截图 IPC。
      const capture_ack=path.join(root,'capture_ack');
      fs.writeFileSync(path.join(root,'capture_request.json'),JSON.stringify({title:document.title,displayed_title:document.querySelector('#title-text')?.textContent,native_path:File.bundle.filePath,active_path:app.workspace.activeLeaf.state.path,request_time:new Date().toISOString(),width:innerWidth,height:innerHeight,expected:'单行标题栏、搜索结果与下方图表预览、中央源码和唯一全局底栏'},null,2),'utf8');
      const capture_started=Date.now();while(!fs.existsSync(capture_ack)&&Date.now()-capture_started<45000)await delay(100);
      result.capture_acknowledged=fs.existsSync(capture_ack);
      result.status = 'PASS';
    } catch (error) {
      result.status = 'FAIL'; result.error = String(error.stack);
      const sidebar_html = document.querySelector('#sidebar-content')?.outerHTML || '';
      fs.writeFileSync(path.join(root, 'sidebar_failure.html'), sidebar_html, 'utf8');
      result.sidebar = {classes: document.querySelector('#typora-sidebar')?.className, active_panel: app?.workspace.sidebar.activePanel?.ribbonButton?.id, html_file: 'sidebar_failure.html'};
      result.active = {path: app?.workspace.activeLeaf?.state.path, status: app?.workspace.activeLeaf?.view.status?.textContent};
      const focused_editor=app?.workspace.activeLeaf?.view.editor?.focused_editor();
      result.focus={document_focused:document.hasFocus(),active_element:document.activeElement?.outerHTML.slice(0,1000),editor_focused:focused_editor?.hasTextFocus(),active_in_editor:focused_editor?.getDomNode()?.contains(document.activeElement),events:focus_events};
      if (app) result.leaves = leaves().map(node => ({path: node.state.path, type: node.type, active: node === app.workspace.activeLeaf, opened: node.view.isOpen, group_size: node.parent?.children?.length}));
      const active_model = app?.workspace.activeLeaf?.view.editor?.models?.[0];
      if (active_model && !active_model.isDisposed()) result.active.model_text = active_model.getValue().slice(0, 1000);
    } finally {
      document.removeEventListener('focusin',record_focus,true);
      // 失败时也仅丢弃临时样例草稿，防止测试窗口被自己的关闭保护留在桌面。
      try {
        for (const node of document.querySelectorAll('.git-graph-dialog-shade')) dialog_button(node, '关闭')?.click();
        if (app && sample_root) for (const leaf of leaves()) {
          const relative = leaf.view.file_path ? path.relative(sample_root, leaf.view.file_path) : '..';
          if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) continue;
          leaf.parent.removeTab(leaf.state.path);
          const pending = dialog('保存文件修改'); if (pending) dialog_button(pending, '不保存并关闭')?.click();
        }
        if (Number.isFinite(original_width)) JSBridge.putSetting('sidebar-width', original_width);
        if (original_scale === null) localStorage.removeItem(scale_key); else localStorage.setItem(scale_key, original_scale);
      } catch (error) { result.cleanup_error = String(error.stack); result.status = 'FAIL'; }
      File.getMountFolder = original_mount;
      fs.writeFileSync(path.join(root,'focus_events.json'),JSON.stringify(focus_events,null,2),'utf8');result.focus_events_file='focus_events.json';
      if (!fs.readFileSync(path.join(root, 'source.md')).equals(original_source) || !fs.readFileSync(path.join(root, 'target.md')).equals(original_target)) { result.status = 'FAIL'; result.preservation_error = '原生测试源文档字节发生变化'; }
      fs.writeFileSync(path.join(root, 'result_1.json'), JSON.stringify(result, null, 2));
      window.close();
    }
  };
  void run();
})();
