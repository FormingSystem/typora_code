import { editor } from 'typora'
import { useService } from 'src/common/service'
import type { WorkspaceTabs } from 'src/ui/layout/tabs'
import type { ModeController, ModeContext } from './mode-controller'
import type { ScrollState } from 'src/ui/layout/workspace-view'
import { useEditingTabs } from './use-editing-tabs'
import { memorize } from 'src/utils'


export class MdEditorMode implements ModeController {

  static getInstance = memorize(() => new MdEditorMode())

  contentEl = editor.writingArea.parentElement!
  private _parentTabs: WorkspaceTabs | null = null
  private _resizeObserver: ResizeObserver | null = null
  private geometry_style: HTMLStyleElement | null = null
  private native_leaf: ModeContext['leaf'] | null = null
  private release_layout: (() => void) | null = null
  private layout_frame = 0
  private handleSettingActiveLeaf: ((this: HTMLElement, ev: MouseEvent) => any) | null = null

  private constructor(
    private workspace = useService('workspace'),
  ) { }

  enter(ctx: ModeContext) {
    const { containerEl, leaf } = ctx
    containerEl.classList.add('mode-typora')
    containerEl.innerHTML = '<object type="text/html" data="about:blank"></object>'

    const { setEditingTabs } = useEditingTabs()
    setEditingTabs(ctx.leaf.parent as WorkspaceTabs)

    this.contentEl.classList.add('typ-workspace-binding')
    this.contentEl.removeEventListener('mousedown', this.handleSettingActiveLeaf!)
    this.contentEl.addEventListener('mousedown', this.handleSettingActiveLeaf = () => {
      this.workspace.activeLeaf = leaf
    })

    this._parentTabs = leaf.parent as WorkspaceTabs
    this.native_leaf = leaf

    if (!this.geometry_style) {
      this.geometry_style = document.createElement('style')
      this.geometry_style.textContent = 'content.typ-workspace-binding:not(.typ-deactive) {}'
      document.head.append(this.geometry_style)
    }

    this.unregisterObserver()
    this.registerObserver()
    this.syncSize()
  }

  exit(ctx: ModeContext) {
    ctx.containerEl.classList.remove('mode-typora')
    ctx.containerEl.innerHTML = ''

    this.contentEl.classList.remove('typ-workspace-binding')
    this.contentEl.removeEventListener('mousedown', this.handleSettingActiveLeaf!)
    this.unregisterObserver()
    this.geometry_style?.remove()
    this.geometry_style = null
    this.native_leaf = null
    this._parentTabs = null
  }

  getScroll(): ScrollState {
    return { scrollTop: this.contentEl.scrollTop }
  }

  applyScroll(state: ScrollState): void {
    this.contentEl.scrollTop = state.scrollTop
  }

  private registerObserver() {
    this._resizeObserver = new ResizeObserver(() => this.syncSize())
    if (this._parentTabs) {
      this._resizeObserver.observe(this._parentTabs.tabContentEl)
    }
    this.release_layout = this.workspace.rootSplit.on('layout-changed', () => {
      if (!this.layout_frame) this.layout_frame = requestAnimationFrame(() => { this.layout_frame = 0; this.syncSize() })
    })
  }

  private unregisterObserver() {
    this._resizeObserver?.disconnect()
    this._resizeObserver = null
    this.release_layout?.()
    this.release_layout = null
    cancelAnimationFrame(this.layout_frame)
    this.layout_frame = 0
  }

  public syncSize() {
    const parent = this.native_leaf?.parent as WorkspaceTabs | null
    if (!parent?.tabContentEl) return
    if (parent !== this._parentTabs) {
      if (this._parentTabs) this._resizeObserver?.unobserve(this._parentTabs.tabContentEl)
      this._parentTabs = parent
      this._resizeObserver?.observe(parent.tabContentEl)
      useEditingTabs().setEditingTabs(parent)
    }

    const style = (this.geometry_style?.sheet?.cssRules[0] as CSSStyleRule | undefined)?.style
    if (!style) return
    const targetEl = parent.tabContentEl
    const rect = targetEl.getBoundingClientRect()
    // The shared native frame owns these four dimensions; inherited body variables would invalidate every text descendant.
    for (const name of ['top', 'left', 'width', 'height'] as const) {
      const value = rect[name] + 'px'
      if (style.getPropertyValue(name) !== value) style.setProperty(name, value, name === 'left' ? 'important' : '')
    }
  }
}
