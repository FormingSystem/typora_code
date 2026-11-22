const formats = new Map([
  ['gif','image/gif'], ['png','image/png'], ['apng','image/png'],
  ['jpg','image/jpeg'], ['jpeg','image/jpeg'], ['webp','image/webp'],
  ['bmp','image/bmp'], ['avif','image/avif'], ['svg','image/svg+xml'], ['ico','image/x-icon']
]);

export function reading_image_mime(path:string):string|undefined {
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
  return extension ? formats.get(extension) : undefined;
}
