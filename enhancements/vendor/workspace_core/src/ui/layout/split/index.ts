import './index.scss'
import { WorkspaceParent } from '../workspace-parent'
import type { WorkspaceNode } from '../workspace-node'


export type Direction = 'horizontal' | 'vertical'

export class WorkspaceSplit extends WorkspaceParent {

  type = 'split'

  private sizes: number[] = []

  constructor(public direction: Direction) {
    super()

    $(this.containerEl).addClass('typ-workspace-split')
    this.setDirection(direction)
  }

  setDirection(direction: Direction) {
    this.direction = direction
    $(this.containerEl)
      .removeClass(['mod-horizontal', 'mod-vertical'])
      .addClass(`mod-${direction}`)
  }

  insertChild(index: number, child: WorkspaceNode): void {
    const prevChild = this.children[index - 1] ?? this.children[index]
    const prevSizeIdx = this.children.findIndex(c => c === prevChild)

    super.insertChild(index, child)

    if (this.children.length === 1) {
      this.sizes.push(1)
    }
    else {
      const avgWidth = this.sizes[prevSizeIdx] / 2
      this.sizes[prevSizeIdx] = avgWidth
      this.sizes.splice(index, 0, avgWidth)
    }
    this.updatePaneSizes()
  }

  protected _insertChildEl(index: number, child: WorkspaceNode) {
    this.containerEl.insertBefore(child.containerEl, this.containerEl.children[index + 1])
  }

  removeChild(child: WorkspaceNode) {
    const removed_index = this.children.indexOf(child)
    if (removed_index < 0) return
    const [released_size] = this.sizes.splice(removed_index, 1)
    super.removeChild(child)

    if (this.children.length) {
      const shared_size = released_size / this.children.length
      this.sizes = this.sizes.map(size => size + shared_size)
      this.updatePaneSizes()
    }

    if (this.children.length === 1) {
      this.parent?.replaceChild(this, this.children[0])
    }
  }

  replaceChild(previous: WorkspaceNode, next: WorkspaceNode) {
    if (!this.children.includes(previous)) return
    super.replaceChild(previous, next)
    // 嵌套分栏展开/收回后，新节点继续占用父分栏原来的份额。
    this.updatePaneSizes()
  }

  onChildResizeStart(child: WorkspaceNode, e: MouseEvent) {
    let dragging = true
    const isVertical = this.direction === 'vertical'
    const splits = this.children
    const idx = process.env.IS_DEV
      ? splits.findIndex(c => c.containerEl === child.containerEl)
      : splits.findIndex(c => c === child)

    if (idx <= 0) return
    const leftIdx = idx - 1

    const containerRect = this.containerEl.getBoundingClientRect()
    const totalPixel = isVertical ? containerRect.width : containerRect.height
    if (totalPixel <= 0) return

    const leftDom = splits[leftIdx].containerEl
    const rightDom = splits[idx].containerEl
    const leftW = isVertical ? leftDom.offsetWidth : leftDom.offsetHeight
    const rightW = isVertical ? rightDom.offsetWidth : rightDom.offsetHeight
    const startPos = isVertical ? e.clientX : e.clientY
    const pair_pixels = leftW + rightW
    const pair_size = this.sizes[leftIdx] + this.sizes[idx]
    const minimum_pixels = Math.min(120, pair_pixels / 2)

    document.onmousemove = (e2) => {
      if (!dragging) return;
      const curPos = isVertical ? e2.clientX : e2.clientY
      const deltaPx = curPos - startPos

      const left_pixels = Math.min(pair_pixels - minimum_pixels, Math.max(minimum_pixels, leftW + deltaPx))
      this.sizes[leftIdx] = pair_pixels > 0 ? pair_size * left_pixels / pair_pixels : pair_size / 2
      this.sizes[idx] = pair_size - this.sizes[leftIdx]

      this.updatePaneSizes()
    }

    document.onmouseup = () => {
      dragging = false
      document.onmousemove = document.onmouseup = null
    }
  }

  private updatePaneSizes() {
    this.children.forEach((child, i) => {
      const dom = child.containerEl
      dom.style.flex = "0 0 auto"
      if (this.direction === 'vertical') {
        dom.style.flexBasis = (this.sizes[i] * 100) + "%"
      } else {
        dom.style.flexBasis = (this.sizes[i] * 100) + "%"
      }
    })
  }
}
