import {remote_files_for} from './remote_workspace_files';

/** 原生Markdown的图片仍由宿主绘制；只按需补齐属于同一主机的物化资源。 */
export function bind_remote_workspace_media(runtime:any=window){
  let disposed=false,scheduled=false,running=false,rescan=false;
  const attempted=new WeakMap<HTMLImageElement,string>();
  const urls=new Map<string,string>();
  const scan=async()=>{
    scheduled=false;if(disposed)return;if(running){rescan=true;return;}running=true;
    try{
      for(const image of document.querySelectorAll<HTMLImageElement>('#write img[src]')){
        if(disposed)return;const source=image.getAttribute('src')||'';if(attempted.get(image)===source)continue;
        let path:string;try{path=runtime.reqnode('url').fileURLToPath(image.src);}catch{continue;}
        const provider=remote_files_for(path);if(!provider)continue;attempted.set(image,source);
        try{await provider.prepare(path);if(!disposed&&image.isConnected&&image.getAttribute('src')===source){
          // 从已校验的远端物化资源生成只用于显示的对象URL，避免宿主本地协议的失败缓存。
          let url=urls.get(path);
          if(!url){const bytes=await runtime.reqnode('fs').promises.readFile(path);if(disposed||!image.isConnected)return;
            const extension=runtime.reqnode('path').extname(path).slice(1).toLowerCase();
            const mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',bmp:'image/bmp',avif:'image/avif'} as Record<string,string>)[extension];
            if(!mime)throw Error('不支持此远程图片格式。');url=URL.createObjectURL(new Blob([bytes],{type:mime}));urls.set(path,url);
          }
          attempted.set(image,url);image.src=url;
        }}
        catch(error){if(!disposed&&image.isConnected)image.title=String((error as Error).message);}
      }
    }finally{running=false;const active=new Set([...document.querySelectorAll<HTMLImageElement>('#write img[src]')].map(image=>image.src));for(const [path,url] of urls)if(!active.has(url)){URL.revokeObjectURL(url);urls.delete(path);}if(rescan){rescan=false;schedule();}}
  };
  const schedule=()=>{if(disposed||scheduled)return;scheduled=true;queueMicrotask(()=>void scan());};
  const observer=new MutationObserver(schedule);observer.observe(document.querySelector('#write')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});schedule();
  return{dispose(){disposed=true;observer.disconnect();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}};
}
