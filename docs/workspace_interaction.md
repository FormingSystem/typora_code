# 工作台交互状态与行内布局

## R049 共享滚动条基础样式

2026-09-19，用户截图标出SCM文件列表的直角滚动条，要求同类基础样式由共同层管理。现有Explorer、搜索、历史和顶栏菜单各设宽度或颜色，其他区域继承宿主；`scrollbar-width:thin`及非auto的`scrollbar-color`还会让Chromium绕过WebKit圆角绘制。修复范围是滚动条滑块，不将所有细长控件等同于任务进度。

固定参考VS Code 1.137.0、`645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`：`modernUI.contribution.ts`的`MODERN_UI_SCROLLBAR_SIZE=8`；`modernUI/browser/media/roundedCorners.css`为普通滑块、Monaco缩略图及终端设置`cornerRadius-small`（4px），带差异概览的右编辑器仅保留左侧圆角。Light/Dark 2026的`scrollbarSlider.background/hoverBackground/activeBackground`分别为`#646464C0/D0/E0`和`#A8A9AA85/90/9C`。同版本`base/browser/ui/progressbar/progressbar.css`的任务进度为2px且无圆角要求，继续使用现有共享`git_progress`。源码路径、摘要及采用值登记到设计来源清单。

实现由`workspace_scrollbars.css`唯一管理8px宽度、4px圆角和三态颜色，静态head样式构建包含它；运行激活范围使用已有`data-linux-note-typora-enhancements`标记，销毁后恢复宿主规则。不增加事件监听、DOM扫描、观察器或配置。删除各业务面板重复的宽度/颜色规则。原生滚动条只改伪元素绘制，不改正文、overflow、滚动位置、键盘或指针处理。原本隐藏的面包屑、状态控件和Graph工具栏继续隐藏；局部滚动条尺寸差异通过共同变量声明，不复制基础规则。

Monaco与实际安装的xterm 6.0.0使用DOM滑块，集中适配其真实`.scrollbar > .slider`；保留各自位置、尺寸、透明度和拖动状态，Monaco/xterm颜色仍由它们的主题服务拥有。阅读缩略图视口共享圆角，其范围及颜色保持阅读模块所有。主题深浅复用现有文件图标主题属性，VS Code显式颜色变量优先；切主题不重建节点。所有动态面板自动采用规则，无需每次挂载登记。失活/启动失败由现有工作台生命周期清理，界面不存在额外确认或取消步骤。

验证使用分类用例：真实Chromium纵横滚动、实际悬停/拖动、键盘、动态加入、隐藏条、明暗和100%/125%缩放；重复20/100/1000次挂载/滚动/移除检查节点与样式数量不增长。回归实际SCM、搜索、Explorer、菜单、Monaco、终端、缩略图和启动清理；隔离原始Typora检查最终静态CSS覆盖宿主规则并保留文档字节。截图与计算样式同时检查，不能用仅外框或伪元素计算值证明像素已绘制。构建、安装资产摘要和重启加载状态单独记录。

### R049 本轮验证与交付

10个不同套件、12份最终选用报告通过，包含20/100/1000三档压力；原始Typora 1.14.10的62项及明暗截图通过，SCM、正文和阅读缩略图圆角实绘已复核。build/check通过；收尾将CSS加载纳入启动异常清理，并将静态规则限定loading/ready，失败标记不保留增强绘制；重建后的启动、样式、原生和部署复验通过。三次测试输入/悬停状态问题保留原始失败报告，不冒充产品回归。

2026.09.19.4已本机安装，安装检查OK；27项安装资产与候选相同，5项宿主及配置保护摘要不变。窗口未重启，保存后手动重启加载；未推送。完整报告、候选摘要、截图和各次验证边界见[机器证据](../enhancements/tests/evidence/scrollbars_20260919.json)。本次未关闭跨机器权限、物理输入法和其他平台等已有未决项。

2026-09-12，用户指出顶部菜单、底部终端入口和SCM分支缺少悬停反馈，文件标签对齐和悬停不明显；追加Git侧栏提交行布局与系统title提示问题。沿用当前平直工作台、文件模型和命令服务，只修复反馈中的呈现与交互缺陷。

## R020

鼠标悬停、按下、键盘焦点、菜单展开、当前选中和禁用是不同状态。共同交互层管理颜色来源、默认控件圆角、状态优先级、焦点轮廓与作用范围；各模块声明操作/标签/行等角色，并提供已有真实状态。悬停只作用于当前目标，不把整个组或邻居一起染色；禁用项不表现成可执行项。活动栏底部按钮和顶部按钮适用相同交互规则，但底部按钮不因此参加顶部排序或侧栏选择。

不新增悬停状态存储和全局鼠标监听；可由CSS表达的交互由浏览器状态维护。共同样式复用现有静态构建和引用计数生命周期，避免局部补丁或首次加载后闪变。已核对生产层叠、宿主规则及固定VS Code状态颜色，具体采用值见下文。标题栏拖动区域仍保留，按钮必须命中可交互区域。

## R021

标签和底栏的共性是文字/图标内容盒居中、自然行高、无单边补偿；标签保留当前35px行高、13px工作台字体及原有选中边界，不能套用底栏高度。核对真实标签DOM与继承样式后抽取有实际调用方的共同布局规则，模块独立管理宽度、截断、关闭/未保存标记和拖动。原标签节点、文档身份、切换、分组和编辑状态不变。

