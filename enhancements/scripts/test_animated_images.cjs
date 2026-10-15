// Compare rendered pixels over time; load completion alone does not prove animation.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{editor_plugins}=require('./editor_bundle.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'typora_animated_images_'));
const gif=Buffer.from(require('../fixtures/animated_image.json').base64,'base64'),checks=[],frames={};
let win,server;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  const filename=path.join(root,'动图 space.gif');fs.writeFileSync(filename,gif);
  fs.writeFileSync(path.join(root,'broken.gif'),'not an image');fs.writeFileSync(path.join(root,'note.md'),'# Unchanged\n');
  fs.writeFileSync(path.join(root,'static.png'),Buffer.from(require('../fixtures/animated_image.json').png_base64,'base64'));
  server=http.createServer((request,response)=>{response.setHeader('Content-Type','image/gif');response.end(gif);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const remote='http://127.0.0.1:'+server.address().port+'/animation.gif';
  const html=path.join(root,'index.html');fs.writeFileSync(html,'<style>body{margin:0;background:white}#write{position:absolute;left:0;top:0;width:250px;height:400px}#write img{width:128px;height:128px}#mount{position:absolute;left:260px;top:0;width:400px;height:450px}#second{position:absolute;left:670px;top:0;width:300px;height:450px}</style><article id="write"><img id="local"><img id="remote"></article><section id="mount"></section><section id="second"></section>');
  win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false,offscreen:true}});await win.loadFile(html);
  const evaluate=async code=>{try{return await win.webContents.executeJavaScript(code,true);}catch(error){throw new Error(code,{cause:error});}};
  const bundle=await build({plugins:editor_plugins(),stdin:{contents:'export {create_link_preview} from "./src/workspace_link_preview";export {bind_reading_images} from "./src/reading_image_viewer";export {bind_workspace_link_selection} from "./src/workspace_link_selection";',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'qa',loader:{'.css':'text'}});await evaluate(bundle.outputFiles[0].text+';void 0;');
  await evaluate(`window.reqnode=require;window.urls=new Set();const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=value=>{const url=create(value);urls.add(url);return url};URL.revokeObjectURL=url=>{urls.delete(url);revoke(url)};window.files={fs:require('fs'),path_api:require('path'),copy(){},open_file:async()=>{},current_file:()=>${JSON.stringify(path.join(root,'note.md'))}};window.preview=qa.create_link_preview(files);document.querySelector('#mount').append(preview.container);window.show=name=>preview.show({source:files.current_file(),href:name});local.src=${JSON.stringify(require('node:url').pathToFileURL(filename).href)};remote.src=${JSON.stringify(remote)};window.binding=qa.bind_reading_images(document.body,'#write img');void 0;`);
  const wait=async(code)=>{for(let i=0;i<100;i++){if(await evaluate(code))return;await pause(30);}throw Error('Timeout: '+code);};
  const check=async(label,code)=>{assert(await evaluate(code),label);checks.push(label);};
  const animated=async(selector,label)=>{
    const rect=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.ceil(r.left),y:Math.ceil(r.top),width:Math.max(1,Math.floor(r.width)-1),height:Math.max(1,Math.floor(r.height)-1)}})()`);
    const colors=[];
    for(let i=0;i<12;i++){await pause(75);const shot=await win.webContents.capturePage(rect),pixels=shot.toBitmap();let red=0,blue=0;for(let j=0;j<pixels.length;j+=4){const [b,g,r]=pixels.subarray(j,j+3);if(r>220&&b<30&&g<30)red++;if(b>220&&r<30&&g<30)blue++;}colors.push({red,blue});if(i===0||i===5)fs.writeFileSync(path.join(root,label.replaceAll(' ','_')+'_'+i+'.png'),shot.toPNG());}
    frames[label]=colors;assert(colors.some(({red,blue})=>red>50&&blue===0)&&colors.some(({red,blue})=>blue>50&&red===0),label+': visible red and blue frames');checks.push(label);
  };
  await wait('local.complete&&local.naturalWidth===32&&remote.complete&&remote.naturalWidth===32');
  await animated('#local','document local GIF');await animated('#remote','document HTTP GIF');
  await evaluate(`local.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0}))`);await wait('!!document.querySelector(".reading-media-content img")?.naturalWidth');
  await animated('.reading-media-content img','document full-screen GIF');await evaluate(`document.querySelector('.reading-media-viewer [data-action="close"]').click()`);
  await evaluate(`show(${JSON.stringify(path.basename(filename))})`);
  await check('local link uses image preview',`preview.container.dataset.state==='ready'&&!!preview.container.querySelector('.workspace-preview-image img')`);
  await animated('#mount .workspace-preview-image img','linked GIF');
  await evaluate(`window.selection_binding=qa.bind_workspace_link_selection({WorkspaceView:class{},app:{viewManager:{registerView:()=>()=>{}},workspace:{eachLeaves:()=>{}}}},files,()=>true,()=>{},{root:preview.container,outside:()=>preview.clear()});preview.container.focus();void 0`);
  await check('image does not offer text search or text scale',`preview.container.querySelector('[data-preview-find-open]').disabled&&preview.container.querySelector('.workspace-preview-scale-controls').hidden`);
  await evaluate(`preview.container.querySelector('.workspace-preview-image img').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0}))`);await wait('!!document.querySelector(".reading-media-content img")?.naturalWidth');
  await animated('.reading-media-content img','linked full-screen GIF');
  await check('full-screen focus retains its source preview',`!!preview.container.querySelector('.workspace-preview-image img')&&document.activeElement.closest('.reading-media-viewer')!==null`);
  await evaluate(`document.querySelector('[data-action="zoom-in"]').click()`);await animated('.reading-media-content img','zoomed GIF');
  await evaluate(`document.querySelector('.reading-media-viewer [data-action="close"]').click()`);
  await evaluate('selection_binding.dispose()');
  await evaluate(`window.second=qa.create_link_preview(files);document.querySelector('#second').append(second.container);second.show({source:files.current_file(),href:${JSON.stringify(path.basename(filename))}})`);
  await animated('#second .workspace-preview-image img','second preview GIF');
  await evaluate(`preview.clear()`);await check('closing one preview retains only the other image URL','urls.size===1');await animated('#second .workspace-preview-image img','other preview survives close');await evaluate('second.dispose()');
  await evaluate(`show('broken.gif')`);await check('corrupt image reports failure and releases URL',`preview.container.dataset.state==='error'&&urls.size===0`);
  await evaluate(`show('missing.gif')`);await check('missing image reports failure',`preview.container.dataset.state==='error'`);
  await evaluate(`show('static.png')`);await check('static PNG retains image display',`preview.container.dataset.state==='ready'&&preview.container.querySelector('.workspace-preview-image img').naturalWidth===32`);await evaluate('preview.clear()');
  await evaluate(`window.original_read=files.fs.promises.readFile;window.release_read=null;files.fs={...files.fs,promises:{...files.fs.promises,readFile:async(...args)=>{const bytes=await original_read(...args);await new Promise(resolve=>release_read=resolve);return bytes}}};window.pending=show(${JSON.stringify(path.basename(filename))});void 0`);await wait('!!release_read');await evaluate('preview.clear();release_read();pending');
  await check('late image read cannot recreate a cleared preview',`urls.size===0&&!preview.container.querySelector('.workspace-preview-image')`);await evaluate('files.fs=require("fs");void 0');
  for(let i=0;i<20;i++){await evaluate(`show(${JSON.stringify(path.basename(filename))})`);await check('open cycle '+i,`preview.container.dataset.state==='ready'&&urls.size===1`);await evaluate('preview.clear()');}
  await evaluate(`show(${JSON.stringify(remote)})`);await wait(`preview.container.querySelector('iframe')?.dataset.loadState==='loaded'`);await animated('#mount iframe','HTTP linked image');
  await evaluate('preview.dispose();binding.dispose()');await check('all image URLs released','urls.size===0');
  assert.deepEqual(fs.readFileSync(filename),gif);assert.equal(fs.readFileSync(path.join(root,'note.md'),'utf8'),'# Unchanged\n');checks.push('source bytes unchanged');
  fs.writeFileSync(path.join(root,'checks.json'),JSON.stringify({status:'PASS',checks,frames},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,evidence:root}));
}).catch(error=>{fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify({error:String(error.stack),checks,frames},null,2));console.error(error);process.exitCode=1;}).finally(()=>{server?.close();win?.destroy();app.exit(process.exitCode||0);});
