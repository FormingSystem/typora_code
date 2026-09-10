

export type WorkspaceSettings = {
  hideExtensionInFileTab: boolean
  useBlankNewTab: boolean
  useAutoSwap: boolean
  rightSplitWidth: number
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  hideExtensionInFileTab: false,
  useBlankNewTab: false,
  useAutoSwap: true,
  rightSplitWidth: 280,
}

