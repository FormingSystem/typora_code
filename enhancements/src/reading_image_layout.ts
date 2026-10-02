import {observe_reading_image_settings,read_reading_image_settings} from "./reading_image_settings";

/** Presentation belongs to the reader stylesheet, never to image attributes serialized into Markdown. */
export function bind_reading_image_layout(root:HTMLElement,selector:string){
  const owner=root.getRootNode(),style=document.createElement("style");
  const dimensions=document.createElement("style");
  style.dataset.readingImageLayout="";
  (owner instanceof ShadowRoot?owner:document.head).append(style);
  (owner instanceof ShadowRoot?owner:document.head).append(dimensions);
  const scope=`:is(${selector}):not(.md-diagram-panel-preview img,.reading-media-viewer img,.CodeMirror img,.md-emoji,.md-emoji img)`;
  const update=()=>{
    const {alignment,scale,size_mode}=read_reading_image_settings();
    style.textContent=`${scope}{width:auto!important;max-width:100%!important;height:auto!important}${scope}:not([style*="zoom" i]){width:${size_mode==="fit_width"?"100%":`min(calc(var(--reading-image-natural-width) * ${scale/100} + var(--reading-image-border,0px)),${scale}%)`}!important}${scope}:not(.md-expand img){display:block}${scope}:not([style*="margin" i]){margin-left:${alignment==="left"?"0":"auto"}!important;margin-right:${alignment==="right"?"0":"auto"}!important}`;
  };
  const release=observe_reading_image_settings(update);update();
  return {update(images:Iterable<HTMLImageElement>){
    const rules=new Set<string>();
    for(const image of images){if(!image.naturalWidth)continue;const source=image.getAttribute("src");if(!source)continue;const computed=getComputedStyle(image),border=computed.boxSizing==="border-box"?["borderLeftWidth","borderRightWidth","paddingLeft","paddingRight"].reduce((sum,key)=>sum+(parseFloat((computed as any)[key])||0),0):0;
      rules.add(`${scope}[src="${CSS.escape(source)}"]{--reading-image-natural-width:${image.naturalWidth}px;--reading-image-border:${border}px}`);
    }
    const text=[...rules].join("\n");if(dimensions.textContent!==text)dimensions.textContent=text;
  },dispose(){release();style.remove();dimensions.remove();}};
}
