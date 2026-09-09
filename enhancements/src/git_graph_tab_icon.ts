/** 以两条轨道和提交点表达图标签；灰色模式随工作台前景，彩色模式保留轨道区分。 */
export function git_graph_tab_icon(theme: string): SVGSVGElement {
  const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox","0 0 16 16");svg.setAttribute("width","16");svg.setAttribute("height","16");
  svg.setAttribute("class","git-standard-icon");svg.setAttribute("aria-hidden","true");svg.dataset.graphTabTheme=theme;
  const main=theme==="colour"?"#0085d9":"currentColor",side=theme==="colour"?"#d9008f":"currentColor";
  for(const [d,color]of [["M4 3v10",main],["M4 10c0-4 8-2 8-7",side]]){
    const path=document.createElementNS(ns,"path");path.setAttribute("d",d);path.setAttribute("stroke",color);path.setAttribute("stroke-width","1.5");path.setAttribute("fill","none");svg.append(path);
  }
  for(const [x,y,color]of [[4,3,main],[4,13,main],[12,3,side]] as const){const dot=document.createElementNS(ns,"circle");dot.setAttribute("cx",String(x));dot.setAttribute("cy",String(y));dot.setAttribute("r","2");dot.setAttribute("fill",color);svg.append(dot);}
  return svg;
}
