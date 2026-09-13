import { useService } from 'src/common/service'
import fs from 'src/io/fs/filesystem'
import { File, editor } from 'typora'
import type { ModeController, ModeContext } from './mode-controller'
import type { ScrollState } from 'src/ui/layout/workspace-view'


export class MdPreviewerMode implements ModeController {

  private _containerEl: HTMLElement | null = null
  private render_sequence = 0
  private cleanup: (() => void)[] = []

  constructor(private mdRenderer = useService('markdown-renderer')) { }

  enter(ctx: ModeContext) {
    const { containerEl, filePath } = ctx
    containerEl.classList.add('mode-previewer')
    this._containerEl = containerEl
    const refresh = async () => {
      const sequence = ++this.render_sequence
      const native_matches = () => (File.bundle.filePath || '') === filePath && !File.isFileLoading()
      try {
        let markdown = native_matches() ? editor.getMarkdown() : filePath ? await fs.readText(filePath) : ''
        if (sequence !== this.render_sequence || this._containerEl !== containerEl) return
        // 异步磁盘读取期间可能已经打开该文档，优先使用最新的原生内存正文。
        if (native_matches()) markdown = editor.getMarkdown()
        const scroll_top = containerEl.parentElement?.scrollTop || 0
        this.mdRenderer.renderTo(markdown, containerEl)
        if (containerEl.parentElement) containerEl.parentElement.scrollTop = scroll_top
      } catch (error) {
        if (sequence === this.render_sequence && this._containerEl === containerEl) containerEl.textContent = String(error)
      }
    }
    this.cleanup.push(useService('markdown-editor').on('edit', refresh), useService('workspace').on('file:open', refresh))
    void refresh()
  }

  exit(ctx: ModeContext) {
    this.render_sequence++
    for (const cleanup of this.cleanup.splice(0)) cleanup()
    ctx.containerEl.classList.remove('mode-previewer')
    ctx.containerEl.innerHTML = ''
    this._containerEl = null
  }

  getScroll(): ScrollState {
    return {
      scrollTop: this._containerEl?.parentElement!.scrollTop ?? 0,
    }
  }

  applyScroll(state: ScrollState): void {
    if (this._containerEl)
      this._containerEl.parentElement!.scrollTop = state.scrollTop
  }
}
