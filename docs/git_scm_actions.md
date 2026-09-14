# 源代码管理与 Graph 操作

源代码管理侧栏分为 **仓库、更改、提交图**。在侧栏标题的“更多”或任一分区标题右键，勾选需要显示的分区；至少保留一个分区。仓库区显示已发现／打开的仓库，点击切换，当前行提供分支、同步状态和 Git 操作。

提交图工具栏从左到右为 **引用范围、定位当前提交、获取所有远端、拉取、推送／发布、刷新、更多**。引用范围支持搜索、全部、自动以及多个分支／标签；“自动”包含当前分支、上游和可核对的基线引用。定位当前提交会在必要时调整筛选，再滚动到 HEAD。

右键工具栏按钮可隐藏该按钮、重新显示其他按钮或配置快捷键。隐藏的动作和窄侧栏容纳不下的动作都可从“更多”执行；“恢复工具栏”恢复被手动隐藏的按钮。更多菜单还可切换 **列表／树形** 和在编辑区打开完整提交图。快捷键只在源代码管理区域生效，输入框和对话框保持原有按键。

文件右键可打开改动、当前文件或只读 HEAD 版本，以及暂存、取消暂存、放弃、加入忽略规则和定位文件。新增文件没有 HEAD 版本时，对应入口禁用；重命名使用 HEAD 中的原路径。给已跟踪文件添加忽略规则不会取消 Git 跟踪。

提交右键可打开全部改动或 GitHub 页面，切换关联分支／远端引用、分离 HEAD、创建分支或标签、删除关联分支、挑选提交、比较上游／基线／指定引用，以及复制完整提交消息或哈希。比较使用固定 Git 对象；没有上游或基线时禁用对应比较。其他既有 Git 操作保留在子菜单中。

仓库“更多 → 工作树”可列出和打开工作树、在新窗口打开、创建或移除工作树。创建／移除与其他 Git 写操作一样，先填写选项并预览，再明确执行。移除保护主工作树、当前工作树、锁定和有改动的目录，不使用强制删除。实际失败原因显示在操作结果中，取消或换仓库不会执行旧计划。

## R027

2026-09-13，用户要求补齐截图中的 VS Code 源代码管理功能。本需求覆盖此前 R024 只对齐外观的限制。目标是入口、状态与真实操作一致，继续复用现有 Git 服务和只读差异阅读器。

### 入口与行为

| 位置 | 行为 | 状态所有者 |
| --- | --- | --- |
| 源代码管理标题／分区标题右键 | 仓库、更改、提交图的显隐与隐藏当前分区；至少保留一个入口 | 既有 SCM 布局记录 |
| 仓库区 | 仓库列表、当前分支、同步计数、切库与仓库操作菜单 | 控制器及独立只读仓库摘要 |
| Graph 工具栏 | 引用筛选及当前范围标签、定位当前提交、获取所有远端、拉取、推送／发布、刷新 | 共用仓库控制器和命令描述 |
| Graph 更多／按钮右键 | 列表／树形、隐藏动作移入更多、逐项恢复、配置快捷键 | Graph 设置；不借用右键菜单的隐藏表 |
| 文件行 | 打开改动、当前文件、HEAD、暂存／取消暂存、放弃、忽略、系统／侧栏定位 | 文件与 Git 既有服务 |
| 提交行 | 改动、GitHub、引用切换／删除、分离HEAD、新分支／标签、cherry-pick、远端／基线／指定引用比较、完整消息复制 | Git 对象和引用；复用操作计划 |
| 仓库操作 | 现有提交、分支、远端、stash、tag、获取／拉取／推送及输出；补工作树管理 | 共享 Git 操作层 |

工具栏动作保持立即出现，信息卡片继续使用已核对的公共悬停规则，不增加人为1秒延迟。延续22px行高、11px轨道、官方Codicons、4px公共交互圆角与文件名称末端裁切。图头显示实际引用范围，窄侧栏将动作收进更多菜单；标题使用独立省略区，数量徽标仅在标题完整容纳时显示，不裁断字符或遮住操作。

### 实现与失败处理

UI 通过同一命令入口打开现有操作对话框，不直接拼接或执行写命令。新增工作树操作也使用预览、执行前仓库身份复核、并发保护与错误反馈。未确认、取消、切库及销毁时不得执行旧动作。工作树删除不强制清理脏目录；保护主工作树和当前工作树。

