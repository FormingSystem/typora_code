import {create_preview_image} from './workspace_preview_image';
import {workspace_element as el} from './workspace_widgets';
import {acquire_workspace_style} from './workspace_styles';
import image_css from './workspace_image_document.css';

export type image_file_side = {label:string; read:(signal:AbortSignal)=>Promise<Blob>};

/** The tab owns pending reads, decoded images and any fullscreen session opened by this view. */
export function create_image_document(sides:readonly image_file_side[], show_labels:boolean) {
  const container = el('section','workspace-image-document');
  const style = acquire_workspace_style('typora-code-style:image-document',image_css);
  const controller = new AbortController();
  const previews = new Set<ReturnType<typeof create_preview_image>>();
  const tasks = sides.map(async side => {
    const cell = el('div','workspace-image-pane');
    if (show_labels) {
      const heading = el('div','git-revision-reader-heading',side.label);
      heading.title = side.label;
      cell.append(heading);
    }
    container.append(cell);
    let preview:ReturnType<typeof create_preview_image>|undefined;
    try {
      const blob = await side.read(controller.signal);
      controller.signal.throwIfAborted();
      preview = create_preview_image(blob,blob.type,side.label);
      previews.add(preview);
      cell.append(preview.container);
      await preview.ready;
      return true;
    } catch (error) {
      if(preview){previews.delete(preview);preview.dispose();}
      if (!controller.signal.aborted) cell.append(el('p','workspace-file-notice',error instanceof Error ? error.message : String(error)));
      return false;
    }
  });
  return {
    container, ready:Promise.all(tasks).then(results=>results.every(Boolean)),
    dispose(){controller.abort();for(const preview of previews)preview.dispose();style.remove();container.remove();}
  };
}
