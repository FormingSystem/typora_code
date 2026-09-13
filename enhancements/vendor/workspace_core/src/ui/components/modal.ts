import {capture_workspace_focus,register_workspace_escape,type workspace_focus_snapshot,type workspace_escape_layer} from "../../../../../src/workspace_focus"
import './modal.scss'
import { Closeable, View } from "src/ui/common/view"
import { html } from 'src/utils'


interface ModalProps {
  className?: string
}

export class Modal extends View implements Closeable {

  modal: HTMLElement
  header?: HTMLElement
  body: HTMLElement
  footer?: HTMLElement

  private previous_focus?:workspace_focus_snapshot
  private escape_layer?:workspace_escape_layer
  private opened=false

  private closeListeners: Array<() => void> = []

  constructor(props: ModalProps) {
    super()

    this.containerEl =
      $('<div class="typ-modal__wrapper middle stopselect" style="display: none;"></div>')
        .on('click', event => {
          if (event.target !== this.containerEl) return
          this.close(false)
        })
        .append(this.modal =
          $(`<div class="typ-modal ${props.className ?? ''}"></div>`)
            .append(this.body =
              html`<div class="typ-modal__body"></div>`
            )
            .get(0),
        )
        .get(0)

    document.body.append(this.containerEl)
  }

  setHeader(text: string) {
    if (!this.header) {
      this.header = html`<div class="typ-modal__header">${text}</div>`
      this.modal.prepend(this.header)
    }
    else {
      this.header.textContent = text
    }
    return this
  }

  setBody(build: (body: HTMLElement) => void) {
    build(this.body)
    return this
  }

  setFooter(build: (footer: HTMLElement) => void) {
    if (!this.footer) {
      this.footer = html`<div class="typ-modal__footer"></div>`
      this.modal.append(this.footer)
    }
    else {
      this.footer.innerHTML = ""
    }

    build(this.footer)
    return this
  }

  onClose(callback: () => void) {
    this.closeListeners.push(callback)
    return this
  }

  open() {
    if(this.opened)return
    this.opened=true
    this.previous_focus=capture_workspace_focus()
    this.containerEl.style.display = ""
    this.escape_layer=register_workspace_escape(()=>[this.containerEl],()=>this.close())
  }

  close(restore=true) {
    if(!this.opened)return
    const owned=this.escape_layer?.owns_focus()
    this.opened=false
    this.escape_layer?.dispose()
    this.escape_layer=undefined
    this.containerEl.style.display = "none"
    // 隐藏前保存的所属焦点只在本层取消时恢复；外部点击不重写编辑选区。
    $('input', this.containerEl).each((i, el) => el.blur())
    if(restore&&owned)this.previous_focus?.restore()
    this.previous_focus=undefined
    this.closeListeners.forEach(callback => callback())
  }
}
