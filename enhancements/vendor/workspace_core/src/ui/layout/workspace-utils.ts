import decorate from "@plylrnsdy/decorate.js"
import { useService } from "src/common/service"
import type { Workspace } from "../workspace"
import type { Direction, WorkspaceSplit } from "./split"
import type { WorkspaceTabs } from "./tabs"
import { WorkspaceLeaf } from "./workspace-leaf"
import { MarkdownView } from "../views/markdown-view"
import { EmptyView } from "../views/empty-view"
import type { ViewState } from "../view-manager"
import { uniqueId } from "src/utils"
import { defaultTheme, windowTheme } from "./floating/theme"
import { resizable } from "./floating/resizable"
import { draggable } from "./floating/draggable"
import { closable } from "./floating/closable"


// ---------- workspace.rootSplit ----------

export function createUntitledTabs() {
  const tabs = useService('workspace-tabs')
  tabs.appendChild(createEditorLeaf(''))
  tabs.once('tab:toggle', () => tabs.removeTab(''))
  return tabs
}

export function createTabs(path?: string) {
  const workspace = useService('workspace')
  const tabs = useService('workspace-tabs')
  const newLeaf = path
    ? path.startsWith('typ://')
      ? createCustomLeaf(path)
      : createEditorLeaf(path)
    : createEmptyLeaf()
  tabs.appendChild(newLeaf)
  workspace.activeLeaf = newLeaf
  return tabs
}

export function openFileInActiveTabs(file: string) {
  const workspace = useService('workspace')
  const activeTabs = workspace.activeLeaf?.parent as WorkspaceTabs
  if (activeTabs.findLeaf(leaf => leaf.state.path === file)) {
    workspace.activeLeaf = activeTabs.toggleTab(file)
    return
  }
  activeTabs.appendChild(createEditorLeaf(file))
  workspace.activeLeaf = activeTabs.activeLeaf
}

export function createLeaf(state?: ViewState) {
  const leaf = new WorkspaceLeaf()
  if (state) leaf.setState(state)
  return leaf
}

export function createEditorLeaf(filePath: string) {
  return createLeaf({
    type: MarkdownView.type,
    state: {
      path: filePath,
    }
  })
}

const RE_TYPE = /^typ:\/\/([^/]+)/

function createCustomLeaf(path: string) {
  const type = (path.match(RE_TYPE) ?? [])[1]
  if (!type) throw Error(`View "${type}" has not registered.`)
  return createLeaf({
    type,
    state: {
      path,
    }
  })
}

export function createEmptyLeaf() {
  return createLeaf({
    type: EmptyView.type,
    state: {
      path: uniqueId(`typ://${EmptyView.type}/`) + '/New tab',
    }
  })
}

export function splitRight(path?: string) {
  split('vertical', path)
}

export function splitDown(path?: string) {
  split('horizontal', path)
}

/**
 * Split the parent {@link WorkspaceTabs} of the {@link Workspace.activeLeaf}
 */
function split(direction: Direction, path?: string) {
  const workspace = useService('workspace')
  const source = workspace.activeLeaf
  if (!source) return
  const target = split_workspace_group(source, direction === 'vertical' ? 'right' : 'down')
  const leaf = path ? path.startsWith('typ://') ? createCustomLeaf(path) : createEditorLeaf(path) : createEmptyLeaf()
  target.appendChild(leaf)
  workspace.activeLeaf = leaf
}

/** 创建紧邻目标组的新组，不关闭或重新读取原文档。 */
export function split_workspace_group(leaf: WorkspaceLeaf, side: 'left' | 'right' | 'up' | 'down'): WorkspaceTabs {
  const direction: Direction = side === 'left' || side === 'right' ? 'vertical' : 'horizontal'
  const previous_group = leaf.parent as WorkspaceTabs
  const parent_split = previous_group.parent as WorkspaceSplit
  const next_group = useService('workspace-tabs')
  const before = side === 'left' || side === 'up'
  if (parent_split.direction === direction) {
    parent_split.insertChild(parent_split.children.indexOf(previous_group) + (before ? 0 : 1), next_group)
  } else {
    const next_split = useService('workspace-split', [direction])
    parent_split.replaceChild(previous_group, next_split)
    next_split.appendChild(before ? next_group : previous_group)
    next_split.appendChild(before ? previous_group : next_group)
  }
  return next_group
}

// ---------- workspace.rightSplit ----------

export function ensureRightSidedockLeaf(uri: string) {
  const workspace = useService('workspace')
  const type = (uri.match(RE_TYPE) ?? [])[1]
  const existing = workspace.rightSplit.findLeaf(leaf => leaf.type === type)
  if (existing) return

  const tabs = useService('workspace-tabs')
  const leaf = createCustomLeaf(uri)

  tabs.appendChild(leaf)
  workspace.rightSplit.appendChild(tabs)
}

// ---------- workspace.floatingSplit ----------

export function openFloatingLeaf(arg0: string | WorkspaceLeaf) {
  const workspace = useService('workspace')
  const tabs = useService('workspace-tabs')
  const leaf = typeof arg0 === 'string' ? createCustomLeaf(arg0) : arg0
  const { view, state } = leaf
  const { containerEl } = view
  let titlebar: HTMLElement | null

  containerEl.classList.add('typ-workspace-floating')
  decorate.afterCall(view, 'onload', () => {
    state.theme === 'default' && defaultTheme(containerEl)
    state.theme === 'window' && (
      windowTheme(containerEl, state.path.split('/').pop()),
      titlebar = containerEl.querySelector('.typ-titlebar'))

    state.resizable && view.register(resizable(containerEl))
    state.draggable && view.register(draggable(containerEl, titlebar))
    state.onClose && view.register(closable(titlebar ?? containerEl, state.onClose))
  })

  tabs.appendChild(leaf)
  workspace.floatingSplit.appendChild(tabs)
}
