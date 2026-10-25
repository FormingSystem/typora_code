/** Screen density includes OS display scaling and the current page zoom. */
export function reading_image_screen_density() {
  const density = window.devicePixelRatio;
  return Number.isFinite(density) && density > 0 ? density : 1;
}

/** Vector layout units and authored responsive density remain browser-owned. */
export function reading_image_uses_screen_pixels(image:HTMLImageElement) {
  const source = image.currentSrc || image.src;
  return !image.srcset && !image.closest('picture')?.querySelector('source[srcset]') &&
    !/^data:image\/svg\+xml[;,]/i.test(source) && !/\.svgz?(?:[?#]|$)/i.test(source);
}

export function reading_image_natural_width(image:HTMLImageElement) {
  return image.naturalWidth / (reading_image_uses_screen_pixels(image) ? reading_image_screen_density() : 1);
}
