// 只操作由测试启动器创建的临时目录，验证原生 Typora 的面板、文件与搜索接线。
(() => {
  const url=new URL(document.currentScript.src);const root=decodeURIComponent(url.pathname).replace(/^\/(\w:)/u,'$1').replace(/\/workspace_browser_native_test.js$/u,'');
  const result={checks:[]};const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const norm=value=>String(value).replace(/\\/gu,'/').toLowerCase();
  const expect=(value,message)=>{if(!value)throw new Error(message);result.checks.push(message);};
  const wait=async(ready,message='Timed out')=>{const start=Date.now();while(!ready()){if(Date.now()-start>16000)throw new Error(message);await delay(60);}};
  const run=async()=>{
    await wait(()=>window.File?.bundle?.filePath);if(norm(File.bundle.filePath)!==norm(root+'/source.md'))return;
    const fs=reqnode('fs'),path=reqnode('path');const original_mount=File.getMountFolder;
    try{
      await wait(()=>document.documentElement.getAttribute('data-linux-note-workspace-browser')==='ready');
      File.getMountFolder=()=>root;window.resizeTo(1400,950);await delay(300);
      const app=window[Symbol.for('typora-code:workspace')].app;
      await wait(()=>document.querySelector('.workspace-titlebar-menu'));
      const top_menus=[...document.querySelectorAll('.workspace-titlebar-menu>button')];
      expect(top_menus.map(node=>node.textContent.trim()).join('/')==='文件/编辑/段落/格式/视图/主题/帮助','native titlebar retains the frozen seven Typora menus');
      expect(!document.querySelector('.workspace-titlebar-command-area,.workspace-titlebar-popup,.workspace-open-editors'),'frozen workbench has no replacement Command Center, custom menu popup or Open Editors section');
      const hidden=path.join(root,'.hidden');fs.mkdirSync(hidden);fs.writeFileSync(path.join(hidden,'config.test.d.ts'),'export const sampleToken: string;\n');
      fs.writeFileSync(path.join(root,'module.test.ts'),'const sampleToken = 42;\n');fs.writeFileSync(path.join(root,'.env.local'),'MODE=local\n');fs.writeFileSync(path.join(root,'binary.tar.gz'),Buffer.from([31,139,0,1,0]));
      app.workspace.sidebar.hide();window.dispatchEvent(new KeyboardEvent('keydown',{key:'E',code:'KeyE',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}));
      await wait(()=>document.querySelector('.workspace-explorer-row[data-path]')&&document.activeElement?.classList?.contains('workspace-explorer-tree'));
      expect(app.workspace.sidebar.activePanel?.ribbonButton?.id==='linux_note:file_explorer'&&document.activeElement.classList.contains('workspace-explorer-tree'),'Ctrl Shift E opens the custom explorer and focuses its tree');
      const row=name=>[...document.querySelectorAll('.workspace-explorer-row[data-path]')].find(row=>norm(row.dataset.path)===norm(path.join(root,name)));
      await wait(()=>row('.hidden')&&row('.env.local')&&row('module.test.ts')&&row('binary.tar.gz'));
      expect(true,'native explorer shows dot files, hidden folder, compound suffix and binary archive');
      row('.hidden').click();await wait(()=>row('.hidden/config.test.d.ts'));expect(true,'native lazy directory expansion includes hidden child');
      row('module.test.ts').click();await wait(()=>app.workspace.activeLeaf.view.editor?.models[0]?.getLanguageId()==='typescript');
      const view=app.workspace.activeLeaf.view;const bounds=view.containerEl.getBoundingClientRect(),leaf=app.workspace.activeLeaf.containerEl.getBoundingClientRect();
      result.source_bounds={view:{width:bounds.width,height:bounds.height},leaf:{width:leaf.width,height:leaf.height}};
      expect(bounds.width>=leaf.width*.95&&bounds.height>300,'ordinary source occupies full current editor group');
      expect(!view.containerEl.querySelector('.monaco-diff-editor'),'ordinary source uses one editor rather than half a diff');
      expect(norm(File.bundle.filePath)===norm(root+'/source.md'),'code file does not replace native Markdown document');
      await app.openFile(path.join(hidden,'config.test.d.ts'));await wait(()=>app.workspace.activeLeaf.view.editor?.models[0]?.getValue().includes('export const sampleToken'));
      expect(app.workspace.activeLeaf.view.editor.models[0].getLanguageId()==='typescript','native app open handles inserted segments and longest compound suffix');
      app.workspace.ribbon.clickButton('core.search');await wait(()=>document.querySelector('.linux-note-workspace-search textarea'));
      const search=document.querySelector('.linux-note-workspace-search');
      // 原生大纲过滤和全文件搜索共享一个旧输入框；自定义面板只保留自己的一组控件。
      const native_search=document.querySelector('#file-library-search');
      expect(getComputedStyle(native_search).display==='none','native shared find input does not overlap custom search');
      expect(Math.abs(search.getBoundingClientRect().top-search.parentElement.getBoundingClientRect().top)<2,'custom search starts at sidebar top without native filter gap');
      expect(search.querySelectorAll('.workspace-search-heading button').length===4&&search.querySelector('.workspace-search-replace').hidden,'search has four title actions and collapsed replacement');
      for(const name of ['case-sensitive','whole-word','regex','edit-code','book','exclude']){
        const icon=search.querySelector(`[data-git-icon="${name}"]`),button=icon?.closest('button'),box=button?.closest('.workspace-search-query-box');
        expect(Boolean(box)&&button.getBoundingClientRect().right<=box.getBoundingClientRect().right,`${name} option stays inside its compact input frame`);
      }
      for(const field of search.querySelectorAll('input,textarea')){if(!field.getClientRects().length)continue;field.focus();const computed=getComputedStyle(field);expect(computed.outlineWidth==='0px'&&computed.boxShadow==='none','native theme does not add a second focus border');}
      const includes=search.querySelector('[aria-label="包含的文件"]');includes.value='*.ts';
      const query=search.querySelector('textarea');query.value='sampleToken';query.dispatchEvent(new Event('input',{bubbles:true}));
      await wait(()=>search.querySelectorAll('.workspace-search-match').length===2,'Search did not produce two TypeScript matches');
      expect(search.querySelectorAll('.workspace-search-file').length===2&&search.querySelectorAll('mark').length===2,'native search groups by file and highlights match previews');
      expect(search.querySelectorAll('.workspace-search-file>summary>[data-git-icon="file"]').length===2,'native search results include standard file icons');
      expect(getComputedStyle(search.querySelector('.workspace-search-line')).display==='none'&&search.querySelector('.workspace-search-match').title.includes(':1:'),'match location stays in tooltip without a separate wide line-number column');
      expect(search.querySelector('.workspace-search-open-editor')?.textContent==='在编辑器中打开','result count exposes the Chinese open-in-editor action');
      search.querySelector('[data-search-option="regex"]').click();query.value='sample[A-Z][a-z]+';query.dispatchEvent(new Event('input',{bubbles:true}));
      await wait(()=>search.querySelectorAll('.workspace-search-match').length===2&&search.querySelector('mark')?.textContent==='sampleToken','Worker regex did not return two native matches');
      expect(true,'installed offline regex worker returns highlighted file matches');
      const module_group=[...search.querySelectorAll('.workspace-search-file')].find(group=>norm(group.dataset.path)===norm(path.join(root,'module.test.ts')));
      const match=module_group.querySelector('.workspace-search-match'),before_leaf=app.workspace.activeLeaf;match.click();
      await wait(()=>{const body=document.querySelector('.workspace-lookup-preview-body');return norm(body?.dataset.previewPath)===norm(path.join(root,'module.test.ts'))&&body.dataset.previewKind==='source'&&body.dataset.previewLine==='1'&&body.dataset.previewColumn==='7'&&body.dataset.previewEndLine==='1'&&body.dataset.previewEndColumn==='18'&&body.dataset.previewText==='sampleToken'&&Boolean(body.querySelector('.monaco-editor'))},'single-click preview did not reach the exact TypeScript match');
      expect(app.workspace.activeLeaf===before_leaf,'single-click search result updates only the lower preview');
      match.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}));
      await wait(()=>norm(app.workspace.activeLeaf.view.file_path)===norm(path.join(root,'module.test.ts'))&&app.workspace.activeLeaf.view.editor?.focused_editor?.().getModel().getValueInRange(app.workspace.activeLeaf.view.editor.focused_editor().getSelection())==='sampleToken','double-click did not open and select the exact source match');
      expect(true,'double-click search result opens the file at the exact selected text');
      expect(app.workspace.sidebar.activePanel?.ribbonButton?.id==='linux_note:search','search retains its own sidebar after opening source match');
      expect(!document.querySelector('.typ-ribbon-item[data-id="linux_note:search"]'),'search reuses standard activity button without duplicate');
      app.workspace.ribbon.clickButton('core.search');await wait(()=>!app.workspace.sidebar.isShown);expect(true,'same search activity button collapses sidebar');
      app.workspace.ribbon.clickButton('core.search');await wait(()=>app.workspace.sidebar.isShown);expect(true,'search activity button reopens retained results');
      // 实际宿主 frame.js 的 ClientCommand.quickOpen -> editor.quickOpenPanel.show 路由。
      ClientCommand.quickOpen();
      const quick_panel=document.querySelector('#typora-quick-open'),quick_input=document.querySelector('#typora-quick-open-input input');
      await wait(()=>quick_panel&&getComputedStyle(quick_panel).display!=='none'&&document.activeElement===quick_input);
      quick_input.value='config.test.d.ts';quick_input.dispatchEvent(new Event('input',{bubbles:true}));
      await wait(()=>[...quick_panel.querySelectorAll('.typora-quick-open-item')].some(node=>norm(node.dataset.path)===norm(path.join(hidden,'config.test.d.ts'))),'native filename search did not find compound-suffix file');
      expect(true,'native filename search finds hidden compound-suffix files through the existing core cache');
      File.editor.quickOpenPanel.close();await wait(()=>getComputedStyle(quick_panel).display==='none');
      expect(true,'native filename search closes without creating a replacement workbench picker');
      app.workspace.ribbon.clickButton('core.file-explorer');await wait(()=>document.querySelector('.workspace-explorer-tree'));
      await app.openFile(path.join(root,'binary.tar.gz'));await wait(()=>app.workspace.activeLeaf.view.containerEl.textContent.includes('二进制'));expect(true,'binary remains visible and opens an explicit non-text notice');
      result.status='PASS';
    }catch(error){result.status='FAIL';result.error=String(error.stack);result.sidebar={classes:document.querySelector('#typora-sidebar')?.className,html:document.querySelector('#sidebar-content')?.innerHTML.slice(0,12000)};}
    finally{File.getMountFolder=original_mount;fs.writeFileSync(path.join(root,'result_1.json'),JSON.stringify(result,null,2));window.close();}
  };void run();
})();
