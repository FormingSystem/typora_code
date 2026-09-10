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
      window.resizeTo(1400, 950); await delay(300);
      const app = window[Symbol.for('typora-code:workspace')].app;
      const source_leaf = app.workspace.activeLeaf;
      await wait(() => document.querySelector('.typ-ribbon-item[data-id="core.file-explorer"] [data-git-icon="files"]'));
      const close_to = (actual, expected) => Math.abs(actual - expected) < .2;
      const activity_icons = { 'core.file-explorer':'files', 'core.search':'search', 'linux_note:source_control':'source-control' };
      expect(Object.entries(activity_icons).every(([id, name]) => {
        const item = document.querySelector(`.typ-ribbon-item[data-id="${id}"]`), icon = item?.querySelector('svg');
        return icon?.dataset.gitIcon === name && item.querySelectorAll('svg').length === 1 && close_to(icon.getBoundingClientRect().width,24) && close_to(icon.getBoundingClientRect().height,24);
      }), 'file search and Git activity use official Codicons on equal 24px canvases');
      const outline_activity = document.querySelector('.typ-ribbon-item[data-id="core.outline"]');
      expect(outline_activity.querySelector('i.fa.fa-list.typ-lighter-icon') && !outline_activity.querySelector('svg'), 'Outline keeps the original native list icon');
      expect(document.body.classList.contains('native-window') && !document.querySelector('.workspace-titlebar-menu,.workspace-window-icon'),
        'standard Typora window owns its menu bar and window controls without duplicate renderer controls');
      result.language = {plugin:window[Symbol.for('typora-code:workspace:env')]?.userLang,displayLang:window._options?.displayLang,userLang:window._options?.userLang,appLocale:window._options?.appLocale,locale:window._options?.locale,fileDisplayLang:File.option?.displayLang,fileUserLang:File.option?.userLang,fileLocale:File.option?.locale,html:document.documentElement.lang,body:document.body.lang,navigator:navigator.languages};
      await wait(() => document.querySelector('[data-linux-note-git-status]')?.dataset.repository === 'ready');
      expect(document.querySelector('[data-git-status=branch]').textContent.includes('main*'), 'native left status bar shows branch and dirty marker');
      expect(document.querySelector('[data-git-status=sync]') && document.querySelector('[data-git-status=graph]'), 'native status bar exposes sync and graph actions');
      const source_bytes = fs.readFileSync(path.join(probe_root, 'source.md'));
      const index_bytes = fs.readFileSync(path.join(probe_root, '.git/index'));
      const content = document.querySelector('content');
      await delay(1200);
      content.scrollTop = 620; await delay(600); const original_scroll = content.scrollTop;
      expect(original_scroll > 500, 'source starts at a nonzero reading position');
      // 独立大纲活动入口复用原生树，重复命令只聚焦，不切换文档。
      const native_outline=document.querySelector('#outline-content');const native_outline_parent=native_outline.parentNode;
      result.outline_before = { shown: app.workspace.sidebar.isShown, active: app.workspace.sidebar.activePanel?.ribbonButton?.id, classes: native_outline_parent.className, items: native_outline.querySelectorAll('.outline-item').length };
      // 原生启动会恢复用户上次选择的面板；明确从收起状态验证第一次展开。
      app.workspace.sidebar.hide();
      app.workspace.ribbon.clickButton('core.outline');
      await wait(() => app.workspace.sidebar.isShown && app.workspace.sidebar.activePanel?.ribbonButton?.id === 'core.outline' && native_outline.querySelector('.outline-item'));
      expect(document.querySelectorAll('#outline-content').length===1 && native_outline.parentNode===native_outline_parent, 'Outline activity reveals the original native tree without relocating it');
      app.workspace.ribbon.clickButton('core.outline');
      await wait(() => !app.workspace.sidebar.isShown);
      expect(true, 'same Outline icon collapses sidebar');
      app.commands.run('linux_note:outline');
      await wait(() => app.workspace.sidebar.isShown && app.workspace.sidebar.activePanel?.ribbonButton?.id === 'core.outline');
      app.commands.run('linux_note:outline');
      expect(app.workspace.sidebar.isShown && app.workspace.activeLeaf === source_leaf && Math.abs(content.scrollTop-original_scroll)<2, 'repeated Outline command preserves current document and reading position');
      app.workspace.ribbon.clickButton('core.file-explorer');
      await wait(() => app.workspace.sidebar.isShown && app.workspace.sidebar.activePanel?.ribbonButton?.id === 'linux_note:file_explorer');
      app.workspace.ribbon.clickButton('core.file-explorer');
      await wait(() => !app.workspace.sidebar.isShown); expect(true, 'same file icon collapses sidebar');
      app.workspace.ribbon.clickButton('core.file-explorer');
      await wait(() => app.workspace.sidebar.isShown && app.workspace.sidebar.activePanel?.ribbonButton?.id === 'linux_note:file_explorer');
      expect(getComputedStyle(document.querySelector('#outline-btn-wrapper')).display === 'none', 'redundant footer sidebar control removed');
      app.workspace.ribbon.clickButton('linux_note:source_control');
      await wait(() => app.workspace.sidebar.isShown && app.workspace.sidebar.activePanel?.ribbonButton?.id === 'linux_note:source_control' && document.querySelector('.git-scm-sidebar .git-scm-file'));
      await delay(250);
      app.workspace.ribbon.clickButton('linux_note:source_control');
      await wait(() => !app.workspace.sidebar.isShown); expect(true, 'same Git icon collapses sidebar');
      app.workspace.ribbon.clickButton('linux_note:source_control');
      await wait(() => document.querySelector('.git-scm-sidebar .git-scm-file')); expect(true, 'Git icon reopens source control');
      app.commands.run('linux_note:outline');
      await wait(() => app.workspace.sidebar.activePanel?.ribbonButton?.id === 'core.outline' && document.querySelector('#outline-content .outline-item'));
      app.workspace.ribbon.clickButton('linux_note:source_control');
      await wait(() => document.querySelector('.git-scm-sidebar .git-scm-file'));
      expect(app.workspace.sidebar.isShown && app.workspace.sidebar.activePanel?.ribbonButton?.id === 'linux_note:source_control', 'switching native Outline to Git keeps sidebar open');
      expect(document.querySelectorAll('.git-scm-group').length === 2 && !document.querySelector('[data-scm-group=untracked]'), 'source control has staged and changes groups only');
      expect(document.querySelectorAll('.git-scm-tools button').length===1&&document.querySelector('.git-scm-tools [data-git-icon=more]'),'SCM top title keeps only view selection menu');
      expect(document.querySelector('.git-scm-history-refresh')&&document.querySelector('.git-scm-graph-launch'),'Graph retains refresh and open-in-editor actions');
      const scm_box = node => { const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,display:style.display,visibility:style.visibility,opacity:style.opacity,transform:style.transform,color:style.color,font:style.fontSize,weight:style.fontWeight}; };
      let scm_groups=[...document.querySelectorAll('.git-scm-group')];
      const previous_open=scm_groups.map(group=>group.open);scm_groups.forEach(group=>{group.open=true;});await delay(40);scm_groups=[...document.querySelectorAll('.git-scm-group')];
      result.scm_geometry={header_rows:[...document.querySelectorAll('.git-scm-input-heading,.git-scm-history-header')].map(scm_box),groups:scm_groups.map(group=>{const summary=group.querySelector('summary');return{id:group.dataset.scmGroup,empty:!group.querySelector('.git-scm-file'),summary:scm_box(summary),icon:scm_box(summary.querySelector('.git-disclosure-icon')),label:scm_box(summary.querySelector('.git-scm-group-label'))};}),headers:[scm_box(document.querySelector('.git-scm-input-heading>.git-disclosure-icon')),scm_box(document.querySelector('.git-scm-history-toggle>.git-disclosure-icon'))],commit:[...document.querySelectorAll('.git-scm-commit-bar>button')].map(button=>({text:scm_box(button).color,icon:scm_box(button.querySelector('svg')).color}))};
      expect(result.scm_geometry.header_rows.length===2&&result.scm_geometry.header_rows.every(row=>row.height===22),'SCM view headers retain the flat 22px baseline');
      expect(result.scm_geometry.groups.some(group=>group.empty),'native fixture covers an empty SCM group');
      for(const group of result.scm_geometry.groups){expect(group.summary.height===22&&group.summary.font==='13px'&&group.summary.weight==='400','SCM '+group.id+' is a regular 22px tree group');expect(group.icon.width===16&&group.icon.height===16&&group.icon.visibility==='visible'&&group.icon.display!=='none'&&group.icon.opacity==='1'&&group.icon.x+16<=group.label.x,'SCM '+group.id+' has a visible unobscured official twistie');}
      expect(result.scm_geometry.groups[0].icon.x===result.scm_geometry.groups[1].icon.x,'SCM group twisties share a column');
      expect(result.scm_geometry.headers[0].x===result.scm_geometry.headers[1].x&&result.scm_geometry.headers.every(icon=>icon.width===16&&icon.height===16),'Changes and Graph view header twisties share a 16px column');
      expect(result.scm_geometry.commit.every(button=>button.icon===button.text&&button.text==='rgb(255, 255, 255)'),'primary commit check and dropdown glyphs inherit white foreground');
      expect(!document.querySelector('.git-scm-filter')&&document.querySelector('.git-scm-inputs').nextElementSibling.classList.contains('git-scm-groups'),'SCM resource groups follow commit input without an extra filter box');
      result.scm_toggle_diagnostics=[];
      const current_group=id=>document.querySelector('.git-scm-group[data-scm-group="'+id+'"]');
      const toggle_state=(id,clicked)=>{
        const live=current_group(id),icon=live?.querySelector('summary>.git-disclosure-icon');
        return{id,clicked_connected:clicked?.isConnected,clicked_open:clicked?.open,same_node:live===clicked,live_connected:live?.isConnected,live_open:live?.open,transform:icon?getComputedStyle(icon).transform:null};
      };
      const toggle_and_check=async(id,open)=>{
        const clicked=current_group(id);
        expect(clicked?.isConnected&&clicked.open!==open,'SCM '+id+' toggle starts from the current connected opposite state');
        result.scm_toggle_diagnostics.push({phase:'before',...toggle_state(id,clicked)});
        clicked.querySelector('summary').click();
        let stable=0,last;const deadline=Date.now()+3000;
        while(Date.now()<deadline){
          last=toggle_state(id,clicked);
          const correct=last.live_connected&&last.live_open===open&&last.transform===(open?'matrix(0, 1, -1, 0, 0, 0)':'none');
          stable=correct?stable+1:0;if(stable>=3)break;await delay(60);
        }
        result.scm_toggle_diagnostics.push({phase:'after',...last,stable});
        expect(stable>=3,'SCM '+id+(open?' expanded points down':' collapsed points right'));
      };
      for(const id of ['staged','changes']){await toggle_and_check(id,false);await toggle_and_check(id,true);}
      ['staged','changes'].forEach((id,index)=>{const group=current_group(id);if(group)group.open=previous_open[index];});
      const changes_parent=document.querySelector('.git-scm-input-section'),changes_body=changes_parent.querySelector('.git-scm-changes-body');
      const commit_message=changes_body.querySelector('.git-scm-message'),old_message=commit_message.value;
      commit_message.value='parent fold draft';commit_message.dispatchEvent(new Event('input',{bubbles:true}));
      const child_open=[...changes_body.querySelectorAll('.git-scm-group')].map(group=>group.open);
      const graph_position=document.querySelector('.git-scm-history-header').getBoundingClientRect().y;
      changes_parent.querySelector(':scope>summary').click();await delay(120);
      expect(!changes_parent.open&&changes_body.inert&&[...changes_body.querySelectorAll('textarea,button,summary')].every(node=>!node.getClientRects().length),'native Changes parent hides both child groups and commit controls');
      commit_message.focus();expect(document.activeElement!==commit_message,'native collapsed Changes body cannot receive focus');
      expect(document.querySelector('.git-scm-history-header').getBoundingClientRect().y===graph_position,'native parent fold leaves Graph position independent');
      const group_before_refresh=changes_body.querySelector('.git-scm-group');
      document.querySelector('.git-scm-history-refresh').click();
      await wait(()=>changes_body.querySelector('.git-scm-group')!==group_before_refresh,'SCM parent-fold refresh did not complete');
      expect(!changes_parent.open&&changes_body.inert,'native SCM refresh preserves collapsed parent');
      changes_parent.querySelector(':scope>summary').click();await delay(120);
      expect(commit_message.value==='parent fold draft'&&[...changes_body.querySelectorAll('.git-scm-group')].every((group,index)=>group.open===child_open[index]),'native parent reopen keeps draft and independent child states');
      commit_message.value=old_message;commit_message.dispatchEvent(new Event('input',{bubbles:true}));
      result.scm_geometry.references=[...document.querySelectorAll('.git-scm-history-ref')].map(ref=>({text:scm_box(ref).color,icon:scm_box(ref.querySelector('svg')).color}));
      expect(result.scm_geometry.references.length>0&&result.scm_geometry.references.every(ref=>ref.text===ref.icon),'SCM history reference glyphs retain the badge foreground');
      const scm_icon = document.querySelector('.typ-ribbon-item[data-id="linux_note:source_control"]');
      const explorer_icon = document.querySelector('.typ-ribbon-item[data-id="core.file-explorer"]');
      expect(scm_icon.closest('.group.top') && scm_icon.getBoundingClientRect().top > explorer_icon.getBoundingClientRect().top && getComputedStyle(document.querySelector('.typ-ribbon-item[data-id="core.outline"]')).display !== 'none', 'Git follows Explorer in top activity group alongside the restored Outline activity');
      expect(!document.querySelector('.typ-ribbon-item[data-id="linux_note:git_graph"]'), 'old bottom Git icon removed');
      expect(app.workspace.activeLeaf === source_leaf, 'source control opens sidebar without replacing document');
      expect(document.querySelector('#sidebar-content .git-scm-sidebar'), 'source control uses native primary sidebar');
      expect(document.querySelectorAll('.git-scm-history-commit').length === 4, 'sidebar shows real commit history by default');
      expect(document.querySelectorAll('.git-scm-history-commit .git-scm-history-topology circle').length === 4, 'sidebar history includes graph nodes');
      document.querySelector('.git-scm-history-commit .git-scm-history-topology circle').dispatchEvent(new MouseEvent('click', {bubbles:true}));
      await wait(() => document.querySelector('[data-history-file]'));
      expect(app.workspace.activeLeaf === source_leaf, 'expanding sidebar commit leaves current document open');
      expect(document.querySelector('[data-history-file]').dataset.historyFile === '中文 #%.md', 'sidebar expands the selected commit files');
      document.querySelector('.git-scm-history-commit .git-scm-history-topology circle').dispatchEvent(new MouseEvent('click', {bubbles:true}));
      expect(!document.querySelector('[data-history-file]') && app.workspace.activeLeaf === source_leaf, 'clicking the same graph node collapses files without switching document');
      expect(document.querySelector('.git-scm-history-sash').getAttribute('aria-orientation') === 'horizontal', 'sidebar history exposes an adjustable horizontal separator');
      document.querySelector('.git-scm-graph-launch').click();
      await wait(() => document.querySelector('.linux-note-git-graph')?.dataset.state === 'ready', 'Graph did not load');
      const graph = document.querySelector('.linux-note-git-graph'); const graph_leaf = app.workspace.activeLeaf;
      const graph_tab = [...document.querySelectorAll('.typ-tab[data-id]')].find(tab => tab.dataset.id === graph_leaf.state.path);
      const explicit_language = result.language.plugin || result.language.displayLang || result.language.userLang;
      if(!explicit_language && result.language.appLocale) expect(graph.getAttribute('aria-label') === (/^zh(?:-|_|$)/iu.test(result.language.appLocale) ? 'Git Graph 提交历史' : 'Git Graph commit history'), 'Graph locale matches native appLocale despite document HTML language');
      const graph_tab_icon = graph_tab?.querySelector('.typ-file-icon.git-tab-icon svg[data-graph-tab-theme]');
      await delay(180);
      expect(graph_tab_icon&&['::before','::after'].every(pseudo=>{const value=getComputedStyle(graph_tab_icon.parentElement,pseudo);return value.content==='none'||value.content==='normal'||value.display==='none'}),'Git Graph owned SVG slot has no late native pseudo glyph');
      expect(graph_tab_icon && graph_tab.querySelectorAll('.typ-file-icon svg').length === 1 && graph_tab_icon.dataset.graphTabTheme === graph_leaf.view.panel.settings.tab_icon_theme && graph_tab_icon.querySelectorAll('path').length === 2 && graph_tab_icon.querySelectorAll('circle').length === 3 && !graph_tab.querySelector('.typ-file-icon.fa-file-o'), 'Git Graph tab has one two-lane graph icon using selected colour theme');
      const feature_badge = graph.querySelector('[data-ref="refs/heads/feature"]');
      expect(feature_badge && getComputedStyle(feature_badge.querySelector('svg')).backgroundColor === getComputedStyle(feature_badge.closest('[data-hash]').querySelector('.git-graph-cell circle')).fill, 'native feature reference icon background matches its graph lane colour');
      const settings_before = JSON.stringify(graph_leaf.view.panel.settings);
      graph_leaf.view.panel.settings_dialog();
      await wait(() => document.querySelector('.git-graph-settings-form'));
      const settings_surface = document.querySelector('.git-graph-settings-form');
      expect(settings_surface.querySelectorAll('[data-setting]').length === Object.keys(graph_leaf.view.panel.settings).length, 'native simple settings lists every repository setting');
      expect(!document.querySelector('[data-settings-category],[data-settings-search]'), 'native settings retains the simple baseline form');
      document.querySelector('[data-settings-action=save]').click();
      await wait(() => !document.querySelector('.git-graph-settings-form') && !graph_leaf.view.panel.pending);
      expect(JSON.stringify(graph_leaf.view.panel.settings) === settings_before, 'native no-edit settings save preserves every action default');
      expect(normalized(File.bundle.filePath) === normalized(path.join(probe_root, 'source.md')), 'native settings save retains the reading document');
      const commits = node => node.querySelectorAll('.git-graph-row:not(.git-graph-worktree)');
      const refresh = node => node.querySelector('.git-graph-refresh').click();
      expect(normalized(graph_leaf.view.panel.root) === normalized(probe_root), 'repository discovered from active document');
      expect(commits(graph).length === 4, 'real commit history rendered in workspace tab');
      expect([...commits(graph)].reduce((count,row)=>count+row.querySelectorAll('svg circle').length,0) === 4, 'one graph node per commit');
      const merge_svg = commits(graph)[0].querySelector('svg'); const merge_y = merge_svg.querySelector('circle').cy.baseVal.value;
      expect(graph_leaf.view.panel.state.commits[0].parents.length === 2 && [...merge_svg.querySelectorAll('path')].filter(edge=>Math.abs(edge.getPointAtLength(0).y-merge_y)<0.01).length === 2, 'merge node has two outgoing parent edges independently of worktree incoming edge');
      expect(!graph.querySelector('img') && graph.textContent.includes('<img src=x onerror=alert(1)>'), 'commit text is displayed without interpreting HTML');
      expect(File.bundle.filePath === source_leaf.state.path, 'opening graph does not switch native document');
      app.commands.run('linux_note:git_graph');
      expect(document.querySelectorAll('.linux-note-git-graph').length === 1, 'reopening active graph does not duplicate tab');
      commits(graph)[0].click();
      await wait(() => graph.querySelector('.git-graph-file'));
      expect(graph.querySelectorAll('.git-graph-parent option').length === 2, 'merge exposes both parents');
      expect(graph.querySelector('.git-graph-file').textContent.includes('中文 #%.md'), 'first parent changed file preserves Unicode and punctuation');
      graph.querySelector('.git-graph-file').click();
      await wait(() => document.querySelector('[data-diff-ready=true]'), 'Monaco native diff did not compute');
      expect(document.querySelectorAll('.monaco-diff-editor .monaco-editor').length >= 2, 'file click opens real Monaco side by side diff');
      const diff_editor = app.workspace.activeLeaf.view.editor.editor;
      expect(diff_editor.getOriginalEditor().getLayoutInfo().verticalScrollbarWidth === 8 && diff_editor.getModifiedEditor().getLayoutInfo().verticalScrollbarWidth === 8, 'native diff retains a thin scrollbar on each side');
    expect(diff_editor.getOriginalEditor().getLayoutInfo().minimap.minimapWidth === 0 && diff_editor.getModifiedEditor().getLayoutInfo().minimap.minimapWidth === 0, 'native diff omits both full-text minimaps');
      expect([...document.querySelectorAll('.typ-tab .typ-file-basename')].some(node => ['中文 #%.md（更改）','中文 #%.md (Changes)'].includes(node.textContent)), 'Chinese diff tab name is readable and safely rendered');
      const diff_bounds = document.querySelector('.git-monaco-body').getBoundingClientRect();
      expect(diff_bounds.height > 400 && diff_bounds.width > 500, 'diff occupies central editor area');
      expect(document.querySelector('#sidebar-content .git-scm-sidebar') && document.querySelector('[data-scm-group=changes] [data-file="source.md"]'), 'source control sidebar shows uncommitted draft');
      expect(!graph.querySelector('.git-scm-sidebar, .git-workbench-tabs, .git-workbench-activity'), 'graph has no nested sidebar activity bar or tabs');
      app.workspace.activeLeaf = graph_leaf.parent.toggleTab(graph_leaf.state.path);
      const parent = graph.querySelector('.git-graph-parent'); parent.selectedIndex = 1; parent.dispatchEvent(new Event('change'));
      await wait(() => graph.querySelector('.git-graph-file')?.textContent.includes('target.md'));
      expect(true, 'switching merge parent updates comparison files');
      const branch = graph.querySelector('.git-graph-branch'); branch.value = 'refs/heads/feature'; branch.dispatchEvent(new Event('change'));
      await wait(() => graph.dataset.state === 'ready' && commits(graph).length === 2);
      expect(true, 'branch selector narrows topology');
      const search_panel = graph_leaf.view.panel; search_panel.close_details(); graph.querySelector('.git-graph-find-toggle').click();
      const search = graph.querySelector('.git-graph-search'); search.value = 'Initial'; search.dispatchEvent(new Event('input',{bubbles:true}));
      await wait(() => search_panel.finder.matches.length === 1 && graph.querySelector('mark.git-graph-find-match'));
      expect(!search_panel.selected, 'Find highlights a match without opening details by default');
      search_panel.finder.details_button.click();
      await wait(() => graph.querySelector('.git-graph-commit-title')?.textContent.includes('Initial'));
      expect(true, 'Find optional details switch opens matching loaded commit');
      search_panel.finder.details_button.click(); search_panel.close_find();
      app.workspace.activeLeaf = source_leaf.parent.toggleTab(source_leaf.state.path);
      await wait(() => { result.source_scroll = { expected: original_scroll, actual: content.scrollTop }; return Math.abs(content.scrollTop - original_scroll) < 1; }, 'Source reading position changed');
      expect(true, 'returning to source preserves reading position');
      await wait(() => !graph_leaf.view.panel.pending);
      const existing_row = graph.querySelector('.git-graph-row'), existing_detail = graph.querySelector('.git-graph-detail-content');
      for (let index = 0; index < 6; index++) {
        app.workspace.activeLeaf = graph_leaf.parent.toggleTab(graph_leaf.state.path);
        const hidden_style = getComputedStyle(content);
        expect(hidden_style.visibility === 'hidden' && hidden_style.transitionDuration === '0s' && content.getAnimations().length === 0, 'native switch ' + index + ' immediately hides Markdown without a shrinking canvas');
        await new Promise(resolve => requestAnimationFrame(resolve));
        expect(graph.querySelector('.git-graph-row') === existing_row && graph.querySelector('.git-graph-detail-content') === existing_detail && !graph_leaf.view.panel.pending, 'native switch ' + index + ' retains graph rows and details without restarting a query');
        app.workspace.activeLeaf = source_leaf.parent.toggleTab(source_leaf.state.path);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      app.workspace.activeLeaf = graph_leaf.parent.toggleTab(graph_leaf.state.path);
      await delay(350);
      refresh(graph);
      await wait(() => graph.dataset.state === 'ready');
      expect(commits(graph).length === 2, 'refresh retains selected branch');
      expect(fs.readFileSync(path.join(probe_root, 'source.md')).equals(source_bytes), 'uncommitted Markdown remains byte-identical');
      expect(fs.readFileSync(path.join(probe_root, '.git/index')).equals(index_bytes), 'Git index remains byte-identical');
      const bounds = graph.getBoundingClientRect();
      result.layout = { viewport: [innerWidth, innerHeight], bounds: bounds.toJSON() };
      expect(bounds.width > 300 && bounds.height > 200 && bounds.bottom <= innerHeight, 'graph fits editor viewport');
      app.commands.run('core.workspace:split-right', [graph_leaf.state.path]);
      await wait(() => [...document.querySelectorAll('.linux-note-git-graph')].filter(node => node.dataset.state === 'ready').length === 2);
      const split_graph = app.workspace.activeLeaf.view.containerEl;
      expect(normalized(app.workspace.activeLeaf.view.panel.root) === normalized(probe_root), 'split graph retains repository context');
      app.workspace.activeLeaf.view.panel.select_commit(app.workspace.activeLeaf.view.panel.state.commits[0]);
      await wait(() => split_graph.querySelector('.git-graph-file'));
      const list_bounds = split_graph.querySelector('.git-graph-list').getBoundingClientRect();
      const details_bounds = split_graph.querySelector('.git-graph-details').getBoundingClientRect();
      const selected_bounds = [...commits(split_graph)].find(row=>row.dataset.hash === app.workspace.activeLeaf.view.panel.selected).getBoundingClientRect();
      expect(list_bounds.width > 100 && list_bounds.height > 50 && details_bounds.height > 100 && Math.abs(details_bounds.top-selected_bounds.bottom)<2 && details_bounds.width <= list_bounds.width+1,
        'narrow split keeps readable inline details immediately below selected row');
      // 非仓库错误保留工具入口；恢复目录后可以继续刷新。
      const split_leaf = app.workspace.activeLeaf;
      split_leaf.view.panel.root = path.dirname(probe_root);
      refresh(split_graph);
      await wait(() => split_graph.dataset.state === 'error');
      expect(split_graph.querySelector('.git-graph-status').textContent.includes('not a git repository'), 'non-repository error is visible in graph');
      split_leaf.view.panel.root = probe_root;
      refresh(split_graph);
      await wait(() => split_graph.dataset.state === 'ready');
      expect(commits(split_graph).length === 4, 'refresh recovers after a repository error');
      // 新增写入操作只在此脚本创建的临时仓库验证。
      const panel = split_leaf.view.panel;
      commits(split_graph)[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 450, clientY: 150 }));
      await wait(() => document.querySelector('[data-action="branch_create"]'));
      document.querySelector('[data-action="branch_create"]').click();
      const field = document.querySelector('[data-field="branch"]'); field.value = 'native-created'; field.dispatchEvent(new Event('input', { bubbles: true }));
      expect(document.querySelector('[data-git-execute]').disabled, 'action requires a concrete preview before execution');
      document.querySelector('[data-git-preview]').click();
      await wait(() => !document.querySelector('[data-git-execute]').disabled);
      expect(document.querySelector('.git-graph-action-preview').textContent.includes('native-created') && !fs.existsSync(path.join(probe_root, '.git/refs/heads/native-created')), 'preview displays exact branch without creating it');
      document.querySelector('[data-git-execute]').click();
      await wait(() => fs.existsSync(path.join(probe_root, '.git/refs/heads/native-created')) && !panel.writing);
      expect(true, 'native dialog executes approved branch operation');
      document.querySelector('.git-graph-dialog-shade').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      panel.select_commit(panel.state.commits[0]); await wait(() => split_graph.querySelector('.git-graph-file'));
      split_graph.querySelector('.git-graph-detail-review').click();
      await wait(() => split_graph.querySelector('.git-file-unreviewed'));
      split_graph.querySelector('.git-graph-file').click();
      await wait(() => panel.is_reviewed('中文 #%.md'));
      expect(panel.is_reviewed('中文 #%.md'), 'native diff selection persists reviewed file');
      const initial = panel.state.commits.find(commit => commit.subject.startsWith('Initial'));
      commits(split_graph)[commits(split_graph).length - 1].dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
      await wait(() => panel.to === initial.hash);
      expect(panel.from !== panel.to, 'Ctrl click compares two distinct revisions');
      panel.render_history();
      expect(split_graph.querySelector('.git-graph-list').contains(split_graph.querySelector('.git-graph-details')), 'fixed inline details attach to selected graph row');
      // 在临时仓库核对 Ctrl+Enter 与提交按钮一样只写入已暂存内容。
      fs.writeFileSync(path.join(probe_root, 'shortcut.txt'), 'staged by shortcut fixture\n');
      await panel.writer.run(probe_root, ['add', '--', 'shortcut.txt']);
      const before_shortcut = (await panel.runner.run(probe_root, ['rev-parse', 'HEAD'])).trim();
      app.commands.run('linux_note:source_control');
      const message_box = document.querySelector('.git-scm-message');
      message_box.value = '测试快捷键提交'; message_box.dispatchEvent(new Event('input', {bubbles: true})); message_box.focus();
      const commit_key = new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, ctrlKey: true, bubbles: true, cancelable: true});
      message_box.dispatchEvent(commit_key);
      await wait(() => message_box.value === '', 'Ctrl Enter commit did not complete');
      const after_shortcut = (await panel.runner.run(probe_root, ['rev-parse', 'HEAD'])).trim();
      expect(after_shortcut !== before_shortcut, 'Ctrl Enter creates a real commit');
      expect((await panel.runner.run(probe_root, ['show', '--pretty=format:', '--name-only', 'HEAD'])).trim() === 'shortcut.txt', 'Ctrl Enter commits staged files only');
      const close_dialog = () => document.querySelector('.git-graph-dialog-shade')?.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
      // 分组按钮预览全部精确文件；取消预览不改变任何内容。
      document.querySelector('[data-scm-group=changes] summary button [data-git-icon=discard]').closest('button').click();
      await wait(() => document.querySelector('[data-git-preview=discard_changes]'));
      document.querySelector('[data-git-preview]').click();
      await wait(() => !document.querySelector('[data-git-execute]').disabled);
      expect(document.querySelector('.git-graph-action-preview').textContent.includes('source.md'), 'group discard previews the current group files');
      close_dialog();
      expect(fs.readFileSync(path.join(probe_root, 'source.md')).equals(source_bytes), 'cancelling group discard preserves draft');
      // 只回收此夹具自己新建的单个文件，不执行分组删除。
      fs.writeFileSync(path.join(probe_root, 'recycle_only.txt'), 'native recycling fixture\n');
      await panel.refresh(false);
      const discard_index = fs.readFileSync(path.join(probe_root, '.git/index'));
      panel.action_dialog('discard_changes', 'file', 'recycle_only.txt', after_shortcut, {include_untracked:true}, ['recycle_only.txt']);
      document.querySelector('[data-git-preview]').click();
      await wait(() => !document.querySelector('[data-git-execute]').disabled);
      expect(['回收："recycle_only.txt"','Recycle: "recycle_only.txt"'].some(value=>document.querySelector('.git-graph-action-preview').textContent.includes(value)), 'discard preview identifies the exact recycle target');
      document.querySelector('[data-git-execute]').click();
      await wait(() => !fs.existsSync(path.join(probe_root, 'recycle_only.txt')) && !panel.writing, 'Native recycle action did not finish');
      expect(fs.readFileSync(path.join(probe_root, '.git/index')).equals(discard_index), 'native recycle preserves index bytes');
      expect(fs.readFileSync(path.join(probe_root, 'source.md')).equals(source_bytes), 'native recycle preserves unrelated draft');
      close_dialog();
      // 同步只使用夹具仓库 .git 内新建的本地 bare 远端，无用户凭据或网络远端。
      const sync_remote = path.join(probe_root, '.git', 'sync_remote');
      await panel.writer.run(probe_root, ['init', '--bare', sync_remote]);
      await panel.writer.run(probe_root, ['remote', 'add', 'fixture_remote', sync_remote]);
      await panel.writer.run(probe_root, ['push', '--set-upstream', 'fixture_remote', 'main']);
      await panel.refresh(false); window.dispatchEvent(new Event('focus'));
      await wait(() => document.querySelector('[data-git-status=sync]').title.includes('fixture_remote/main'));
      document.querySelector('[data-git-status=sync]').click();
      await wait(() => document.querySelector('[data-git-execute=sync]')?.disabled === false);
      expect(['确认同步','Confirm Sync'].includes(document.querySelector('[data-git-execute=sync]').textContent) && ['先拉取','Pull and integrate remote commits first'].some(value=>document.querySelector('.git-graph-action-preview').textContent.includes(value)), 'status sync opens a localized prepared pull then push confirmation');
      const sync_index = fs.readFileSync(path.join(probe_root, '.git/index'));
      document.querySelector('[data-git-execute=sync]').click();
      await wait(() => ['同步完成','Sync complete.'].some(value=>document.querySelector('.git-graph-action-preview').textContent.includes(value)), 'Native sync did not finish');
      expect(fs.readFileSync(path.join(probe_root, '.git/index')).equals(sync_index) && fs.readFileSync(path.join(probe_root, 'source.md')).equals(source_bytes), 'native sync with no incoming changes preserves index and draft');
      close_dialog();
      // 两类非 Markdown 文件与原生阅读区互切，逐帧检查右侧缩略图的归属和边界。
      const visible_box = node => {
        if (!node || node.hidden) return false;
        const style = getComputedStyle(node), box = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
      };
      for (const extension of ['txt', 'ts']) {
        const file_path = path.join(probe_root, 'minimap_switch.' + extension);
        fs.writeFileSync(file_path, Array.from({length:600}, (_, index) => extension === 'ts' ? `const value_${index} = ${index};` : `Text line ${index}`).join('\n'));
        app.workspace.activeLeaf = source_leaf.parent.toggleTab(source_leaf.state.path);
        await app.openFile(file_path);
        await wait(() => normalized(app.workspace.activeLeaf?.view.file_path) === normalized(file_path) && app.workspace.activeLeaf.view.loaded, 'minimap source did not load');
        const code_leaf = app.workspace.activeLeaf, code_view = code_leaf.view;
        for (let iteration = 0; iteration < 3; iteration++) {
          app.workspace.activeLeaf = source_leaf.parent.toggleTab(source_leaf.state.path);
          await wait(() => visible_box(content.querySelector('.linux-note-reading-minimap')) && content.querySelector('.linux-note-reading-minimap').dataset.ready === 'true', 'Markdown minimap did not return');
          const reading_rail = content.querySelector('.linux-note-reading-minimap');
          const rail_box = reading_rail.getBoundingClientRect(), owner_box = content.getBoundingClientRect();
          expect(rail_box.height > 200 && Math.abs(rail_box.top - owner_box.top - content.clientTop) < 1 && Math.abs(rail_box.height - content.clientHeight) < 1, 'native Markdown from ' + extension + ' keeps the minimap at the full reading viewport height ' + iteration);
          app.workspace.activeLeaf = code_leaf.parent.toggleTab(code_leaf.state.path);
          for (let frame = 0; frame < 3; frame++) {
            expect(![...content.querySelectorAll('.linux-note-reading-minimap')].some(visible_box), 'native ' + extension + ' frame ' + iteration + '/' + frame + ' has no collapsed Markdown minimap at the editor top');
            await new Promise(resolve => requestAnimationFrame(resolve));
          }
          const source_editor = code_view.editor.focused_editor(), info = source_editor.getLayoutInfo();
          const source_box = source_editor.getDomNode().getBoundingClientRect();
          expect(info.width > 100 && info.height > 200 && Math.abs(info.height - source_box.height) < 1 && visible_box(code_view.containerEl.querySelector('.monaco-editor .minimap')), 'native ' + extension + ' retains its own Monaco layout and minimap ' + iteration);
        }
      }
      expect(fs.readFileSync(path.join(probe_root, 'source.md')).equals(source_bytes) && fs.readFileSync(path.join(probe_root, '.git/index')).equals(sync_index), 'native Markdown and non-Markdown minimap switches preserve draft and index bytes');
      result.status = 'PASS';
    } catch (error) {
      result.status = 'FAIL'; result.error = String(error.stack);
      result.graph = document.querySelector('.linux-note-git-graph')?.innerText.slice(0, 3000);
      const sidebar = window[Symbol.for('typora-code:workspace')]?.app.workspace.sidebar;
      result.sidebar = {shown: sidebar?.isShown, active: sidebar?.activePanel?.ribbonButton?.id, classes: document.querySelector('#typora-sidebar')?.className, connected: sidebar?.activePanel?.containerEl?.isConnected, visible: sidebar?.activePanel?.visible};
    } finally {
      const prefix = 'linux-note-git-graph:v2:';
      try {
        const repositories = JSON.parse(localStorage.getItem(prefix + 'repositories') || '[]');
        localStorage.setItem(prefix + 'repositories', JSON.stringify(repositories.filter(root => normalized(root) !== normalized(probe_root))));
        const reviews = JSON.parse(localStorage.getItem(prefix + 'reviews') || '[]');
        localStorage.setItem(prefix + 'reviews', JSON.stringify(reviews.filter(review => normalized(review.root) !== normalized(probe_root))));
        for (const key of Object.keys(localStorage)) if (key.startsWith('linux-note-source-control:v1:') && normalized(key).endsWith(normalized(probe_root))) localStorage.removeItem(key);
        for (const key of Object.keys(localStorage)) if (key.startsWith(prefix + 'settings:') && normalized(key.slice((prefix + 'settings:').length)) === normalized(probe_root)) localStorage.removeItem(key);
      } catch { /* 不覆盖已有的损坏记录。 */ }
      fs.writeFileSync(path.join(probe_root, 'result_1.json'), JSON.stringify(result, null, 2));
      window.close();
    }
  };
  void run();
})();
