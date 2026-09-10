

export type FileLinkSettings = {
  openLinkInCurrentWin: boolean
  mdLinkWithoutExtension: boolean
  quickOpenInCurrentWin: boolean
  ignoreFile: boolean
  ignoreFileGlob: string
}

export const DEFAULT_FILE_LINK_SETTINGS: FileLinkSettings = {
  openLinkInCurrentWin: true,
  mdLinkWithoutExtension: false,
  quickOpenInCurrentWin: true,
  ignoreFile: true,
  ignoreFileGlob: '.git',
}

