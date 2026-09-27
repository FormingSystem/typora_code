// 原始Typora：源码/查找输入边界、主题状态与clangd宏裁剪。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),crypto=reqnode('crypto'),base=__CASE_ROOT__,checks=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(fn,label)=>{for(let i=0;i<1000;i++){if(fn())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'窗口就绪');await pause(500);
  const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host,root=files.context_root();
  assert(root===path.join(base,'workspace'),'隔离工作区');
  const file=path.join(root,'sample.c'),text='// 中文\n#define VALUE 3\nstruct device { int state; };\nint twice(int value) { return value * VALUE; }\n';fs.writeFileSync(file,text,'utf8');await files.open_file(file);
  await wait(()=>core.app.workspace.activeLeaf.view.file_path===file&&core.app.workspace.activeLeaf.view.editor?.focused_editor()?.getModel(),'打开源码');
  const editor=core.app.workspace.activeLeaf.view.editor.focused_editor(),model=editor.getModel();
  await wait(()=>model.tokenization.hasCompleteSemanticTokens(),'真实clangd语义着色进入Monaco');assert(true,'原始宿主真实clangd语义着色');
  editor.setPosition({lineNumber:4,column:8});
  const palettes=[['dark_2026','rgb(18, 19, 20)'],['light_2026','rgb(255, 255, 255)']];
  for(const [mode,color] of palettes){document.documentElement.style.setProperty('--workspace-code-theme',mode);window.dispatchEvent(new Event('resize'));await pause(500);const background=core.app.workspace.activeLeaf.view.editor.container.querySelector('.monaco-editor-background');assert(getComputedStyle(background).backgroundColor===color,'官方主题背景 '+mode+' '+getComputedStyle(background).backgroundColor);assert(editor.getPosition().lineNumber===4,'主题切换保留光标 '+mode);}
  const clipboard=reqnode('electron').clipboard,old_clipboard=clipboard.readText();
  try{
   await editor.getAction('editor.action.startFindReplaceAction').run();await pause(200);
   const editor_root=editor.getDomNode(),before=model.getValue();
   for(const part of ['find-part','replace-part']){
    const input=editor_root.querySelector('.'+part+' textarea');input.focus();input.select();document.execCommand('insertText',false,'输入框文字');input.select();
    const key=(name,shift=false)=>input.dispatchEvent(new KeyboardEvent('keydown',{key:name,ctrlKey:true,shiftKey:shift,bubbles:true,cancelable:true}));
    key('c');fs.writeFileSync(path.join(base,'input_probe.json'),JSON.stringify({part,value:input.value,start:input.selectionStart,end:input.selectionEnd,focused:document.activeElement===input,document_focus:document.hasFocus(),copied_expected:clipboard.readText()==='输入框文字'},null,2));assert(clipboard.readText()==='输入框文字',part+'复制只读本框');
    clipboard.writeText('粘贴的查询');key('v');assert(input.value==='粘贴的查询',part+'粘贴进入本框');key('z');assert(input.value==='输入框文字',part+'撤销不改源码');key('y');assert(input.value==='粘贴的查询',part+'重做');
    input.select();input.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:600,clientY:160}));
    const menu=document.querySelector('.workspace-text-input-menu');assert(menu&&menu.querySelectorAll('[data-action]').length===6&&!menu.textContent.includes('转到定义'),part+'专属文本菜单');
    menu.querySelector('[data-action="input_cut"]').click();assert(input.value===''&&model.getValue()===before,part+'菜单剪切保留源码');
   }
   const samples=[];
   for(const [mode,bg,active,fg] of [['dark_2026','rgb(25, 26, 27)','rgb(49, 50, 51)','rgb(191, 191, 191)'],['light_2026','rgb(255, 255, 255)','rgb(214, 214, 214)','rgb(32, 32, 32)']]){
    document.documentElement.style.setProperty('--workspace-code-theme',mode);await pause(300);
    const widget=editor_root.querySelector('.find-widget'),toggles=[...widget.querySelectorAll('.find-part .monaco-custom-toggle')];
    for(const toggle of toggles){if(toggle.classList.contains('disabled')){assert(getComputedStyle(toggle).opacity==='0.4',mode+'禁用选项');continue;}if(!toggle.classList.contains('checked'))toggle.click();assert(getComputedStyle(toggle).backgroundColor===active&&getComputedStyle(toggle).color===fg,mode+'选项选中 '+toggle.className);toggle.click();assert(getComputedStyle(toggle).color===fg,mode+'选项默认 '+toggle.className);}
    assert(getComputedStyle(widget.querySelector('.monaco-inputbox')).backgroundColor===bg,mode+'查找输入背景');
    samples.push({mode,bg,active,fg});
   }
   fs.writeFileSync(path.join(base,'find_colors.json'),JSON.stringify(samples,null,2));
   editor.getContribution('editor.contrib.findController').closeFindWidget();
   core.app.workspace.activeLeaf.view.editor.context_menu(new MouseEvent('contextmenu',{clientX:600,clientY:160}));
   assert(document.querySelector('[data-action="source_navigation_definition"]')&&document.querySelector('[data-action="paste"]')&&!document.querySelector('.workspace-text-input-menu'),'源码菜单含导航与剪贴板');
   document.querySelector('[data-action="select_all"]').click();assert(editor.getModel().getValueInRange(editor.getSelection())===before,'源码菜单操作模型');
   const source_command=name=>{core.app.workspace.activeLeaf.view.editor.context_menu(new MouseEvent('contextmenu',{clientX:600,clientY:160}));document.querySelector('[data-action="'+name+'"]').click();};
   source_command('copy');assert(clipboard.readText().replace(/\r\n/g,'\n')===before,'源码菜单复制实际选区');
   clipboard.writeText('// pasted source');source_command('paste');assert(model.getValue()==='// pasted source','源码菜单粘贴实际修改');editor.trigger('test','undo',null);assert(model.getValue()===before,'源码粘贴可撤销');
   editor.setSelection(model.getFullModelRange());source_command('cut');assert(model.getValue()==='','源码菜单剪切实际修改');editor.trigger('test','undo',null);assert(model.getValue()===before,'源码剪切可撤销');
   model.setValue('#define ENABLE 0\n#if ENABLE\nint inactive(void) { return 1; }\n#else\nint active;\n#endif\n');
   await wait(()=>model.getAllDecorations().some(d=>d.options.inlineClassName==='source-inactive-region'),'clangd条件编译范围');
   editor.revealLine(3);await wait(()=>editor_root.querySelector('.source-inactive-region'),'淡化渲染');assert(getComputedStyle(editor_root.querySelector('.source-inactive-region')).opacity==='0.55','未激活区域保留语法色并淡化');
   model.setValue(model.getValue().replace('ENABLE 0','ENABLE 1'));
   assert(!model.getAllDecorations().some(d=>d.options.inlineClassName==='source-inactive-region'),'修改立即清除旧淡化');
   await wait(()=>model.getAllDecorations().some(d=>d.options.inlineClassName==='source-inactive-region'&&d.range.startLineNumber===5),'宏切换后else淡化');assert(true,'宏切换重分析');
   assert(fs.readFileSync(file,'utf8')===text,'查找操作和分析未保存文件');
  }finally{clipboard.writeText(old_clipboard);}
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex'),limits:'隔离原始宿主DOM事件；未测物理键鼠、其他平台和第三方服务全部能力。'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack)},null,2));}
})();
