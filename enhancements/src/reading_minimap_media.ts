/** Per-reader media snapshots. Never mount cloned SVG nodes in the document. */
export function create_minimap_media(refresh: () => void) {
 const cache = new Map<SVGSVGElement, { key: string; image: HTMLImageElement; url: string }>();
 let disposed = false;
 const release = (entry: {image: HTMLImageElement; url: string}) => {
  entry.image.onload = entry.image.onerror = null; entry.image.src = "";
 };
 const snapshot = (svg: SVGSVGElement) => {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...svg.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((node, index) => {
   const style = getComputedStyle(node);
   for (const key of ['color','fill','stroke','stroke-width','font-family','font-size','font-weight','font-style','opacity','text-anchor','dominant-baseline','background-color'])
    (copies[index] as SVGElement).style.setProperty(key, style.getPropertyValue(key));
  });
  const bounds = svg.getBoundingClientRect();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(bounds.width)); clone.setAttribute('height', String(bounds.height));
  return new XMLSerializer().serializeToString(clone);
 };
 return {
  *draw(context: CanvasRenderingContext2D, root: HTMLElement, scroller: HTMLElement): Generator<void> {
   for (const [node, entry] of cache) if (!root.contains(node)) { release(entry); cache.delete(node); }
   for (const node of root.querySelectorAll<HTMLImageElement | HTMLCanvasElement | SVGSVGElement>('img,canvas,svg')) {
    if (node.closest('.linux-note-reading-minimap') || node.parentElement?.closest('svg')) continue;
    const bounds = node.getBoundingClientRect(), style = getComputedStyle(node);
    if (!bounds.width || !bounds.height || style.visibility === 'hidden' || style.display === 'none') continue;
    let source: CanvasImageSource = node as HTMLImageElement | HTMLCanvasElement;
    if (node instanceof SVGSVGElement) {
     const key = snapshot(node); let entry = cache.get(node);
     if (!entry || entry.key !== key) {
      if (entry) release(entry);
      const image = new Image(), url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(key);
      entry = {key,image,url}; cache.set(node,entry);
      image.onload = () => { if (!disposed && cache.get(node)?.image === image) refresh(); };
      image.onerror = () => { image.onload = image.onerror = null; };
      image.src = url;
     }
     source = entry.image;
    }
    if (source instanceof HTMLImageElement && (!source.complete || !source.naturalWidth)) { yield; continue; }
    const root_bounds = root.getBoundingClientRect(), scroll_bounds = scroller.getBoundingClientRect();
    try { context.drawImage(source, bounds.left-root_bounds.left, bounds.top-scroll_bounds.top+scroller.scrollTop, bounds.width, bounds.height); } catch { /* Unavailable media cannot interrupt text or navigation. */ }
    yield;
   }
  },
  dispose() { disposed = true; for (const entry of cache.values()) release(entry); cache.clear(); }
 };
}
