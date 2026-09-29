import {File, editor, reqnode} from "typora"

import {Notice} from "src/ui/components/notice"
import {useService} from "src/common/service"

let pending_path: string | undefined
let revision = 0

/** The native editor has only one loading slot; late-old loading events cannot reclaim the user's latest selection. */
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
    // The native save/cancel process is still used here; dirty status is never cleared or the document content is never replaced.
    if (file.bundle?.filePath !== path) {
      ;(editor.library as any)[Symbol.for('openFile$original')](path)
    }
    finish()
  }
  // Historical background tabs may have been removed; reading metadata failure cannot be handed over to the host to clear the document content.
  if (path && reqnode) {
    void (reqnode('fs') as typeof import('fs')).promises.stat(path).then(stat => {
      if (!current()) return
      if (!stat.isFile()) throw new Error(useService('i18n').t.workspace.not_regular_file)
      open()
    }).catch(error => { if (current()) { finish(); new Notice(useService('i18n').t.workspace.open_file_failed + String(error), 6000) } })
  } else open()
  return () => { clearTimeout(timer); if (token === revision) { revision++; pending_path = undefined } }
}