仓库列表独立读取最小分支／状态摘要，不逐个加载全部提交。当前仓库只由控制器持有可写状态；非当前仓库先完成切换并核对身份再启用操作。HEAD文件只读，重命名回溯旧名，新增且无HEAD对象时禁用；“加入.gitignore”只追加精准规则，已跟踪文件明确说明忽略规则不取消跟踪。

提交比较固定在不可变对象ID，远端比较使用当前分支真实上游；没有远端或可核对基线时禁用并说明，不假设所有仓库主分支为main。复制消息读取完整 `%B`。新开工作树仍走已核对的工作区文件夹服务。文件夹开窗与标签移交共同调用 `JSBridge.invoke("app.openFile", null, {mountFolder, anchor})`，不经过编辑器内只负责标签导航的 `app.openFile`；初始化锚点限定为安全的文内片段。

工具栏显隐与快捷键保存到当前仓库的Graph设置，作用范围为源代码管理区域；输入框、IME、菜单与对话框不劫持。只允许有效组合，拒绝本组冲突，清空可取消绑定。按钮和快捷键使用同一执行及禁用条件。

### 非 Git 扩展边界

截图的“添加到聊天／解释／评审／添加到Codex任务”由外部扩展贡献，“定义／引用／Peek”由语言服务提供。本轮实现 Git／SCM 操作；AI 扩展接入和完整编辑器语言服务保留为独立范围，当前没有对应扩展宿主，不显示不可执行的占位项。

### 固定来源

VS Code 1.137.0，提交 `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`：

- [SCM Graph](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/scmHistoryViewPane.ts)：引用选择、列表／树形、当前提交定位及文件动作。
- [Git菜单声明](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/package.json)：`scm/history/title`、`scm/historyItem/context`、`scm/historyItemRef/context`、`git.worktrees` 的命令、分组和条件。
- [Git命令](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/commands.ts)：`compareWithRemote`、`compareWithMergeBase`、`copyCommitMessage`及工作树入口。
- [公共工具栏](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/actions/browser/toolbar.ts)：隐藏项移入overflow、动作右键与恢复。
- [仓库视图](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/scmRepositoriesViewPane.ts)：仓库行、状态命令与选择。

### 模块边界与采用值

`git_scm_toolbar` 唯一组织六个动作的按钮、更多菜单与快捷键，复用控制器的禁用条件；`git_scm_repositories` 只加载有限并发的仓库摘要，切库后取消旧摘要。`git_scm_data` 统一 NUL 分隔的状态、上游、基线及工作树读取；`git_scm_menus` 组织菜单和不可变比较；`git_worktrees` 负责工作树预览与执行前保护。写入仍由原有 `git_graph_actions`、runner 和控制器串行处理。

仓库条目、动作槽采用22px，引用标签最大100px、行高16px和右内距2px来自固定版本 SCM 样式；仓库图标采用 Git 扩展[仓库状态定义](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/repository.ts)中的官方 `repo` Codicon。仓库列表的30vh滚动上限与分支最多占行宽40%是本产品的自适应约束，避免长列表挤占其他分区，不宣称为上游常量。

基线先读取有效的 `branch.<name>.vscode-merge-base` 远端引用，再从创建／切换分支的 reflog 找来源分支上游，最后使用远端符号 HEAD。全程只读，不写入 VS Code 配置。远端名含斜杠、上下游分支异名时仍按完整引用处理；推送预览明确显示实际目标。

