import DOMPurify from 'dompurify';
import {bind_reading_images} from './reading_image_viewer';
import {workspace_text} from './workspace_i18n';

export type git_image_reader = (href:string, signal:AbortSignal)=>Promise<Blob>;
const attribute = 'data-git-image-path';
const selector = 'img[' + attribute + ']';

/** Capture image references while the markup is inert, before parsing it into a live document. */
export function sanitize_git_markdown(html:string, view:'revision'|'diff'):string {
  if (/<img\b/i.test(html)) {
    const template = document.createElement('template');
    template.innerHTML = html;
    for (const image of template.content.querySelectorAll('img')) {
      image.setAttribute(attribute, image.getAttribute('src') || '');
      image.removeAttribute('src');
      image.removeAttribute('srcset');
    }
    html = template.innerHTML;
  }
  const forbidden = ['style','iframe','object','embed','form','audio','video','source'];
  if (view === 'diff') forbidden.push('svg','math');
  return DOMPurify.sanitize(html, {
    FORBID_TAGS:forbidden,
    FORBID_ATTR:['src','srcset','style','id','name','contenteditable','autofocus','background','poster'],
    ALLOW_DATA_ATTR:false, ADD_ATTR:[attribute]
  });
}

/** A read-only view owns its requests and object URLs. Its source supplies only versioned bytes. */
export function bind_git_markdown_images(root:HTMLElement) {
  const viewer = bind_reading_images(root, selector);
  let controller = new AbortController();
  const urls = new Set<string>();
  function clear() {
    controller.abort();
    controller = new AbortController();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
  }
  async function load(read?:git_image_reader, side?:'left'|'right') {
    const {signal} = controller;
    const sources = new Map<string,string>();
    const query = side ? '[data-side=' + side + '] ' + selector : selector;
    for (const image of root.querySelectorAll<HTMLImageElement>(query)) {
      if (signal.aborted) return;
      const href = image.getAttribute(attribute) || '';
      const fallback = (error?:unknown) => {
        if (signal.aborted) return;
        const label = document.createElement('span');
        label.className = 'markdown-diff-attachment';
        label.textContent = (image.alt || workspace_text('git_markdown_diff_image')) + ' [' + href + ']';
        label.title = error instanceof Error ? error.message : href;
        image.replaceWith(label);
      };
      if (!read) { fallback(); continue; }
      try {
        let url = sources.get(href);
        if (!url) {
          const blob = await read(href, signal);
          if (signal.aborted) return;
          const object_url = URL.createObjectURL(blob);
          urls.add(object_url);
          url = object_url + (blob.type === 'image/svg+xml' ? '#image.svg' : '');
          sources.set(href, url);
        }
        image.onerror = () => fallback();
        image.src = url;
      } catch (error) { fallback(error); }
    }
  }
  return {load, clear, dispose(){clear();viewer.dispose();}};
}
