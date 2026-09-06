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
      const app=window[Symbol.for('typora-plugin-core@v2')].app;
      const hidden=path.join(root,'.hidden');fs.mkdirSync(hidden);fs.writeFileSync(path.join(hidden,'config.test.d.ts'),'export const sampleToken: string;\n');
      fs.writeFileSync(path.join(root,'module.test.ts'),'const sampleToken = 42;\n');fs.writeFileSync(path.join(root,'.env.local'),'MODE=local\n');fs.writeFileSync(path.join(root,'binary.tar.gz'),Buffer.from([31,139,0,1,0]));
      app.workspace.ribbon.clickButton('core.file-explorer');
      await wait(()=>document.querySelector('.workspace-explorer-row[data-path]'));
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
      const search=document.querySelector('.linux-note-workspace-search');const includes=search.querySelector('[aria-label="包含的文件"]');includes.value='*.ts';
      const query=search.querySelector('textarea');query.value='sampleToken';query.dispatchEvent(new Event('input',{bubbles:true}));
      await wait(()=>search.querySelectorAll('.workspace-search-match').length===2,'Search did not produce two TypeScript matches');
      expect(search.querySelectorAll('.workspace-search-file').length===2&&search.querySelectorAll('mark').length===2,'native search groups by file and highlights match previews');
      search.querySelector('[data-search-option="regex"]').click();query.value='sample[A-Z][a-z]+';query.dispatchEvent(new Event('input',{bubbles:true}));
      await wait(()=>search.querySelectorAll('.workspace-search-match').length===2&&search.querySelector('mark')?.textContent==='sampleToken','Worker regex did not return two native matches');
      expect(true,'installed offline regex worker returns highlighted file matches');
      const match=search.querySelector('.workspace-search-match');match.click();await delay(150);
      const editor=app.workspace.activeLeaf.view.editor.focused_editor();expect(editor.getModel().getValueInRange(editor.getSelection())==='sampleToken','search click selects exact source match');
      expect(app.workspace.sidebar.activePanel?.ribbonButton?.id==='linux_note:search','search retains its own sidebar after opening source match');
      expect(!document.querySelector('.typ-ribbon-item[data-id="linux_note:search"]'),'search reuses standard activity button without duplicate');
      app.workspace.ribbon.clickButton('core.search');await wait(()=>!app.workspace.sidebar.isShown);expect(true,'same search activity button collapses sidebar');
      app.workspace.ribbon.clickButton('core.search');await wait(()=>app.workspace.sidebar.isShown);expect(true,'search activity button reopens retained results');
      app.workspace.ribbon.clickButton('core.file-explorer');await wait(()=>document.querySelector('.workspace-explorer-tree'));
      await app.openFile(path.join(root,'binary.tar.gz'));await wait(()=>app.workspace.activeLeaf.view.containerEl.textContent.includes('二进制'));expect(true,'binary remains visible and opens an explicit non-text notice');
      result.status='PASS';
    }catch(error){result.status='FAIL';result.error=String(error.stack);result.sidebar={classes:document.querySelector('#typora-sidebar')?.className,html:document.querySelector('#sidebar-content')?.innerHTML.slice(0,12000)};}
    finally{File.getMountFolder=original_mount;fs.writeFileSync(path.join(root,'result_1.json'),JSON.stringify(result,null,2));window.close();}
  };void run();
})();