侧栏分页、incoming／outgoing虚拟行、引用徽标合并等既有差异继续见[完整配置核对](git_graph_configuration.md#全部graph专用配置差异)。本需求不把这些独立设置差异或外部扩展能力标成已完成。

### 验收

临时仓库构造多远端／无上游、分离HEAD、空仓、重命名／新增／删除、合并及工作树；验证真实Git结果、取消／失败零意外写入和执行前身份变化。UI覆盖所有入口、显隐持久化、键盘、窄栏、明暗、旧菜单切库、销毁及异步乱序。最后单独核对原生Typora布局与文件／版本阅读，完整check与相关UI通过后交付。旧验证不能代替本轮验收。

### 2026-09-13 更改标题操作补齐

用户截图中的更改标题缺少提交、刷新和Graph入口。原实现只放置分支和更多，按钮未被创建。本次标题顺序改为 **提交、刷新、打开Git Graph、更多**；分支选择继续使用仓库行、底栏和已有菜单。主提交按钮和标题提交共用 `git_source_control.commit()`，空消息时显式展开更改分区并聚焦输入框，填写消息后走原有提交事务；不会新增第二套写命令。刷新复用控制器刷新且保留当前分页，Graph调用已有编辑区完整提交图入口。

`git_source_control`拥有标题呈现，`git_graph_panel`统一分发读取/写入状态变化。正在读取或执行操作时禁用动作；空路径、仓库身份不符或读取失败时禁用提交和Graph，保留空闲时刷新有效路径以恢复。首次空仓仍可提交暂存内容并打开空Graph。每次执行复查当前状态；销毁后旧按钮不能触发动作。按钮点击不触发summary折叠，标题正文仍执行折叠。共享按钮工厂管理悬停、明暗、4px圆角和键盘焦点。

固定VS Code 1.137.0的[Git菜单声明](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/package.json)在`scm/title`的navigation组贡献`git.commit`、`git.refresh`，使用官方`check`与`refresh`，条件为Git provider且无operationInProgress。原生SCM Graph是独立视图区，标题中的Graph可能由扩展贡献；本产品按用户要求将既有完整Graph放进更改标题，采用已有官方`git-branch`图标，不声称它是VS Code内置标题命令，也不依赖扩展宿主。

上游基础pane标题22px；[paneview.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/splitview/paneview.css)给16px图标2px内距，通用[actionbar.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/actionbar/actionbar.css)为3px内距。此处沿用本产品已核对的22px标题、22px操作槽、16px官方图标和公共交互规则。标题文字弹性省略，四个按钮保持可点击；保持既有标题动作常驻策略，未引入上游`workbench.view.alwaysShowHeaderActions`配置。Graph历史工具栏的显隐设置继续只管理其六个历史动作。

本轮回归覆盖临时仓库真实提交与刷新、Graph仓库目标、空消息和异步忙碌、错误恢复、空仓与销毁；验证按钮鼠标/键盘不误折叠、180/240/380px明暗几何，并在隔离原生Typora核对。完成后记录实际构建、测试和安装证据。

### 2026-09-13 放弃更改确认

用户截图要求单文件确认包含文件名，混合批量分别提供仅放弃已跟踪文件、放弃全部文件和取消。当前SCM虽有放弃图标，但仍进入通用Git参数预览表单。本次入口改为直接显示已准备的操作确认，删除该入口的复选框及手动预览步骤；“加入.gitignore”仍是独立命令。提交区、文件行及右键放弃共用同一确认所有者，底层准确路径恢复与回收站服务保持唯一。

| 已准备的对象 | 提示及选择 |
| --- | --- |
| 一个已跟踪文件 | 完整文件名与放弃确认；全部为删除状态时显示恢复文件 |
| 多个已跟踪文件 | 文件数量和放弃全部；全部为删除状态时显示恢复全部 |
| 只有未跟踪文件 | 文件名/数量、移入回收站的说明，移至回收站或取消 |
| 已跟踪与未跟踪混合 | 分别显示两类数量；仅放弃已跟踪N个、放弃全部M个、取消 |

点击入口先只读准备当前准确文件名单、分类及仓库指纹。加载中仅可取消；准备完成也保留取消焦点，避免迟到结果把Enter转成破坏性确认。长文件名完整换行，单文件保留相对路径说明，多文件名称放在可展开列表；不会以Git命令文本代替用户提示。窗口使用公共对话框、明暗与焦点/外点退出机制，警告使用已有官方图标。关闭、Esc、外点、换仓库、销毁或被另一次确认替代均使未确认计划失效；迟到准备不得重新显示或写入。确认后关闭窗口并由原控制器执行一次事务，后续取消不能撤销已经明确启动的操作，结果由源代码管理状态区反馈。

`git_discard_confirmation`只负责计划确认与生命周期；`git_graph_panel`串行执行已确认计划、统一忙碌状态与刷新；`git_graph_actions`提供准备和同一快照的范围选择。选择仅已跟踪时从已显示的计划移除未跟踪对象及其保护值，不重新扫描或扩大名单。执行前继续检查未保存正文、仓库及暂存区指纹、未跟踪内容；更改后要求重新打开确认。仅恢复index中的工作区文件，不修改暂存区；未跟踪文件交给宿主回收站，失败不退回永久删除。部分完成仍报告已恢复/已回收状态。冲突、子模块、不在当前更改中的路径和目录等继续沿用原有拒绝边界。

来源为固定VS Code1.137.0 [Git命令](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/commands.ts#L2185)：clean入口限定工作区/未跟踪组并去重，2255–2286区分两类及tracked/all选择，2290–2316按单个/多个和全部删除状态调整文案，2319–2363说明回收站。 [仓库实现](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/repository.ts#L1561)从index恢复并使用系统trash；[消息服务](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/api/browser/mainThreadMessageService.ts#L127)将取消返回为未确认。本产品复用公共确认外观与取消焦点，不复制系统原生窗口皮肤、不增加上游失败后永久删除的回退选项或新删除设置。

验收使用临时Git仓库验证取消零写入、tracked/all范围、index字节与未选择文件保持、真实恢复及可恢复的未跟踪处理；覆盖单个、混合、仅未跟踪、全删除、长名、计划迟到、状态变化、未保存正文、回收失败、键盘/外点/销毁及重复确认，最后在隔离原生Typora核对真实窗口与回收站。

### 2026-09-13 快捷执行与上游识别

用户追加指出获取／拉取／推送按钮不应要求手填已有远端和再次预览确认，分支范围选择器应与VS Code截图一致；这些需求与放弃更改及比较编辑器顶栏在同一轮交付。普通动作的点击即是执行意图，不能用统一确认表单替代命令分派。分支筛选的“确定”用于提交多选草稿，不是额外执行确认；放弃更改继续采用上一节明确的破坏性确认。

固定依据仍为 VS Code1.137.0提交`645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`的[Git命令](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/commands.ts)、[仓库服务](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/extensions/git/src/repository.ts)与[SCM历史视图](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/scmHistoryViewPane.ts)。获取全部远端、普通拉取、普通推送在上游具有直接执行入口，发布、强推、同步各有独立条件；本产品按本轮明确偏好直接执行普通同步，不能据此删除放弃更改、强推等独立确认。

`git_quick_actions`统一读取本仓库remotes、当前分支upstream、pushRemote／remote.pushDefault及Git有效配置，识别获取、拉取、推送和同步的真实目标，不以第一个remote或硬编码origin代替解析。已有可确定目标时直接执行；多目标或缺少必要参数时只展示现有目标选择，选择后执行一次，不再嵌套预览。没有远端、分离HEAD、上游无效、认证失败、非快进拒绝与冲突给出对应结果，不静默force／reset。同步先拉取，再基于更新后状态推送；不把未暂存文件自动纳入提交。并发点击由仓库事务拦截，操作中更新忙碌与禁用状态，成功／失败均重新读取分支、远端引用、ahead／behind、历史和文件状态。状态仅来自实际Git读取，不伪造联网成功；外部目标选择取消与切库使旧选择失效。真实推送验收仅使用专属临时bare仓库，开发任务不借此推送用户仓库。

### 2026-09-13 分支范围快速选择

提交图的分支入口替换居中大表单为顶端紧凑多选快速选择器。展示筛选输入、已选数、确认按钮，以及全部、自动、当前仓库本地分支、远端分支和标签等实际引用，条目含图标、完整名称的可访问标签、短提交号与分组说明。全部／自动是互斥范围，普通引用可多选；过滤不丢失已选项。打开从当前范围初始化草稿，只有确认应用一次刷新；Esc／外部点击恢复原范围，切库／销毁丢弃草稿。复用公共主题、控件、焦点与外部关闭机制。具体行高、宽度与筛选默认取上述固定源码及有效配置核对值，并在实施后记录。

只读Git命令可能更新索引stat缓存；保护边界是HEAD、暂存路径／模式／对象内容以及未授权的工作文件不变。不能为强求`.git/index`原始元数据字节一致而禁用Git校验并产生幽灵更改。验证使用真实临时仓库，覆盖不同上游名、多remote、未发布分支、重复点击、取消、过期状态与执行后刷新。

## 2026-09-14 Git快捷操作动态进度

用户截图9def5abb要求所有Git快捷图标在执行时提供持续状态。目标是让用户区分正在读取、执行命令、刷新结果和等待选择；不增加执行确认、虚假百分比或新占位行。

固定VS Code 1.137.0（645f29cc3176500b4b5762ba887cf2a7f0ffdf2c）来源：`extensions/git/src/repository.ts` 的 ProgressManager 观察实际 Operation、读取默认开启的 `git.showProgress`，结束防抖300ms；`extensions/git/src/statusbar.ts` 同步期间使用 `sync~spin`；`src/vs/workbench/contrib/scm/browser/scmHistoryViewPane.ts` 让历史加载Promise拥有进度。`src/vs/base/browser/ui/progressbar/progressbar.css` 采用2px高度、2%滑块、4秒线性动画；对应TS在10秒后改steps(100)降低GPU消耗。`src/vs/platform/theme/common/colors/miscColors.ts` 的 progressBar.background 默认明暗均为#0E70C0。源码存于忽略的 `.cache/vscode_graph_1_137_0`，仅提取设计事实独立实现。

Git控制器拥有操作活动及刷新生命周期；写操作共用一个执行包装，UI不再自行置写入状态。活动使用唯一令牌，旧读取或已取消选择的finally不能结束新操作。仓库切换及销毁清理旧活动；多远端选择期间暂停动画并显示等待选择，接受后继续，取消零网络写入。真实业务锁立即释放，300ms只影响结束显示，不能延迟下一次点击或造成已完成操作仍被禁用。

Changes标题、Graph标题和中央Graph工具栏复用同一覆盖进度组件；绝对定位在标题下沿，不增加行高，不接收鼠标。底栏和仓库行从同一活动读取提示与忙碌，网络过程使用官方sync图标旋转；其余动作保留自身图标并提供操作提示。设置`show_progress`对应git.showProgress，默认true，只控制进度条，不能隐藏业务锁和失败信息。未知工作总量不显示百分比；进度条的减少动画行为以本节后续复核为准。

提交执行期间禁用提交说明，进入结果刷新后恢复输入。收尾仅清理仍与本次提交相同的说明；刷新期间填写的下一次说明及其持久草稿保留。失败不清理说明。此规则在真实临时仓库延迟刷新时验证，避免统一操作生命周期把新输入当成旧操作的残留状态。

验收覆盖Refresh、Fetch/Pull/Push/Sync、Commit、Stage/Unstage、Ignore及所选范围操作，含侧栏、底栏、更多菜单和文件功能栏真实调用方；专属临时仓库和本地bare远端验证单次执行、错误及刷新。几何验证默认／运行／结束标题与正文位置不变，明暗、窄侧栏、折叠、等待选择、连续刷新、取消切库与销毁后清理。全量构建和安装完成后记录实际版本；旧安装和旧截图不能代替新版本验收。

底栏与仓库行的同步图标旋转采用同一固定提交的 `src/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css`：1.5秒、`steps(30)`、中心旋转。尊重系统减少动画偏好时保持静态忙碌提示；这不改变操作锁或命令执行。

### 2026-09-14 横向移动进度条复核

用户截图d693fe41再次明确：Git Graph快捷命令运行时使用标题下沿横向移动的细条。上一轮为系统`prefers-reduced-motion`增加的100%宽静态线属于本产品自行补充的规则，本机原生验收恰好进入这一路径，不能以普通动画夹具通过代替该环境的移动效果。

复核上述固定提交的[ProgressBar样式](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/base/browser/ui/progressbar/progressbar.css)、[辅助功能服务](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/accessibility/browser/accessibilityService.ts#L66)与该版本安装包的完整工作台CSS：服务根据`workbench.reduceMotion`及系统偏好设置状态类，各组件自行采用；ProgressBar的无限进度动画没有静止替代。这里仅移除进度条的静止覆盖，恢复2%滑块、4秒横向移动、运行10秒后的`steps(100)`节流。其他组件的减少动画规则及底栏已有策略不在本次修改范围内，不修改用户系统设置。

三个入口继续订阅同一真实操作；运行、结果刷新期间移动，等待目标选择时暂停，结束或失败收尾后消失，切库与销毁继续清理。验证必须包含系统减少动画开／关时三个入口的实际transform变化、明暗和窄侧栏几何、10秒后持续移动、成功／失败／取消与销毁清理，不能只检查CSS中存在animation字段。固定安装包CSS摘要及提取规则保存在忽略的`.cache/vscode_graph_1_137_0/progress_motion_verified.json`。