## R022

提交行独立管理图形轨道、摘要、引用、作者与操作槽位，宽度不足时截断非关键文本并保留可达操作。明确比较固定VS Code提交行的滚动槽位、行高、字段分配与悬停卡片，不复制Git Graph受限扩展源码。提交详情是Git领域数据，共同浮层仅管理显示、边界、主题和关闭；异步结果绑定当前提交身份，指针离开/切换仓库/刷新/销毁要取消或丢弃旧结果。

卡片显示真实已有的作者、提交信息、时间、引用与提交号；若加载统计，复用已有Git服务并按取消约定处理，不为悬停每次触发整库刷新。文案用textContent构建，不将提交消息作为HTML。复制等可操作内容要保留移入卡片的短暂过渡，Esc关闭。远端链接仅使用已核验映射，未知能力不画无效按钮。失败保留可用基础信息，不能使列表或当前文档失效。

## 验收与证据

先复现当前缺口，再使用真实指针输入比较默认/悬停/离开、焦点/失焦、展开/选中、禁用状态与非目标项。覆盖明暗主题、100%/120%/125%缩放、长标签、SCM窄宽、终端开关，以及原文/未保存草稿和会话身份保持。布局检查实际字形Range和图标中心，不只比较容器。Git卡片检查窗口边缘、滚动/刷新取消、快速切换身份和内容安全；原生Typora隔离验证与夹具各自记录覆盖边界。

## 固定参考与采用规则

基线为VS Code `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`（1.136.2）。`extensions/theme-defaults/themes/2026-light.json`、`2026-dark.json` 的 `list.hoverBackground` 分别为 `#00000014`、`#ffffff14`，统一供行、活动入口和标签使用；标签采用 `modernUI/browser/media/tabs.css` 引用的列表悬停色，保留现有35px标签布局；控件圆角按2026-09-13追加要求统一，见下文。菜单使用 `menubar.selectionBackground` 的 `#eaeaea`/`#242526`；操作按钮使用 `toolbar.hoverBackground` 的 `#0000001f`/暗色注册默认 `#5a5d5e50`（`editorColors.ts`）；焦点使用主题 `focusBorder`。不设置整组悬停背景，不删除现有选中边界。

`scm/browser/media/scm.css` 的history-item使用22px行高、18px引用标记、4px字段间距，操作随当前行悬停/焦点显示。采用这些紧凑参数，取消常驻隐藏操作槽。`scmHistoryViewPane.ts` 使用右侧延迟信息浮层；本工程独立实现相同方向的安全文本卡片，保留窗口边界与异步身份检查。

### 统一默认与独立管理

2026-09-12追加澄清：覆盖未逐项指出的控件，至少提供统一默认和独立管理。公共控件工厂自动声明交互；模块根通过 `acquire_workspace_interaction(root)` 声明UI范围，范围内后来插入的button、summary及button/tab/treeitem/menuitem语义节点自动获得默认反馈。原生适配器只登记既有操作节点。正文、Monaco、CodeMirror、xterm及 `data-workspace-interaction="none"` 子树排除在默认规则外。

公共层在控件已有边框盒内绘制背景/前景、统一默认圆角和内侧焦点线，不设置尺寸、padding、display、定位或transform。2026-09-13的圆角反馈替代此前“圆角完全交给控件”的约定：长按钮、行和动态控件默认4px，圆形及分裂等特殊形状显式声明，所有形状在悬停前后保持稳定。嵌套操作被命中时外层行不重复高亮。浏览器维护hover/focus，业务层继续独立维护selected/expanded/disabled；不通过全局指针追踪或遍历DOM重写样式。

默认操作使用toolbar颜色；菜单、列表/标签和活动入口通过角色选用共同语义颜色。领域可在自身样式中覆盖 `--workspace-interaction-hover`、`--workspace-interaction-foreground`、`--workspace-interaction-radius`，仍走同一悬停/焦点规则；例如蓝色提交分裂按钮保留原有 `#006cbe`/白色悬停，选中活动项沿用活动栏状态颜色。`none` 是明确的独立绘制边界，可用于第三方编辑器或特殊交互；不允许为普通按钮复制另一套hover规则。

普通工厂调用方（文件、搜索、Git、终端及弹窗）自动接入；原生菜单、活动栏、标签、底栏由各自适配器接入。新增视图只登记一次根，不登记每一个后续按钮。引用计数负责公共样式寿命，根范围和原生角色随适配器销毁恢复。验证新增圆形/长矩形、运行时插入、局部颜色覆写、none子树、禁用、键盘焦点及选中优先级，并保留提交按钮语义回归。

### 信息提示的共同机制与局部策略

参考固定版本[Hover服务接口与委托](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/platform/hover/browser/hover.ts)的职责划分：共同机制提供默认行为，调用方提供内容、目标及覆盖选项。这里将CSS即时反馈和延迟信息卡片分开管理；它们分别回答“当前能操作哪里”和“这个对象是什么”。

