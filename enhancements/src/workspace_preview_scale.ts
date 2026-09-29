import {workspace_text} from "./workspace_i18n";
import {workspace_element as el} from './workspace_widgets';
import {git_icon_button} from './git_icons';
import {acquire_workspace_style} from './workspace_styles';
import css from './workspace_preview_scale.css';

type preview_scale_owner={container:HTMLElement;get_scale():number;set_scale(value:number):void};
/** Controls only display the reader's ratio; the wheel, restore, and theme refresh are still owned by the reader. */
export function create_preview_scale_controls(owner:preview_scale_owner){
  const style=acquire_workspace_style('typora-code-style:workspace_preview_scale',css,{});
  const container=el('div','workspace-preview-scale-controls');
  const smaller=git_icon_button('remove',workspace_text("preview_scale_reduce_preview_size"),()=>owner.set_scale(owner.get_scale()-5));
  const larger=git_icon_button('add',workspace_text("preview_scale_enlarge_preview"),()=>owner.set_scale(owner.get_scale()+5));
  const slider=el('input','workspace-preview-scale-slider'),value=el('output','workspace-preview-scale-value');
  slider.type='range';slider.min='50';slider.max='150';slider.step='1';slider.setAttribute('aria-label',workspace_text("preview_scale_preview_font_size_ratio"));slider.title=workspace_text("preview_scale_drag_to_adjust_preview_text_size_50_150");
  slider.oninput=()=>{owner.set_scale(Number(slider.value));sync();};
  value.setAttribute('aria-label',workspace_text("preview_scale_current_preview_ratio"));
  const sync=()=>{const scale=owner.get_scale();value.value=`${scale}%`;slider.value=String(scale);slider.setAttribute('aria-valuetext',`${scale}%`);smaller.disabled=scale<=50;larger.disabled=scale>=150;};
  container.append(smaller,slider,value,larger);
  const observer=new MutationObserver(sync);observer.observe(owner.container,{attributes:true,attributeFilter:['data-preview-scale']});sync();
  return {container,dispose(){observer.disconnect();slider.oninput=null;container.remove();style.remove();}};
}
