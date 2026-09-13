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
- 临时文件预览继续由 `workspace_preview` 控制斜体；Markdown阅读预览按真实视图模式显示预览图标与前缀，避免把所有Markdown误标成只读。源文件及diff仍使用真实文件图标。键盘可进入标签、切换相邻标签并激活，关闭槽可用Enter／空格触发原动作。
- `workspace_tab_controls` 统一几何、标签语义及清理；`workspace_file_icons` 管理真实文件类型图标，标签适配器根据视图模式管理预览图标；文件服务和编辑器动作层继续拥有数据及命令。关闭工具提示复用既有公共提示，不增设第二套业务状态。
- 差异编辑器保留同组右侧的实际工具按钮，路径行显示当前文件及版本说明，并保留内联／并排切换菜单。Markdown原位阅读不添加多余路径行。此次不引入未接线的AI工具、扩展商店入口或符号选择服务。

## 验收

使用生产core验证单／多标签、完整及特殊字符文件名、空叶子、预览、修改、固定、多个编辑组、明暗主题、窄宽、滚动与拖动。用真实指针移动比较标题和相邻标签的矩形，验证关闭子图标、键盘焦点、动态重命名和销毁恢复。差异与源码检查工具栏同高、路径行裁剪和模式菜单，保留关闭取消与模型生命周期回归。原生Typora隔离实例检查正文视口、顶端定位及截图；自动化结果与用户实际窗口加载状态分开记录。
