// 仅隔离验收：按注册位置聚合回调耗时，不改变产品调度。
(()=>{
 const audit=window.__reading_audit={enabled:false,stats:{},bounds:0,ranges:0,styles:0};
 const ids=new WeakMap();let next=0;
 const wrap=(fn,kind)=>{
  if(typeof fn!=='function')return fn;
  let id=ids.get(fn);if(!id){id=++next;ids.set(fn,id);}
  const key=kind+':'+id+':'+(fn.name||'anonymous'),source=String(fn).slice(0,220);
  return function(...args){if(!audit.enabled)return fn.apply(this,args);const start=performance.now();try{return fn.apply(this,args);}finally{const row=audit.stats[key]||(audit.stats[key]={source,count:0,total:0,max:0});const elapsed=performance.now()-start;row.count++;row.total+=elapsed;row.max=Math.max(row.max,elapsed);}};
 };
 for(const name of ['MutationObserver','ResizeObserver']){const original=window[name];window[name]=class extends original{constructor(fn){super(wrap(fn,name));}};}
 const raf=window.requestAnimationFrame;window.requestAnimationFrame=fn=>raf.call(window,wrap(fn,'frame'));
 const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,handlers=new WeakMap();
 EventTarget.prototype.addEventListener=function(type,fn,options){if(typeof fn==='function'&&['scroll','wheel'].includes(type)){let entries=handlers.get(fn);if(!entries){entries=new Map();handlers.set(fn,entries);}if(!entries.has(type))entries.set(type,wrap(fn,type));fn=entries.get(type);}return add.call(this,type,fn,options);};
 EventTarget.prototype.removeEventListener=function(type,fn,options){return remove.call(this,type,handlers.get(fn)?.get(type)||fn,options);};
 for(const [owner,name,count]of [[Element.prototype,'getBoundingClientRect','bounds'],[Range.prototype,'getBoundingClientRect','ranges'],[window,'getComputedStyle','styles']]){const fn=owner[name];owner[name]=function(...args){if(audit.enabled)audit[count]++;return fn.apply(this,args);};}
})();
