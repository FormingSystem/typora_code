const {app,BrowserWindow}=require('electron'),{build}=require('esbuild'),fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'code_editor_colors_'));app.setPath('userData',path.join(base,'profile'));app.disableHardwareAcceleration();let view;
app.whenReady().then(async()=>{
 view=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,offscreen:true}});
 await view.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<style>.CodeMirror-cursor{border-left:1px solid black}.CodeMirror-selected{background:#ddd}.CodeMirror-gutters{background:white}.cm-searching{background:yellow}.CodeMirror-selectedtext{background:blue}</style><div id="write"><p id="body">正文</p><div class="md-fences"><div class="CodeMirror"><div class="CodeMirror-cursor CodeMirror-overwrite"></div><div class="CodeMirror-selected"></div><div class="CodeMirror-gutters"></div><div class="CodeMirror-activeline-gutter"><div class="CodeMirror-linenumber">1</div></div><div class="CodeMirror-activeline-background"></div><pre class="CodeMirror-line"><span class="cm-variable">p = plain;</span><span class="cm-searching">find</span><span class="CodeMirror-matchingbracket">(</span><span class="CodeMirror-composing">输入</span></pre></div></div><div class="md-diagram"><svg></svg></div></div>`));
 const bundle=await build({stdin:{contents:'export * from "./src/reading_code_theme"; export {markdown_theme_rules} from "./src/workspace_markdown_theme";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'api',loader:{'.wasm':'binary'}});
 await view.webContents.executeJavaScript(bundle.outputFiles[0].text);
 const results=await view.webContents.executeJavaScript(`(async()=>{
 const data=await api.load_code_themes(),style=document.createElement('style');style.textContent=data.css;document.head.append(style);
 const root=document.documentElement,cm=document.querySelector('.CodeMirror'),result=[];
 const read=q=>{const s=getComputedStyle(document.querySelector(q));return {color:s.color,bg:s.backgroundColor,border:s.borderLeftColor,caret:s.caretColor,shadow:s.boxShadow,bottom:s.borderBottomColor,outline:s.outlineColor}};
 const original=document.querySelector('#write').innerHTML;
 for(let i=0;i<20;i++){
  const mode=i%2?'light':'dark';root.dataset.workspaceCodeTheme=mode;cm.classList.remove('CodeMirror-focused');
  const token=data.c.tokenizeLine('p = plain;',api.initial_code_stack()).tokens[0];document.querySelector('.CodeMirror-line span').className=token.style.split(' ').map(c=>'cm-'+c).join(' ');
  cm.classList.add('cm-fat-cursor');const block=read('.CodeMirror-cursor');cm.classList.remove('cm-fat-cursor');const inactive=read('.CodeMirror-selected');cm.classList.add('CodeMirror-focused');
  result.push({mode,block,cursor:read('.CodeMirror-cursor'),selection:read('.CodeMirror-selected'),inactive,gutter:read('.CodeMirror-gutters'),number:read('.CodeMirror-linenumber'),line:read('.CodeMirror-line'),token:read('.CodeMirror-line span'),active:read('.CodeMirror-activeline-background'),find:read('.cm-searching'),bracket:read('.CodeMirror-matchingbracket'),composition:read('.CodeMirror-composing'),diagram:read('.md-diagram')});
 }
 const dynamic=cm.cloneNode(true);cm.after(dynamic);const added=getComputedStyle(dynamic.querySelector('.CodeMirror-cursor')).borderLeftColor;dynamic.remove();style.remove();root.removeAttribute('data-workspace-code-theme');
 return {result,added,restored:read('.CodeMirror-cursor').border,body:document.querySelector('#body').textContent};
 })()`);
 for(const sample of results.result){const dark=sample.mode==='dark';assert.equal(sample.cursor.border,dark?'rgb(174, 175, 173)':'rgb(0, 0, 0)');assert.equal(sample.selection.bg,dark?'rgb(38, 79, 120)':'rgb(173, 214, 255)');assert.equal(sample.inactive.bg,dark?'rgb(58, 61, 65)':'rgb(229, 235, 241)');assert.equal(sample.gutter.bg,dark?'rgb(31, 31, 31)':'rgb(255, 255, 255)');assert.equal(sample.number.color,dark?'rgb(204, 204, 204)':'rgb(23, 17, 132)');assert.equal(sample.line.bg,'rgba(0, 0, 0, 0)');assert.equal(sample.token.bg,'rgba(0, 0, 0, 0)');assert.equal(sample.find.bg,'rgba(234, 92, 0, 0.333)');assert.equal(sample.diagram.bg,'rgba(0, 0, 0, 0)');assert.equal(sample.cursor.bottom,dark?'rgb(174, 175, 173)':'rgb(0, 0, 0)');assert.equal(sample.block.bg,dark?'rgb(174, 175, 173)':'rgb(0, 0, 0)');assert.equal(sample.bracket.bg,'rgba(0, 100, 0, 0.1)');assert.equal(sample.bracket.outline,dark?'rgb(136, 136, 136)':'rgb(185, 185, 185)');assert.equal(sample.composition.bottom,dark?'rgb(255, 255, 255)':'rgb(0, 0, 0)');assert(sample.active.shadow.includes(dark?'40, 40, 40':'238, 238, 238'));}
 assert.equal(results.added,'rgb(0, 0, 0)');assert.equal(results.restored,'rgb(0, 0, 0)');assert.equal(results.body,'正文');
 const dark_css=fs.readFileSync(path.join(__dirname,'../../vscode2026_dark.css'),'utf8').replace(/@import[^;]+;/u,'');
 const light_css=fs.readFileSync(path.join(__dirname,'../../vscode2026_light.css'),'utf8').replace(/@import[^;]+;/u,'');
 const palette=await view.webContents.executeJavaScript(`(async()=>{
  const root=document.documentElement,theme=document.createElement('style');theme.textContent=${JSON.stringify(dark_css)};document.head.append(theme);root.dataset.workspaceColors='dark';
  const release=await api.bind_code_theme(),cm=document.querySelector('.CodeMirror');cm.classList.add('CodeMirror-focused');
  const span=document.querySelector('.CodeMirror-line span');span.className='cm-keyword';
  const color=(node,key)=>getComputedStyle(node).getPropertyValue(key),read=()=>({identity:root.dataset.workspaceCodeTheme,bg:color(cm,'background-color'),cursor:color(cm.querySelector('.CodeMirror-cursor'),'border-left-color'),selection:color(cm.querySelector('.CodeMirror-selected'),'background-color'),keyword:color(span,'color')});
  const dark=read(),host=document.body.appendChild(document.createElement('div')),shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<style>'+api.markdown_theme_rules()+'</style><div id=write><pre><code><span class=cm-keyword>if</span></code></pre></div>';
  const preview={bg:color(shadow.querySelector('pre'),'background-color'),keyword:color(shadow.querySelector('span'),'color')};
  theme.remove();await new Promise(r=>setTimeout(r,60));const night=read();
  document.head.append(theme);await new Promise(r=>setTimeout(r,60));const restored=read();
  theme.textContent=${JSON.stringify(light_css)};root.dataset.workspaceColors='light';await new Promise(r=>setTimeout(r,250));const light=read();
  const light_preview={bg:color(shadow.querySelector('pre'),'background-color'),keyword:color(shadow.querySelector('span'),'color')};
  const debug={declared:getComputedStyle(root).getPropertyValue('--workspace-code-theme'),computed:api.workspace_code_theme()};release();theme.remove();host.remove();return {dark,preview,night,restored,light,light_preview,debug};
 })()`);
 assert.deepEqual(palette.dark,{identity:'dark_2026',bg:'rgb(18, 19, 20)',cursor:'rgb(187, 190, 191)',selection:'rgba(39, 103, 130, 0.867)',keyword:'rgb(255, 123, 114)'});
 assert.deepEqual(palette.preview,{bg:'rgb(18, 19, 20)',keyword:'rgb(255, 123, 114)'});
 assert.equal(palette.night.identity,'dark');assert.equal(palette.night.bg,'rgb(31, 31, 31)');assert.equal(palette.night.cursor,'rgb(174, 175, 173)');assert.deepEqual(palette.restored,palette.dark);
 assert.deepEqual(palette.light,{identity:'light_2026',bg:'rgb(255, 255, 255)',cursor:'rgb(32, 32, 32)',selection:'rgba(0, 105, 204, 0.25)',keyword:'rgb(207, 34, 46)'});
 assert.deepEqual(palette.light_preview,{bg:'rgb(255, 255, 255)',keyword:'rgb(207, 34, 46)'});
 fs.writeFileSync(path.join(base,'checks.json'),JSON.stringify({status:'PASS',checks:311,samples:results,palette},null,2));console.log('PASS 303 editor-state assertions and 8 official 2026/base CSS/Shadow/same-mode switch checks');view.destroy();app.exit(0);
}).catch(error=>{console.error(error);view?.destroy();app.exit(1)});
