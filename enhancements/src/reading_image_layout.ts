import {observe_reading_image_settings,read_reading_image_settings} from "./reading_image_settings";
import {reading_image_screen_density,reading_image_uses_screen_pixels} from './reading_image_dimensions';

/** Presentation belongs to the reader stylesheet, never to image attributes serialized into Markdown. */
export function bind_reading_image_layout(root:HTMLElement,selector:string){
  const owner=root.getRootNode(),style=document.createElement("style");
  const dimensions=document.createElement("style");
  style.dataset.readingImageLayout="";
  (owner instanceof ShadowRoot?owner:document.head).append(style);
  (owner instanceof ShadowRoot?owner:document.head).append(dimensions);
  const scope=`:is(${selector}):not(.md-diagram-panel-preview img,.reading-media-viewer img,.CodeMirror img,.md-emoji,.md-emoji img)`;
  let density=reading_image_screen_density(),resolution:MediaQueryList;
  const update=()=>{
    const {alignment,scale,size_mode}=read_reading_image_settings();
    style.textContent=`${scope}{--reading-image-screen-density:${density};width:auto!important;max-width:100%!important;height:auto!important}${scope}:not([style*="zoom" i]){width:${size_mode==="fit_width"?"100%":`min(calc(var(--reading-image-natural-width) / var(--reading-image-density,1) * ${scale/100} + var(--reading-image-border,0px)),${scale}%)`}!important}${scope}:not(.md-expand img){display:block}${scope}:not([style*="margin" i]){margin-left:${alignment==="left"?"0":"auto"}!important;margin-right:${alignment==="right"?"0":"auto"}!important}`;
  };
  const watch_density=()=>{
    resolution?.removeEventListener('change',density_changed);
    resolution=window.matchMedia(`(resolution: ${density}dppx)`);
    resolution.addEventListener('change',density_changed);
  };
  const density_changed=()=>{const next=reading_image_screen_density();if(next===density)return;density=next;watch_density();update();};
  watch_density();window.addEventListener('resize',density_changed);
  const release=observe_reading_image_settings(update);update();
  return {update(images:Iterable<HTMLImageElement>){
    const rules=new Set<string>();
    for(const image of images){if(!image.naturalWidth)continue;const source=image.getAttribute("src");if(!source)continue;const computed=getComputedStyle(image),border=computed.boxSizing==="border-box"?["borderLeftWidth","borderRightWidth","paddingLeft","paddingRight"].reduce((sum,key)=>sum+(parseFloat((computed as any)[key])||0),0):0;
      rules.add(`${scope}[src="${CSS.escape(source)}"]{--reading-image-natural-width:${image.naturalWidth}px;--reading-image-density:${reading_image_uses_screen_pixels(image)?'var(--reading-image-screen-density)':'1'};--reading-image-border:${border}px}`);
    }
    const text=[...rules].join("\n");if(dimensions.textContent!==text)dimensions.textContent=text;
  },dispose(){release();window.removeEventListener('resize',density_changed);resolution.removeEventListener('change',density_changed);style.remove();dimensions.remove();}};
}
