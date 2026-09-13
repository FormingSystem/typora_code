# 文件标签与编辑器顶部

## R034 问题与目标

2026-09-13，用户以 VS Code 的单个 Markdown 预览和多标签工作区差异截图为准，要求统一文件打开后的顶部界面。采用紧凑圆角标签、完整文件名、真实预览／修改／固定状态及悬停关闭动作。此次授权替代该区域早先的平直标签、35px 高度和顶部黑色指示线约定；其余区域仍遵守既有范围。

## 固定来源与采用值

本机只读核对 VS Code 1.137.0、提交 `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`，用户设置为 Light 2026。用户截图展示 Modern UI 标签，本次明确采用这一模块，不以软件升级自动启用其他 Modern UI 布局。

| 来源 | 采用规则 | 本地落点 |
| --- | --- | --- |
| [Modern tabs](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/modernUI/browser/media/tabs.css) | 32px 连续命中行，24px 圆角底色，左右2px底色内缩；左6px、右8px，固定／修改时右28px；关闭动作覆盖24px列，不因悬停增减标题布局宽度 | `workspace_tab_controls` |
| [尺寸变量](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/theme/common/sizes/baseSizes.ts) | 13px 正文字号、4px圆角；16px图标加两侧2px按钮内边距 | 共用交互角色与标签布局 |
| [主题角色](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/common/theme.ts)、[Light 2026](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/theme-defaults/themes/2026-light.json)、[Dark 2026](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/theme-defaults/themes/2026-dark.json) | 编辑器底色；活动标签使用 inactiveSelection，非活动字色为foreground的50%；活动与非活动组共用Modern状态配色；关闭覆盖层使用合成后的不透明底色 | 共用主题变量，无整行黑线或标签间竖边框 |
| [breadcrumbsControl](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/parts/editor/breadcrumbsControl.ts)、[路径栏样式](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/parts/editor/media/breadcrumbscontrol.css) | 22px路径行，右侧11px编辑器类型，窄组内裁剪；编辑动作与标签同一行 | Git差异及源码查看器路径行 |

完整缓存及摘要保存在本次忽略的研究目录，运行时不访问上游。产品图标仍使用固定 Codicons，文件类型仍由既有 Seti 关联决定。

## 交互与职责

- 原标签节点、分组、叶子、滚动容器和委托事件保持身份；展示层只包装标题和动作。悬停、活动和键盘焦点不改变标题或相邻标签的位置；文件名由真实路径生成，取消20字符预截断，超出组宽由CSS裁剪，原路径仍可悬停查阅。
- 关闭使用原关闭槽和共享文件服务；按钮呈现官方 close，显示“关闭（Ctrl+F4）”。修改标记占同一个动作位置，悬停后可关闭；固定标签使用已有取消固定动作。保存、取消、失败和重命名仍由文件服务拥有。取消关闭保持文档和标签，绝不伪造保存成功。
- 临时文件标签继续由 `workspace_preview` 控制临时状态与斜体；Markdown实际文件标签统一显示文件类型图标及文件名，原生编辑与后台阅读视图均不添加“预览”前缀或预览产品图标。源文件及diff也继续使用真实文件图标。键盘可进入标签、切换相邻标签并激活，关闭槽可用Enter／空格触发原动作。
- `workspace_tab_controls` 统一几何、标签语义及清理；`workspace_file_icons` 统一管理真实文件类型图标，标签适配器不根据编辑／阅读模式替换文件身份；文件服务和编辑器动作层继续拥有数据及命令。关闭工具提示复用既有公共提示，不增设第二套业务状态。
- 差异编辑器保留同组右侧的实际工具按钮，路径行显示当前文件及版本说明，并保留内联／并排切换菜单。下述追加授权将路径行统一为可交互面包屑，并覆盖 Markdown 标题及源码符号；原有差异模式动作保留。不引入无实际提供者的 AI 或扩展商店入口。

## 验收

使用生产core验证单／多标签、完整及特殊字符文件名、空叶子、预览、修改、固定、多个编辑组、明暗主题、窄宽、滚动与拖动。用真实指针移动比较标题和相邻标签的矩形，验证关闭子图标、键盘焦点、动态重命名和销毁恢复。差异与源码检查工具栏同高、路径行裁剪和模式菜单，保留关闭取消与模型生命周期回归。原生Typora隔离实例检查正文视口、顶端定位及截图；自动化结果与用户实际窗口加载状态分开记录。

## R034 标题与函数面包屑

2026-09-13，用户追加目录、文件、标题链和下拉标题树截图，明确此处用于标题及函数定位，要求布局、样式和配置遵循 VS Code。替代上一版只显示静态路径和省略 Markdown 路径行的范围。

### 来源、布局与交互

继续固定 VS Code 1.137.0 提交 `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`。采用 [配置注册](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/parts/editor/breadcrumbs.ts)、[路径及符号模型](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/parts/editor/breadcrumbsModel.ts)、[选择器](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/parts/editor/breadcrumbsPicker.ts) 和前述路径栏样式的规则。

