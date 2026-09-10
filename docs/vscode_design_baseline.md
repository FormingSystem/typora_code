# VS Code 界面设计基线

当前产品按用户确认，以 `59412a2` 为平直布局和功能范围参考，保留稳定修复，并非恢复整库旧提交。本文中的VS Code数值是此前已核对的研究事实，不再作为强制Modern改造或无限功能扩充目标。

当前界面：Typora 标准原生窗口及七菜单、48px连续活动栏、35px编辑标签条、26px Explorer树行和22px SCM行；Explorer没有Open Editors和紧凑目录链，大纲独立；Explorer与真实文件标签使用固定Seti，大纲保留原始fa-list。搜索单击下方预览、双击打开；终端默认down编辑组，不提供底部Panel；SCM不增加文件筛选框。中央Git Graph保留已验证的扩展布局与正确性修复。

编辑标签条使用13px Segoe UI与Light 2026／Dark 2026状态颜色；Ctrl+P及标签条右侧入口打开 `440ec3f` 中的文件选择器。选择器当前宽度为 `min(62vw, 600px, calc(100vw - 12px))`，最大高度为 `min(70vh, 560px)`；结果行22px、输入框23px。`440ec3f` 是历史提交标识，不是440px尺寸。系统标题与窗控由Typora管理，不应用自绘标题35px或18px窗控规则。renderer快捷键目标已通过，原生冲突仍在验证。

## 已核对的VS Code参考资料

研究核对日期为 2026-09-09：**VS Code 1.136.2，提交 `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`，Light 2026，Modern UI，默认布局密度**。软件版本取自本机发行文件，主题和编辑器字体取自有效用户配置；Modern UI 取自本机实验配置中实际生效的 `config.workbench.experimental.modernUI=true`，不是只看设置文件中的缺省值。

[机器可读研究记录](../enhancements/src/vscode_design_baseline.json)保存曾核对的数值，是否用于当前运行时以实际入口为准；[来源与摘要清单](vscode_design_sources.json)记录固定源码和取证方式；[图标槽位表](icon_mapping.md)记录冻结版实际使用的官方图标。截图只能帮助发现遗漏，不能替代源码数值。

| 上游对象 | 已核对参考值与语义 | 固定版本依据 |
| --- | --- | --- |
| 工作台正文、菜单与文件名 | 13px / 400；Windows Segoe WPC、Segoe UI，中文采用上游 Microsoft YaHei 回退 | [工作台字体](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/media/style.css)、[Modern 字体层级][font] |
| 侧栏标题、分区标题 | 12px / 600 | [Modern 字体层级][font] |
| 数字徽标 | 10px / 400；不能让正文的13px覆盖 | [Modern 字体层级][font] |
| 源码编辑器 | 本机 `editor.fontSize=16`、Consolas/Microsoft YaHei/Courier New；行高由编辑器默认值计算 | 本机有效编辑器配置；已提炼到运行基线 |
| 常规命令图标 | 官方 Codicons，通常16px；按控件角色保留原字形及状态 | [工作台图标规则](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/media/style.css)、[图标槽位表](icon_mapping.md) |
| 文件类型图标 | 本机内置 `vs-seti` 主题的 JSON 映射、字形、light颜色覆盖；这是上游主题事实；按最新用户要求用于本项目Explorer与真实文件标签，不覆盖SCM及大纲专属图标 | [内置 Seti](https://github.com/microsoft/vscode/tree/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/extensions/theme-seti) |
| 活动栏 | Modern目标36×36px、图标24px、目标之间8px、选中背景32×32px；44px卡片加外侧4px占位 | [活动栏常量][activity]、[Modern 活动栏][activity_style] |
| 分区标题 / 文件树行 | Modern分区标题28px；文件树行22px，不共用一个行高 | [Modern初始化][modern]、[Explorer行高][explorer] |
| 卡片间距、边框与圆角 | 外边距4px、相邻卡片间距4px、内侧0px、边框1px、大圆角8px；共享边界按上游去掉对应圆角/重复边框 | [布局常量][layout]、[浮动面板][floating]、[尺寸注册][sizes] |
| 小控件圆角 | small4px、medium6px、large8px，按对应控件源码选取 | [尺寸注册][sizes] |
| 滚动条 | Modern UI默认8px | [Modern初始化][modern] |
| 窗口缩放 | 当前用户和仓库未覆写 `window.zoomLevel`，配置基线0；系统DPI与截图像素比单独记录 | 固定版本窗口配置；不能用CSS transform弥补错误尺寸 |
| 颜色 | Light 2026及其继承规则；现代活动项使用 `modernActivityBarItem.*`，不能误套经典 `activityBar.*` | [Light 2026][light]、[主题角色][theme] |
| Git Graph | 固定扩展v1.30.0的布局/设置，工作台边框与字体采用上述宿主基线 | [Git Graph矩阵](../enhancements/git_graph_features.md) |

每次界面变更先定位上游规则、状态和生效分支，记入对应矩阵再实现。验证要区分实际CSS布局像素、DPI、窗口zoom、视口和内容滚动，不把不同缩放下的截图尺寸直接相减。宽度随用户拖动的侧栏与编辑组按比例与约束验证，不把截图中的某个拖动位置写死。

链接悬停提示采用固定版本 [hoverWidget.css](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/base/browser/ui/hover/hoverWidget.css) 的 `4px 8px` 内边距、`500px` 最大内容宽度及 `1.5` 行高，背景和边框读取 Light/Dark 2026 的 `editorHoverWidget.*`。显示延迟为用户指定的 **1000ms**，不是 VS Code 默认延迟；浮层仅显示链接目标，不修改 Typora 正文 DOM、读取目标文件或访问网络。

当前表是设计依据，不是全功能或全视觉验收完成声明。完整源码取值、实际样式应用、隐藏Electron交互、真实Typora窗口和同DPI成对截图属于不同证据层；缺哪一层就在[工作台矩阵](workbench_parity.md)中保留缺口。

[font]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/modernUI/browser/media/fontRamp.css
[activity]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/parts/activitybar/activitybarPart.ts
[activity_style]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/modernUI/browser/media/activityBar.css
[modern]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/modernUI/browser/modernUI.contribution.ts
[explorer]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/files/browser/views/explorerViewer.ts
[layout]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/services/layout/browser/layoutService.ts
[floating]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/media/floatingPanels.css
[sizes]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/platform/theme/common/sizes/baseSizes.ts
[light]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/extensions/theme-defaults/themes/2026-light.json
[theme]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/common/theme.ts