`bind_workspace_hover`按本轮核对的Windows/Linux基线默认等待500ms展示，离开后保留250ms进入卡片；模块可通过 `delay_ms`、`hide_delay_ms` 改变时序，仍复用边界定位、Esc、焦点恢复、滚动/缩放关闭、目标移除及卸载清理。内容使用AbortSignal丢弃迟到结果，呈现失败清除空卡和ARIA引用。卡片尺寸与排版由内容模块在共同最大边界内定义。Git提交详情按仓库+提交缓存，最多128份；只读统计使用提交与首个父提交的真实diff，根提交与空树比较，处理重命名及二进制文件。复制使用原有宿主剪贴板服务。

阅读链接沿用用户既定1秒规则与原来的路径/点击策略，只共用浮层外观；普通短title提示和宿主原生菜单继续由所属适配器管理，不把编辑器内部提示全局替换。Git提交行的多行系统title已由结构化卡片替代。窗口边界以当前CSS视口计算。Graph的实际配置、紧凑外观和悬停组规则见[配置核对](git_graph_configuration.md#r024)；取消用户随后撤回的1秒假设。

### 实现与验证状态

共同模块为 `workspace_interaction`、`workspace_inline_layout`、`workspace_hover` 与 `workspace_hover_surface`；Git领域内容在 `git_commit_hover`，Git数据读取仍在仓库服务。正式静态样式随启动预载，独立夹具使用引用计数样式，未新增二次加载路径。官方作者/复制图标补入已有固定Codicons资源与校验清单。

R020、R021、R022均已落地，验证证据、失败复查和安装状态统一记录在[反馈记录](feedback_review.md#2026-09-12-统一悬停与独立交互管理)。首次出现的控件默认接入不等于每个未来控件都无需验证；新增第三方控件、无语义的原生节点或独特交互仍必须明确适配范围。

### R022 详情卡片避让

2026-09-12追加：卡片遮住行末“查看全部改动”按钮。现有触发节点只包含摘要和引用，兄弟操作列不在其矩形内；触发与布局边界必须分开。共同hover目标允许领域提供独立布局锚点，焦点、ARIA与触发身份仍归原操作节点；Git指定整个列表作为避让边界，包含行末操作和滚动条，卡片纵向仍对齐触发提交行。默认调用方继续使用自身节点边界。

共同定位优先右侧，其次左侧；空间不足时使用上下可用区域并约束卡片尺寸，不能简单把横坐标夹回窗口而重新覆盖操作区。异步内容增长、布局尺寸变化均重新计算，窗口缩放和滚动仍关闭；若没有可用展示区域则关闭提示，不能妨碍操作。共享层不理解Git节点或命令，也不修改列表的尺寸和结构。

验收同时检查卡片与列表/操作按钮无交叠以及真实指针命中和点击，不能只检查卡片没有超出窗口。覆盖窄宽侧栏、展开提交、明暗主题和窗口缩放，保留进入卡片复制、Esc焦点恢复、迟到数据与刷新/销毁回归。依据固定版本 `scmHistoryViewPane.ts` 的完整history-item元素及右侧延迟hover，不仅依据截图测量。


R022/R024本轮补充：Git选用共同紧凑外观（12px/19px、2px 8px内距、3px圆角）与指示角，卡片中心对齐提交行中心，超出可用边缘再夹紧。`grouped`局部选项把一次绑定视为一个悬停组，已显示时切换组内目标直接更新，首次进入仍使用共同默认；普通调用方和正文链接既有局部策略独立。指示角不接收鼠标，随卡片共同移除。按钮由CSS即时hover/focus决定，不能复用卡片计时器或以展开状态代替焦点；`history_always_show_actions`由现有Graph设置存储持有，默认false，true时仅使Graph行操作常显。设置校验、保存失败回滚、导入导出使用原有入口，不另设存储。

尺寸观察通知合并到下一动画帧处理，关闭时取消待执行布局，避免在ResizeObserver交付过程中反向调整尺寸产生循环。布局测试的键盘焦点使用隐藏窗口焦点模拟，边界夹具移动锚点时禁止焦点自动滚屏；实际滚动仍按共同规则关闭提示。

### R020 原生底栏操作接入

2026-09-13，源码模式入口缺少悬停。该宿主节点是div，既没有button语义也没有公共交互属性；原生底栏适配此前仅登记布局角色，加载公共样式本身不能使无语义节点自动成为操作。底栏适配器在现有control角色登记处同时接入公共action默认，统一覆盖源码模式、字数、语言、新建、目录菜单和列表切换，不新增按按钮ID绘制的hover规则，也不向正文或菜单内容扩散。

公共层继续管理颜色、焦点与禁用优先级，沿用本页固定VS Code操作色；原生适配器只拥有新增的角色属性并在卸载时清理。已显式声明的独立角色或none边界保持；原DOM、原生事件、提示、源码模式与显隐均不改变，不复制业务状态或新增指针监听。回归使用真实指针验证每个原生操作的悬停/移出、邻居隔离、明暗/缩放、阅读/源码状态及终端开关；核对原处理器和节点身份、卸载与重复安装，并在隔离Typora验证实际源码切换。

### R020 默认圆角与独立形状

2026-09-13，用户再次指出底栏和Git提交/文件行的直角悬停。此前公共层只负责颜色，各模块的`border-radius:0`仍有效，导致“统一反馈”没有统一形状默认值。本轮将默认圆角收拢进`workspace_interaction.css`，原生适配器和控件工厂复用已有接入方式；不增加逐节点扫描、计时器或业务状态。

固定参考为VS Code1.137.0、提交`645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`：[控件与列表规则](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/modernUI/browser/media/roundedCorners.css#L47)、[底栏规则](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/modernUI/browser/media/statusBar.css#L19)均引用`cornerRadius.small`；[尺寸注册](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/theme/common/sizes/baseSizes.ts#L98)为4px。VS Code这些规则受Modern UI开关控制，其注册默认false且允许自动实验；本机Light 2026用户设置无显式Modern UI或圆角覆写，仅凭用户设置文件不能确定实验后的有效开关。本工程按本次明确需求采用这一控件层级，不整体开启或移植Modern UI布局。

共同`--workspace-control-radius`默认引用上述4px值；`--workspace-interaction-radius`是单控件覆写口，支持百分比及四角简写。每个控件将局部覆写重置为initial，避免父行的圆形/分裂形状意外传给子操作；改变全域默认使用前一变量。普通行、标签、菜单和按钮默认圆角一致；圆形可声明50%，分裂按钮只圆外侧、接缝为0。`none`子树和正文/第三方编辑器仍由自身管理。公共圆角在所有状态生效，禁用不改变形状但不获得可执行悬停颜色。圆角只调整既有边框盒，不加外层、不裁剪内容、不改点击事件；列表轨道、滚动和行末操作布局继续由Git管理。

验收以生产样式与真实指针检查默认/移入/移出、选中、禁用、焦点及动态加入；覆盖明暗和100%/120%/125%缩放、局部圆形/分裂/直角覆写、嵌套隔离及卸载恢复。底栏核对原生源码/字数/语言和Git分支操作；Graph检查提交与展开文件行的圆角、动作可达和拓扑连续。原生隔离实例复查宿主层叠与源码切换、终端身份，交付证据写入反馈记录。

### R022 文件名称与行尾操作

2026-09-13，用户补充“操作出现不挤压文件名”的截图，并最终澄清比较的是悬停与移出，不能将其理解为点击选中或要求绝对定位覆盖。固定1.137.0的[HistoryItemChangeRenderer](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/scmHistoryViewPane.ts#L674)在资源标签内部追加操作；[iconlabel.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/iconLabel/iconlabel.css#L44)将名称和目录作为一个flex:1区域内的行内内容，统一溢出省略；[scm.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/media/scm.css#L315)在hover/focused时显示动作。动作有自己的空间，标签可见右边界可以缩小，但不会按两个flex子项分别压缩名称和目录，更不会缩小字号或盖住字形。

本工程共享`git_file_label`构建图标及统一裁切的行内名称/目录，源码改动列表与历史文件列表共同使用。行首图标、名称起点及字形自然宽度保持；先裁切目录，必要时才裁切超长文件名。沿用既有字体和密度，本轮不更改文件状态、选中模型或命令。历史文件行移除常驻操作空列，hover/focus-within或已有“操作常显”配置时才给行尾动作分配22px；动作与状态字段不重叠，普通态不阻挡行点击，键盘聚焦时可见且可执行。悬停圆角、颜色继续走公共层。

回归比较真实指针移入前后及移出后的名称起点、字号、字形自然宽度、末端裁切区域、按钮和状态命中；覆盖长中文文件名、长目录、目录树/平铺、窄宽侧栏、明暗与缩放、按钮常显开关。保留历史文件打开对比/读取版本、提交展开、异步取消与原生终端/草稿保护。页面和操作均只使用安全文本；该改动不读写用户文件。


### R022 提交标题与作者连续排列

2026-09-13，用户比较宽窄侧栏的提交节点，指出作者位置与 VS Code 不同。原实现把标题设为独立 `flex:1`，作者占据最右侧且限制为30%；有引用时作者被省略。这使短标题与作者之间出现大块空白，长标题则过早截断。

固定参考仍为 VS Code 1.137.0、提交 `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`。[HistoryItemRenderer](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/scmHistoryViewPane.ts#L496)将 subject 与 author 同时交给 IconLabel；[iconlabel.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/iconLabel/iconlabel.css#L44)以一个 `flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis` 区域承载行内名称和说明，说明左距0.5em、字号0.9em，保留多空格；普通作者透明度0.7、浅色主题0.95，聚焦时为1。[scm.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/media/scm.css#L212)让引用位于标签区域之后，间隔4px、描述字号12px且最大100px；当前提交标题字重600。复查本机配置仍为 Light 2026，没有 SCM 或 hover 覆写，编辑器字号不作为侧栏字号。

提交渲染器创建共同的标题／作者文本容器，无引用与有引用均保留同一作者信息；文本标签本身不参与 flex 分配。CSS负责可见末端的统一省略：空间充足时作者紧随标题，先裁切末端作者，再裁切超长标题。作者没有独立保留列，不缩小字形。引用维持行尾位置，取消按侧栏45%分配，改为每个引用描述最多100px；沿用现有引用过滤和排序，多个引用总宽超过可用区时在引用容器内裁切，避免越过按钮或产生横向滚动。本次不扩展 `scm.graph.badges=filter` 的分组计数功能，差异仍在配置文档中说明。

沿用22px行高、11px轨道、公共悬停／焦点和已有22px操作位。hover、键盘焦点或常显配置出现动作时只缩小共同文本区，标题起点和自然文字宽度保持；鼠标离开恢复原裁切。提交展开、文件行操作、图拓扑、异步详情、中央 Graph 独立列和所有 Git 命令继续由现有模块管理，本次不增加选中状态或鼠标计时器。

验收通过生产渲染器和真实 Chromium 指针，比较短／长中文标题、长作者、有／无／多引用、空作者和多空格；覆盖220/300/480/600px侧栏、明暗、100%/125%、移入移出／键盘焦点／常显、展开与点击动作、拓扑和无横向溢出。另在隔离 Typora 中核对实际层叠和来源文件未改写。失败证据与最终构建、测试、提交和安装记录归反馈文档；合成输入与原生 DOM 检查不替代物理鼠标证据。

## R029 顶栏搜索入口的悬停外观

2026-09-13：用户比较顶栏搜索入口，要求移入时不出现整块灰色选中效果。当前入口是打开文件搜索的按钮，声明公共 action 角色后继承了普通 toolbar 悬停背景与前景，导致整框和文字一同变色。

固定参考为 VS Code 1.136.2、提交 `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f` 的 [titlebarpart.css](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/parts/titlebar/media/titlebarpart.css#L244)：Command Center 使用独立的 `commandCenter.activeBackground`、`activeForeground` 和 `activeBorder`，不直接采用普通工具栏的悬停色。Light 2026 的背景值为 `#DADADA4f`，Dark 2026 为 `#FFFFFF0F`；上游仍有主题相关的轻微悬停反馈，不能概括为所有配置都完全不变色。本机用户配置为 Light 2026，无显式 Command Center 颜色或 Modern UI 覆写；实验后的有效 Modern UI 状态未据此推断。

本次采用其独立外观职责，并按用户明确要求将本产品搜索入口的悬停底色设为 transparent、前景引用原顶栏颜色 `--tc-title-fg`，使它与原有静态外观相同。仅在 `workspace_titlebar.css` 中声明公共的 `--workspace-interaction-hover` 和 `--workspace-interaction-foreground`，保留 action 角色、共同焦点线、原有5px圆角和22px高度。无需新增角色、鼠标监听、计时器、选择状态或单独 hover 选择器；侧栏输入框、搜索结果、菜单及历史导航按钮继续保持各自行为。

鼠标移入／离开只允许原提示显示，不抢焦点或选中文字；单击和键盘 Enter／Space 仍打开原文件搜索，关闭／取消仍归已有搜索模块管理。原生标题节点、未保存正文、窗口拖动区域及搜索名称更新由原适配器管理，不改写宿主文件或配置。

回归复用顶栏 UI 测试，用真实 Chromium 指针比较明暗主题、宽窄窗口和100%／125%缩放下的背景、文字、边框与几何；验证移入不激活搜索、移出恢复、邻近导航仍有悬停、键盘焦点可见、鼠标及键盘各只触发一次、卸载还原。构建和安装后另核对隔离 Typora 的实际层叠；原生 DOM／样式检查与物理鼠标验收分别说明。结果记录在反馈复查文档。


## R032 Esc退出与原操作恢复

2026-09-13，用户反馈退出放大查看等界面后必须再次鼠标聚焦才能编辑。问题来自入口按钮被当作固定返回目标，以及菜单、查看器、快速打开分别处理 Esc。统一由 `workspace_focus` 保存原焦点、输入框选择方向和正文选区；原生 Markdown 通过已核对的 `File.editor.selection.getRangy().select()` 适配，源码编辑器与终端恢复原输入节点。恢复前核对来源节点、文档 bundle 和活动编辑组，切换文档、销毁或点击其他区域时不抢回焦点。

使用固定 VS Code 1.137.0（`645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`）作为行为依据：[contextMenuHandler.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/contextview/browser/contextMenuHandler.ts#L143) 仅在焦点仍归菜单时恢复原控件；[quickInputController.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/quickinput/browser/quickInputController.ts#L829) 保留打开前目标并避免覆盖已转移焦点；[dialog.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/dialog/dialog.ts#L504) 配对消费 Escape 按下和释放；[menu.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/menu/menu.ts#L953) 子菜单取消只返回父菜单。

本产品的窗口级退出栈由两个现有构建包共享同一个实例。最上层拥有一次完整 Esc 按下／释放，释放时退出；重复按下不会继续关闭背景层，输入法组合期间不接管 Esc。菜单先退出最深子菜单，再退出父菜单，最后才到背景对话框。没有临时界面时不覆盖源码补全、查找、终端、重命名等领域自己的 Esc。Tab 圈定与焦点恢复也遵循当前层归属。

鼠标点击放大入口和顶栏搜索保留打开前的编辑位置；键盘从入口启动则返回该入口。关闭操作恢复原光标／选区及滚动，不修改正文。外部点击、失焦、来源替换和增强销毁只清理界面；已经失效的来源不会被强制聚焦。核心命令输入框移除自己的 Markdown 选区恢复分支，复用同一所有者。

验收覆盖原生 Markdown 光标与选区、普通输入框和反向选择、源码输入、父子菜单与对话框、鼠标／键盘入口、重复 Esc、组合输入、失焦和来源移除。使用真实 Chromium 按下／释放及后续输入验证可连续编辑，并在隔离 Typora 中复查实际正文／图片／Mermaid 和配置字节；记录构建、测试和安装证据，未执行的场景不得标为通过。


## R033 弹窗外部关闭与焦点转移

2026-09-13，用户反馈文件搜索打开后点击空白仍保留，要求搜索选择器、临时弹窗和右键菜单统一关闭。已有实现混用 document pointerdown、body click、窗口 blur，普通对话框缺少遮罩取消；核心选择器没有焦点离开取消。统一窗口级所有者接收外部指针／鼠标、焦点离开和 Esc，再交还各模块既有的取消与异步清理路径。关闭不提交输入，也不触发确认操作。

依据固定 VS Code 1.137.0 的 [quickInputController.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/quickinput/browser/quickInputController.ts#L331)：默认 ignoreFocusOut 为 false，焦点移动到容器内部不隐藏，离开时以 Blur 取消。[contextMenuHandler.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/contextview/browser/contextMenuHandler.ts#L97) 将菜单取消、焦点离开、窗口失焦和菜单外 mousedown 接入关闭；焦点已移动时不归还旧位置。R032 的配对 Esc 与子菜单返回规则继续生效。

`workspace_focus` 统一持有可见临时层、关闭原因和一次鼠标手势的归属；core 与 workbench 共用窗口单例。真实指针在窗口捕获阶段判断，兼顾宿主仅产生 mousedown 的路径；后续兼容鼠标事件和焦点转移不能让同一手势继续关闭下一层。非模态菜单和快速选择器不拦截外部目标的默认操作，因此一次点击即可进入新的输入位置。点击弹窗内部空白、输入框、滚动列表或已打开子菜单不取消；遮罩属于外部，子菜单从共同菜单族判断边界。Shadow DOM 使用 composedPath 和跨宿主焦点判定。

非模态层外部点击和焦点离开使用取消但不恢复旧焦点；Esc、关闭按钮仍在所属焦点有效时恢复。字体颜色取消回调接收恢复意图，不在外部关闭时重放选区。普通设置对话框不因打开系统颜色选择器而关闭；文件／命令选择器及菜单才接管窗口失焦。图片查看器的画布拖动仍属于内部操作。原生系统确认和宿主原有菜单保持其所有权，不用覆盖层模拟系统输入。

2026-09-14 原生验收发现，模态遮罩在 pointerdown 关闭后，兼容鼠标释放会落到刚露出的 Typora 正文，导致正文未变却被标记为未保存。模态构造显式启用 `consume_outside`：同一次 pointer／mouse down、up、click及右／中键终结事件归遮罩所有，不能传给正文或继续关闭底层弹窗。手势结束、新手势及窗口失焦统一清理。由于本次点击已被模态消耗，外点取消与 Esc 一样恢复仍有效的原焦点和选区，用户可立即继续输入。核心与工作台共用同一服务和修复版本；普通菜单和快速选择器保留外点直接操作目标的行为。

回归在真实 Chromium 下验证内外点击、一次点击聚焦、普通输入和 Shadow DOM、菜单／对话框嵌套、右键替换、键盘恢复、扫描中取消后晚到结果、销毁后的事件清理，并补充宿主 mousedown 路径。隔离 Typora 核对实际快速打开、核心命令选择器、菜单和原生正文／配置不改写；合成事件与物理输入证据分别记录。


## R035 更改与提交图覆盖式分隔条

2026-09-13，用户指出更改与提交图间的拖动边界提前预留一行，增加视觉间隔。当前7px网格行和常态底色应移除：两个面板直接相接，分隔条只在交界处覆盖命中，不消耗布局尺寸。

固定参考为 VS Code 1.137.0 提交 `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`：[sash.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/sash/sash.css) 定义绝对定位、4px命中与高亮厚度及透明常态；[sash.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/sash/sash.ts) 定义300ms默认悬停延迟；[splitview.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/splitview/splitview.css) 将sash放入独立覆盖层；[Modern sashHandles.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/modernUI/browser/media/sashHandles.css) 明确不为面板内部边界绘制常驻握柄。本次采用以上面板内部交界规则。

SCM网格只保留更改和提交图两个实际内容轨道。原分隔条保留同一节点和键盘顺序，以第二轨道的起点作为绝对定位边界，4px命中区上下各覆盖2px；这会自动跟随比例、容器尺寸和提交图22px最小标题高度，不另算百分比或增加观察器。悬停300ms后显示既有强调色；拖动与键盘焦点即时显示，移开后消失，所有状态的轨道尺寸一致。折叠提交图或隐藏任一面板时同时隐藏分隔条；原比例、持久化、双击复位与方向键归既有SCM和workspace_sash所有，不新建状态存储。

检查现有侧栏外缘和终端面板／列表／分屏已使用覆盖命中，本次不改变其业务或几何。验证真实SCM结构中更改底边与提交图顶边相接，鼠标穿过／悬停／拖动、键盘调节、折叠和显隐后恢复、窄窗、极端比例、明暗及缩放；高亮不得挡住提交图标题中央的点击区域。取消、销毁、保存和未完成的其他能力沿用已有职责。

## R022 长分支徽章完整名称

2026-09-13，用户指出提交详情卡的长分支名称被裁切，并以 VS Code 截图明确：列表空间不足时可以省略，详情卡直接显示完整名称。此前固定高度的徽章继承卡片正文换行规则，导致文字跨行而容器未增高。

列表与详情卡继续使用同一徽章、图标和完整原始名称。共享规则以 CSS 变量表达场景差异：列表采用 18px 单行及 100px 名称上限；详情卡取消该名称上限，在卡片可用宽度内显示全名，超长名称允许断行，徽章高度随内容增加。多个徽章仍可整体换行。图标、圆角、颜色、文字行高和名称内容归共享组件管理，卡片只声明宽度和换行策略；不靠 title 提示替代全名。

回归覆盖同一长分支在列表和详情卡中的不同呈现、多个引用、超长无空格名称、明暗主题和 100%／125% 缩放。检查文本行盒均在徽章内、完整 textContent 保留、卡片没有横向溢出，以及打开引用菜单与提交操作保持可用。

## H001.1 顶栏右键显示配置

2026-09-14，用户指出顶端功能区右键仍弹出 Typora 原生“文件／编辑／段落…”根菜单，要求采用 VS Code 顶栏组件显示配置。右键配置此区域的呈现，左键仍打开已有主菜单。

固定参考为 VS Code 1.137.0 提交 `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`：[titlebarPart.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/parts/titlebar/titlebarPart.ts) 将顶栏右键交给 `TitleBarContext`；[titlebarActions.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/parts/titlebar/titlebarActions.ts) 的开关直接更新配置，导航项只在命令中心启用时提供；[layout.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/layout.ts) 对自定义菜单栏在 classic 与 compact 之间切换。[workbench.contribution.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/workbench.contribution.ts) 的命令中心及导航默认均为 true。

接入“菜单栏、命令中心、导航控件”三个真实组件，默认均显示。取消菜单栏后类别收进现有更多菜单入口，Alt 助记键仍可用；产品继续复用现有 more 图标。取消命令中心后显示纯窗口标题并隐藏前后退，但不清除导航选项；重新启用时按此前选择恢复。菜单按已实现的组件贡献，不显示没有提供者的 Share、Agents、Integrated Browser 或尚未实现的顶栏 Layout Controls 占位。原生窗口按钮保持宿主所有权。

`workspace_titlebar_settings` 唯一解析默认值和保存值，持久化到既有用户设置的 `titlebar` 对象（`menu_bar`、`command_center`、`navigation_controls`），不写打开的仓库。切换前重新读取并保留同对象其他字段；`set_and_save` 成功后才通知呈现。保存失败保留原状态并报告实际错误，不增加确认步骤。隐藏不销毁节点、历史或文档；纯标题读取宿主 title，`#title-text` 保持连接。

在捕获阶段阻止顶栏控件的原生根菜单，关闭已有顶栏下拉，调用公共紧凑 `workspace_menu`，复用勾选、主题、24px菜单行、16px图标、视口定位及退出栈。Shift+F10／菜单键从顶栏控件打开同一菜单；Esc恢复原焦点及选区，外部点击保留新目标焦点。设置变化和卸载清理菜单及监听器，隐藏命令中心后可从菜单区或纯标题恢复。

回归覆盖真实鼠标右键、左键主菜单、一次点击一次保存、开关依赖和恢复、损坏配置默认、保存失败、重新挂载、助记键、Shift+F10、Esc与外点、明暗／宽窄／125%缩放、隐藏控件不占位和宿主节点／正文保持。侧会话编译本次源码并运行隔离 Electron 测试，不覆盖主会话正在修改的共享发布包；源码验证与安装验收分别记录。

## R020 选中行的明暗主题

2026-09-13，用户反馈Night主题中资源管理器选中目录仍为浅底浅字。现有视图读取的 `--linux-note-shell-inactive-selection-background` 在生产样式中没有定义，落回浅色后备值；测试手工注入深色值，未覆盖真实缺陷。

共同交互层集中提供选中背景与前景，采用固定 VS Code 1.137.0、提交 `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c` 的 [Light 2026](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/theme-defaults/themes/2026-light.json#L69) 和 [Dark 2026](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/theme-defaults/themes/2026-dark.json#L59) 中 `list.inactiveSelectionBackground`／`list.inactiveSelectionForeground`：

| 状态 | 背景 | 前景 |
| --- | --- | --- |
| 浅色 | `#DADADA99` | `#202020` |
| 深色 | `#2C2D2E` | `#ededed` |

有显式VS Code主题变量时优先引用它们，否则采用上述配对值。继续复用现有 `observe_workspace_theme` → `observe_terminal_theme` → 文件图标主题属性链，根据宿主实际合成背景识别深浅；不新增主题名称判断、监听器或配置。主题变化只更新颜色，选中身份、展开状态、滚动及行高仍归视图管理。共享选中hover同时保持选中前景，Explorer文字和箭头继承同一前景；Graph／SCM现有消费者复用同组变量。共同选中hover同时识别现有 `selected` 按钮状态，避免SCM文件行被普通action底色覆盖；嵌套行尾按钮仍按各自控件重置默认hover，不继承整行选中底色。独立标签、面包屑、搜索选中样式继续使用原局部覆写，正文和第三方编辑器不纳入公共重绘。

回归须通过实际body主题样式触发日→夜→日传播，不允许向夹具注入待测选中变量。检查同一选中目录在鼠标离开、真实悬停和键盘焦点时文字及箭头对比度、26px行高、名称位置、滚动、展开和文件字节保持；另覆盖同类Graph／SCM及公共交互、局部覆写。主题加载前使用共同浅色默认，加载后沿既有观察链更新；失败或卸载不改变原选中模型。原生Typora验证与Chromium夹具、物理用户操作分别记载，不以旧通过记录替代本轮结果。

### 2026-09-14 菜单分隔线主题隔离

原生 Night 主题对正文 hr 使用强制24px上下边距，曾使普通文件更多菜单每个分隔处出现大片空白。公共 workspace_widgets.css 仅在 .git-graph-menu 内明确1px边框盒、零padding及标准5px／紧凑4px上下边距；局部 important 抵消宿主正文主题的强制边距，不改变文档正文。普通文件、比较页、终端及其他公共菜单共享这一规则。回归加载原生同等强度的明暗 hr 规则，检查实际分隔间距及正文保持；原生两主题截图与最终安装见本轮反馈。

## 2026-09-19 R044 功能菜单图标列

问题：核心Menu对fa设置相对左移，而SVG直接插入文字前，未统一菜单图标槽。以固定VS Code菜单menu.ts的独立图标/文字组织与既定16px菜单字形为依据；保留活动栏24px，核心Menu为字体/SVG提供共同16px槽、文字独立容器与同行居中。子菜单箭头独立于主图标；主题与焦点仍由共享交互管理，不传播活动栏布局class。验收全部有图标/无图标/禁用/子菜单、明暗、长文字及键盘。

原生复查发现Git图标还包含被克隆的`.git-activity-icon`外壳，24px规则原先没有活动栏范围。将24px约束限定到实际活动按钮，并由菜单槽统一限制外壳及内层SVG为16px；不能只测外层槽位。原生宿主覆盖菜单anchor的display规则也需用菜单所属范围解决，保留文字行盒与图标8px间距。

本次来源：固定VS Code 1.136.2提交`88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`的[src/vs/base/browser/ui/menu/menu.ts](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/base/browser/ui/menu/menu.ts)，采用独立文字/指示区域、flex居中及16px菜单符号语义。现有宿主菜单行高/外边距保留；本工作台16px图标槽加8px文字间隔是24px内容占位的宿主适配，不声称上游具有相同gap常量。

### R044复现：活动栏可见性勾选与菜单留白

2026-09-19，关联R018：前次只验了图标尺寸与文字列，未验证菜单状态。RibbonView创建菜单时仅传图标和标题，遗漏button.visible；MenuItem统一state-off又引入Typora的8px伪元素，宿主锚点24px左padding与flex gap叠加成空白。原生复查还确认ul.context-menu li的9pt字号覆盖父菜单13px，须在独立菜单的行节点统一字体继承，否则2em会缩为24px。

本次菜单读取Ribbon按钮所有者的visible字段，调用原toggleButton及onChange持久化。MenuItem增加可选set_checked，提供menuitemcheckbox／aria-checked及官方Codicons check；勾选项共用原图标槽，只显示勾选和名称，不再克隆活动栏图标。每次打开重新读取实际状态；Esc／外部关闭零状态变更。键盘方向键定位，Enter／Space执行一次，关闭恢复焦点；不添加其他VS Code菜单或新的开关状态副本。

固定VS Code 1.136.2、88e44fa0的compositeBarActions.ts中ToggleCompositePinnedAction.checked来自isPinned；本产品对应既有visible状态。menu.ts的updateChecked采用menuitemcheckbox、aria-checked；内嵌CSS采用24px行高、2em勾选列、上下4px。本地独立菜单13px字号下勾选列26px、官方字形16px、文字紧接槽位。普通图标菜单保留16px槽与8px间距，独立菜单显式拥有padding／行高，原生菜单节点不套用独立几何。来源使用仓库已核对固定源码，Typora1.14.10 window.css提供本次冲突规则证据。

影响范围：共享Menu与MenuItem、活动栏可见性配置及普通嵌套菜单；正文、活动栏图标、宿主原生菜单不改。扩展核心UI套件验证checked真／假、无图标勾选列、持久化、反复打开／切换、键盘单次执行、普通图标／子菜单和退出；原生夹具验证明暗实际26px槽／16px图形、24px行盒、隐藏后再显示，记录截图与用户正文保护。

本轮验收：6个目标套件通过，原始Typora1.14.10的46项检查及20次菜单开关压力通过，明暗截图已视检；build/check、核心摘要与部署检查通过。版本2026.09.19.2已安装，27项资产一致，check OK；未重启用户窗口，未推送。首次原生字号失败和持久化夹具修正分别保留，详见[勾选与留白证据](../enhancements/tests/evidence/menu_checks_20260919.json)。4项保护摘要不变；工作台配置在早期快照之后、安装开始前写入，安装未重写该文件，保留当时配置，不用旧快照回滚用户状态。
