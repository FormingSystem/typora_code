// 原始宿主的实际C围栏；不以手写cm类替代真实TextMate路径。
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await pause(30);}throw Error(label);};
 const text='# 代码配色\n\n```c\np = rcu_dereference(table[id]);\nconst char *s = "hello"; // 注释\n#define COUNT 42\n```\n\n```cpp\nstd::vector<int> values;\n```\n\n```js\nlet p = 42;\n```\n\n```\np = plain;\n```\n',file=path.join(base,'workspace/code.md');
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'窗口准备超时');await pause(400);
  fs.writeFileSync(file,text);await files.open_file(file);await wait(()=>File.bundle.filePath===file&&!File.isFileLoading(),'文档未打开');
  await wait(()=>document.querySelector('.md-fences[lang=c] .CodeMirror')?.CodeMirror?.getOption('mode')==='linux-note-vscode-textmate-c','真实C模式未接入');
  let typography;
  for(const [theme,fg,bg]of [['cpp_github-consolas_dark.css','rgb(204, 204, 204)','rgb(31, 31, 31)'],['cpp_github-consolas_light.css','rgb(59, 59, 59)','rgb(255, 255, 255)'],['cpp_github-consolas_dark.css','rgb(204, 204, 204)','rgb(31, 31, 31)']]){
   await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(800);
   const fence=document.querySelector('.md-fences[lang=c]'),cm=fence.querySelector('.CodeMirror');cm.CodeMirror.refresh();await pause(200);
   const spans=[...cm.querySelectorAll('.CodeMirror-line span')].filter(n=>n.children.length===0),plain=spans.find(n=>n.textContent.includes('p ='))||spans.find(n=>n.textContent.trim()==='p');
   samples.push({theme,tokens:spans.map(n=>({text:n.textContent,cls:n.className,color:getComputedStyle(n).color})),bg:getComputedStyle(cm).backgroundColor,root:getComputedStyle(document.documentElement).getPropertyValue('--linux-note-code-foreground')});
   assert(plain&&getComputedStyle(plain).color===fg,'真实p默认前景 '+theme+' '+getComputedStyle(plain||cm).color);
   assert(getComputedStyle(cm).backgroundColor===bg,'代码背景沿官方editor.background '+theme);
   const style=getComputedStyle(cm),geometry=[style.fontFamily,style.fontSize,style.lineHeight];if(typography)assert(JSON.stringify(geometry)===JSON.stringify(typography),'明暗代码字体行距一致');typography=geometry;
   fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'code_'+theme}));await pause(350);
  }
  for(let i=0;i<20;i++){const theme=i%2?'cpp_github-consolas_dark.css':'cpp_github-consolas_light.css';await JSBridge.invoke('setting.setCurTheme',theme,theme);File.setTheme(theme);await pause(100);}
  await pause(400);assert(document.querySelectorAll('#typora-code-official-code-theme').length===1,'20次主题切换共用唯一代码样式');
  core.app.commands.run('typora_code:custom_colors');await wait(()=>document.querySelector('[data-color-key=markdown_link]')?.value.startsWith('#'),'原生颜色表默认值未显示');
  const preview=document.querySelector('.workspace-color-preview');assert(preview.contentDocument.querySelector('#write a').textContent==='跳转链接','真实宿主隔离预览已渲染');
  const input=document.querySelector('[aria-label="新配色方案名称"]');input.value='原生暗色方案';document.querySelector('[data-color-action=duplicate]').click();await pause(700);
  const color=document.querySelector('[data-color-key=markdown_link]');color.value='#789ABC';color.dispatchEvent(new Event('input',{bubbles:true}));await pause(100);
  preview.contentDocument.querySelector('[data-color-target=markdown_link]').click();assert(document.querySelector('[data-color-row=markdown_link]').dataset.colorSelected==='true','原生模板链接定位颜色行');
  document.querySelector('[data-color-action=activate]').click();await pause(800);assert(core.app.settings.get('workspace_colors').active.dark,'原生应用命名主题保存活动身份');
  assert(document.querySelector('#theme_css').href.includes('cpp_github-consolas_dark.css'),'原生主题命令使用Dark基础');
  assert(core.app.settings.get('workspace_colors').profiles.some(profile=>profile.name==='原生暗色方案'&&profile.colors.markdown_link==='#789ABC'),'命名方案独立落盘');
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'color_profiles'}));await pause(500);
  document.querySelector('.workspace-dialog-close').click();assert(!document.querySelector('.workspace-color-preview'),'关闭清理预览');
  assert(fs.readFileSync(file,'utf8')===text,'正文未改写');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,samples,error:String(error.stack||error),ui_status:document.querySelector('.workspace-settings-status')?.textContent,frames:[...document.querySelectorAll('.workspace-color-preview')].map(frame=>({src:frame.src,connected:frame.isConnected,html:frame.contentDocument?.documentElement.outerHTML.slice(0,7000)}))},null,2));}
})();
