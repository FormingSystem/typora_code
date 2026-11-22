// Check the native language field against the actual code editor and diagram rectangles.
(async () => {
  const fs = reqnode('fs'), path = reqnode('path'), base = __CASE_ROOT__;
  const checks = [], samples = [];
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function wait(test, label) {
    for (let i = 0; i < 300; i++) {
      if (test()) return;
      await pause(40);
    }
    throw Error(label);
  }
  function check(value, label) {
    if (!value) throw Error(label);
    checks.push(label);
  }
  let input_id = 0;
  async function click(node) {
    node.scrollIntoView({block:'center'});
    await pause(250);
    const r = node.getBoundingClientRect(), id = ++input_id;
    fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind:'click',
      width:innerWidth,height:innerHeight,x:r.left+Math.min(12,r.width/2),y:r.top+r.height/2}));
    await wait(() => {
      try {return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id;}
      catch {return false;}
    },'native click');
  }
  const fixtures = {
    mermaid: [
      'flowchart TD',' A["应用 CMakeLists.txt / prj.conf / 设备树"] --> C["Zephyr CMake 规则"]',
      ' B["板与 SoC 支持"] --> C',' H["CMSIS / 所需厂商 HAL 模块"] --> C',' C --> N["Ninja 构建任务"]',
      ' S["SDK 中的目标编译器和库"] --> N',' S ~~~ C',' N --> F["zephyr.elf 等构建产物"]',
      ' W["west build 命令"] --> C',' I["Zephyr IDE 的 Build 按钮"] --> W'
    ].join('\n'),
    flow: 'st=>start: Start\ne=>end: End\nst->e',
    sequence: 'Alice->Bob: Hello'
  };
  const file = path.join(base,'workspace','diagram-edit.md');
  const text = '# Diagram edit\n\n' + Object.entries(fixtures).map(([lang,source]) =>
    '```' + lang + '\n' + source + '\n```\n\nAfter ' + lang + '.\n').join('\n');
  const box = node => node.getBoundingClientRect().toJSON();
  const report = result => fs.writeFileSync(path.join(base,'checks.json'), JSON.stringify({...result,checks,samples},null,2));
  try {
    await wait(() => fs.existsSync(path.join(base,'window_bounds_ready.json')), 'window ready');
    const core = window[Symbol.for('typora-code:workspace')];
    const files = core.app[Symbol.for('linux-note.workspace-files@v1')].host;
    fs.writeFileSync(file,text);
    await files.open_file(file);
    await wait(() => File.bundle.filePath===file && !File.isFileLoading(), 'file loaded');
    for (const [theme,width] of [['vscode_2026_default_light.css',780],['vscode_2026_default_dark.css',320]]) {
      await JSBridge.invoke('setting.setCurTheme',theme,theme);
      File.setTheme(theme);
      await pause(700);
      for (const lang of Object.keys(fixtures)) {
        const fence = document.querySelector('#write pre[lang="'+lang+'"]');
        fence.style.maxWidth = width + 'px';
        const editor = fence.querySelector('.CodeMirror');
        const preview = fence.querySelector('.md-diagram-panel');
        await wait(() => preview?.querySelector('svg'),lang+' preview');
        fence.scrollIntoView({block:'center'});
        await click(preview);
        await wait(() => fence.classList.contains('md-focus') && fence.querySelector('.ty-cm-lang-input'),lang+' source editor');
        const field = fence.querySelector('.ty-cm-lang-input');
        const control = field.closest('.code-tooltip');
        await pause(100);
        const input = box(control), code = box(editor), diagram = box(preview), picture = box(preview.querySelector('svg'));
        samples.push({theme,lang,width,input,code,diagram,picture,children:[...fence.children].map(n=>n.className)});
        check(input.width>0 && input.height>0 && code.height>0 && picture.height>0,lang+' visible editor, language and diagram');
        check(input.bottom<=diagram.top+1 || input.top>=diagram.bottom-1,lang+' language field outside preview');
        check(input.bottom<=code.top+1 || input.top>=code.bottom-1,lang+' language field outside code');
        field.focus();
        check(document.activeElement===field && field.textContent===lang,lang+' editable native language field');
        const tail=fence.nextElementSibling;
        if (lang==='mermaid' && width===780) {
          fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'mermaid_edit_controls'}));
          await wait(() => {
            try {return JSON.parse(fs.readFileSync(path.join(base,'capture_done.json'),'utf8').replace(/^\uFEFF/,'')).stage==='mermaid_edit_controls';}
            catch {return false;}
          },'capture editing layout');
        }
        check(box(tail).top>=diagram.bottom-1,lang+' following paragraph below preview');
        await click(tail);
        await wait(() => !fence.classList.contains('md-focus'),lang+' reading mode');
        check(!fence.querySelector('.ty-cm-lang-input')?.getClientRects().length && box(preview).height>0,lang+' reading preview restored');
      }
    }
    await files.save_active();
    check(fs.readFileSync(file,'utf8')===text,'Markdown preserved');
    report({status:'PASS'});
  } catch(error) { report({status:'FAIL',error:String(error.stack || error)}); }
})();
