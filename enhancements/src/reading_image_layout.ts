import {reading_image_selector} from './reading_image_selector';
import {linked_svg_text_width} from './reading_vector_size';
import {observe_reading_image_settings,read_reading_image_settings} from "./reading_image_settings";
import {reading_image_screen_density,reading_image_uses_screen_pixels} from './reading_image_dimensions';
import {reading_image_decoration} from './reading_image_decoration';
import {observe_workspace_theme,workspace_theme_mode} from './workspace_theme';

/** Presentation belongs to the reader stylesheet, never to image attributes serialized into Markdown. */
export function bind_reading_image_layout(root:HTMLElement,selector:string){
  const owner=root.getRootNode(),style=document.createElement("style");
  const dimensions=document.createElement("style");
  style.dataset.readingImageLayout="";
  (owner instanceof ShadowRoot?owner:document.head).append(style);
  (owner instanceof ShadowRoot?owner:document.head).append(dimensions);
  const scope=`:is(${selector}):not(.md-diagram-panel-preview img,.reading-media-viewer img,.CodeMirror img,.md-emoji,.md-emoji img)`;
  const vectors=new Map<string,{controller:AbortController;ratio?:number}>();let images_current:HTMLImageElement[]=[];let disposed=false;
  let density=reading_image_screen_density(),resolution:MediaQueryList;
  let frame=0;const parents=new Set<Element>();
  const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(()=>{frame=0;measure(images_current);});};
  const resize=new ResizeObserver(schedule);
  const update=()=>{
    const settings=read_reading_image_settings(),{alignment,scale,size_mode}=settings;
    const css=`${scope}{${reading_image_decoration(settings,workspace_theme_mode()==='dark')}}${scope}{--reading-image-screen-density:${density};width:auto!important;max-width:100%!important;height:auto!important}${scope}:not([style*="zoom" i]){width:${size_mode==="fit_width"?"100%":`min(calc(var(--reading-image-natural-width) / var(--reading-image-density,1) * ${scale/100} + var(--reading-image-border,0px)),${scale}%)`}!important}${scope}:not(.md-expand img){display:block}${scope}:not([style*="margin" i]){margin-left:${alignment==="left"?"0":"auto"}!important;margin-right:${alignment==="right"?"0":"auto"}!important}`;
    if(style.textContent!==css)style.textContent=css;measure(images_current);
  };
  const watch_density=()=>{
    resolution?.removeEventListener('change',density_changed);
    resolution=window.matchMedia(`(resolution: ${density}dppx)`);
    resolution.addEventListener('change',density_changed);
  };
  const density_changed=()=>{const next=reading_image_screen_density();if(next===density)return;density=next;watch_density();update();};
  watch_density();window.addEventListener('resize',density_changed);
  const release=observe_reading_image_settings(update),release_theme=observe_workspace_theme(update);update();
  function measure(images:Iterable<HTMLImageElement>){
    images_current=[...images];const sources=new Set(images_current.map(image=>image.currentSrc||image.src));
    for(const [source,entry]of vectors)if(!sources.has(source)){entry.controller.abort();vectors.delete(source);}
    const rules=new Set<string>(),next_parents=new Set<Element>(),settings=read_reading_image_settings();
    for(const image of images){if(!image.naturalWidth)continue;const source=image.getAttribute("src");if(!source)continue;const computed=getComputedStyle(image),border=computed.boxSizing==="border-box"?["borderLeftWidth","borderRightWidth","paddingLeft","paddingRight"].reduce((sum,key)=>sum+(parseFloat((computed as any)[key])||0),0):0;
      const resolved=image.currentSrc||image.src;
      if(!reading_image_uses_screen_pixels(image)&&!vectors.has(resolved)){
        const entry={controller:new AbortController(),ratio:undefined as number|undefined};vectors.set(resolved,entry);
        void linked_svg_text_width(resolved,entry.controller.signal).then(ratio=>{if(disposed||vectors.get(resolved)!==entry)return;entry.ratio=ratio;if(ratio)measure(images_current);}).catch(()=>{});
      }
      const ratio=vectors.get(resolved)?.ratio;
      rules.add(`${scope}[src="${CSS.escape(source)}"]{--reading-image-natural-width:${ratio?ratio+'em':image.naturalWidth+'px'};--reading-image-density:${reading_image_uses_screen_pixels(image)?'var(--reading-image-screen-density)':'1'};--reading-image-border:${border}px}`);
    }
    for(const image of images_current){
      if(!image.naturalWidth)continue;
      let parent=image.parentElement;while(parent&&['inline','contents'].includes(getComputedStyle(parent).display))parent=parent.parentElement;
      if(!parent)continue;next_parents.add(parent);
      if(settings.frame_width!=='column'||image.style.zoom)continue;
      const parent_style=getComputedStyle(parent),available=Math.max(1,parent.clientWidth-(parseFloat(parent_style.paddingLeft)||0)-(parseFloat(parent_style.paddingRight)||0)-settings.padding_x*2);
      const computed=getComputedStyle(image),vertical_border=(parseFloat(computed.borderTopWidth)||0)+(parseFloat(computed.borderBottomWidth)||0);
      const content=settings.size_mode==='fit_width'?available+'px':`min(calc(var(--reading-image-natural-width) / var(--reading-image-density,1) * ${settings.scale/100}),${available*Math.min(1,settings.scale/100)}px)`;
      rules.add(`${scope}:is(${reading_image_selector(image)}){width:100%!important;height:calc(${content} * ${image.naturalHeight/image.naturalWidth} + ${settings.padding_y*2+vertical_border}px)!important}`);
    }
    for(const parent of parents)if(!next_parents.has(parent)){resize.unobserve(parent);parents.delete(parent);}
    for(const parent of next_parents)if(!parents.has(parent)){parents.add(parent);resize.observe(parent);}
    const text=[...rules].join("\n");if(dimensions.textContent!==text)dimensions.textContent=text;
  };
  return {update:measure,dispose(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();parents.clear();for(const entry of vectors.values())entry.controller.abort();vectors.clear();release();release_theme();window.removeEventListener('resize',density_changed);resolution.removeEventListener('change',density_changed);style.remove();dimensions.remove();}};
}
