/** Address a live image without adding serializable attributes to the document. */
export function reading_image_selector(image:HTMLImageElement){
  const owner=image.getRootNode(),path:string[]=[];
  for(let node:Element|null=image;node;node=node.parentElement){
    path.unshift(`${node.localName}:nth-child(${Array.prototype.indexOf.call(node.parentNode!.children,node)+1})`);
    if(node.parentNode===owner)break;
  }
  return path.join(' > ');
}
