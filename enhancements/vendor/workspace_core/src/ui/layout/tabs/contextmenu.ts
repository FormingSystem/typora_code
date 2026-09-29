import type { WorkspaceRoot } from "../workspace-root"
import type { WorkspaceTabs } from "."

// Document menu is managed by workbench action service, core only provides precise right-click leaf identity.
export function onTabsContextMenu(root: WorkspaceRoot) {
  return function (event: MouseEvent) {
    const tab = event.target instanceof Element ? event.target.closest<HTMLElement>('.typ-tab[data-id]') : null
    if (!tab) return
    const group = root.findNode(node => node.containerEl === tab.closest('.typ-workspace-tabs')) as WorkspaceTabs | undefined
    const leaf = group?.children.find(child => child.state.path === tab.dataset.id)
    if (!leaf) return
    event.preventDefault()
    document.dispatchEvent(new CustomEvent('typora-code:tab-context-menu', {detail: {leaf, event}}))
  }
}