标签下方统一为 22px 单行导航，13px文字、16px图标；右端仅在 Markdown 可切换视图或差异模式可操作时显示入口，普通源码不显示无其他提供者的切换器。工作区内路径从根目录下一层开始，外部文件显示绝对路径。文件夹、文件和符号使用箭头分隔，窄组保持单行横向滚动，当前末端可见；悬停改变前景，焦点／打开的项目用下划线，采用公共主题变量。每组跟随本组活动叶子，差异视图跟随最近聚焦的一侧，不混用当前磁盘正文与历史模型。

点击目录或文件打开所属目录列表，按需读取目录项、不读取文件正文；点击符号打开文档符号树，含层级展开／折叠、过滤、位置／名称／类型排序，点击或 Enter 定位。符号列表显示整棵当前文档树并展开当前祖先，避免只显示路径而没有实际导航。方向键移动，左右折叠／展开；导航栏左右键切换段，Enter／向下打开列表。Ctrl+Shift+. 聚焦并打开末端，Ctrl+Shift+; 聚焦末端。选择器采用22px行、最大300px及70%视口高度、最小240px且不超视口的宽度，超长标签末端裁剪。

Escape 取消并恢复先前编辑器焦点和选区；外部点击／焦点离开关闭，保留用户点击目标的焦点。切换文件、模型、编辑组销毁及窗口缩放取消旧列表；异步目录／符号结果按所有者与版本验收。选择仅在确认条目时导航，不在悬停时改变正文；关闭失败提示不替换当前文件。弹层使用共同关闭与焦点机制，不另装全局关闭规则。

### 职责与配置

`workspace_breadcrumbs` 管理每个编辑组的导航及当前选择器；文件打开仍交给 `workspace_files`。`workspace_document_symbols` 按实际 Monaco 模型、文件和解析环境共享带版本的符号快照，现有代码大纲和面包屑订阅同一提供者。C/C++ 使用既有 clangd，其他已有语法语言使用既有 Tree-sitter；Markdown 源码从 marked 词法结果提取标题，忽略围栏内的伪标题。原生 Markdown 读取实际标题节点，当前阅读标题复用原生大纲唯一判定，选择标题后同步该判定。原生正文归属按文件身份和编辑模式核对，另一组获得焦点仍保留其标题链；在非活跃组选择标题时，先激活所属组再恢复正文光标。无提供者时说明当前语言不提供符号，不伪造函数。

配置由 `workspace_breadcrumbs_settings` 统一解析默认值、用户值、工作区覆盖及语言覆盖，写入既有用户设置存储，不向文档目录写配置文件；恢复默认删除当前层覆盖并回退到上层，写入失败保留原有效配置。路径与符号显示提供 on/off/last，默认 on；enabled、icons、show_editor_type 默认 true；symbol_sort_order 默认 position，可选 name/type；符号复制分隔符默认点号，可为空；分隔符、符号排序和种类开关均支持语言覆盖。符号种类开关默认 true，影响树和导航。设置入口为导航右键及视图菜单，保存后立即刷新所有组，当前组的工作区键取实际文件服务上下文。自有设置字段使用 snake_case，文档对应 VS Code 的 breadcrumbs.enabled/filePath/symbolPath/icons/showEditorType/symbolSortOrder/symbolPathSeparator/show*；不声称承载 VS Code 扩展设置引擎。

### 验收与失败边界

生产绑定覆盖 Markdown 原位／阅读／源码、代码函数及嵌套类、diff 两侧、多个组；光标／阅读位置同步、重复标题、围栏伪标题、非ASCII、修改后版本失效、快速换文件和慢目录结果丢弃；取消不改正文、编辑器模型及选区继续有效。检查主题、窄宽、100%／125%缩放、零符号、长路径、键盘及鼠标打开／关闭、设置覆盖／重置与销毁清理。原生 Typora 隔离实例复查实际正文边界和标题跳转，验收与安装状态见反馈记录。

## R034 Markdown文件标签语义纠正

2026-09-13，用户明确Typora的Markdown顶部标签应显示正常MD文件图标，不采用VS Code的Markdown Preview称谓。本次替代此前按`isEditor()`添加预览图标和“预览”前缀的展示约定；VS Code布局参考不代表照搬其不同编辑模型的名称。移除标签层的预览DOM、状态类与隐藏文件图标规则，复用已有Seti文件图标及关联，不新增图标来源。底层单个原生编辑器、后台阅读视图、临时标签、固定、未保存和关闭行为继续由原服务管理。

图标来源沿用[Seti固定版本](icon_mapping.md)：VS Code1.136.2提交`88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`的Seti10.0.0原始字体与文件关联。验收多Markdown标签活动／非活动切换、不同编辑组、名称和图标一致、正常文件名包含“预览”仍保留、真实临时状态斜体，以及明暗／窄窗／缩放、关闭与原生宿主回归。
