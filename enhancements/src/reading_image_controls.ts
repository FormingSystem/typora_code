import {register_workspace_dismissal,type workspace_dismiss_layer} from "./workspace_focus";
import {workspace_element as el,workspace_button} from "./workspace_widgets";
import {workspace_text} from "./workspace_i18n";
import {begin_reading_image_scale,observe_reading_image_settings,read_reading_image_settings,write_reading_image_setting} from "./reading_image_settings";
import {open_image_layout_menu} from "./reading_image_menu";

export function create_reading_image_controls(image:HTMLImageElement){
  const group=el('label','reading-image-scale'),slider=el('input'),output=el('output');
  slider.type='range';slider.min='20';slider.max='600';slider.step='5';slider.setAttribute('aria-label',workspace_text('image_layout_scale'));slider.title=workspace_text('image_layout_scale_description');
  group.append(slider,output);
  let dismissal:workspace_dismiss_layer|undefined;
  let gesture:ReturnType<typeof begin_reading_image_scale>|undefined,close_menu:(()=>void)|undefined;
  const fail=(error:unknown)=>{const core=(window as any)[Symbol.for('typora-code:workspace')];if(core?.Notice)new core.Notice(String(error instanceof Error?error.message:error),3500);else console.error(error);};
  const run=(action:()=>void)=>{try{action();}catch(error){fail(error);}};
  const layout=workspace_button(workspace_text('image_layout_alignment'),()=>{close_menu?.();const rect=layout.getBoundingClientRect();close_menu=open_image_layout_menu(image,new MouseEvent('contextmenu',{clientX:rect.left,clientY:rect.bottom}));},'reading-media-open');
  const fit=workspace_button(workspace_text('image_layout_fit_short'),()=>run(()=>write_reading_image_setting('size_mode','fit_width')),'reading-media-open');
  fit.title=workspace_text('image_layout_fit');
  const reset=workspace_button('100%',()=>run(()=>write_reading_image_setting('scale',100)),'reading-media-open');reset.title=workspace_text('image_layout_natural');reset.setAttribute('aria-label',reset.title);
  const sync=()=>{const settings=read_reading_image_settings();slider.value=String(settings.scale);output.value=`${settings.scale}%`;output.textContent=output.value;fit.setAttribute('aria-pressed',String(settings.size_mode==='fit_width'));reset.setAttribute('aria-pressed',String(settings.size_mode==='natural'&&settings.scale===100));};
  const events=new AbortController(),{signal}=events;
  slider.addEventListener('input',()=>{if(!gesture){gesture=begin_reading_image_scale();dismissal=register_workspace_dismissal(()=>[group],cancel,{outside:false,focus_out:false});}gesture.update(Number(slider.value));},{signal});
  slider.addEventListener('change',()=>{const current=gesture;gesture=undefined;dismissal?.dispose();dismissal=undefined;run(()=>current?current.commit(Number(slider.value)):write_reading_image_setting('scale',Number(slider.value)));sync();},{signal});
  const cancel=()=>{dismissal?.dispose();dismissal=undefined;gesture?.cancel();gesture=undefined;sync();};
  slider.addEventListener('pointercancel',cancel,{signal});slider.addEventListener('blur',cancel,{signal});
  slider.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cancel();}},{signal});
  const release=observe_reading_image_settings(sync);sync();
  return {controls:[group,reset,fit,layout],dispose(){events.abort();release();dismissal?.dispose();gesture?.cancel();close_menu?.();}};
}
