import { File, editor } from 'typora'
import { Component } from 'src/common/component'
import { useService } from 'src/common/service'
import type { WorkspaceLeaf } from 'src/ui/layout/workspace-leaf'
import type { WorkspaceTabs } from 'src/ui/layout/tabs'
import type { MarkdownView } from '.'
import { useEditingTabs } from './use-editing-tabs'
import { usePreviewTabToSwap } from './use-preview-tab-to-swap'
import { useRecord } from './use-record'
import { request_markdown_open } from './native_open'

let swapping = false

/** Native input ownership changes only after the requested document is ready. */
export class SwapCommand extends Component {
  private cancel_swap: (() => void) | undefined
  constructor(private settings = useService('settings'), private workspace = useService('workspace')) { super() }
  onunload() { this.cancel_swap?.() }

  execute(editor_leaf: WorkspaceLeaf<MarkdownView>, preview_leaf: WorkspaceLeaf<MarkdownView>) {
    if (!this._loaded || swapping || !this.settings.get('useAutoSwap')) return
    swapping = true
    const { saveStateToLeaf, restoreStateFromLeaf } = useRecord()
    const { beginSwap, endSwap } = usePreviewTabToSwap()
    const { setEditingTabs } = useEditingTabs()
    const content = editor.writingArea.parentElement!
    const target_path = preview_leaf.state.path
    const valid_target = () => preview_leaf.view.containerEl.isConnected && preview_leaf.state.path === target_path && (preview_leaf.parent as WorkspaceTabs)?.activeLeaf === preview_leaf
    const visibility = content.style.visibility
    let frame = 0, finished = false
    let stop_open = () => {}, stop_event = () => {}
    let timeout: ReturnType<typeof setTimeout>
    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timeout); cancelAnimationFrame(frame); stop_event(); stop_open()
      content.style.visibility = visibility
      swapping = false; endSwap(); this.cancel_swap = undefined
    }
    const restore_owner = () => {
      clearTimeout(timeout); stop_event(); stop_open()
      const owner = this.workspace.findLeaf<WorkspaceLeaf<MarkdownView>>(leaf => leaf.viewType === 'core.markdown' && leaf.state.path === File.bundle.filePath && (leaf.parent as WorkspaceTabs)?.activeLeaf === leaf)
      if (owner?.view.containerEl.isConnected) {
        setEditingTabs(owner.parent as WorkspaceTabs)
        owner.view.setMode('typora')
        restoreStateFromLeaf(owner.view)
      }
      frame = requestAnimationFrame(finish)
    }
    this.cancel_swap = () => { restore_owner() }
    saveStateToLeaf(editor_leaf.view); saveStateToLeaf(preview_leaf.view)
    editor_leaf.view.setMode('previewer')
    restoreStateFromLeaf(editor_leaf.view)
    beginSwap(preview_leaf)
    content.style.visibility = 'hidden'
    content.classList.remove('typ-deactive')
    setEditingTabs(preview_leaf.parent as WorkspaceTabs)
    const ready = () => {
      if (finished || File.bundle.filePath !== target_path || File.isFileLoading()) return
      if (!valid_target()) { restore_owner(); return }
      stop_event()
      preview_leaf.view.setMode('typora')
      restoreStateFromLeaf(preview_leaf.view)
      // The view restoration frame runs before the native surface becomes visible.
      frame = requestAnimationFrame(finish)
    }
    stop_event = this.workspace.on('file:open', path => { if (path === target_path) ready() })
    timeout = setTimeout(restore_owner, 10000)
    if (File.bundle.filePath === target_path && !File.isFileLoading()) ready()
    else stop_open = request_markdown_open(target_path, () => !finished && valid_target())
  }
}
