import './index.scss'
import { WorkspaceParent } from "../workspace-parent"
import type { WorkspaceLeaf } from '../workspace-leaf'
import { createEmptyLeaf } from '../workspace-utils'
import { WorkspaceNode } from '../workspace-node'
import { FileTab, FileTabContainer, UntitledTab } from './file-tabs'
import { useActiveLeaf } from '../use-active-leaf'
import { EmptyView } from 'src/ui/views/empty-view'


export class WorkspaceTabs extends WorkspaceParent {

  type = 'tabs'

  tabHeader = new FileTabContainer({
    className: 'typ-workspace-tab-header',
    onToggle: (tabId, tabEl) => {
      const leaf = this.toggleTab(tabId, tabEl)
      const [, setActiveLeaf] = useActiveLeaf()
      setActiveLeaf(leaf)
    },
    onClose: (tabId, tabEl) => this.removeTab(tabId, tabEl),
  })

  tabContentEl: HTMLElement

  constructor() {
    super()

    $(this.containerEl)
      .addClass('typ-workspace-tabs')
      .append(this.tabHeader.containerEl)
      .append(this.tabContentEl = $('<div class="typ-workspace-tab-content">')[0])
  }

  insertChild(index: number, child: WorkspaceLeaf) {
    const fixed_count = (this.children as WorkspaceLeaf[]).filter(leaf => leaf.state.workspace_pinned).length
    index = child.state.workspace_pinned ? Math.min(index, fixed_count) : Math.max(index, fixed_count)
    this.tabHeader.insertTab(index, child.state.path ? new FileTab(child.state.path) : new UntitledTab())
    super.insertChild(index, child)
    this.toggleTab(child.state.path)

    // 新窗合并到第一个插入点时，空占位叶可能位于真实标签之后。
    // 仅移除 core.empty，占位位置不应影响结果，也不关闭用户的 Untitled 草稿。
    if (!child.state.path?.startsWith(`typ://${EmptyView.type}`)) {
      const empty_leaf = this.children.find(node => node !== child && (node as WorkspaceLeaf).state.path?.startsWith(`typ://${EmptyView.type}`))
      if (empty_leaf) this.removeChild(empty_leaf)
    }
  }

  _insertChildEl(index: number, child: WorkspaceLeaf) {
    this.tabContentEl.querySelector('.mod-active')?.classList.remove('mod-active')
    child.containerEl.classList.add('mod-active')
    this.tabContentEl.insertBefore(child.containerEl, this.tabContentEl.children[index])
  }

  removeChild(child: WorkspaceNode): void {
    this.removeTab((child as WorkspaceLeaf).state.path)
  }

  /** 恢复标签身份不打开视图，后台文档由首次激活按需读取。 */
  append_inactive(leaves: WorkspaceLeaf[]) {
    for (const leaf of leaves) {
      const fixed_count = (this.children as WorkspaceLeaf[]).filter(item => item.state.workspace_pinned).length
      const index = leaf.state.workspace_pinned ? fixed_count : this.children.length
      this.tabHeader.insertTab(index, new FileTab(leaf.state.path), false)
      this.children.splice(index, 0, leaf)
      leaf.setParent(this)
      this.tabContentEl.insertBefore(leaf.containerEl, this.tabContentEl.children[index])
    }
    if (leaves.length) this.getRoot().emit('layout-changed')
  }

  // --------- Tab Operators ---------

  private _activeLeaf!: WorkspaceLeaf

  get activeLeaf() {
    return this._activeLeaf ?? this.children[0] as WorkspaceLeaf
  }

  toggleTab(path: string, tabEl?: HTMLElement): WorkspaceLeaf {
    if (this._activeLeaf?.state.path === path) return this._activeLeaf
    this.activeLeaf.view.close()
    this.tabContentEl.querySelector('.mod-active')?.classList.remove('mod-active')

    tabEl ??= this.tabHeader.getTabById(path)
    this.tabHeader.activeTab(tabEl)

    const leaf = (this.children as WorkspaceLeaf[]).find(c => c.state.path === path)!
    leaf.containerEl.classList.add('mod-active')
    this._activeLeaf = leaf
    leaf.view.open()

    if (!path.startsWith(`typ://${EmptyView.type}`)) {
      const empty_leaf = this.children.find(node => node !== leaf && (node as WorkspaceLeaf).state.path?.startsWith(`typ://${EmptyView.type}`)) as WorkspaceLeaf | undefined
      if (empty_leaf) this.removeTab(empty_leaf.state.path)
    }

    this.emit('tab:toggle', leaf)
    return leaf
  }

  renameTab(oldPath: string, newPath: string): void {
    const tabEl = this.tabHeader.getTabById(oldPath)
    const newTab = new FileTab(newPath)
    this.tabHeader.renameTab(tabEl, newTab)

    const leaf = (this.children as WorkspaceLeaf[]).find(c => c.state.path === oldPath)!
    leaf.state.path = newPath
    leaf.view.setIcon(leaf.view.icon)
  }

  removeTab(path: string, tabEl?: HTMLElement): void {
    tabEl ??= this.tabHeader.getTabById(path)
    if (!tabEl) return
    this.tabHeader.closeTab(tabEl)

    const leaf = (this.children as WorkspaceLeaf[]).find(c => c.state.path === path)!
    leaf.view.close()
    super.removeChild(leaf)

    if (!this.children.length) {
      if (this.getRoot() !== this.parent || this.parent.children.length > 1) {
        this.parent!.removeChild(this)
      }
      else {
        this.appendChild(createEmptyLeaf())
      }
    }
  }

  removeOthers(path: string): WorkspaceLeaf {
    const leaf = this.toggleTab(path)
    this.tabHeader.closeOtherTabs(this.tabHeader.getTabById(path))
    return leaf
  }

  removeRight(path: string): WorkspaceLeaf {
    const leaf = this.toggleTab(path)
    this.tabHeader.closeRightTabs(this.tabHeader.getTabById(path))
    return leaf
  }
}
