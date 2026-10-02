const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'typora-image-layout-')));app.disableHardwareAcceleration();
let win;
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:800,height:600,webPreferences:{offscreen:true,contextIsolation:false,backgroundThrottling:false}});
 await win.loadURL('data:text/html,<style>article{width:400px}img{width:100%}</style><article></article>');
 const built=await require('esbuild').build({plugins:require('./editor_bundle.cjs').editor_plugins(),stdin:{contents:`export * from './src/reading_image_settings';export * from './src/reading_image_viewer';export * from './src/reading_image_controls';`,resolveDir:path.join(__dirname,'..')},bundle:true,write:false,format:'iife',globalName:'qa',loader:{'.css':'text'}});
 await win.webContents.executeJavaScript(built.outputFiles[0].text);
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const checks=[],assert=(v,m)=>{if(!v)throw Error(m);checks.push(m)},pause=ms=>new Promise(r=>setTimeout(r,ms));
  const values=new Map();let writes=0,failed=false;window[Symbol.for('typora-code:workspace')]={app:{settings:{get:k=>values.get(k),set_and_save(k,v){if(failed)throw Error('disk');values.set(k,v);writes++;}}}};
  const article=document.querySelector('article'),image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="40"/>');article.append(image);await image.decode();
  const html=article.innerHTML,binding=qa.bind_reading_images(article);await pause(120);
  assert(image.getBoundingClientRect().width===64,'natural small image overrides theme stretching');
  qa.write_reading_image_setting('size_mode','fit_width');assert(image.getBoundingClientRect().width===400,'fit width explicit');
  const before=writes,gesture=qa.begin_reading_image_scale();for(let n=0;n<100;n++)gesture.update(150+n);
  assert(writes===before&&image.getBoundingClientRect().width>150,'100 updates remain in memory');gesture.cancel();assert(image.getBoundingClientRect().width===400,'cancel restores fit mode');
  const failure=qa.begin_reading_image_scale();failure.update(200);failed=true;try{failure.commit(200)}catch{}failed=false;
  assert(qa.read_reading_image_settings().size_mode==='fit_width'&&writes===before,'failed save restores persisted presentation');
  qa.write_reading_image_setting('scale',150);assert(image.getBoundingClientRect().width===96,'committed percentage uses natural size');
  for(const value of ['left','center','right']){qa.write_reading_image_setting('alignment',value);const r=image.getBoundingClientRect(),p=article.getBoundingClientRect();assert(Math.abs(r.left-(value==='left'?p.left:value==='center'?p.left+152:p.right-96))<1,'global alignment '+value);}
  image.style.margin='0 auto 0 0';qa.write_reading_image_setting('alignment','right');assert(image.getBoundingClientRect().left===article.getBoundingClientRect().left,'individual alignment wins');image.removeAttribute('style');
  assert(article.innerHTML===html,'global presentation leaves source DOM unchanged');
  binding.dispose();assert(!document.querySelector('.reading-media-entries'),'dispose removes controls');
  const loads=[];for(const count of [20,100,1000]){article.replaceChildren(...Array.from({length:count},()=>image.cloneNode()));const started=performance.now(),bound=qa.bind_reading_images(article);await pause(250);assert(document.querySelectorAll('.reading-image-open').length===count,'controls created '+count);bound.dispose();assert(!document.querySelector('.reading-media-entries'),'controls disposed '+count);loads.push({count,elapsed_ms:performance.now()-started});}
  assert(!document.querySelector('style[data-reading-image-layout]'),'layout stylesheet ownership cleaned');
  return {status:'PASS',checks,loads};
 })()`);console.log(JSON.stringify(result));
}).catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{win?.destroy();app.exit(process.exitCode||0)});
