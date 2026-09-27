// 原始Typora：源码编辑器的官方颜色、真实语义分析和环境选择入口。
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
  editor.executeEdits('fixture',[{range:{startLineNumber:4,startColumn:5,endLineNumber:4,endColumn:10},text:'changed'}]);await wait(()=>model.tokenization.hasCompleteSemanticTokens(),'内存修改后恢复语义');assert(fs.readFileSync(file,'utf8')===text,'分析不改写用户文件');
  const header=path.join(root,'helper.h');fs.writeFileSync(header,'static inline int helper(int value) { return value + 1; }\n','utf8');
  await files.open_file(header,{source:true});await wait(()=>core.app.workspace.activeLeaf.view.file_path===header&&core.app.workspace.activeLeaf.view.loaded,'头文件就绪');
  const header_model=core.app.workspace.activeLeaf.view.editor.models[0];header_model.setValue(header_model.getValue()+'// unsaved target\n');
  await files.open_file(file,{source:true});await wait(()=>core.app.workspace.activeLeaf.view.file_path===file,'回到来源');
  model.setValue('#include "helper.h"\nint caller(void) { return helper(7); }\n');editor.setPosition({lineNumber:2,column:27});await pause(300);
  assert(core.app.workspace.activeLeaf.view.menu_entries().some(item=>item.title==='转到声明'),'源码右键含声明入口');
  editor.getDomNode().dispatchEvent(new KeyboardEvent('keydown',{key:'F12',bubbles:true,cancelable:true}));
  await wait(()=>core.app.workspace.activeLeaf.view.file_path===header,'真实跨文件定义跳转');
  assert(core.app.workspace.activeLeaf.view.editor.models[0]===header_model&&header_model.getValue().includes('unsaved target'),'保留目标未保存模型');
  assert(core.app.workspace.activeLeaf.view.editor.focused_editor().getPosition().lineNumber===1,'目标按LSP行列定位');
  await files.open_file(file,{source:true});await wait(()=>core.app.workspace.activeLeaf.view.file_path===file,'再次回到来源');await pause(200);
  const point=editor.getScrolledVisiblePosition({lineNumber:2,column:27}),rect=editor.getDomNode().getBoundingClientRect(),x=rect.left+point.left+2,y=rect.top+point.top+point.height/2;
  const target=document.elementFromPoint(x,y);for(const type of ['mousedown','mouseup','click'])target.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,ctrlKey:true,button:0,buttons:type==='mousedown'?1:0,clientX:x,clientY:y}));
  await wait(()=>core.app.workspace.activeLeaf.view.file_path===header,'原始宿主Ctrl左键跨文件跳转');assert(true,'Ctrl左键进入公共文件导航');
  assert(fs.readFileSync(file,'utf8')===text&&!fs.readFileSync(header,'utf8').includes('unsaved target'),'跨文件导航不保存源文件和目标草稿');
  await pause(650);window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:-1}}));
  await wait(()=>core.app.workspace.activeLeaf.view.file_path===file,'定义跳转后退到来源');assert(editor.getPosition().lineNumber===2,'后退恢复调用位置');
  await pause(200);window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:1}}));await wait(()=>core.app.workspace.activeLeaf.view.file_path===header,'定义跳转前进到目标');assert(true,'源码导航复用前后历史');
  await files.open_file(file,{source:true});model.setValue('int broken(void) { return missing_symbol; }');
  await wait(()=>model.getAllDecorations().some(d=>JSON.stringify(d.options).includes('squiggly-error')),'真实诊断标记');assert(true,'clangd当前内存诊断进入原生源码标记');
  core.app.commands.run('typora_code:settings');await wait(()=>document.querySelector('[data-setting="outline.environment"]'),'环境设置入口');document.querySelector('[data-setting="outline.environment"]').click();
  await wait(()=>document.querySelector('[data-field="language"]'),'语言环境表单');
  const form=document.querySelector('[aria-label="选择语言服务与环境"]'),language=form.querySelector('[data-field="language"]');assert([...language.options].some(option=>option.value==='rust'),'Rust语言配置入口');language.value='python';language.dispatchEvent(new Event('change'));
  await wait(()=>form.querySelector('[data-field="environment"]').options[0].textContent!=='正在检测…','环境检测完成');
  assert(!form.querySelector('[data-field="venv"]').parentElement.hidden,'Python虚拟环境入口可用');
  assert([...form.querySelector('[data-field="environment"]').options].some(option=>option.textContent.includes('PATH')),'系统PATH程序下拉展示');
  form.querySelector('.workspace-dialog-close').click();assert(!form.isConnected,'取消关闭环境表单');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,asset_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(window._options.userDataPath,'typora_code/workbench.js'))).digest('hex'),limits:'隔离原始宿主DOM事件；未测物理键鼠、其他平台和第三方服务全部能力。'},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,error:String(error.stack)},null,2));}
})();
