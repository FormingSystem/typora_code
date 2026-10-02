import './markdown-renderer.scss'
import { editor, MathJax, reqnode } from "typora"
import DOMPurify from 'dompurify'
import { useService } from "src/common/service"
import { memorize, parseMarkdown } from "src/utils"

const MarkdownParser = memorize(() => editor.nodeMap.allNodes.first()!.__proto__.constructor)

/** Native parsing retains block identity; inactive panes own only inert reading DOM. */
export class MarkdownRenderer {
  private sessions = new WeakMap<HTMLElement, AbortController>()
  constructor(private mdEditor = useService('markdown-editor')) { }

  release(target: HTMLElement) {
    this.sessions.get(target)?.abort()
    this.sessions.delete(target)
    ;(MathJax as any)?.typesetClear?.([target])
  }

  renderTo(md: string, target: HTMLElement, file_path = ''): void {
    this.release(target)
    const controller = new AbortController()
    this.sessions.set(target, controller)
    md = this.mdEditor.preProcessor.process('preload', md)
    const { frontMatter, content } = parseMarkdown(md)
    const [html] = MarkdownParser().parseFrom(content)
    target.classList.add('typ-markdown-preview')
    target.innerHTML = DOMPurify.sanitize(html, {FORBID_TAGS:['script','iframe','object','embed'], FORBID_ATTR:['contenteditable']})
    if (frontMatter) { const pre = document.createElement('pre'); pre.className = 'md-meta-block md-end-block'; pre.textContent = frontMatter; target.prepend(pre) }
    target.querySelectorAll<HTMLElement>('pre.md-fences').forEach(pre => {
      const code = document.createElement('code'); code.className = 'language-' + (pre.getAttribute('lang') || 'plaintext'); code.textContent = pre.innerText
      pre.replaceChildren(code)
    })
    const path_api = reqnode('path'), url_api = reqnode('url')
    for (const image of target.querySelectorAll<HTMLImageElement>('img')) {
      const source = image.getAttribute('src') || image.closest('.md-image')?.getAttribute('data-src') || ''
      try {
        let decoded = source
        try { decoded = decodeURIComponent(source) } catch { /* Literal percent characters remain valid file names. */ }
        const resolved = /^[a-z][a-z0-9+.-]*:/i.test(source) && !path_api.isAbsolute(source) ? new URL(source) : url_api.pathToFileURL(path_api.resolve(path_api.dirname(file_path), decoded))
        if (!['file:', 'http:', 'https:', 'data:'].includes(resolved.protocol) || resolved.protocol === 'data:' && !source.startsWith('data:image/')) { image.removeAttribute('src'); continue }
        image.src = resolved.href; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'
      } catch { image.removeAttribute('src') }
    }
    target.dispatchEvent(new CustomEvent('typora-code:markdown-pane-rendered', {bubbles:true,detail:{root:target,file_path,signal:controller.signal}}))
    const math = [...target.querySelectorAll('.math-jax-preprocess')]
    if (math.length) void MathJax.typesetPromise(math).catch(() => {}).then(() => { if (controller.signal.aborted) (MathJax as any)?.typesetClear?.(math) })
  }

  /** Read-only code blocks have no mutable editor instance. */
  getCodeMirrorInstance(_cid: string): undefined { return undefined }
}
