import './file-tabs.scss'
import { useService } from "src/common/service"
import path from "src/path"
import { Tab, TabContainer } from "src/ui/components/tabs"



export class FileTabContainer extends TabContainer {

  static hideTabExtension(isHide: boolean) {
    $(document.body).toggleClass('typ-file-ext--hide', isHide)
  }
}

export class UntitledTab extends Tab {
  constructor() {
    const shortName = 'Untitled'

    super({
      id: '',
      text: () => tab_label(shortName),
      title: shortName,
    })
  }
}

export class FileTab extends Tab {
  constructor(filePath: string, vault = useService('vault')) {
    const isUri = filePath.startsWith('typ://')
    const longPath = isUri ? filePath : simplifyFilePath(vault.path, filePath)
    const ext = path.extname(filePath)
    const shortName = path.basename(longPath, ext)

    super({
      id: filePath,
      text: () => tab_label(shortName, ext),
      title: isUri ? shortName : longPath,
    })
  }
}

function simplifyFilePath(root: string, filePath: string) {
  return path.relative(root, filePath)
    .replace(/(\.textbundle)[\\/]text\.(?:md|markdown)$/, '$1')
}

/** 文件名作为文本写入；完整名称由标签布局按可用空间裁剪。 */
function tab_label(name: string, extension = '') {
  return $('<i class="typ-file-icon fa fa-file-o"></i>')
    .add($('<span class="typ-file-basename"></span>').text(name))
    .add($('<span class="typ-file-ext"></span>').text(extension))
}
