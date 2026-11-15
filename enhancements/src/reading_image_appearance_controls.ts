import {workspace_element as el,workspace_button} from './workspace_widgets';
import {workspace_text} from './workspace_i18n';
import {get_workspace_app} from './workspace_bootstrap';
import {workspace_theme_mode} from './workspace_theme';
import {IMAGE_SHADOW_VALUES,begin_reading_image_appearance,read_reading_image_settings,write_reading_image_setting} from './reading_image_settings';

/** Floating controls share the persistent image settings owner and never edit the image. */
export function create_reading_image_appearance_controls(image:HTMLImageElement,fail:(error:unknown)=>void){
  const rows=Array.from({length:8},()=>el('div','reading-image-control-row reading-image-appearance'));
  rows[0].append(el('span','reading-image-scope',workspace_text('image_appearance_global')));
  let mode=workspace_theme_mode();
  const drafts=new Set<HTMLInputElement>(),events=new AbortController(),{signal}=events;
  const fields=new Map<string,HTMLInputElement>();
  const ranges=new Map<string,HTMLInputElement>();
  let gesture:ReturnType<typeof begin_reading_image_appearance>|undefined;
  const color_key=()=>mode==='dark'?'border_color_dark':'border_color_light';
  const save=(key:string,value:unknown)=>{try{write_reading_image_setting(key,value);}catch(error){fail(error);}sync();};
  const toggle=workspace_button(workspace_text('image_border'),()=>save('border',!read_reading_image_settings().border),'reading-media-open');
  toggle.dataset.imageAppearance='border';
  function field(key:string,title:string,min?:number,max?:number){
    const label=el('label','reading-image-appearance-field'),input=el('input');
    input.type=min===undefined?'text':'number';input.dataset.imageAppearance=key;input.setAttribute('aria-label',title);
    if(min!==undefined){input.min=String(min);input.max=String(max);input.step=key==='border_width'?'.5':'1';}
    else input.placeholder=workspace_text('image_border_color_auto');
    label.append(el('span','',title),input);fields.set(key,input);
    const commit=()=>{if(!drafts.delete(input))return;if(key==='color'&&workspace_theme_mode()!==mode){sync();return;}const value=min===undefined?input.value:input.value.trim()?input.valueAsNumber:NaN;save(key==='color'?color_key():key,value);};
    input.addEventListener('input',()=>drafts.add(input),{signal});
    input.addEventListener('change',()=>{drafts.add(input);commit();},{signal});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit();}else if(event.key==='Escape'){event.preventDefault();drafts.delete(input);sync();}},{signal});
    return label;
  }
  rows[1].append(toggle,field('border_width',workspace_text('image_border_width_short'),.5,8),el('span','reading-image-scope','px'));
  const shadow=el('select');shadow.dataset.imageAppearance='shadow';shadow.setAttribute('aria-label',workspace_text('image_shadow'));
  for(const value of IMAGE_SHADOW_VALUES)shadow.append(new Option(workspace_text('image_shadow_'+value as any),value));
  shadow.addEventListener('change',()=>save('shadow',shadow.value),{signal});
  rows[2].append(field('border_radius',workspace_text('image_border_radius_short'),0,32),el('span','reading-image-scope','px'),el('span','reading-image-scope',workspace_text('image_shadow')),shadow);
  const color=field('color',workspace_text('image_border_color_short')),caption=color.querySelector('span')!;
  const picker=el('input');picker.type='color';picker.dataset.imageAppearance='picker';picker.setAttribute('aria-label',workspace_text('image_border_color_short'));
  picker.addEventListener('change',()=>{const current=read_reading_image_settings()[color_key()];drafts.delete(fields.get('color')!);save(color_key(),picker.value+(/^#[0-9a-f]{8}$/i.test(current)?current.slice(7):''));},{signal});
  const automatic=workspace_button(workspace_text('image_border_color_auto_short'),()=>{drafts.delete(fields.get('color')!);save(color_key(),'');},'reading-media-open');automatic.dataset.imageAppearance='automatic';
  rows[3].append(color,picker,automatic);
  const frame=el('select');frame.dataset.imageAppearance='frame_width';frame.setAttribute('aria-label',workspace_text('image_frame_width'));
  frame.append(new Option(workspace_text('image_frame_content'),'content'),new Option(workspace_text('image_frame_column'),'column'));
  frame.addEventListener('change',()=>save('frame_width',frame.value),{signal});
  rows[4].append(el('span','reading-image-scope',workspace_text('image_frame_width')),frame);
  for(const [index,key]of (['padding_x','padding_y','border_opacity'] as const).entries()){
    const title=workspace_text(key==='border_opacity'?'image_border_opacity':key==='padding_x'?'image_padding_x':'image_padding_y'),max=key==='border_opacity'?100:48;
    const range=el('input');range.type='range';range.min='0';range.max=String(max);range.step='1';range.dataset.imageAppearance=key+'_range';range.setAttribute('aria-label',title);
    range.addEventListener('input',()=>{if(!gesture)gesture=begin_reading_image_appearance(key);gesture.update(range.valueAsNumber);},{signal});
    range.addEventListener('change',()=>{const active=gesture;gesture=undefined;try{if(active)active.commit(range.valueAsNumber);else save(key,range.valueAsNumber);}catch(error){fail(error);}sync();},{signal});
    range.addEventListener('pointercancel',()=>{gesture?.cancel();gesture=undefined;sync();},{signal});
    ranges.set(key,range);rows[index+5].append(field(key,title,0,max),range,el('span','reading-image-scope',key==='border_opacity'?'%':'px'));
  }
  function sync(){
    const next=workspace_theme_mode();if(next!==mode){mode=next;drafts.delete(fields.get('color')!);}
    const settings=read_reading_image_settings(),disabled=!get_workspace_app();
    for(const [key,input]of fields){if(!drafts.has(input))input.value=String(key==='color'?settings[color_key()]:settings[key as 'border_width'|'border_radius'|'padding_x'|'padding_y'|'border_opacity']);input.disabled=disabled;}
    for(const [key,range]of ranges){range.value=String(settings[key as 'padding_x'|'padding_y'|'border_opacity']);range.disabled=disabled;}
    frame.value=settings.frame_width;frame.disabled=disabled;
    toggle.disabled=shadow.disabled=picker.disabled=automatic.disabled=disabled;
    toggle.setAttribute('aria-pressed',String(settings.border));shadow.value=settings.shadow;
    const title=workspace_text(mode==='dark'?'image_border_color_dark_short':'image_border_color_light_short');if(caption.textContent!==title)caption.textContent=title;
    const color=settings[color_key()],fallback=getComputedStyle(image).getPropertyValue('--theme-muted').trim();
    picker.value=/^#[0-9a-f]{6}/i.test(color)?color.slice(0,7):/^#[0-9a-f]{6}$/i.test(fallback)?fallback:mode==='dark'?'#9d9d9d':'#3b3b3b';
    automatic.setAttribute('aria-pressed',String(!color));
  }
  sync();
  return {rows,sync,cancel(){const active=drafts.size>0||!!gesture;drafts.clear();const current=gesture;gesture=undefined;current?.cancel();sync();return active;},dispose(){events.abort();gesture?.cancel();gesture=undefined;drafts.clear();}};
}
