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
