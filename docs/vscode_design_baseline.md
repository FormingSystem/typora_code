# VS Code 界面设计基线

2026-09-24 R020.1/R034.8/R034.9：按用户要求克隆最新VS Code，固定 `68070681e87284e2f22728f15fe3f3651fbf932b`（package 1.140.0，main开发快照，不是稳定发行版）。本次现有工作台采用 Light/Dark 2026 的完整语义配色，覆盖下面R074旧Modern颜色；布局和尺寸保留各区域的已确认契约。列表选中/焦点/悬停共用模型和透明色，不再按Git/Explorer分别设计。源码文件及SHA256见[来源清单](vscode_design_sources.json)的selection_diff_20260924，逐项采用规则见[共享选择](workspace_interaction.md#r020-列表与树的共享选择)和[颜色对照](workspace_colors.md#2026-09-24-最新源码逐项对照)。研究缓存不参与运行。

2026-09-23 R074：用户重新授权统一功能区域的颜色层次。工作台颜色改用同一固定提交的 Light Modern／Dark Modern，框架 `#F8F8F8`／`#181818`、功能内容 `#FFFFFF`／`#1F1F1F`、分隔 `#E5E5E5`／`#2B2B2B`；以下旧2026颜色记录被本项覆盖，几何与布局约定保留。Markdown、原生偏好与社区设置仍由原主题/所有者呈现。范围、状态映射及验证见[颜色设计](workspace_colors.md)。

2026-09-10 顶栏回归修复：Windows／Linux 活动栏采用与编辑区相同的 `--typ-workspace-top` 上边界及可用窗口底边，修正核心 `100vh` 从 y=0 开始被35px顶栏遮住首个按钮的问题；48px功能行与24px官方图标保持。Typora原始64px标识位图含透明边距，按用户要求将图像框由16px改为24px，左右边距改为4px，总占位仍为32px。

模块边界采用固定 Light 2026／Dark 2026 的 `sideBar.border`、`editorGroupHeader.tabsBorder`、`statusBar.border` 共用值 `#F0F1F2`／`#2A2B2C`，侧栏和状态栏背景取 `sideBar.background` 的 `#FAFAFD`／`#191A1B`。实现见 `workspace_chrome.css`：侧栏拖拽线不再读取最大化时会变透明的宿主 `--window-border-color`，标签条下沿与状态栏上沿使用1px细线，不新增卡片、圆角或全局留白。活动栏目标验证覆盖0／35px顶距、窗口尺寸变化、125%／150%缩放、Explorer与底部按钮真实点击以及最大化明暗主题边界；标题栏目标核对24px标识和原菜单占位。

当前产品按用户确认，以 `59412a2` 为平直布局和功能范围参考，保留稳定修复，并非恢复整库旧提交。本文中的VS Code数值是此前已核对的研究事实，不再作为强制Modern改造或无限功能扩充目标。

搜索与拖动的当前实现分别见[大目录搜索性能](search_performance.md)和[左键拖动与独立窗口](drag_and_windows.md)。搜索借鉴独立匹配与流式结果职责，不接入VS Code扩展后端；标签按固定 VS Code 的原生 HTML DnD、标签图像及实际窗口边界实现，移除30px离组规则；独立窗口使用Typora宿主。活动栏保留6px起拖。

当前界面：Typora 无边框窗口与35px单行顶栏（Typora七类菜单及终端）、48px连续活动栏、35px编辑标签条、26px Explorer树行和22px SCM行；Explorer没有Open Editors和紧凑目录链，大纲独立；Explorer与真实文件标签使用固定Seti，大纲保留原始fa-list。搜索单击下方预览、双击打开；2026-09-12 按最新要求，终端默认独立底部面板并可搬移到编辑器；SCM不增加文件筛选框。中央Git Graph保留已验证的扩展布局与正确性修复。

编辑标签条使用13px Segoe UI与Light 2026／Dark 2026状态颜色；Ctrl+P及顶栏中央搜索入口打开 `440ec3f` 中的文件选择器。选择器当前宽度为 `min(62vw, 600px, calc(100vw - 12px))`，最大高度为 `min(70vh, 560px)`；结果行22px、输入框23px。`440ec3f` 是历史提交标识，不是440px尺寸。单行顶栏35px、菜单行24px、搜索框22px、窗控按钮46px宽，取自固定 VS Code 对应源码；原窗口动作由宿主处理。物理键盘与原生 accelerator 的冲突尚未实证；验证记录见[反馈复查记录](feedback_review.md)。

差异编辑器的前后改动、打开版本／文件、查找与更多动作位于所属编辑组的标签行右侧，使用16px Codicons和24px按钮；切换到其他类型标签时撤下该组差异动作。下方保留26px高、13px字体的版本路径行：并排模式分别显示旧、新版本，内联模式同一行显示两版及模式入口。26px是本工作台的紧凑路径行取值，不宣称所有VS Code版本都采用相同高度。

自动布局采用固定VS Code及Monaco 0.56.0的[差异选项默认值][diff_options]：`renderSideBySideInlineBreakpoint=900`、`useInlineViewWhenSpaceIsLimited=true`。普通显示模式下，手动选项为并排时，实际差异编辑器宽度不超过900 CSS px就使用内联，超过900 CSS px恢复并排；依据的是所在编辑组内的编辑器宽度，不是整个窗口宽度。标题跟随Monaco实际渲染模式更新。手动内联与自动窄幅切换独立；手动内联不会因组变宽而恢复并排。`splitViewDefaultRatio=0.5`仅表示初始左右版本各占一半，不参与900px阈值计算。

差异更多菜单接入Monaco实际支持的隐藏未修改区域、`experimental.showMoves`、空间不足时内联和无障碍查看器。`F7`／`Shift + F7`使用无障碍差异查看器的下一处／上一处；普通前后改动保留标签行箭头。模式切换保留当前选择与查看位置，不为未实现的工作台功能添加占位按钮。

## 已核对的VS Code参考资料

2026-09-12 文件与终端采用值仍取自下面固定提交：

| 对象 | 采用值 | 上游位置与本机边界 |
| --- | --- | --- |
| 文件树缩进 | 每级8px；文件行没有空展开槽 | `src/vs/platform/list/browser/listService.ts`、`src/vs/workbench/browser/parts/views/media/views.css`；保留本工作台26px行高 |
| Explorer 与终端弹出菜单 | 13px字体、24px行高、上下4px内边距 | `src/vs/base/browser/ui/menu/menu.ts`；共同组件应用同一几何 |
| 终端面板 | 初始高度占可用高度40%，用户可调；顶栏35px | `src/vs/workbench/browser/parts/panel/panelPart.ts` 及工作台面板标题规则；扣除本宿主标题栏和底栏 |
| 终端会话与工具图标 | 列表22px行高，16px字形，22px操作目标 | `src/vs/workbench/contrib/terminal/browser/media/terminal.css`；列表默认120px、窄模式46px，拖动边界见下文R006.1 |
| 终端活动栏入口 | 24px字形，48px点击目标 | `activitybarPart.ts` 的 `ICON_SIZE=24`；48px采用当前已确认的连续活动栏功能行，面板工具仍为16px |
| 终端配置默认 | Windows字号14、缓冲1000行、最小对比度4.5、列表在右侧、单会话时隐藏 | `src/vs/workbench/contrib/terminal/common/terminalConfiguration.ts`；实际设置范围见[终端说明](terminal_operations.md) |

系统文件／文件夹选择窗口调用 Typora 1.14.9 已有 `dialog.showOpenDialog`；本地代码不绘制一个路径输入框替代系统选择。菜单行为与服务职责见[文件操作](file_operations.md)和[工作台架构](workspace_architecture.md)。

研究核对日期为 2026-09-09：**VS Code 1.136.2，提交 `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`，Light 2026，Modern UI，默认布局密度**。软件版本取自本机发行文件，主题和编辑器字体取自有效用户配置；Modern UI 取自本机实验配置中实际生效的 `config.workbench.experimental.modernUI=true`，不是只看设置文件中的缺省值。

[机器可读研究记录](../enhancements/src/vscode_design_baseline.json)保存曾核对的数值，是否用于当前运行时以实际入口为准；[来源与摘要清单](vscode_design_sources.json)记录固定源码和取证方式；[图标槽位表](icon_mapping.md)记录冻结版实际使用的官方图标。截图只能帮助发现遗漏，不能替代源码数值。

| 上游对象 | 已核对参考值与语义 | 固定版本依据 |
| --- | --- | --- |
| 工作台正文、菜单与文件名 | 13px / 400；Windows Segoe WPC、Segoe UI，中文采用上游 Microsoft YaHei 回退 | [工作台字体](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/media/style.css)、[Modern 字体层级][font] |
| 侧栏标题、分区标题 | 12px / 600 | [Modern 字体层级][font] |
| 数字徽标 | 10px / 400；不能让正文的13px覆盖 | [Modern 字体层级][font] |
| 源码编辑器 | 本机 `editor.fontSize=16`、Consolas/Microsoft YaHei/Courier New；行高由编辑器默认值计算 | 本机有效编辑器配置；已提炼到运行基线 |
| 常规命令图标 | 官方 Codicons，通常16px；按控件角色保留原字形及状态 | [工作台图标规则](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/media/style.css)、[图标槽位表](icon_mapping.md) |
| 文件类型图标 | 内置 `vs-seti` 主题的 JSON 映射、字形、light颜色覆盖；按最新用户要求统一用于 Explorer、搜索、快速打开、SCM/历史/Graph真实文件行及文件/差异标签；Git操作和大纲符号保留其专属图标 | [内置 Seti](https://github.com/microsoft/vscode/tree/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/extensions/theme-seti) |
| 活动栏 | Modern目标36×36px、图标24px、目标之间8px、选中背景32×32px；44px卡片加外侧4px占位 | [活动栏常量][activity]、[Modern 活动栏][activity_style] |
| 分区标题 / 文件树行 | Modern分区标题28px；文件树行22px，不共用一个行高 | [Modern初始化][modern]、[Explorer行高][explorer] |
| 卡片间距、边框与圆角 | 外边距4px、相邻卡片间距4px、内侧0px、边框1px、大圆角8px；共享边界按上游去掉对应圆角/重复边框 | [布局常量][layout]、[浮动面板][floating]、[尺寸注册][sizes] |
| 小控件圆角 | small4px、medium6px、large8px，按对应控件源码选取 | [尺寸注册][sizes] |
| 滚动条 | Modern UI默认8px | [Modern初始化][modern] |
| 窗口缩放 | 当前用户和仓库未覆写 `window.zoomLevel`，配置基线0；系统DPI与截图像素比单独记录 | 固定版本窗口配置；不能用CSS transform弥补错误尺寸 |
| 颜色 | Light 2026及其继承规则；现代活动项使用 `modernActivityBarItem.*`，不能误套经典 `activityBar.*` | [Light 2026][light]、[主题角色][theme] |
| Git Graph | 固定扩展v1.30.0的布局/设置，工作台边框与字体采用上述宿主基线 | [Git Graph矩阵](../enhancements/git_graph_features.md) |

每次界面变更先定位上游规则、状态和生效分支，记入对应矩阵再实现。验证要区分实际CSS布局像素、DPI、窗口zoom、视口和内容滚动，不把不同缩放下的截图尺寸直接相减。宽度随用户拖动的侧栏与编辑组按比例与约束验证，不把截图中的某个拖动位置写死。

链接悬停提示采用固定版本 [hoverWidget.css](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/base/browser/ui/hover/hoverWidget.css) 的 `4px 8px` 内边距、`500px` 最大内容宽度及 `1.5` 行高，背景和边框读取 Light/Dark 2026 的 `editorHoverWidget.*`。显示延迟为用户指定的 **1000ms**，不是 VS Code 默认延迟；浮层显示原始链接与项目内目标位置，百分号编码的中文路径和标题按可读文字展示；可选择文字或复制原始链接，移入浮层保留250ms宽限。它不修改 Typora 正文 DOM，不读取目标文件或访问网络。

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
[diff_options]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/editor/common/config/diffEditor.ts

单行顶栏采用35px高度：左侧保留 Typora 文件、编辑、段落、格式、视图、主题、帮助七类菜单，并按2026-09-12后续授权在帮助前增加终端菜单，中间为后退、前进和文件搜索，右侧复用宿主窗口按钮。菜单由本地 renderer 组织，只调用已核对的 Typora API，不使用整棵 `Menu.popup` 或修改 ASAR；能力与动态状态以实际接线为界，不声称完整原生菜单等价。菜单在顶栏下方按可用高度滚动，支持 Shift+滚轮。

当前实现、历史基线及各层验证结果统一见[反馈复查记录](feedback_review.md)。旧布局的运行计数不能证明后续活动栏、可见标题、边距或底栏遮挡问题已经修复；本文只维护设计来源和实际采用的规则。
Markdown 正文沿用原有底栏边距滑块：单侧0%～24%、默认0%，只改变活动正文框宽度并保留阅读段落。大纲按完整可见标题同步，文档缩略图和标题识别共用扣除底栏的可读视口；这些是当前阅读行为，不来自旧 Modern 布局尺寸表。操作见[阅读位置与标题定位](../enhancements/README.md#1.4.1_阅读位置与标题定位)。

## 2026-09-13 Graph局部核对

R024本次从本机发行文件读到VS Code1.137.0、提交`645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`。仅用这一固定版本核对内置SCM Graph的按钮、悬停与布局；其余工作台继续使用此前冻结依据。实际用户配置边界、采用数值和全部Graph专用键的差异见[Graph配置核对](git_graph_configuration.md)。不使用已撤销的1秒延迟猜测，也不整体迁移旧基线表。

2026-09-13圆角补充：R020/R022采用同一固定1.137.0源码的`cornerRadius.small=4px`，共享覆盖底栏、Graph提交/文件行和普通操作；分裂接缝保留独立形状。该参考来自Modern UI控件规则，不能泛称所有VS Code配置均有相同圆角；本工程仅采用用户要求的控件默认，完整来源与职责见[圆角设计](workspace_interaction.md#r020-默认圆角与独立形状)。


2026-09-13，R006.1：固定1.136.2的 `TerminalTabsListSizes` 定义22px行、46px窄列表、80px宽列表最小、120px默认、500px最大；`terminalTabbedView.ts`定义主终端最小120px，`terminalGroup.ts`定义分屏最小80px。按此增加列表和分屏分隔条，同窗拖放移动组/组内会话。对话最后确认只将物理悬停与点击状态区分，不改变已交付Git动作。Terminal来源为微软官方固定提交，本次缓存已核对，运行不依赖缓存。

## 2026-09-13 SCM 操作设计

R027 沿用已核对的 VS Code 1.137.0 固定提交，核对 `scm/history/title`、提交与引用菜单、工具栏隐藏恢复、仓库摘要和工作树条件；数值、源文件和本产品的自适应边界统一记录在[SCM 操作设计](git_scm_actions.md#固定来源)。不改变原有悬停延迟、公共圆角或文件行标签裁切设计。


2026-09-13，R029：重新核对固定1.136.2的 `titlebarpart.css` 第244行 Command Center 悬停规则，以及 Light／Dark 2026 独立颜色。按用户要求让顶栏搜索维持中性背景，使用公共交互变量引用原顶栏前景；没有将普通 toolbar 的选中色应用到搜索框。上游仍存在主题相关悬停反馈，来源、采用差异和验收见[顶栏搜索设计](workspace_interaction.md#r029-顶栏搜索入口的悬停外观)。

## 2026-09-13 文档标签菜单

R030核对固定VS Code 1.137.0提交 `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c` 的 `editor.contribution.ts`、`editorCommands.ts` 与 `fileActions.contribution.ts`。采用标签目标与所属组、关闭分组、预览／固定的独立状态、相邻分屏／移动和文件动作可用条件；菜单复用现有公共尺寸、圆角、主题和视口定位。源码链接、实现职责与扩展提供者差异见[标签菜单设计](editor_tab_menu.md#r030目标与参考)，没有借此增加VS Code扩展宿主。

## 2026-09-13 文件标签与编辑器顶部

R034按用户新截图采用固定VS Code 1.137.0提交 `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c` 的 Modern 标签：32px命中行、内缩24px圆角底色、13px标题、悬停覆盖关闭槽；Markdown文件标签按同日最新要求统一使用现有Seti文件图标，阅读／编辑均不添加“预览”前缀。取消文件名20字符预截断，超宽由实际组宽裁剪。源码和diff使用22px路径栏，diff操作保留在所属组标签右侧。该区域早先的平直35px标签及黑色顶部线被本次授权替代；原生菜单顶栏仍是35px，不受影响。来源、状态分工与验收见[文件顶部设计](editor_header.md)。


## 2026-09-13 SCM内部拖动边界

R035按固定VS Code 1.137.0的sash／splitview与Modern内部面板规则，采用4px覆盖命中、300ms悬停反馈和透明常态，删除SCM更改／提交图间7px网格占位。真实轨道边界由网格定位，悬停不重排，折叠和显隐保留原状态。来源与验收见[分隔条设计](workspace_interaction.md#r035-更改与提交图覆盖式分隔条)。

## 2026-09-13 标题函数导航与详情分支全名

R034继续固定VS Code 1.137.0提交 `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`，核对breadcrumbs配置、Model、Picker、Control与样式：采用22px导航及选择器行、13px文字、16px图标、目录与符号层级、默认显隐与排序、用户／工作区／语言覆盖策略。实现复用已有文件服务、原生标题判定和代码符号提供者；普通源码没有其他提供者时不显示空的编辑器类型动作。明暗选中颜色沿用共享主题角色，实际Night文字与鼠标悬停对比度单独核对。固定来源、采用值与平台边界见[面包屑设计](editor_header.md#r034-标题与函数面包屑)。

R022依据用户最后两张VS Code截图明确两个显示上下文：列表中的长分支名称末端省略，详情卡呈现全名。共享徽章的列表默认保持18px单行与100px名称限宽；详情取消该名称限宽，超出卡片可用宽度时换行并撑高。图标、配色与圆角继续共用。此前换行文字受18px固定高度裁切的问题由同一可配置盒模型修正，验收检查实际字形边界，见[详情徽章设计](workspace_interaction.md#r022-长分支徽章完整名称)。

2026-09-13，R020：选中行补齐固定1.137.0 Light／Dark 2026的非活动选中背景与前景，统一交互层管理、实际宿主主题驱动。来源、采用值及避免测试注入掩盖缺陷的验收见[选中行明暗主题](workspace_interaction.md#r020-选中行的明暗主题)。

## 2026-09-13 底栏窗口缩放

R014核对固定VS Code1.137.0提交645f29cc3176500b4b5762ba887cf2a7f0ffdf2c的WindowZoomStatusEntry、statusbarItem/statusbarPart、window.css、hover.css与desktop.contribution。采用非默认级别入口、官方方向放大镜、实际级别及减／加／重置／齿轮顺序；12px紧凑文案、2px 8px内距和10px右组间隔复用在公共浮层中。图标仍来自固定Codicons1c47ab36原始SVG，plus复用同映射add。宿主比例和设置保持Typora所有权，底栏高度、22px操作目标及4px控件圆角沿用本产品公共规则；原生偏好没有缩放深链，使用无参入口。逐项来源与回归见[窗口缩放](workspace_zoom.md#r014-底栏缩放入口)。

## 2026-09-22 设置浮层、标签换行和已打开编辑器

R072.2/R073沿用1.137.0固定提交645f29cc3176500b4b5762ba887cf2a7f0ffdf2c。`modalEditorPart.ts`取默认上限1400×900、最小400×300、33px标题、最大化16px边距；不移植通用编辑器迁移和拖动。`multiEditorTabsControl.ts#doLayoutTabsWrapping`用于开启换行后按组宽及可用高度回退，默认`workbench.editor.wrapTabs=false`。`editorQuickAccess.ts`取`edt active `、当前组最近激活顺序、名称/路径筛选及逐行关闭。几何保留本工作台已采用32px标签及24px工具按钮，源文件图标复用已有go-to-file；主题和缩放实际回归见[本轮证据](../enhancements/tests/evidence/preview_settings_20260922.json)。


## 2026-09-23 独立预览的边缘与角落调整

R069.2读取固定1.137.0提交的[sash.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/sash/sash.css)，采用4px边缘和8px正交角落、方向光标；170px侧栏最小宽度和220px编辑区保留既有共享契约。初始40%/最低120px高度沿用本项目预览，独立左下停靠由用户本次需求定义，不称为上游默认布局。关闭使用已有官方close图标及24px共同操作容器。原生验证包含矩形和elementFromPoint真实命中，避免侧栏背景遮挡被外框检查遗漏。
