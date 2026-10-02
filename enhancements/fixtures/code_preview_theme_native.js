// R068.12: compare production readers with actual native fence token colors.
(async()=>{
 const fs=reqnode('fs'),path=reqnode('path'),base=__CASE_ROOT__,checks=[],samples=[],initial_mode_count=Object.keys(window.CodeMirror.modes).length;
 const core=window[Symbol.for('typora-code:workspace')],files=core.app[Symbol.for('linux-note.workspace-files@v1')].host,renderer=core.app.features.markdownRenderer;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(test,label)=>{for(let i=0;i<400;i++){if(await test())return;await pause(25);}throw Error(label);};
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
 const sources={bash:'#!/bin/bash\n# comment\nname="hello"\nif [ "$name" ]; then\n  echo "$name" 42\nfi',tex:'% comment\n\\begin{equation}\n  x = \\frac{42}{2}\n\\end{equation}',js:'/* multi\n\nline comment */\nfunction greet(name) {\n  const value = "hello";\n  return name + value + 42;\n}',c:'#define COUNT 42\nint main(void) {\n  const char *s = "hello"; // comment\n  return COUNT;\n}',cpp:'#include <vector>\nstd::vector<int> values;\nconst char *s = "hello"; // comment\nint count = 42;'};
 sources.unknown_fixture='plain value <thing>\nsecond line 42';
 const themes=[['cpp_github-consolas_dark.css','dark'],['vscode2026_dark.css','dark_2026'],['vscode2026_light.css','light_2026'],['cpp_github-consolas_light.css','light']];
 const directory=path.join(base,'workspace');
 const characters=root=>{const out=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){const color=getComputedStyle(node.parentElement).color;for(const value of node.nodeValue.replace(/\u00a0/g,' ').replace(/\u200b/g,''))out.push({value,color});}return out;};
 try{
  await wait(()=>fs.existsSync(path.join(base,'window_bounds_ready.json')),'window ready');
  reqnode(path.join(_options.userDataPath,'typora_code/assets/update/workspace_update_service.cjs')).check_update=async()=>undefined;
  const text='# preview_palette_marker\n\n'+Object.entries(sources).map(([language,source])=>'```'+language+'\n'+source+'\n```\n').join('\n');
  const file=path.join(directory,'all.md'),reading_file=path.join(directory,'all_read.md');fs.writeFileSync(file,text,'utf8');fs.writeFileSync(reading_file,text,'utf8');
  await pause(400);
  window.dispatchEvent(new CustomEvent('linux-note-search-selection',{detail:{query:'preview_palette_marker'}}));
  const panel=()=>document.querySelector('.linux-note-workspace-search');
  await wait(()=>panel()?.dataset.state==='ready'&&panel().querySelectorAll('.workspace-search-match').length===2,'two search files');
  panel().querySelector('.workspace-search-file[data-path$="all_read.md"] .workspace-search-match').click();
  await wait(()=>panel().querySelector('.workspace-lookup-markdown')?.shadowRoot.querySelector('code.language-bash span'),'search before native fences');
  const shadow=panel().querySelector('.workspace-lookup-markdown').shadowRoot;
  assert(!!shadow.querySelector('.cm-builtin,.cm-keyword'),'native mode registry available for initial search');
  await files.open_file(file);await wait(()=>File.bundle.filePath===file&&!File.isFileLoading(),'open corpus');
  const holder=document.createElement('div'),reader=document.createElement('div');holder.style.cssText='position:fixed;right:20px;top:160px;width:360px;height:500px;overflow:auto;z-index:9000';document.body.append(holder);holder.append(reader);
  renderer.renderTo(text,reader,file);
  for(const [language,source] of Object.entries(sources)){
   const fence=()=>document.querySelector('#write .md-fences[lang="'+language+'"] .CodeMirror');
   document.querySelector('#write .md-fences[lang="'+language+'"]').scrollIntoView({block:'center'});
   await wait(()=>fence()?.CodeMirror,'native '+language);const cm=fence().CodeMirror;
   if(language==='c'||language==='cpp')await wait(()=>cm.getOption('mode')==='linux-note-vscode-textmate-'+language,'TextMate '+language);
   reader.querySelector('code.language-'+language).scrollIntoView({block:'center'});
   if(language!=='unknown_fixture')await wait(()=>reader.querySelector('code.language-'+language+' span'),'split tokens '+language);else await pause(150);
   shadow.querySelector('code.language-'+language).scrollIntoView({block:'center'});
   for(const [theme,identity] of themes){
    ClientCommand.setTheme(theme,theme);await wait(()=>document.documentElement.dataset.workspaceCodeTheme===identity,'theme '+identity);await pause(250);
    cm.refresh();await pause(80);
    const native=[...fence().querySelectorAll('.CodeMirror-code .CodeMirror-line')].flatMap((line,index)=>[...(index?[{value:'\n',color:null}]:[]),...characters(line)]);
    assert(native.map(item=>item.value).join('')===source,'native source '+language+' '+identity+' '+JSON.stringify(native.map(item=>item.value).join('')));
    const results=[];
    for(const [kind,code] of [['split',reader.querySelector('code.language-'+language)],['search',shadow.querySelector('code.language-'+language)]]){
     const actual=characters(code);if(actual.at(-1)?.value==='\n')actual.pop();
     assert(actual.map(item=>item.value).join('')===source,kind+' source '+language+' '+identity);
     const differences=actual.flatMap((item,index)=>item.value!=='\n'&&item.color!==native[index]?.color?[{index,value:item.value,actual:item.color,expected:native[index]?.color}]:[]);
     results.push({kind,differences,background:getComputedStyle(code.closest('pre')).backgroundColor,tokens:[...code.querySelectorAll('span')].map(span=>({text:span.textContent,cls:span.className,color:getComputedStyle(span).color}))});
     samples.push({language,identity,kind,differences,mode:cm.getOption('mode'),native_bg:getComputedStyle(fence()).backgroundColor,preview_bg:getComputedStyle(code.closest('pre')).backgroundColor});
     assert(!differences.length,kind+' colors '+language+' '+identity+' '+JSON.stringify(differences.slice(0,8)));
     assert(getComputedStyle(code.closest('pre')).backgroundColor===getComputedStyle(fence()).backgroundColor,kind+' background '+language+' '+identity);
    }
    assert(!reader.querySelector('.CodeMirror')&&!shadow.querySelector('.CodeMirror'),'readers have no editors '+language+' '+identity);
    assert(File.editor.getMarkdown().trim()===text.trim(),'main document retained '+language+' '+identity);
    fs.writeFileSync(path.join(base,'sample_'+language+'_'+identity+'.json'),JSON.stringify(results,null,2));
   }

  }
  renderer.release(reader);holder.remove();assert(document.querySelectorAll('#typora-code-official-code-theme').length===1,'one shared theme owner after 24 switches');
  assert(fs.readFileSync(file,'utf8')===text&&fs.readFileSync(reading_file,'utf8')===text,'source file bytes retained');
  fs.writeFileSync(path.join(base,'capture_request.json'),JSON.stringify({stage:'code_preview_colors'}));await pause(500);
  fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks,samples,initial_mode_count},null,2));
 }catch(error){fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'ERROR',error:String(error.stack||error),checks,samples,diagnostic:{markdown:File.editor.getMarkdown(),path:File.bundle.filePath,reader:document.querySelector('.typ-markdown-preview')?.outerHTML,shadow:document.querySelector('.workspace-lookup-markdown')?.shadowRoot?.innerHTML.slice(-12000),cm:typeof window.CodeMirror,resolver:typeof window.getCodeMirrorMode,modes:Object.keys(window.CodeMirror?.modes||{}),native:document.querySelector('#write .CodeMirror')?.CodeMirror?.getOption('mode')}},null,2));}
})();
