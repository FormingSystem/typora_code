import type { App } from "src/app"
import type { Command } from "src/command/command-manager"
import { Component } from "src/common/component"
import { useService } from "src/common/service"
import path from 'src/path'
import type { PluginManifest } from "./plugin-manifest"
import { PluginSettings } from './plugin-settings'

import type { SettingTab } from "src/ui/settings/setting-tab"
import type { TPostProcessor } from 'src/ui/editor/postprocessor/postprocessor-manager'
import type { TPreProcessor } from 'src/ui/editor/preprocessor/preprocessor'
import type { MarkdownEditor } from "src/ui/editor/markdown-editor"
import type { EditorSuggest } from "src/ui/editor/suggestion/suggest"


interface StatusBarItemOptions {
  position: 'left' | 'right',
  hint?: string,

  /**
   * - `"item"`: Always visible.
   * - `"button"`: Hidden by default; appears when hovering over the status bar.
   *
   * @default "button"
   */
  type?: 'item' | 'button'
}

export abstract class Plugin<T extends Record<string, any> = {}>
  extends Component {

  private _settings: PluginSettings<T>

  get settings() {
    if (!this._settings) {
      throw Error('[Plugin] Use `registerSettings()` register `PluginSettings` instance before using `settings`.')
    }
    return this._settings
  }

  constructor(
    protected app: App,
    public manifest: PluginManifest,
    private config = useService('config-repository'),
  ) {
    super()
  }

  async load() {
    if (this._loaded) return
    this._loaded = true
    try { await this.onload(); for (const child of this._children) await child.load() }
    catch (error) { await this.unload(); throw error }
  }

  async unload() {
    const was_loaded = this._loaded
    if (!was_loaded && !this._disposables.length && !this._children.length) return
    this._loaded = false
    const errors: unknown[] = []
    try { if (was_loaded) await this.onunload() } catch (error) { errors.push(error) }
    for (const dispose of this._disposables.splice(0).reverse()) try { await dispose() } catch (error) { errors.push(error) }
    for (const child of this._children.splice(0).reverse()) try { await child.unload() } catch (error) { errors.push(error) }
    if (errors.length) console.error('社区插件清理异常', this.manifest.id, errors)
  }

  get dataPath() {
    return path.join(this.config.dataDir, `${this.manifest.id}.json`)
  }

  registerSettings(settings: PluginSettings<any>) {
    this._settings = settings
    this._settings.load()
  }

  registerSettingTab(tab: SettingTab) {
    this.register(
      (this.app as any).community_plugins.register_setting_tab(this.manifest.id, tab))
  }

  /**
   * ActualCommand.id = `${this.manifest.id}:${command.id}`
   */
  registerCommand(command: Command) {
    command.id = this.manifest.id + ':' + command.id
    command.title = this.manifest.name + ': ' + command.title
    this.register(
      this.app.commands.register(command))
  }

  /**
   * @deprecated Use `this.register(app.features.markdownEditor.on(...))` instead.
   */
  registerMarkdownEvent(...args: Parameters<MarkdownEditor['on']>) {
    this.register(
      useService('markdown-editor').on(...args))
  }

  /**
   * @deprecated Use `this.register(app.features.markdownEditor.preProcessor.register(...))` instead.
   */
  registerMarkdownPreProcessor(processor: TPreProcessor) {
    this.register(
      useService('markdown-editor').preProcessor.register(processor))
  }

  /**
   * @deprecated Use `this.register(app.features.markdownEditor.postProcessor.register(...))` instead.
   */
  registerMarkdownPostProcessor(processor: TPostProcessor) {
    this.register(
      useService('markdown-editor').postProcessor.register(processor))
  }

  /**
   * @deprecated Use `this.register(app.features.markdownEditor.suggestion.register(...))` instead.
   */
  registerMarkdownSugguest(suggest: EditorSuggest<any>) {
    this.register(
      useService('markdown-editor').suggestion.register(
        suggest
      ))
  }

  registerScript(relativePath: string) {
    this.register(this.importScript(relativePath))
  }

  importScript(relativePath: string) {
    const script = document.createElement('script')
    script.dataset.by = this.manifest.id
    script.src = 'file://' + path.join(this.manifest.dir!, relativePath)
    document.head.appendChild(script)
    return () => script.remove()
  }

  registerCss(relativePath: string) {
    this.register(this.importCss(relativePath))
  }

  importCss(relativePath: string) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.dataset.by = this.manifest.id
    link.href = 'file://' + path.join(this.manifest.dir!, relativePath)
    document.head.appendChild(link)
    return () => link.remove()
  }

  addStatusBarItem(options?: StatusBarItemOptions) {
    options ??= { position: 'left' }
    const { hint = '', type = 'button' } = options

    const btnCls = 'workspace-footer-control'
    const el = $(`<div class="footer-item footer-item-${options.position} ${btnCls}" ty-hint="${hint}" aria-label="${hint}">`)
      .appendTo($('footer.ty-footer'))
      .get(0)

    el.setAttribute("data-workspace-interaction", type === "button" ? "action" : "none")
    this.register(() => el.remove())
    return el
  }
}
