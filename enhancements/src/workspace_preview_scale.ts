import {workspace_element as el} from './workspace_widgets';
import {git_icon_button} from './git_icons';
import {acquire_workspace_style} from './workspace_styles';
import css from './workspace_preview_scale.css';

type preview_scale_owner={container:HTMLElement;get_scale():number;set_scale(value:number):void};
/** 控件只呈现阅读器比例，滚轮、恢复和主题刷新仍由阅读器拥有。 */
export function create_preview_scale_controls(owner:preview_scale_owner){
  const style=acquire_workspace_style('typora-code-style:workspace_preview_scale',css,{});
  const container=el('div','workspace-preview-scale-controls');
  const smaller=git_icon_button('remove','缩小预览',()=>owner.set_scale(owner.get_scale()-5));
  const larger=git_icon_button('add','放大预览',()=>owner.set_scale(owner.get_scale()+5));
  const slider=el('input','workspace-preview-scale-slider'),value=el('output','workspace-preview-scale-value');
  slider.type='range';slider.min='50';slider.max='150';slider.step='1';slider.setAttribute('aria-label','预览字号比例');slider.title='拖动调整预览字号（50%–150%）';
  slider.oninput=()=>{owner.set_scale(Number(slider.value));sync();};
  value.setAttribute('aria-label','当前预览比例');
  const sync=()=>{const scale=owner.get_scale();value.value=`${scale}%`;slider.value=String(scale);slider.setAttribute('aria-valuetext',`${scale}%`);smaller.disabled=scale<=50;larger.disabled=scale>=150;};
  container.append(smaller,slider,value,larger);
  const observer=new MutationObserver(sync);observer.observe(owner.container,{attributes:true,attributeFilter:['data-preview-scale']});sync();
  return {container,dispose(){observer.disconnect();slider.oninput=null;container.remove();style.remove();}};
}
