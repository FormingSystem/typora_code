import './sidebar.scss'
import { editor } from "typora"
import { useService } from "src/common/service"
import { View } from "src/ui/common/view"
import type { DisposeFunc } from "src/utils/types"
import { FileExplorer } from "./file-explorer"
import { Component } from 'src/common/component'
import type { SidebarPanel } from './sidebar-panel'
import { ViewLegacy } from '../common/view-legacy'


/**
 * @example
 *
 * ```js
 * // Get instance
 * const sidebar = app.workspace.sidebar
 * ```
 */
export class Sidebar extends Component {

  container = new SidebarContainer()

  private activePanel?: SidebarPanel
  private shown_panel?: SidebarPanel
  private internalPanels: SidebarPanel[] = []
  private panels: SidebarPanel[] = []

  constructor(
    private readonly panel_factory: () => SidebarPanel[],
    private ribbon = useService('ribbon'),
  ) {
    super()


  }

  mount() {
    if (this.internalPanels.length) return
    this.internalPanels = this.panel_factory()
    this.internalPanels.forEach(view => this.addPanel(view))
  }

  addPanel(panel: SidebarPanel): DisposeFunc {
    // fix: compatible with `workspace.getViewByType()` for the old plugins: tag
    super.addChild(panel)

    // @deprecated
    if (panel instanceof ViewLegacy) {
      panel.load()
      this.container.addPanel(panel)
    }

    if (panel.ribbonButton) {
      this.ribbon.addButton(panel.ribbonButton)
    }

    this.panels.push(panel)
    return () => this.removePanel(panel)
  }

  /**
   * Use `addPanel` instead.
   * @deprecated compatible with old api (<=2.2.22)
   */
  addChild(panel: any): DisposeFunc {
    return this.addPanel(panel)
  }

  removePanel(panel: SidebarPanel): void {
    if (this.shown_panel === panel) {
      panel.hide()
      this.shown_panel = undefined
    }
    if (this.activePanel === panel) this.activePanel = undefined
    if (panel.ribbonButton) {
      this.ribbon.removeButton(panel.ribbonButton)
    }

    this.panels = this.panels.filter((v) => v !== panel)

    // @deprecated
    if (panel instanceof ViewLegacy) {
      panel.unload()
      this.container.removePanel(panel)
    }
  }

  /**
   * Use `removePanel` instead.
   * @deprecated compatible with old api (<=2.2.22)
   */
  removeChild(panel: any): void {
    this.removePanel(panel)
  }

  get isShown() {
    return editor.library.isSidebarShown()
  }

  switch<T extends SidebarPanel>(viewClass: new (...args: any[]) => T) {
    const target_panel = this.panels.find(c => c instanceof viewClass)
    if (!target_panel) return
    if (this.activePanel instanceof viewClass) {
      this.toggle()
      return
    }

    // 可见面板之间只移交内容，不能关闭宿主侧栏触发正文重排与原生动画。
    const previous_panel = this.shown_panel ?? this.activePanel
    previous_panel?.hide()
    this.shown_panel = undefined
    this.internalPanels.forEach(panel => { if (panel !== previous_panel) panel.hide() })
    this.activePanel = target_panel
    this.show()
  }

  toggle() {
    this.isShown ? this.hide() : this.show()
  }

  show() {
    if (!this.isShown) editor.library.showSidebar()
    if (this.shown_panel === this.activePanel) return
    this.shown_panel?.hide()
    this.activePanel?.show()
    this.shown_panel = this.activePanel
  }

  hide() {
    if (this.isShown) editor.library.hideSidebar()
    this.shown_panel?.hide()
    this.shown_panel = undefined
  }
}

class SidebarContainer extends View {

  wrapperEl: HTMLElement

  constructor() {
    super()

    this.containerEl = document.getElementById('sidebar-content')!
    this.wrapperEl = this.containerEl.parentElement!
  }

  addPanel(panel: SidebarPanel) {
    this.containerEl.append(panel.containerEl)
  }

  removePanel(panel: SidebarPanel) {
    panel.containerEl.remove()
  }
}

