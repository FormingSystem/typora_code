/** 标准行内样式保留静态回退色；变量名本身携带颜色身份，无需 class/data 属性。 */
export const text_color_presets = [
  ["红色", "b42318"], ["橙色", "b54708"], ["黄色", "946800"], ["绿色", "18794e"],
  ["青色", "087e8b"], ["蓝色", "175cd3"], ["紫色", "7f3fbf"], ["粉色", "b4236c"],
] as const;
export const text_color_prefix = "--typora-code-color-";
export function normalize_text_color(value: string): string {
  const color=value.replace(/^#/u, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/u.test(color)) throw new Error("请输入六位十六进制颜色，例如 #B42318。");
  return color;
}
export function text_color_open(color: string): string {
  color=normalize_text_color(color); return `<span style="color:var(${text_color_prefix}${color}, #${color})">`;
}
export function read_text_color_open(value: string): string | undefined {
  const match=/^<span style="color:var\(--typora-code-color-([0-9a-f]{6}), #\1\)">$/u.exec(value);
  return match?.[1];
}
export function color_luminance(rgb: readonly number[]): number {
  return rgb.map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,index)=>sum+c*[.2126,.7152,.0722][index],0);
}
export function color_contrast(left: readonly number[],right: readonly number[]): number {
  const a=color_luminance(left), b=color_luminance(right);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
/** 在同一色系内向黑/白调整，以当前实际背景为准，普通文字目标对比度 4.5:1。 */
export function adaptive_text_color(color: string,background: readonly number[]): string {
  color=normalize_text_color(color);const rgb=[0,2,4].map(offset=>parseInt(color.slice(offset,offset+2),16));
  if(color_contrast(rgb,background)>=4.5)return "#"+color;
  const target=color_contrast([0,0,0],background)>=color_contrast([255,255,255],background)?0:255;
  const mix=(amount:number)=>rgb.map(c=>Math.round(c+(target-c)*amount));let low=0,high=1;
  for(let i=0;i<24;i++){const mid=(low+high)/2;if(color_contrast(mix(mid),background)>=4.5)high=mid;else low=mid;}
  return "#"+mix(high).map(c=>c.toString(16).padStart(2,"0")).join("");
}
export type text_color_run={start:number;end:number;color?:string};
export type text_color_cut={start:number;end:number};
/** 原生渲染器提供可见文字区间。这里只编辑那些区间及本功能自己的标签，其他 Markdown 字节不变。 */
export function rewrite_text_colors(source:string,runs:text_color_run[],cuts:text_color_cut[],selection?:text_color_cut){
  const sorted=runs.filter(run=>run.end>run.start).sort((a,b)=>a.start-b.start);
  cuts=[...cuts].sort((a,b)=>a.start-b.start);
  for(const list of [sorted,cuts])for(let i=0;i<list.length;i++){const item=list[i];if(!Number.isInteger(item.start)||!Number.isInteger(item.end)||item.start<0||item.end>source.length||item.end<item.start||(i>0&&item.start<list[i-1].end))throw new Error("文字颜色区间已失效。");}
  let text="",cursor=0;const copies:{start:number;end:number;output:number}[]=[];
  const copy=(start:number,end:number)=>{
    let offset=start;
    for(const cut of cuts){if(cut.end<=offset)continue;if(cut.start>=end)break;if(cut.start>offset){copies.push({start:offset,end:cut.start,output:text.length});text+=source.slice(offset,cut.start);}offset=Math.max(offset,Math.min(end,cut.end));}
    if(offset<end){copies.push({start:offset,end,output:text.length});text+=source.slice(offset,end);}
  };
  for(const run of sorted){copy(cursor,run.start);if(run.color)text+=text_color_open(run.color);copy(run.start,run.end);if(run.color)text+="</span>";cursor=run.end;}copy(cursor,source.length);
  const map=(offset:number,end:boolean)=>{const matches=copies.filter(part=>part.start<=offset&&part.end>=offset);const part=end?matches[0]:matches.at(-1);if(!part)throw new Error("文字颜色选区无法恢复。");return part.output+offset-part.start;};
  return {text,selection:selection?{start:map(selection.start,false),end:map(selection.end,true)}:undefined};
}
