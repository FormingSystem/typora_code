import {File, editor, reqnode} from "typora"

import {Notice} from "src/ui/components/notice"

let pending_path: string | undefined
let revision = 0

/** 原生编辑器只有一个加载槽；迟到的旧加载事件不能抢回用户最新选择。 */
export function pending_markdown_open() { return pending_path }
export function request_markdown_open(path: string, valid: () => boolean) {
  const token = ++revision
  pending_path = path
  let timer: ReturnType<typeof setTimeout> | undefined
  const file = File as any
  const current = () => token === revision && valid()
  const finish = () => { if (token === revision) pending_path = undefined }
  const open = () => {
    if (!current()) { finish(); return }
    if (file.isFileLoading?.() || file._onInitParse || file._onFileSwitching) {
      timer = setTimeout(open, 16)
      return
    }
    // 此处仍使用原生保存/取消流程，绝不清除脏状态或替换正文。
    if (file.bundle?.filePath !== path) {
      ;(editor.library as any)[Symbol.for('openFile$original')](path)
    }
    finish()
  }
  // 历史后台标签可能已被移走；读取元数据失败不能交给宿主清空正文。
  if (path && reqnode) {
    void (reqnode('fs') as typeof import('fs')).promises.stat(path).then(stat => {
      if (!current()) return
      if (!stat.isFile()) throw new Error('目标不是普通文件。')
      open()
    }).catch(error => { if (current()) { finish(); new Notice('无法打开文件：' + String(error), 6000) } })
  } else open()
  return () => { clearTimeout(timer); if (token === revision) { revision++; pending_path = undefined } }
}
