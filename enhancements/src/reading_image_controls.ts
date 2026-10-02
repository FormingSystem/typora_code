import {register_workspace_dismissal,type workspace_dismiss_layer} from "./workspace_focus";
import {workspace_element as el,workspace_button} from "./workspace_widgets";
import {workspace_text} from "./workspace_i18n";
import {git_icon} from "./git_icons";
import {begin_reading_image_scale,observe_reading_image_settings,read_reading_image_settings,write_reading_image_setting} from "./reading_image_settings";
import {open_image_layout_menu} from "./reading_image_menu";

export function create_reading_image_controls(image:HTMLImageElement){
  const group=el('div','reading-image-scale'),input=el('input'),suffix=el('span','','%');
  input.type='number';input.min='20';input.max='600';input.step='any';input.setAttribute('aria-label',workspace_text('image_layout_scale'));input.title=workspace_text('image_layout_scale_description');
  let dismissal:workspace_dismiss_layer|undefined,editing=false;
  let gesture:ReturnType<typeof begin_reading_image_scale>|undefined,close_menu:(()=>void)|undefined;
  const fail=(error:unknown)=>{const core=(window as any)[Symbol.for('typora-code:workspace')];if(core?.Notice)new core.Notice(String(error instanceof Error?error.message:error),3500);else console.error(error);};
  const run=(action:()=>void)=>{try{action();}catch(error){fail(error);}};
  const draft=()=>{const value=input.valueAsNumber;return input.value.trim()!==''&&Number.isFinite(value)&&value>=20&&value<=600?value:undefined;};
  const layout=workspace_button(workspace_text('image_layout_alignment'),()=>{cancel();close_menu?.();const rect=layout.getBoundingClientRect();close_menu=open_image_layout_menu(image,new MouseEvent('contextmenu',{clientX:rect.left,clientY:rect.bottom}));},'reading-media-open');
  const fit=workspace_button(workspace_text('image_layout_fit_short'),()=>{cancel();run(()=>write_reading_image_setting('size_mode','fit_width'));},'reading-media-open');
  fit.title=workspace_text('image_layout_fit');
  const reset=workspace_button('100%',()=>{cancel();run(()=>write_reading_image_setting('scale',100));},'reading-media-open');reset.title=workspace_text('image_layout_natural');reset.setAttribute('aria-label',reset.title);
  const sync=()=>{const settings=read_reading_image_settings();if(!editing)input.value=String(settings.scale);decrease.disabled=settings.scale<=20;increase.disabled=settings.scale>=600;fit.setAttribute('aria-pressed',String(settings.size_mode==='fit_width'));reset.setAttribute('aria-pressed',String(settings.size_mode==='natural'&&settings.scale===100));};
  const cancel=()=>{editing=false;dismissal?.dispose();dismissal=undefined;gesture?.cancel();gesture=undefined;sync();};
  const commit=(value=draft())=>{
    if(value===undefined){cancel();return;}
    editing=false;const current=gesture;gesture=undefined;dismissal?.dispose();dismissal=undefined;
    run(()=>{if(current)current.commit(value);else{const saved=read_reading_image_settings();if(saved.scale!==value||saved.size_mode!=='natural')write_reading_image_setting('scale',value);}});sync();
  };
  const step=(direction:number)=>commit(Math.max(20,Math.min(600,(draft()??read_reading_image_settings().scale)+direction*5)));
  const decrease=workspace_button(workspace_text('image_layout_decrease'),()=>step(-1),'reading-media-open'),increase=workspace_button(workspace_text('image_layout_increase'),()=>step(1),'reading-media-open');
  decrease.replaceChildren(git_icon('remove'));increase.replaceChildren(git_icon('add'));decrease.dataset.imageScaleAction='decrease';increase.dataset.imageScaleAction='increase';
  group.append(decrease,input,suffix,increase);
  const events=new AbortController(),{signal}=events;
  input.addEventListener('focus',()=>{editing=true;},{signal});
  input.addEventListener('input',()=>{editing=true;const value=draft();if(value===undefined)return;if(!gesture){gesture=begin_reading_image_scale();dismissal=register_workspace_dismissal(()=>[group],cancel,{outside:false,focus_out:false});}gesture.update(value);},{signal});
  const finish_input=()=>{if(editing||gesture)commit();};
  input.addEventListener('change',finish_input,{signal});input.addEventListener('blur',finish_input,{signal});
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cancel();}else if(event.key==='Enter'){event.preventDefault();commit();}else if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();step(event.key==='ArrowUp'?1:-1);}},{signal});
  const release=observe_reading_image_settings(sync);sync();
  return {controls:[group,reset,fit,layout],dispose(){events.abort();release();dismissal?.dispose();gesture?.cancel();close_menu?.();}};
}
