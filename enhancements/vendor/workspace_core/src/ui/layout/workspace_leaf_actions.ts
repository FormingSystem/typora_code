import { useService } from "src/common/service"
import type { WorkspaceLeaf } from "./workspace-leaf"
import type { WorkspaceTabs } from "./tabs"

/** Moving preserves original leaf, editor, and undo stack; same-group sorting updates status and two DOM at the same time. */
export function move_workspace_leaf(leaf: WorkspaceLeaf, target: WorkspaceTabs, index: number, workspace = useService('workspace')): void {
  const source = leaf.parent as WorkspaceTabs
  const fixed_count = target.children.filter(child => child !== leaf && child.state.workspace_pinned).length
  const next_index = leaf.state.workspace_pinned ? Math.min(index, fixed_count) : Math.max(index, fixed_count)
  if (source === target) {
    const old_index = target.children.indexOf(leaf)
    if (old_index < 0) return
    if (old_index === next_index) {
      workspace.activeLeaf = target.activeLeaf === leaf ? leaf : target.toggleTab(leaf.state.path)
      return
    }
    target.children.splice(old_index, 1)
    target.children.splice(next_index, 0, leaf)
    const tab = target.tabHeader.getTabById(leaf.state.path)!
    const other_tabs = [...target.tabHeader.container.children].filter(child => child !== tab)
    const other_leaves = [...target.tabContentEl.children].filter(child => child !== leaf.containerEl)
    target.tabHeader.container.insertBefore(tab, other_tabs[next_index] || null)
    target.tabContentEl.insertBefore(leaf.containerEl, other_leaves[next_index] || null)
    target.getRoot().emit('layout-changed')
  } else {
    leaf.detach()
    target.insertChild(next_index, leaf)
    if (workspace.activeLeaf === leaf) {
      source.containerEl.classList.remove('mod-active')
      target.containerEl.classList.add('mod-active')
    }
  }
  // insertChild The target is activated; the sorting of active tabs should not re-enable the editor.
  workspace.activeLeaf = target.activeLeaf === leaf ? leaf : target.toggleTab(leaf.state.path)
}

