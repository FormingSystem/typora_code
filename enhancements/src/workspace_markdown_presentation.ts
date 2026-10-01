import {capture_native_markdown_line, reveal_native_markdown_line} from './native_markdown_position';
import {create_native_markdown_editor} from './native_markdown_editor';

/** Native Markdown owns content; changing its presentation must not change workbench panels. */
export function bind_workspace_markdown_presentation(runtime: any) {
  const file = runtime.File;
  if (typeof file?.toggleSourceMode !== 'function' || !file.editor?.sourceView) return () => {};
  const toggle_descriptor = Object.getOwnPropertyDescriptor(file, 'toggleSourceMode');
  const source = file.editor.sourceView;
  const methods = new Map<string, {descriptor?: PropertyDescriptor; wrapped: (...args: any[]) => any}>();
  let frame = 0, disposed = false;
  const cancel = () => { cancelAnimationFrame(frame); frame = 0; };
  const editor = create_native_markdown_editor(runtime, cancel);
  const input = (event: Event) => { if (event.isTrusted) cancel(); };
  for (const name of ['wheel', 'pointerdown', 'keydown', 'touchstart']) window.addEventListener(name, input, true);
  for (const name of ['show', 'hide']) {
    const original = source[name];
    if (typeof original !== 'function') continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, name);
    const wrapped = function(this: unknown, ...args: any[]) {
      cancel();
      const opening = name === 'show', path = file.bundle?.filePath;
      const info = !opening && source.cm?.getScrollInfo();
      const line = opening ? capture_native_markdown_line(file.editor)
        : info ? source.cm.coordsChar({left: info.left, top: info.top + info.clientHeight / 2}, 'local').line : undefined;
      const result = original.apply(this, args);
      editor.synchronize();
      const restore = () => {
        if (disposed || file.bundle?.filePath !== path || Boolean(source.inSourceMode) !== opening || line === undefined) return;
        if (opening) source.cm.scrollTo(null, source.cm.charCoords({line, ch: 0}, 'local').top - source.cm.getScrollInfo().clientHeight / 2);
        else reveal_native_markdown_line(file.editor, line);
      };
      restore();
      frame = requestAnimationFrame(() => {frame = 0; restore();});
      return result;
    };
    source[name] = wrapped; methods.set(name, {descriptor, wrapped});
  }
  const toggle = () => {
    const source = file.editor.sourceView;
    // Typora 1.14.10 uses the same native methods plus temporary sidebar hiding.
    // The workbench retains its own sidebar state; preferences keep the native path.
    if (source.inSourceMode) source.hide();
    else source.show();
    file.freshMenuWithDelay();
  };
  file.toggleSourceMode = toggle;
  return () => {
    disposed = true; cancel(); editor.dispose();
    for (const name of ['wheel', 'pointerdown', 'keydown', 'touchstart']) window.removeEventListener(name, input, true);
    for (const [name, {descriptor, wrapped}] of methods) if (source[name] === wrapped) {
      if (descriptor) Object.defineProperty(source, name, descriptor); else delete source[name];
    }
    if (file.toggleSourceMode === toggle) {
      if (toggle_descriptor) Object.defineProperty(file, 'toggleSourceMode', toggle_descriptor);
      else delete file.toggleSourceMode;
    }
  };
}
