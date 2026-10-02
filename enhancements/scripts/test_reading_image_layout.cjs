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
  const shortcuts=[...document.querySelectorAll('[data-image-align-scope]')],alignment_button=(scope,value)=>document.querySelector('[data-image-align-scope="'+scope+'"][data-image-align="'+value+'"]');
  assert(shortcuts.length===7&&shortcuts.every(button=>!button.hasAttribute('aria-haspopup')),'alignment actions are seven inline shortcuts');
  assert(shortcuts.filter(button=>button.dataset.imageAlignScope==='single').every(button=>button.disabled),'read-only individual shortcuts disabled');
  alignment_button('global','center').click();assert(qa.read_reading_image_settings().alignment==='center'&&alignment_button('global','center').getAttribute('aria-pressed')==='true','global shortcut updates settings and selected state immediately');
  assert(article.innerHTML===html,'global shortcut does not modify document');alignment_button('global','right').click();
  image.style.margin='0 auto 0 0';qa.write_reading_image_setting('alignment','right');assert(image.getBoundingClientRect().left===article.getBoundingClientRect().left,'individual alignment wins');image.removeAttribute('style');
  assert(article.innerHTML===html,'global presentation leaves source DOM unchanged');
  const field=document.querySelector('.reading-image-scale input'),down=document.querySelector('[data-image-scale-action="decrease"]'),up=document.querySelector('[data-image-scale-action="increase"]');
  assert(field.type==='number'&&!document.querySelector('input[type="range"]'),'numeric field replaces slider');
  const enter=(value,key='Enter')=>{field.value=value;field.dispatchEvent(new Event('input'));field.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));field.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true}));};
  enter('125');assert(qa.read_reading_image_settings().scale===125&&image.getBoundingClientRect().width===80,'numeric Enter commits proportion');
  const stepped=writes;down.click();assert(qa.read_reading_image_settings().scale===120,'minus steps 5');up.click();assert(qa.read_reading_image_settings().scale===125&&writes===stepped+2,'plus steps 5 with one write per click');
  field.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));assert(qa.read_reading_image_settings().scale===130,'keyboard steps 5');
  const committed=writes;enter('150','Escape');field.dispatchEvent(new Event('blur'));assert(qa.read_reading_image_settings().scale===130&&writes===committed,'Escape cancels without blur recommitting');
  enter('');assert(qa.read_reading_image_settings().scale===130&&writes===committed,'empty input does not persist zero');enter('700');assert(qa.read_reading_image_settings().scale===600&&up.disabled,'out of range clamps to image limit');
  field.value='135';field.dispatchEvent(new Event('input'));field.dispatchEvent(new Event('blur'));assert(qa.read_reading_image_settings().scale===135,'blur commits valid draft');
  qa.write_reading_image_setting('size_mode','fit_width');enter('150','Escape');field.dispatchEvent(new Event('blur'));assert(qa.read_reading_image_settings().size_mode==='fit_width','Escape preserves prior fit mode');
  qa.write_reading_image_setting('scale',20);assert(down.disabled&&!up.disabled,'lower bound disables decrement');qa.write_reading_image_setting('scale',600);assert(up.disabled&&!down.disabled,'upper bound disables increment');
  const large=new Image();large.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1000"/>');article.append(large);await large.decode();await pause(100);
  for(const [scale,width]of [[50,200],[100,400],[150,400]]){qa.write_reading_image_setting('scale',scale);assert(Math.abs(large.getBoundingClientRect().width-width)<1,'large image available-width base '+scale);}
  await pause(100);const large_field=[...document.querySelectorAll('.reading-image-scale input')][1],large_up=large_field.parentElement.querySelector('[data-image-scale-action=increase]');
  const saved_writes=writes;assert(large_field.value==='100'&&large_field.max==='100'&&large_up.disabled,'large image displays effective capped scale and disables plus');large_field.focus();large_field.blur();assert(writes===saved_writes&&qa.read_reading_image_settings().scale===150,'viewing or focusing capped percentage does not rewrite global preference');
  large_field.value='180';large_field.dispatchEvent(new Event('input'));large_field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));assert(large_field.value==='100'&&qa.read_reading_image_settings().scale===100,'over-limit numeric commit clamps to actual image bound');
  large_field.parentElement.querySelector('[data-image-scale-action=decrease]').click();assert(large_field.value==='95'&&qa.read_reading_image_settings().scale===95,'minus moves five percent below fitted limit');
  article.style.width='100px';qa.write_reading_image_setting('scale',200);await pause(100);assert(field.max==='156.25'&&field.value==='156.25'&&up.disabled,'small image limit follows resized container');
  const toolbar=field.closest('.reading-media-entry');toolbar.classList.add('is-revealed');
  for(const theme of ['light','dark']){document.documentElement.dataset.workspaceFileIconTheme=theme;const surface=getComputedStyle(toolbar),input_style=getComputedStyle(field);assert(!surface.backgroundColor.startsWith('rgba')&&!input_style.backgroundColor.startsWith('rgba')&&surface.borderTopStyle==='solid','opaque toolbar, input and border '+theme);}
  toolbar.classList.remove('is-revealed');assert(getComputedStyle(toolbar).backgroundColor==='rgba(0, 0, 0, 0)','idle toolbar leaves no empty surface');
  qa.write_reading_image_setting('scale',50);article.style.width='300px';assert(Math.abs(large.getBoundingClientRect().width-150)<1,'container resize updates percentage base');article.style.width='400px';large.remove();
  binding.dispose();assert(!document.querySelector('.reading-media-entries'),'dispose removes controls');
  const loads=[];for(const count of [20,100,1000]){article.replaceChildren(...Array.from({length:count},()=>image.cloneNode()));const started=performance.now(),bound=qa.bind_reading_images(article);await pause(250);assert(document.querySelectorAll('.reading-image-open').length===count,'controls created '+count);bound.dispose();assert(!document.querySelector('.reading-media-entries'),'controls disposed '+count);loads.push({count,elapsed_ms:performance.now()-started});}
  assert(!document.querySelector('style[data-reading-image-layout]'),'layout stylesheet ownership cleaned');
  return {status:'PASS',checks,loads};
 })()`);console.log(JSON.stringify(result));
}).catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{win?.destroy();app.exit(process.exitCode||0)});
