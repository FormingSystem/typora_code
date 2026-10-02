import {register_workspace_dismissal,type workspace_dismiss_layer} from "./workspace_focus";
import {workspace_element as el,workspace_button} from "./workspace_widgets";
import {workspace_text} from "./workspace_i18n";
import {git_icon} from "./git_icons";
import {begin_reading_image_scale,observe_reading_image_settings,read_reading_image_settings,write_reading_image_setting} from "./reading_image_settings";
import {capture_image_alignment,read_image_alignment} from "./reading_image_native";
import {IMAGE_ALIGNMENT_VALUES,reading_image_alignment_labels,type image_alignment} from "./reading_image_settings";
import {get_workspace_app} from "./workspace_bootstrap";

/** Match the containing content box used by percentage image widths. */
function image_scale_limit(image:HTMLImageElement){
  let parent=image.parentElement;
  while(parent&&['inline','contents'].includes(getComputedStyle(parent).display))parent=parent.parentElement;
  if(!parent||!image.naturalWidth)return 100;
  const style=getComputedStyle(parent),available=parent.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0);
  const image_style=getComputedStyle(image),border=image_style.boxSizing==='border-box'?['borderLeftWidth','borderRightWidth','paddingLeft','paddingRight'].reduce((sum,key)=>sum+(parseFloat((image_style as any)[key])||0),0):0;
  const percent=Math.max(100,100*(available-border)/image.naturalWidth);
  return Math.max(20,Math.min(600,Math.floor(percent*100)/100));
}

export function create_reading_image_controls(image:HTMLImageElement){
  const group=el('div','reading-image-scale'),input=el('input'),suffix=el('span','','%');
  input.type='number';input.min='20';input.max='600';input.step='any';input.setAttribute('aria-label',workspace_text('image_layout_scale'));input.title=workspace_text('image_layout_scale_description');
  let dismissal:workspace_dismiss_layer|undefined,editing=false;
  let gesture:ReturnType<typeof begin_reading_image_scale>|undefined;
  const fail=(error:unknown)=>{const core=(window as any)[Symbol.for('typora-code:workspace')];if(core?.Notice)new core.Notice(String(error instanceof Error?error.message:error),3500);else console.error(error);};
  const run=(action:()=>void)=>{try{action();}catch(error){fail(error);}};
  const draft=()=>{const value=input.valueAsNumber;return input.value.trim()!==''&&Number.isFinite(value)&&value>=20?Math.min(image_scale_limit(image),value):undefined;};

  const fit=workspace_button(workspace_text('image_layout_fit_short'),()=>{cancel();run(()=>write_reading_image_setting('size_mode','fit_width'));},'reading-media-open');
  fit.title=workspace_text('image_layout_fit');
  const reset=workspace_button('100%',()=>{cancel();run(()=>write_reading_image_setting('scale',100));},'reading-media-open');reset.title=workspace_text('image_layout_natural');reset.setAttribute('aria-label',reset.title);
  const sync=()=>{const settings=read_reading_image_settings(),limit=image_scale_limit(image),value=settings.size_mode==='fit_width'?limit:Math.min(limit,settings.scale);input.max=String(limit);if(!editing)input.value=String(value);decrease.disabled=value<=20;increase.disabled=value>=limit;fit.setAttribute('aria-pressed',String(settings.size_mode==='fit_width'));reset.setAttribute('aria-pressed',String(settings.size_mode==='natural'&&settings.scale===100));refresh_alignment();};
  const cancel=()=>{editing=false;dismissal?.dispose();dismissal=undefined;gesture?.cancel();gesture=undefined;sync();};
  const commit=(value=draft())=>{
    if(value===undefined){cancel();return;}
    editing=false;const current=gesture;gesture=undefined;dismissal?.dispose();dismissal=undefined;
    run(()=>{if(current)current.commit(value);else{const saved=read_reading_image_settings();if(saved.scale!==value||saved.size_mode!=='natural')write_reading_image_setting('scale',value);}});sync();
  };
  const step=(direction:number)=>commit(Math.max(20,Math.min(image_scale_limit(image),(draft()??read_reading_image_settings().scale)+direction*5)));
  const decrease=workspace_button(workspace_text('image_layout_decrease'),()=>step(-1),'reading-media-open'),increase=workspace_button(workspace_text('image_layout_increase'),()=>step(1),'reading-media-open');
  decrease.replaceChildren(git_icon('remove'));increase.replaceChildren(git_icon('add'));decrease.dataset.imageScaleAction='decrease';increase.dataset.imageScaleAction='increase';
  group.append(decrease,input,suffix,increase);
  const labels=reading_image_alignment_labels(),alignment_buttons:{button:HTMLButtonElement;scope:'global'|'single';value:image_alignment|undefined}[]=[];
  const make_alignment=(scope:'global'|'single',value:image_alignment|undefined)=>{
    const label=value?labels[value]:workspace_text('image_layout_follow');
    const button=workspace_button(label,()=>{cancel();run(()=>{if(scope==='global')write_reading_image_setting('alignment',value);else{const apply=capture_image_alignment(image);if(!apply)throw Error(workspace_text('image_layout_stale'));apply(value);}});refresh_alignment();},'reading-media-open');
    button.title=workspace_text(scope==='global'?'image_layout_global':'image_layout_single')+': '+label;button.setAttribute('aria-label',button.title);
    button.setAttribute('data-image-align-scope',scope);button.setAttribute('data-image-align',value||'follow');alignment_buttons.push({button,scope,value});return button;
  };
  const global_caption=el('span','reading-image-scope',workspace_text('image_layout_global_short')),single_caption=el('span','reading-image-scope',workspace_text('image_layout_single_short'));
  const global_buttons=IMAGE_ALIGNMENT_VALUES.map(value=>make_alignment('global',value)),single_buttons=[make_alignment('single',undefined),...IMAGE_ALIGNMENT_VALUES.map(value=>make_alignment('single',value))];
  function refresh_alignment(){
    const global=read_reading_image_settings().alignment,local=read_image_alignment(image),editable=!!capture_image_alignment(image);
    for(const {button,scope,value}of alignment_buttons){button.disabled=scope==='global'?!get_workspace_app():!editable;const selected=String((scope==='global'?global:local)===value);if(button.getAttribute('aria-pressed')!==selected)button.setAttribute('aria-pressed',selected);}
  }
  const events=new AbortController(),{signal}=events;
  input.addEventListener('input',()=>{editing=true;const value=draft();if(value===undefined)return;if(!gesture){gesture=begin_reading_image_scale();dismissal=register_workspace_dismissal(()=>[group],cancel,{outside:false,focus_out:false});}gesture.update(value);},{signal});
  const finish_input=()=>{if(editing||gesture)commit();};
  input.addEventListener('change',finish_input,{signal});input.addEventListener('blur',finish_input,{signal});
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cancel();}else if(event.key==='Enter'){event.preventDefault();commit();}else if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();step(event.key==='ArrowUp'?1:-1);}},{signal});
  const release=observe_reading_image_settings(sync);sync();
  return {controls:[group,reset,fit,global_caption,...global_buttons,single_caption,...single_buttons],refresh:sync,dispose(){events.abort();release();dismissal?.dispose();gesture?.cancel();}};
}
