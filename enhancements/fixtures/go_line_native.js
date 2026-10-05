// R086: run against the original host on a private desktop with disposable documents.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<400;i++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const core=window[Symbol.for('typora-code:workspace')],workspace=core.app.workspace,files=core.app[Symbol.for('linux-note.workspace-files@v1')].host;
 let input_id=0;
 const send=async(kind,value={})=>{const id=++input_id;fs.writeFileSync(path.join(base,'native_input_request.json'),JSON.stringify({id,kind,...value,width:innerWidth,height:innerHeight,x:100,y:200}));await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(base,'native_input_result.json'),'utf8').replace(/^\uFEFF/,'')).id===id}catch{return false}},'input receipt');await pause(100);};
 const input=()=>document.querySelector('.workspace-go-line input');
 const open=async()=>{await send('go_line_key');await wait(input,'Ctrl+G opens line input');assert(input().value===':','colon prefix');};
 const set=value=>{input().value=value;input().dispatchEvent(new Event('input',{bubbles:true}));};
 const accept=async(value)=>{set(value);await send('key',{key:13});await wait(()=>!input(),'line input accepted');};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  [...document.querySelectorAll('button')].find(node=>/^(Skip|跳过)$/.test(node.textContent.trim()))?.click();
  const file=path.join(base,'workspace/go_line.txt'),text=Array.from({length:300},(_,i)=>'line '+(i+1)).join('\n');fs.writeFileSync(file,text,'utf8');await files.open_file(file);
  await wait(()=>workspace.activeLeaf?.view?.editor,'source editor ready');const leaf=workspace.activeLeaf,editor=leaf.view.editor.focused_editor(),model=editor.getModel();editor.setPosition({lineNumber:3,column:2});editor.focus();
  editor.executeEdits('qa',[{range:{startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1},text:'draft '}]);const draft=model.getValue();editor.setPosition({lineNumber:3,column:2});await pause(200);
  const before=editor.saveViewState(),before_scroll=editor.getScrollTop();await open();set(':170:3');await pause(100);
  samples.push({stage:'source_preview',before,position:editor.getPosition(),scroll:editor.getScrollTop()});assert(editor.getPosition().lineNumber===3&&editor.getScrollTop()>before_scroll,'source preview scrolls without moving selection');
  await send('key',{key:27});assert(!input()&&editor.getScrollTop()===before_scroll,'Escape restores source position');
  await open();await accept(':170:3');assert(editor.getPosition().lineNumber===170&&editor.getPosition().column===3,'Enter positions current model');
  assert(model.getValue()===draft&&fs.readFileSync(file,'utf8')===text,'unsaved draft and disk retained');
  window.dispatchEvent(new CustomEvent('linux-note-reading-history-travel',{detail:{direction:-1}}));await wait(()=>editor.getPosition().lineNumber===3,'history returns to source origin');assert(true,'Go uses existing source history');
  const destination=core.split_workspace_group(leaf,'right');await pause(200);const second=path.join(base,'workspace/second.txt');fs.writeFileSync(second,text,'utf8');await files.open_file(second);await wait(()=>workspace.activeLeaf!==leaf&&workspace.activeLeaf.view.editor,'second editor');
  const second_editor=workspace.activeLeaf.view.editor.focused_editor();second_editor.focus();await open();await accept('40:2');assert(second_editor.getPosition().lineNumber===40&&editor.getPosition().lineNumber===3,'active split owns line navigation');
  for(const [theme,identity] of [['vscode_default_light.css','light'],['vscode_default_dark.css','dark'],['vscode_2026_default_light.css','light_2026'],['vscode_2026_default_dark.css','dark_2026']]){
   ClientCommand.setTheme(theme,theme);await wait(()=>document.documentElement.dataset.workspaceCodeTheme===identity,'theme applied');await pause(300);second_editor.focus();await open();
   const root=document.querySelector('.workspace-go-line'),rect=root.getBoundingClientRect(),row=root.querySelector('button');samples.push({theme,rect:rect.toJSON(),background:getComputedStyle(root).backgroundColor,foreground:getComputedStyle(root).color,selection:getComputedStyle(row).backgroundColor});
   assert(rect.width<=600&&rect.left>=0&&rect.right<=innerWidth&&Math.abs(rect.top-6)<1,'quick input bounded '+theme);assert(getComputedStyle(row).backgroundColor!=='rgba(0, 0, 0, 0)','selected prompt painted '+theme);
   fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'go_'+identity}));await pause(300);await send('key',{key:27});
  }
  const md=path.join(base,'workspace/go_line.md'),markdown='# Heading\n\n'+Array.from({length:100},(_,i)=>'Paragraph '+(i+1)+' stays unchanged.\n').join('\n');fs.writeFileSync(md,markdown,'utf8');await files.open_file(md);await wait(()=>File.bundle.filePath===md&&!File.isFileLoading(),'native Markdown ready');
  const original=File.editor.getMarkdown();File.editor.sourceView.show();await wait(()=>File.editor.sourceView.cm&&File.editor.sourceView.inSourceMode,'native source ready');const cm=File.editor.sourceView.cm;await pause(300);cm.setCursor({line:2,ch:0});cm.focus();
  await open();await accept(':63:5');assert(cm.getCursor().line===62&&cm.getCursor().ch===4,'native source row and column');assert(cm.getValue()===original,'native source content retained');
  File.editor.sourceView.hide();await wait(()=>!File.editor.sourceView.inSourceMode,'rendered Markdown ready');await pause(400);document.querySelector('#write').focus();
  await open();await accept(':83:6');assert(!File.editor.sourceView.inSourceMode&&File.editor.getMarkdown()===original,'rendered jump keeps mode and text');
  const cursor=File.editor.selection.buildUndo();assert(cursor&&cursor.start===5,'rendered jump maps source column');samples.push({stage:'rendered',cursor,selection:File.editor.selection.getRangy()?.startContainer?.parentElement?.textContent});
  const go=[...document.querySelectorAll('.workspace-titlebar-menu>button')].find(node=>/^(转到|Go)$/.test(node.textContent.trim()));assert(go,'Go top menu exists');go.click();await wait(()=>document.querySelector('.workspace-titlebar-popup'),'Go popup');
  const entries=[...document.querySelectorAll('.workspace-titlebar-entry')];assert(entries.some(node=>node.textContent.includes('Ctrl+G'))&&entries.some(node=>node.textContent.includes('Alt+Left')),'Go exposes shared navigation and line shortcut');entries.find(node=>node.textContent.includes('Ctrl+G')).click();await wait(input,'menu opens same line input');await send('key',{key:27});
  assert(fs.readFileSync(md,'utf8')===markdown&&File.editor.getMarkdown()===original,'all Markdown actions are non-writing');
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',checks,samples,error:String(error.stack||error),input:input()?.outerHTML,result:document.querySelector('.workspace-go-line button')?.textContent,active:workspace.activeLeaf?.state,source:File.editor.sourceView?.inSourceMode},null,2));}
})();
