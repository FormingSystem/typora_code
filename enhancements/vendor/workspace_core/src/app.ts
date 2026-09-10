import './ui/variables.scss'
import './ui/global.scss'
import path from 'src/path'
import { JSBridge, _options, editor } from 'typora'
import * as Core from '.'
import { coreDir, coreVersion, platform } from 'src/common/constants'
import { Events } from 'src/common/events'
import { useService } from 'src/common/service'
import type { HotkeyManager } from 'src/hotkey-manager'
import fs from 'src/io/fs/filesystem'
import type { Vault } from "src/io/vault"
import type { CommandManager } from 'src/command/command-manager'
import type { I18n } from 'src/locales/i18n'
import * as Locale from 'src/locales/lang.en.json'
import type { MetadataManager } from './metadata/metadata-manager'
import type { Settings } from 'src/settings/settings'
import type { FileLinkSettings } from 'src/ui/settings/tabs/file-link-setting-tab'
import type { AppearanceSettings } from 'src/ui/settings/tabs/appearance-setting-tab'
import type { WorkspaceSettings } from './settings/workspace-defaults'
import type { ViewManager } from './ui/view-manager'
import type { Workspace } from 'src/ui/workspace'
import type { MarkdownEditor } from './ui/editor/markdown-editor'
import { MarkdownRenderer } from './ui/editor/markdown-renderer'
import type { RibbonSettings } from 'src/ui/ribbon/workspace-ribbon'
import { GlobalSearch } from './ui/sidebar/search/global-search'
import { Statistics } from './ui/statusbar/statistics'
import { isMarkdownUrl } from 'src/utils'
import type { FileURL } from 'src/utils/types'
import { ConfigRepository } from './io/config-repository'
import { ExportManager } from './export-manager'


export type AppEvents = {
  'load'(): void
}

export type EnvironmentVariables = {

  [key: string]: any
}

export type AppSettings =
  FileLinkSettings
  & AppearanceSettings
  & RibbonSettings
  & WorkspaceSettings




/**
 * Proxy of Typora
 *
 * Use in development environment:
 * @example
 * ```ts
 * const { app } = Typora
 * ```
 *
 * Use in production environment:
 * @example const { app } = pliginInstance
 * @example import { app } from '@typora-community-plugin/core'
 */
export class App extends Events<AppEvents> {

  private _isReady = false

  /**
   * @example app.coreVersion  //=> '2.0.0'
   */
  readonly runtime_version = "2.10.15-typora-code.1"

  readonly coreDir = coreDir()

  readonly platform = platform()

  vault: Vault = useService('vault')
  config: ConfigRepository = useService('config-repository')
  settings!: Settings<AppSettings>
  i18n!: I18n<typeof Locale>
  env: EnvironmentVariables = useService('env')
  hotkeyManager: HotkeyManager = useService('hotkey-manager')
  commands!: CommandManager
  viewManager!: ViewManager
  workspace!: Workspace
  metadata!: MetadataManager

  features!: {
    exporter: ExportManager,
    globalSearch: GlobalSearch,
    markdownEditor: MarkdownEditor,
    markdownRenderer: MarkdownRenderer,
    statistics: Statistics,
  }

  constructor() {
    super('app')

    // @ts-ignore
    Object.assign(window[Symbol.for(process.env.CORE_NS)], {
      ...Core,
      app: this,
    })
    if (process.env.IS_DEV) {
      // @ts-ignore
      window['Typora'] = window[Symbol.for(process.env.CORE_NS)]
    }

  }
  private initialized = false
  initialize() {
    if(this.initialized)return;this.initialized=true
    this.settings = useService('settings')
    this.i18n = useService('i18n')
    this.commands = useService('command-manager')
    this.viewManager = useService('view-manager')
    this.workspace = useService('workspace')
    this.metadata = useService('metadata-manager')
    this.features = {exporter: useService('exporter'),globalSearch: new GlobalSearch(),markdownEditor: useService('markdown-editor'),markdownRenderer: useService('markdown-renderer'),statistics: new Statistics()}
  }
  private started = false
  start() { if(this.started)return;this.started=true;this.features.statistics.load();this.emit('load') }

  /**
   * @param link HTTP url or file path
   */
  openLink(link: string) {
    if (link.startsWith('http') || link.startsWith('#')) {
      editor.tryOpenUrl(link)
    }
    else {
      this.openFile(decodeURIComponent(link))
    }
  }

  /**
   * Open Markdown file with Typora or unsupported file with default app.
   *
   * @param filepath path of Markdown file or unsupported file
   */
  async openFile(filepath: string) {
    if (filepath.startsWith('<')) {
      // handle: `[](<file path.md>)`
      filepath = filepath.slice(1, -1)
    }
    if (!path.isAbsolute(filepath)) {
      // handle: non absolute path. like `[](test.md)`
      // handle: relative path. like `[](./test.md)`
      filepath = path.join(path.dirname(this.workspace.activeFile), filepath)
    }

    let url: FileURL = { pathname: filepath }
    const basename = path.basename(filepath)
    if (basename.includes('#')) {
      url = await fs.access(filepath)
        .then(() => url)
        .catch(() => {
          const hashSplitorIdx = filepath.lastIndexOf('#')
          return {
            pathname: filepath.slice(0, hashSplitorIdx),
            hash: filepath.slice(hashSplitorIdx),
          }
        })
    }

    if (isMarkdownUrl(url.pathname)) {
      this.workspace.activeEditor.openFile(url)
    }
    else {
      this.openFileWithDefaultApp(filepath)
    }
  }

  /**
   * Open unsupported file with default app.
   *
   * @param filepath path of unsupported file
   */
  openFileWithDefaultApp(filepath: string) {
    return fs.access(filepath)
      .then(() => JSBridge.invoke("shell.openItem", filepath))
      .catch(e => this.logger.error(e))
  }
}
