import { useService } from 'src/common/service'
import fs from 'src/io/fs/filesystem'
import { File, editor } from 'typora'
import type { ModeController, ModeContext } from './mode-controller'
import type { ScrollState } from 'src/ui/layout/workspace-view'


export class MdPreviewerMode implements ModeController {

  private _containerEl: HTMLElement | null = null
  private render_sequence = 0
  private cleanup: (() => void)[] = []
  private pending_scroll: number | undefined

  constructor(private mdRenderer = useService('markdown-renderer')) { }

  enter(ctx: ModeContext) {
    const { containerEl, filePath } = ctx
    const native_matches = () => (File.bundle.filePath || '') === filePath && !File.isFileLoading()
    containerEl.classList.add('mode-previewer')
    this._containerEl = containerEl
    let previous_text: string | undefined, frame = 0
    const refresh = async () => {
      const sequence = ++this.render_sequence
      try {
        let markdown = native_matches() ? editor.getMarkdown() : filePath ? await fs.readText(filePath) : ''
        if (sequence !== this.render_sequence || this._containerEl !== containerEl) return
        // During asynchronous disk reading, the document may already be open; prioritize using the latest native memory document content.
        if (native_matches()) markdown = editor.getMarkdown()
        if (markdown === previous_text) return
        const scroll_top = this.pending_scroll ?? containerEl.parentElement?.scrollTop ?? 0
        this.mdRenderer.renderTo(markdown, containerEl, filePath)
        previous_text = markdown
        if (containerEl.parentElement) containerEl.parentElement.scrollTop = scroll_top
        this.pending_scroll = undefined
      } catch (error) {
        if (sequence === this.render_sequence && this._containerEl === containerEl) containerEl.textContent = String(error)
      }
    }
    const schedule = () => {
      if (!native_matches() || frame) return
      frame = requestAnimationFrame(() => { frame = 0; void refresh() })
    }
    this.cleanup.push(useService('markdown-editor').on('edit', schedule), useService('workspace').on('file:open', schedule), () => cancelAnimationFrame(frame))
    void refresh()
  }

  exit(ctx: ModeContext) {
    this.render_sequence++
    for (const cleanup of this.cleanup.splice(0)) cleanup()
    this.mdRenderer.release(ctx.containerEl)
    ctx.containerEl.classList.remove('mode-previewer', 'typ-markdown-preview')
    ctx.containerEl.innerHTML = ''
    this._containerEl = null
  }

  getScroll(): ScrollState {
    return {
      scrollTop: this._containerEl?.parentElement!.scrollTop ?? 0,
    }
  }

  applyScroll(state: ScrollState): void {
    this.pending_scroll = this._containerEl?.childElementCount ? undefined : state.scrollTop
    if (this._containerEl)
      this._containerEl.parentElement!.scrollTop = state.scrollTop
  }
}
