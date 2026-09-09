---
id: tools.typora.git_graph_features
title: "Typora Git Graph 功能对照与操作说明"
kind: reference
status: evolving
domains:
  - tools
---

# 第1章\_Git\_Graph功能对照与操作说明

本次以 Visual Studio Code 扩展 Git Graph `1.30.0`（`mhutchie/vscode-git-graph`）的 [官方功能清单](https://github.com/mhutchie/vscode-git-graph/blob/v1.30.0/README.md)、[设置与命令定义](https://github.com/mhutchie/vscode-git-graph/blob/v1.30.0/package.json) 为对照，核对日期为 2026-09-09。源代码管理布局同时参照 [VS Code 源代码管理](https://code.visualstudio.com/docs/sourcecontrol/overview) 与 [文件历史](https://code.visualstudio.com/docs/sourcecontrol/history)。这里维护 Typora 中的对应入口、操作边界和验证情况。

Typora 实现独立编写，使用系统 Git 和现有社区工作区核心。上游 Git Graph 的 [许可证](https://github.com/mhutchie/vscode-git-graph/blob/v1.30.0/LICENSE) 限制衍生作品发布，本目录不复制或打包它的实现代码。Gemoji 数据使用其独立的 MIT 许可证，来源及摘要见 [数据说明](./vendor/gemoji/README.md#第1章_Gemoji短代码数据来源)。

界面共用官方 Codicons SVG，采用图标 CC BY 4.0／代码 MIT 许可，保留固定来源、摘要和随部署许可。按钮、状态栏及需要折叠的分组使用 SVG，箭头按开合状态旋转；不依赖本机 VS Code、字体或扩展。来源与原始画布见 [Codicons 说明](./vendor/codicons/README.md#第1章_Codicons图标来源与使用)。

## 1.1\_功能与入口

点击活动栏的 Git 图标，在原有主侧栏打开中文 **源代码管理**；默认位置在文件、大纲之后，可拖动排序。再次点击同一图标收起，点击其他功能切换侧栏；选中边线、背景与前景跟随实际面板，系统减少动态效果时关闭过渡。下半区 **提交图** 直接显示历史与选中提交的文件，上下分区支持拖动调整，收起后标题仍完整可见。原生文件树底部工具条不会覆盖提交图，正文状态栏保留。标题栏的打开按钮、状态栏 **Git Graph** 或提交图命令，在原有编辑标签栏打开完整历史；文件差异和时间线也使用该标签栏。布局与菜单见 [主侧栏与中文菜单](./README.md#1.5.1_主侧栏与中文菜单)。

源代码管理标题区高 35px，提交消息框高 30px，提交按钮与筛选框高 26px，更改分组、文件行和下方提交图标题栏均高 22px；活动栏每项为 48×48px，图标使用 24×24px Codicon 画布。文件行只有名称和右侧 16px 状态固定列，行内操作仅在悬停或聚焦时覆盖名称尾部，不为操作长期预留空列。侧栏历史采用 11px 轨道间距和 22px 行高，每行按本行仍存在的轨道计算图形宽度。提交前不另占箭头列，展开后直接显示带图标和状态的文件，不增加文件总数行；引用使用彩色圆角标签。大纲与搜索清除多余原生过滤框，大纲保留层级缩进并去除外围重复留白，见 [活动栏与侧栏布局](./README.md#1.4.5_活动栏与侧栏布局)。

中央历史标签参照经典 Git Graph `1.30.0` 的信息密度与列顺序：35px 起的紧凑工具栏、22px 表头和 22px 提交行，动作命中区为 22px、图标为 16px；窄组中工具栏可换行。工具栏放置分支筛选、远端分支开关和右侧图标操作；默认列顺序为 Graph、Description、Date、Author、Commit，列头菜单可独立隐藏后三列，引用标签先于提交说明显示。选中提交后，详情直接插在该行之后，以 50%／50% 展示提交摘要和更改文件，最右侧保留 30px 操作栏；可在设置中改为底部停靠。520px 以下详情摘要和文件纵向排列，文件区独立滚动。

面板文案通过受类型约束的键成对提供简体中文和英文，并根据 Typora／插件语言统一切换源代码管理、Git Graph、提示、菜单、设置、确认框和错误消息。分支、提交、路径、Git 参数及用户输入作为原始数据保留，不翻译也不改变实际操作标识。

Windows／Linux 新窗口将应用图标、中文主菜单、标题与原生窗口按钮放在同一顶栏；原生命令和关闭流程保留。全局底栏根据当前活动编辑区更新状态，不在各分屏之间额外插入状态行。

| 功能组 | Typora 已实现的操作 | 入口 |
| --- | --- | --- |
| 历史与拓扑 | HEAD、本地分支、远端跟踪分支、标签、stash、未提交改动；圆点及父提交连线 | 提交图 |
| 分支范围 | 单选、多选、当前 HEAD、自定义 glob、从引用菜单加入或移除筛选 | 分支框、多选分支 |
| 历史加载 | 首次加载、继续加载、滚动自动加载；拓扑、提交日期、作者日期排序；第一父提交和 reflog | 设置、加载更多 |
| 提交详情 | 完整编号、作者与提交者姓名、邮箱和时间、说明、签名结果；合并提交选择父版本 | 点击提交 |
| 引用包含关系 | HEAD、分支、标签和 stash 是否包含此提交 | 悬停图节点 |
| 文件差异 | Monaco 左右／行内比较、对齐空行、行内差异、源码高亮、改动导航、两侧各 8px 滚动条与同步纵向滚动、30px 原生红绿差异概览、重命名前后路径；双栏关闭全文缩略图 | 变更文件及其右键菜单 |
| 文件历史 | 按文件显示提交并跟随重命名，点击比较该次提交前后源码 | 文件树、变更文件右键 → 时间线 |
| 任意版本比较 | 两条提交之间、任意提交与工作区之间；首个提交与空树之间 | 先选一条，再 Ctrl / Cmd 点击另一条或未提交行 |
| 工作区与暂存区 | 仅“暂存的更改／更改”两组；新文件暂存、添加精确忽略规则、取消暂存、按钮或 Ctrl+Enter 提交、amend | 未提交改动、文件右键 |
| 分支管理 | 创建、切换、重命名、删除、本地分支 Fetch、远端分支检出和删除 | 分支或远端引用右键 |
| 历史整合 | Merge、Rebase、Reset、检出提交、Cherry-pick、Revert、Drop；冲突后继续、中止、跳过 | 提交右键、操作 |
| 交互式 Rebase | 生成待处理列表，调整顺序、pick、reword、edit、squash、fixup、drop | Rebase 对话框 |
| 操作选项 | 快进策略、squash、暂不提交、Cherry-pick 来源记录和父编号、重置方式、Force-with-lease、Fetch 强制更新与 prune | 对应操作对话框 |
| 标签 | 轻量与注解标签、签署、删除、推送；查看标记者、邮箱、时间和说明 | 提交或标签右键 |
| Stash | 创建、包含未跟踪文件、保留暂存内容、apply、pop、drop、创建分支、恢复暂存状态 | 未提交行、stash 节点右键 |
| 清理 | Clean 的目录与忽略文件选项、删除清单预览、Reset 的 mixed / soft / hard | 未提交行右键 |
| 网络同步 | 获取、拉取、推送；确认后先拉取再推送的同步；无上游时发布分支；远端分支与标签推送 | 状态栏同步、获取按钮、操作与引用右键 |
| 仓库管理 | 克隆到指定目标文件夹、当前文档所属仓库、手动添加、指定深度发现子仓库、移除记录、排序、独立 worktree | 仓库按钮及仓库选择框 |
| 远端管理 | 查看 Fetch / Push URL，添加、分别修改 URL、删除、Fetch、Prune | 操作 → 远端配置 |
| 评审 | 单提交或版本区间的未读标识、打开差异后记为已读、跨会话继续、结束指定或全部评审；90 天未活动到期 | 详情、操作、命令面板 |
| 查找 | 说明、日期、作者、编号、分支和标签；向前或向后定位匹配结果 | 搜索框、Enter / Shift + Enter |
| 路径与复制 | 名称、完整编号、提交标题、文件相对路径和绝对路径；打开当前文件 | 节点、引用、文件右键 |
| 工作区重命名 | 文件、文件夹改名，同步打开标签、草稿保存路径与阅读历史；搜索结果刷新 | 资源管理器选中后 F2、双击名称或右键重命名 |
| 外部链接 | 提交与标签说明中的 HTTP / HTTPS、Issue 编号链接；GitHub、GitLab、Bitbucket、自定义 PR 表单 | 说明链接、分支右键 |
| 仓库配置共享 | 本地设置、导入、导出；新环境首次打开自动读取仓库根的 `.typora_git_graph.json` | 设置 |
| 右键配置与布局 | 按对象勾选菜单项、拖动五列表头列宽、重置五列宽度；历史双栏和侧栏上下分区独立调整 | 菜单底部配置、表头右键、对应分界线 |
| 集成终端 | 仓库根目录、Shell 配置、标签／分栏、真实交互、查找复制、会话保留、跟随 Typora 主题、管理员 UAC 入口 | 工具栏、空白处与文件树右键、Ctrl + ` |
| 图形与阅读外观 | 连线与颜色、未提交节点连接、合并同名引用、固定五列、目录树和列表、紧凑目录、淡化策略 | 设置、拖动表头边缘 |
| 文本与头像 | 常见 emoji 与 gitmoji、自定义短代码、行内粗体／斜体／代码、可选 Gravatar 及缓存清理、文件编码 | 设置、操作 |
| 工作区集成 | 全文件与隐藏目录按需浏览、带缩略图的源码单文件编辑保存、全局活动编辑器状态栏、按文件搜索、仅搜索 Git 更改文件、选中文字进入搜索及下方预览、标签和分栏、文件菜单、活动栏排序与侧栏收放、仓库终端 | 工作区入口、设置 |
| 版本归档 | 将指定提交、分支或标签导出为 ZIP，拒绝覆盖现有目标 | 节点或引用右键 |

图内额外提供的暂存、提交与归档也使用相同的目标和错误展示方式。图中显示的远端引用来自本地 Git 数据；**刷新只读取，Fetch 才联系远端**。

## 1.2\_操作预览与冲突处理

主侧栏暂存／取消暂存直接执行用户选择；普通提交使用按钮或 `Ctrl + Enter`，只提交已暂存内容，消息框普通回车保留换行。新文件与其他更改一样暂存，或右键添加精确忽略规则。需要填写参数、改变磁盘内容或改写历史的操作，从右键对话框填写参数，点击 **预览操作**，对话框显示仓库、目标和 Git 参数；点击 **执行此操作** 才执行写入。参数变动会使旧预览失效。Clean 先列出删除目标，Prune 先执行 dry-run。预览期间若 HEAD、引用、暂存内容、已跟踪文件差量或远端地址变化，需要重新预览。同一仓库在本窗口内串行执行写操作；其他 Git 进程的竞争仍由 Git 自身锁和错误处理约束。

状态栏同步会自动准备目标和操作顺序，点击 **确认同步** 才联系远端；先拉取成功，再推送尚未发布的提交，冲突时不继续推送。源代码管理的 **放弃所有更改** 精确列出本组文件，恢复来源是暂存区，未跟踪文件默认移入回收站；取消勾选可以只处理已跟踪文件。文件右键的放弃操作限定为单文件。回收站不可用或失败时报告实际结果，不自动改为永久删除。

会改变磁盘工作区的操作先读取 Typora 的实际未保存状态。如果当前原生编辑器仍有未保存内容，界面要求先保存，再执行。图查询不写正文或索引；隐藏图标签取消旧查询，正在执行的写操作保留至结果返回。

合并或变基发生冲突时，结果区显示 Git 错误，状态栏显示进行中的操作。打开冲突文件完成修改并保存，暂存解决结果，再选择 **继续当前 Git 操作**；也可以 **中止**，或在 Rebase / Cherry-pick / Revert 中选择 **跳过**。错误不会被显示成成功。

交互式 Rebase 勾选交互选项后，第一次预览生成完整编号列表，调整后再次预览。`reword` 行中编号后的文字成为新的提交标题；`edit` 会让 Git 停在相应提交，可修改并 amend 后继续。列表只允许上述六种动作，每个原提交必须出现一次；删除应显式使用 `drop`。交互列表处理线性提交，保留合并结构使用普通 Rebase 的独立选项。Drop 节点操作要求一个父提交且属于当前 HEAD 历史，根提交与合并提交会给出明确说明。

## 1.3\_快捷键与设置

| 图内键位 | 动作 |
| --- | --- |
| Ctrl / Cmd + F | 定位搜索框 |
| Ctrl / Cmd + H | 定位 HEAD |
| Ctrl / Cmd + R | 刷新 |
| Ctrl / Cmd + S，增加 Shift | 下一个、上一个 stash |
| ↑ / ↓ | 上一条、下一条提交详情 |
| Ctrl / Cmd + ↑ / ↓，增加 Shift | 子提交／父提交；Shift 选择另一条分支 |
| Enter | 操作对话框预览或执行；多行说明中保留换行 |
| Ctrl + Enter（提交消息框） | 提交已暂存内容，与提交按钮一致 |
| Esc | 关闭菜单、对话框或详情 |

除提交消息框的 `Ctrl + Enter` 外，表中键位只在活动 Git 图标签中处理。正文编辑区继续使用原来的保存、查找和阅读历史键位。`shortcuts` 可调整查找、HEAD、刷新、前后 stash 的键位，例如 `Mod+f`；空字符串表示不绑定。

设置使用中文标签，枚举项用选择框，复杂映射使用 JSON。下面是可导入的部分配置，未填写的设置使用默认值：

```json
{
  "graph_style": "curved",
  "column_widths": { "subject": 300, "author": 110, "date": 145, "hash": 80 },
  "branch_globs": [{ "name": "功能分支", "glob": "heads/feature/*" }],
  "dialog_defaults": { "merge": { "mode": "no-ff", "no_commit": false } },
  "emoji": { ":review:": "🔎" },
  "issue_pattern": "#([0-9]+)",
  "issue_url": "https://github.com/owner/repository/issues/{id}",
  "pr_base": "main",
  "hidden_actions": ["drop", "archive"]
}
```

配置中的 `{id}` 为 Issue 捕获组，PR 模板支持 `{base}`、`{branch}`、`{remote}`。Git 可执行文件和终端程序可在本地设置中指定；共享配置不会替换本机可执行程序设置，也不会自动打开联网头像。导出文件不记录仓库绝对位置，并将 Git 和终端设置恢复为可移植默认值。

## 1.4\_宿主差异与验证边界

差异使用 MIT 许可的 **Monaco 0.56.0**，在中央编辑标签中显示完整双栏源码、行对齐、行内标色、语法高亮、中文查找和改动导航；两侧各保留 8px 滚动条，30px 原生概览分别显示删除与新增，点击后同步定位。双栏关闭全文缩略图，普通单文件和单版本查看继续提供缩略图。功能说明见 [中央差异编辑器与文件时间线](./README.md#1.5.2_中央差异编辑器与文件时间线)。主侧栏复用社区核心 `SidebarPanel`，活动栏功能图标可排序；提交图内部不再复制侧栏和标签系统。终端继续使用现有 xterm.js 与 node-pty，颜色跟随 Typora 实际主题，管理员入口通过 UAC 打开独立 PowerShell，见 [集成终端说明](./README.md#1.6_集成终端、管理员入口与分界线)。

历史和两个差异版本均为只读。**打开文件** 对 Markdown 使用 Typora 原生渲染与编辑，对其他文本使用占满编辑组的单栏 Monaco，支持编辑、Ctrl+S 保存、Ctrl+F 查找，以及按文档独立保留的语言、编码和换行设置。保存前检查磁盘变化，切换或移动标签保留草稿，关闭后台标签和窗口时处理未保存内容，见 [全部文件与语言识别](./README.md#1.4.3_全部文件与语言识别)。当前没有选中行暂存、三方合并编辑器或 VS Code 扩展宿主。二进制文件、目录及子模块不冒充文本差异，界面说明打开方式；符号链接比较链接值。文件编码由 `TextDecoder` 解码。

全文件浏览不会按已知语言隐藏文件，目录按需展开；特殊名称、最长复合后缀及解释器映射见 [全部文件与语言识别](./README.md#1.4.3_全部文件与语言识别)。工作区文本搜索与图内提交搜索是独立入口：前者使用紧凑工具栏和一个搜索框，提供文件分组、路径、Git 状态、高亮和悬停行列位置，支持单击预览、双击精确选中 Markdown 原生正文或其他文本的源码，以及大小写／全字／正则／包含排除／忽略／仅已打开与替换预览。**仅搜索源代码管理中的更改文件** 包含已暂存、工作区更改及未跟踪文件，搜索当前磁盘文本，与“仅已打开”互斥；范围过滤仍有效。替换前检查磁盘快照和未保存内容，边界见 [工作区搜索与替换](./README.md#1.4.4_工作区搜索与替换)。这些能力不意味着已经移植完整 VS Code。

选中文字后 Ctrl／Cmd 加鼠标左键进入同一个 **搜索** 面板并列出命中文件；默认单击在编辑区预览打开目标，双击或 Enter 保持打开，Markdown 使用原生视图并保留阅读历史和既有标签。需要下方只读 Markdown／源码阅读预览时，在搜索视图选项中显式开启；该模式单击更新下方预览并保留中央位置。预览支持收放、默认 80% 且范围 50%～150% 的本地持久化内容缩放、Ctrl／Cmd 加滚轮及上下分区调整。侧预览只读取 2 MiB 以内的文本，代码围栏按语言高亮；Mermaid 使用独立 iframe 加载 Typora 随附的本地图表库，不改变中央实例配置。文档 HTML 经过净化，不执行文档脚本或加载媒体；它查找文本出现位置，不解析符号定义或 Git 提交关系，见 [搜索下方预览操作](./README.md#1.4.6_选中文字的跳转预览)。

源码的行列、编码、换行和语言设置统一位于窗口全局底栏，随活动标签及编辑组更新，各分屏不再单独占用底栏。格式仍由各文件自己的编辑模型保存；Git Diff 根据最后聚焦的左右一侧显示只读行列、语言和换行。切换到原生 Markdown、提交图或终端会撤下旧源码状态。

Git 与其他主侧栏共用 170 CSS px 最小正文宽度；继续拖到请求宽度不足 85px 收起，活动栏仍可用于恢复，完整鼠标／键盘规则见 [活动栏与侧栏布局](./README.md#1.4.5_活动栏与侧栏布局)。该宽度、源代码管理内部上下分区和中央差异双栏宽度分别调整；中央 Git Graph 的详情默认跟随所选提交行，也可停靠底部。

默认读取 300 条，每次再加载 100 条，滚动到底自动加载，可设置为 1～2000 条；文件历史也可继续加载。Git 读取超时 30 秒、写操作 5 分钟，命令输出与历史文件上限 16 MiB。Monaco 使用浏览器 Worker 计算差异，默认计算时限 10 秒；超过限制应缩小文件或提交范围。普通安装直接使用包含代码、中文界面、图标和 Worker 的离线 bundle。

已有验证基线包括：真实 Git 临时仓库中的分支、标签、重命名、任意版本差异、空仓库、分页、独立 worktree、stash、暂存、提交、本地 bare 远端推拉、交互式 Rebase、冲突继续／中止／跳过、预览失效和未保存保护；Windows Typora `1.14.9` 实窗中的标签、分栏、阅读位置、菜单、预览与执行、评审和 Ctrl 比较；隐藏 Chromium 的真实鼠标／键盘输入与双栏差异。对应脚本为 `test_git_graph.mjs`、`test_git_graph_full.mjs`、`test_reading_native.ps1 -suite git` 和 `test_git_graph_interaction.cjs`。

网络操作复用系统 Git 的凭据助手和 SSH 配置；安装器不写凭据。签名复用 Git 已有的签名工具与密钥配置，回归中使用临时 SSH 密钥完成提交与标签的签名、验签。远端 GitHub/GitLab 账户认证、用户签名密钥及头像服务可用性取决于实际环境，本轮没有使用用户凭据执行这些验证。原生 Linux / UCRT64 Typora 仍需对应设备实机复核。

安装与恢复回归额外检查：旧的仅查看图 bundle 不能通过完整功能标记校验，重复安装保持一个入口，升级及恢复不删除阅读位置、评审、设置或头像缓存。普通安装使用随仓库提交的 bundle、插件核心与终端模块，不要求预装 Node.js、Ruby，也不包含本机固定路径。Windows 首次配置另下载并校验固定版本的 Node 私有运行时；离线安装使用官方 ZIP 缓存。详见 [安装说明](./README.md#1.1_普通用户一键配置)。

扩展回归当前检查 35px 工具栏、22px 表头／提交行、引用顺序、行内双栏详情与 30px 操作栏，并覆盖可选底部停靠和 360px 窄组。双语键由测试动态核对，不冻结键数。目标脚本为 `test_git_graph_interaction.cjs` 和 `test_git_graph_actions_settings_i18n.mjs`；单个目标通过不能替代完整构建、完整 UI 套件或真实 Typora 实窗验收。

Git 回归覆盖主侧栏复用、活动栏顺序、中央独立差异标签、多个差异块的行对齐、C 高亮、单击暂存／取消暂存、中文子菜单键盘导航、重命名时间线、指定文件放弃更改和克隆。

侧栏交互回归继续覆盖两组文件状态、新文件暂存、精确忽略且保留磁盘文件、Enter 换行与 Ctrl+Enter 提交、提交失败保留消息、提交节点展开／收起与文件差异、上下区域调整、两侧 8px 滚动条及同步滚动。普通文档缩略图另由 `test_reading_minimap.cjs` 检查真实鼠标定位、多组与源码模式、正文完整性及跨帧绘制；`test_reading_native.ps1 -suite reading` 在真实 Typora 验证阅读、源码和分栏集成。

侧栏回归还检查三视图显隐持久化、提交输入区折叠、提交下拉、历史文件树、行内按钮键盘操作、编辑框原生右键，以及 220px 窄侧栏中无固定操作列、状态列在悬停前后保持对齐。`test_git_sync.mjs` 覆盖真实本地远端分歧、拉取冲突、推送拒绝与上游变化；`test_git_discard_changes.mjs` 覆盖精确文件清单、暂存区字节保留、预览失效和回收失败。Windows Typora 实窗套件另检查系统回收站及状态栏同步确认，不使用用户远端或删除用户文件。

2026-09-09 本轮完整构建、逻辑检查和28/28隐藏Electron回归通过；Windows安装及干净Git检出副本安装通过。真实Typora Git套件通过68项，覆盖源代码管理、提交拓扑、内嵌详情、分栏、查找默认行为、真实差异、精确暂存提交、回收与同步，并验证中文appLocale不被HTML的英文lang覆盖。阅读套件两次开窗共20项通过。停靠、所有配置枚举及与VS Code同DPI成对截图仍按下表逐项记录，不从这些结果外推完整一比一验收。套件范围见 [开发者构建与验证](./README.md#1.2_开发者构建)。

## 1.5\_固定上游配置逐项矩阵

来源：官方 `v1.30.0`，提交 `881a9e613045bacbbadf8940f6b6c5b8bd699335` 的 `package.json`。缓存工作树 HEAD 是较新的 beta，不能替代此固定 tag；本表逐项从固定 tag 提取。设置列记录当前默认值，不把字段存在视为运行验证。

验证入口：**UI** = `scripts/test_git_graph_interaction.cjs`（真实 Electron 输入、几何和详情）；**Git** = `scripts/test_git_graph_full.mjs`（真实临时 Git 仓库及本地 bare 远端）；**Data** = `scripts/test_git_graph.mjs`（拓扑、过滤、分页）；**Meta** = `scripts/test_git_graph_actions_settings_i18n.mjs`（配置类型与双语元数据，只证明配置契约）。标为适配的行不宣称与 VS Code 宿主逐像素一致。

| 上游设置（省略 git-graph.） | 上游默认 | Typora 配置／默认 | 实际入口与证据 | 边界 |
| --- | --- | --- | --- | --- |
| `commitDetailsView.autoCenter` | `true` | `auto_center` = `true` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `commitDetailsView.fileView.fileTree.compactFolders` | `true` | `compact_folders` = `true` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `commitDetailsView.fileView.type` | `"File Tree"` | `file_view` = `"tree"` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `commitDetailsView.location` | `"Inline"` | `details_location` = `"inline"` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `contextMenuActionsVisibility` | `{}` | `hidden_actions` = `[]` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已映射；按证据列区分验证层 |
| `customBranchGlobPatterns` | `[]` | `branch_globs` = `[]` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已映射；按证据列区分验证层 |
| `customEmojiShortcodeMappings` | `[]` | `emoji` = `{}` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已映射；按证据列区分验证层 |
| `customPullRequestProviders` | `[]` | `pr_providers` = `[]` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已接命名的自定义提供方列表；`test_git_graph_pull_request.cjs` 真实对话框与 `test_git_graph.mjs` URL／配置回归通过 |
| `date.format` | `"Date & Time"` | `date_format` = `"local"` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `date.type` | `"Author Date"` | `date_type` = `"author"` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `defaultColumnVisibility` | `{"Date":true,"Author":true,"Commit":true}` | `show_date,show_author,show_hash` = `{"show_date":true,"show_author":true,"show_hash":true}` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `dialog.addTag.pushToRemote` | `false` | `tag_add.push` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.addTag.type` | `"Annotated"` | `tag_add.tag_type` = `"annotated"` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.applyStash.reinstateIndex` | `false` | `stash_apply.index` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.cherryPick.noCommit` | `false` | `cherry_pick.no_commit` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.cherryPick.recordOrigin` | `false` | `cherry_pick.record_origin` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.createBranch.checkOut` | `false` | `branch_create.checkout` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.deleteBranch.forceDelete` | `false` | `branch_delete.force` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.fetchIntoLocalBranch.forceFetch` | `false` | `branch_fetch.force` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.fetchRemote.prune` | `false` | `fetch.prune` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.fetchRemote.pruneTags` | `false` | `fetch.prune_tags` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.general.referenceInputSpaceSubstitution` | `"None"` | `reference_space` = `"none"` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已映射；按证据列区分验证层 |
| `dialog.merge.noCommit` | `false` | `merge.no_commit` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.merge.noFastForward` | `true` | `merge.mode` = `"no-ff"` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.merge.squashCommits` | `false` | `merge.mode` = `"no-ff"` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.merge.squashMessageFormat` | `"Default"` | `merge.squash_message` = `"default"` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.popStash.reinstateIndex` | `false` | `stash_pop.index` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.pullBranch.noFastForward` | `false` | `pull.mode` = `"merge"` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.pullBranch.squashCommits` | `false` | `pull.mode` = `"merge"` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.pullBranch.squashMessageFormat` | `"Default"` | `pull.squash_message` = `"default"` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.rebase.ignoreDate` | `true` | `rebase.ignore_date` = `true` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.rebase.launchInteractiveRebase` | `false` | `rebase.interactive` = `false` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.resetCurrentBranchToCommit.mode` | `"Mixed"` | `reset.mode` = `"mixed"` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.resetUncommittedChanges.mode` | `"Mixed"` | `dialog_defaults.reset_changes.mode`（缺省mixed） | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `dialog.stashUncommittedChanges.includeUntracked` | `true` | `stash_create.untracked` = `true` | 对应右键动作对话框；Git + Meta | 已映射；按证据列区分验证层 |
| `enhancedAccessibility` | `false` | 无独立设置；状态字母固定显示 | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 适配：始终显示文字状态，无须开启 |
| `fileEncoding` | `"utf8"` | `encoding` = `"utf-8"` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 适配：TextDecoder 支持的编码集合 |
| `graph.colours` | `["#0085d9","#d9008f","#00d90a","#d98500","#a300d9","#ff0000","#00d9cc","#e138e8","#85d900","#dc5b23","#6f24d6","#ffcc00"]` | `colors` = `["#0085d9","#d9008f","#00d90a","#d98500","#a300d9","#ff0000","#00d9cc","#e138e8","#85d900","#dc5b23","#6f24d6","#ffcc00"]` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `graph.style` | `"rounded"` | `graph_style` = `"curved"` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `graph.uncommittedChanges` | `"Open Circle at the Uncommitted Changes"` | `uncommitted_style` = `"connected"` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `integratedTerminalShell` | `""` | `terminal_shell` = `""` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已映射；按证据列区分验证层 |
| `keyboardShortcut.find` | `"CTRL/CMD + F"` | `shortcuts.find` = `"Mod+f"` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `keyboardShortcut.refresh` | `"CTRL/CMD + R"` | `shortcuts.refresh` = `"Mod+r"` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `keyboardShortcut.scrollToHead` | `"CTRL/CMD + H"` | `shortcuts.head` = `"Mod+h"` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `keyboardShortcut.scrollToStash` | `"CTRL/CMD + S"` | `shortcuts.stash_next` = `"Mod+s"` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `markdown` | `true` | `inline_markdown` = `true` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已映射；按证据列区分验证层 |
| `maxDepthOfRepoSearch` | `0` | `search_depth` = `0` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已映射；按证据列区分验证层 |
| `openNewTabEditorGroup` | `"Active"` | `new_tab_group` = `"active"` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已映射；按证据列区分验证层 |
| `openToTheRepoOfTheActiveTextEditorDocument` | `false` | `open_active_repo` = `true` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 适配：默认活动文件仓库，减少手工选仓 |
| `referenceLabels.alignment` | `"Normal"` | `label_alignment` = `"normal"` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `referenceLabels.combineLocalAndRemoteBranchLabels` | `true` | `combine_refs` = `true` | 设置／列头菜单／图；UI + Meta | 已映射；按证据列区分验证层 |
| `repository.commits.fetchAvatars` | `false` | `fetch_avatars` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.commits.initialLoad` | `300` | `initial_count` = `300` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.commits.loadMore` | `100` | `page_count` = `100` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.commits.loadMoreAutomatically` | `true` | `auto_load` = `true` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.commits.mute.commitsThatAreNotAncestorsOfHead` | `false` | `mute_unreachable` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.commits.mute.mergeCommits` | `true` | `mute_merges` = `true` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.commits.order` | `"date"` | `order` = `"date"` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.commits.showSignatureStatus` | `false` | `show_signature` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.fetchAndPrune` | `false` | `fetch_prune` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.fetchAndPruneTags` | `false` | `fetch_prune_tags` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.includeCommitsMentionedByReflogs` | `false` | `include_reflogs` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.onLoad.scrollToHead` | `false` | `on_load_head` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.onLoad.showCheckedOutBranch` | `false` | `on_load_branch` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.onLoad.showSpecificBranches` | `[]` | `on_load_branches` = `[]` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.onlyFollowFirstParent` | `false` | `first_parent` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.showCommitsOnlyReferencedByTags` | `true` | `tag_only_commits` = `true` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.showRemoteBranches` | `true` | `show_remotes` = `true` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.showRemoteHeads` | `true` | `show_remote_heads` = `true` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.showStashes` | `true` | `show_stashes` = `true` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.showTags` | `true` | `show_tags` = `true` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.showUncommittedChanges` | `true` | `show_changes` = `true` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.showUntrackedFiles` | `true` | `show_untracked` = `true` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.sign.commits` | `false` | `sign_commits` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.sign.tags` | `false` | `sign_tags` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repository.useMailmap` | `false` | `use_mailmap` = `false` | 设置／图；Meta；运行覆盖需按1.6及具体测试场景核对 | 已映射；按证据列区分验证层 |
| `repositoryDropdownOrder` | `"Workspace Full Path"` | `repository_order` = `"path"` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已映射；按证据列区分验证层 |
| `retainContextWhenHidden` | `true` | `retain_context` = `true` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已映射；按证据列区分验证层 |
| `showStatusBarItem` | `true` | `show_status_button` = `true` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已映射；按证据列区分验证层 |
| `sourceCodeProviderIntegrationLocation` | `"Inline"` | `scm_integration` = `"inline"` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 已实现：SCM标题行内按钮／更多菜单；UI验证位置切换 |
| `tabIconColourTheme` | `"colour"` | `tab_icon_theme` = `"colour"` | 设置／仓库菜单；Meta，宿主场景见功能矩阵 | 标签专属colour/grey，不修改活动栏配色 |

### 1.5.1\_上游已弃用名称

以下是同一设置的旧名称，不是新增能力；Typora 使用上表唯一配置，不引入旧名称转发。

| 上游旧名称 | 上游替代说明 |
| --- | --- |
| `git-graph.autoCenterCommitDetailsView` | Depreciated: This setting has been renamed to git-graph.commitDetailsView.autoCenter |
| `git-graph.combineLocalAndRemoteBranchLabels` | Depreciated: This setting has been renamed to git-graph.referenceLabels.combineLocalAndRemoteBranchLabels |
| `git-graph.commitDetailsViewFileTreeCompactFolders` | Depreciated: This setting has been renamed to git-graph.commitDetailsView.fileView.fileTree.compactFolders |
| `git-graph.commitDetailsViewLocation` | Depreciated: This setting has been renamed to git-graph.commitDetailsView.location |
| `git-graph.commitOrdering` | Depreciated: This setting has been renamed to git-graph.repository.commits.order |
| `git-graph.dateFormat` | Depreciated: This setting has been renamed to git-graph.date.format |
| `git-graph.dateType` | Depreciated: This setting has been renamed to git-graph.date.type |
| `git-graph.defaultFileViewType` | Depreciated: This setting has been renamed to git-graph.commitDetailsView.fileView.type |
| `git-graph.fetchAndPrune` | Depreciated: This setting has been renamed to git-graph.repository.fetchAndPrune |
| `git-graph.fetchAvatars` | Depreciated: This setting has been renamed to git-graph.repository.commits.fetchAvatars |
| `git-graph.graphColours` | Depreciated: This setting has been renamed to git-graph.graph.colours |
| `git-graph.graphStyle` | Depreciated: This setting has been renamed to git-graph.graph.style |
| `git-graph.includeCommitsMentionedByReflogs` | Depreciated: This setting has been renamed to git-graph.repository.includeCommitsMentionedByReflogs |
| `git-graph.initialLoadCommits` | Depreciated: This setting has been renamed to git-graph.repository.commits.initialLoad |
| `git-graph.loadMoreCommits` | Depreciated: This setting has been renamed to git-graph.repository.commits.loadMore |
| `git-graph.loadMoreCommitsAutomatically` | Depreciated: This setting has been renamed to git-graph.repository.commits.loadMoreAutomatically |
| `git-graph.muteCommitsThatAreNotAncestorsOfHead` | Depreciated: This setting has been renamed to git-graph.repository.commits.mute.commitsThatAreNotAncestorsOfHead |
| `git-graph.muteMergeCommits` | Depreciated: This setting has been renamed to git-graph.repository.commits.mute.mergeCommits |
| `git-graph.onlyFollowFirstParent` | Depreciated: This setting has been renamed to git-graph.repository.onlyFollowFirstParent |
| `git-graph.openDiffTabLocation` | Depreciated: This setting has been renamed to git-graph.openNewTabEditorGroup |
| `git-graph.openRepoToHead` | Depreciated: This setting has been renamed to git-graph.repository.onLoad.scrollToHead |
| `git-graph.referenceLabelAlignment` | Depreciated: This setting has been renamed to git-graph.referenceLabels.alignment |
| `git-graph.showCommitsOnlyReferencedByTags` | Depreciated: This setting has been renamed to git-graph.repository.showCommitsOnlyReferencedByTags |
| `git-graph.showCurrentBranchByDefault` | Depreciated: This setting has been renamed to git-graph.repository.onLoad.showCheckedOutBranch |
| `git-graph.showSignatureStatus` | Depreciated: This setting has been renamed to git-graph.repository.commits.showSignatureStatus |
| `git-graph.showTags` | Depreciated: This setting has been renamed to git-graph.repository.showTags |
| `git-graph.showUncommittedChanges` | Depreciated: This setting has been renamed to git-graph.repository.showUncommittedChanges |
| `git-graph.showUntrackedFiles` | Depreciated: This setting has been renamed to git-graph.repository.showUntrackedFiles |
| `git-graph.useMailmap` | Depreciated: This setting has been renamed to git-graph.repository.useMailmap |

## 1.6\_命令与功能布局矩阵

| 上游命令 | Typora 入口 | 实现与验证边界 |
| --- | --- | --- |
| `git-graph.view` | 状态栏、SCM 提交图标题、命令面板；UI打开中央历史 | View Git Graph (git log) |
| `git-graph.addGitRepository` | 仓库管理 → 添加；UI验证单仓隐藏/多仓选择 | Add Git Repository... |
| `git-graph.clearAvatarCache` | 操作／命令面板 → 清除头像缓存；宿主生命周期回归 | Clear Avatar Cache |
| `git-graph.endAllWorkspaceCodeReviews` | 评审管理 → 全部结束；Git评审存储与90天过期 | End All Code Reviews in Workspace |
| `git-graph.endSpecificWorkspaceCodeReview` | 评审管理 → 指定评审结束；Git存储 | End a specific Code Review in Workspace... |
| `git-graph.fetch` | 顶部Fetch、操作菜单；Git本地bare远端 | Fetch from Remote(s) |
| `git-graph.removeGitRepository` | 仓库管理 → 移除记录；UI多仓入口 | Remove Git Repository... |
| `git-graph.resumeWorkspaceCodeReview` | 评审管理 → 继续；Git存储、UI打开详情 | Resume a specific Code Review in Workspace... |
| `git-graph.version` | 操作／命令面板 → 版本信息；系统Git输出 | Get Version Information |
| `git-graph.openFile` | 变更文件右键 → 打开文件；UI历史文件到宿主编辑器 | Open File |

### 1.6.1\_可见布局与交互逐项核对

下表区分上游 Git Graph 与 VS Code 工作台宿主。35/22/16px 是本轮工作台统一尺寸，不把上游扩展的 40/30/24px 旧尺寸称作已逐像素复制。功能入口的归属和排列先保持一致，宿主差异单列记录。

| 区域／功能 | 上游行为及布局 | Typora 当前行为 | 实际回归 |
| --- | --- | --- | --- |
| 顶部仓库 | 多仓库 selector，单仓库省略 | 首次加载即隐藏；多仓刷新显示；分支、远端开关、右侧动作 | UI 单仓／多仓状态与宽度 |
| 顶部动作 | Find、仓库设置、Fetch、Refresh | 相同区域，增加集成终端入口；22px 命中框／16px SVG | UI 几何与可访问名称 |
| 历史五列 | Graph、Description、Date、Author、Commit；后三列可隐藏 | 默认同顺序；列头菜单恢复显隐并保留缩放 | UI 真鼠标菜单切换及显示计算 |
| 引用标签 | Normal；分支左标签右；分支紧靠图标签右 | 三种设置分别移动真实标签 DOM，非仅修改字段 | UI 图列落点；分支／标签数据由 Data 验证 |
| 未提交节点 | 工作树空心圆／HEAD空心圆，后者虚线相连 | 两种模式；与HEAD连接保持拓扑，默认工作树空心圆 | Data 拓扑；UI 工作树选中与SVG |
| 提交详情 | 点击打开，再次点击关闭；Ctrl比较；行内或底部 | 鼠标及Enter/Space共享转换；关闭清理版本和文件状态；两种落点 | UI 重复激活、异步延迟、停靠与360px布局 |
| Changed Files | 树／列表、紧凑目录、状态标识、打开差异和文件 | 文件／目录22px行、16px图标，无重复外margin；局部滚动 | UI 真实文件跳转与嵌套目录 |
| 任意比较 | 两提交、提交与工作树、根提交与空树 | Ctrl/Meta鼠标及键盘比较；首提交EMPTY | UI + Git |
| 评审 | 单提交／区间、跨会话、90天过期 | localStorage按仓库和版本对保存；打开文件记已读 | Git存储过期；UI详情操作 |
| 查找 | 字段搜索、大小写／正则、输入更新、高亮、可选自动开详情 | 三开关默认false与上游一致；输入同步匹配，Enter／Shift+Enter切换结果；匹配位置独立于详情 | UI实际输入、大小写、合法／非法及零长度正则、高亮、循环、详情开关与延迟Git响应失效 |
| 日期 | 本地日期时间、仅日期、ISO日期时间、ISO日期、相对时间 | 五种；相对时间按秒／分／小时／天表达 | UI真实格式输出；Meta枚举 |
| Git操作对话框 | 对象右键、可配置初始值、Enter主动作 | 中文字段；先预览具体命令再执行；多行消息Enter换行 | UI无变更预览、Git执行／过期拒绝 |
| 分支 | 创建／切换／删除／Fetch／Merge／Pull／Push／Rebase／重命名／Reset | 本地branch菜单补Fetch与Pull；各种命令按目标填充 | Git真实ref、bare远端、rebase；UI入口 |
| 标签 | Annotated默认；Lightweight；创建后可推送 | 显式类型和push；复合预览显示两条命令，第二步失败说明第一步已完成 | Git对象类型及bare远端ref |
| 压缩合并 | Merge/Pull squash、Default／Git SQUASH_MSG、可延迟提交 | 成功有暂存差异才提交；提交前复核草稿与index；首步后失败报告部分成功并保留暂存成果 | Git单父提交、--no-commit、后续检查失败及外部stage保留 |
| 引用输入 | 不替换／用连字符／下划线替换空格 | 显式设置，替换后仍执行check-ref-format | Git实际创建feature-space |
| Stash | 创建含未跟踪、apply/pop恢复index、drop、分支 | 对象右键；默认include-untracked对齐上游 | Git真实stash生命周期 |
| 远端仓库 | 查看、添加、编辑、删除、fetch/prune、配置导出 | 操作菜单与共享配置；Git/终端路径不从共享文件覆盖 | Git本地远端；UI仓库管理 |
| 语言和图标 | VS Code宿主语言与主题 | Typora语言；双语键；官方Codicons数据，源码不复制上游 | Meta双语；UI真实SVG |
| SCM入口 | 标题行内／More Actions | `scm_integration`控制标题图按钮，更多菜单保留入口 | UI隐藏行内后菜单仍可达 |
| 生命周期 | 宿主负责隐藏／关闭／卸载 | 隐藏取消读查询；永久dispose清监听/observer/节点；写入中拒绝卸载 | UI阻止写入时销毁、幂等销毁和禁止重开 |

### 1.6.2\_默认适配与证明边界

首次数量300、增量100、自动加载、date排序、淡化merge、合并同名引用、显示remote HEAD、mailmap默认关闭、搜索深度0、仓库按路径排序已对齐固定上游。`open_active_repo=true`保留本产品默认：打开活动文档所属仓库，避免用户每次切换文件后重新选仓。无障碍状态字母始终显示。TextDecoder编码集合、Typora文档和侧栏宿主、35/22/16px统一密度属于明确适配。

上游废弃配置名仅列为索引，不为它们建立第二份状态或旧参数转发。自定义PR提供方列表与标签图标配色已经接入，`test_git_graph_pull_request.cjs` 与 `test_git_graph.mjs` 已验证提供方切换、自建服务、编码和存储；`pr_providers`维护命名提供方，`pr_config`保存仓库选择。GitHub/GitLab/Bitbucket URL生成可使用本地纯函数验证，用户账户认证及网络推送不能用本地bare回归替代。

本表为本次固定版本完整配置与命令清点，不以条目数量作为全功能完成证明。每次改动后应重跑相关实际行为回归，再更新证据；保留前述宿主差异，不能宣称Typora已经具备完整VS Code扩展宿主。

### 1.6.3\_工作台菜单与快速入口

以下属于承载 Git Graph 的工作台排版，参考 VS Code 的入口职责；不是 Git Graph 扩展自带配置。

| 功能／排版 | Typora Code 入口与适配 | 实际行为证据 |
| --- | --- | --- |
| 顶级菜单 | 文件、编辑、选择、视图、转到、终端、帮助；Markdown 段落／格式位于编辑子菜单，主题位于视图 | `test_workspace_titlebar.cjs` 菜单顺序、子菜单内容、原生命令调用 |
| 文本选择与定位 | 选择支持原生文本或 Monaco 全选／当前行／扩大范围；转到支持历史前后、文首／文末 | `test_workspace_file_editing.cjs` 实际选区和光标；titlebar 历史事件 |
| 命令面板 | `Ctrl+Shift+P` 或快速输入 `>`；实时读取社区核心 `CommandManager.commandMap`，尊重 `showInCommandPanel` 和用户快捷键，经 `run(id)` 执行 | titlebar 动态注册表、隐藏命令、注销后消失、真实路由断言 |
| 文件与行定位 | `Ctrl+P` 文件名搜索；`Ctrl+G` 或 `:行号:列号` 定位活动文件；不复制正文到另一文档 | titlebar 隐藏文件及复合扩展名；file editing 真实 Monaco 定位且无修改 |
| 符号与调试边界 | `@` 提示使用大纲，尚无跨原生 Markdown／Monaco 的统一符号提供方；不展示无实现的运行／调试菜单 | 明确界面提示，不把静态条目当作能力 |
| 终端菜单 | 调用已注册的默认／管理员终端、编辑区／Panel 转移和设置命令 | titlebar 命令路由；终端专项真实会话验证 |
| 右侧布局按钮 | 窗口控制前放置主侧栏与底部 Panel；22px 按钮、16px 官方布局图标，调用 sidebar.toggle／terminal_toggle_panel | titlebar 几何、路由和卸载清理；terminal Panel 保持真实会话 |

### 1.6.4\_收尾审查的未完成项与证据缺口

下列条目明确限定“一比一”的完成范围；配置名称清点齐全不等于其全部值、入口和行为均已对齐。

| 优先级 | 未完成项／差异 | 已确认实现边界 | 应补行为证明 |
| --- | --- | --- | --- |
| 已完成 | Graph Find 控件与行为 | 固定上游 `web/findWidget.ts` 与 `src/extensionState.ts` 为依据；`git_graph_find.ts`实现大小写、正则、错误提示、即时匹配、高亮与详情开关；三个开关默认false。同步匹配替代上游200ms延迟，详情仍使用epoch隔离 | `test_git_graph_interaction.cjs` 已执行真实输入、零长度／非法模式、循环与开关、逆序释放真实Git diff响应；截图 `graph_find_regex.png` |
| P2 | 设置页的操作排版 | 当前 `settings_dialog` 逐字段生成一个表单；对象配置为 JSON 文本框，包括快捷键、对话框默认值、自定义glob等。字段可配置，但不是 VS Code 设置页分组／检索／控件的一比一移植 | 常见配置无须编辑 JSON 的实际操作；非法输入能定位字段，不只展示通用错误 |
| P2 | 部分配置的运行回归不足 | 配置矩阵中的 Meta 仅验证类型、默认值、双语标签；没有逐项证明自动加载、每种加载筛选、全部快捷键覆盖与替换、头像和签名显示等 | 每项真实加载／重开／键盘行为；签名显示不能以标签签名Git测试代替，联网头像不能以默认false代替 |
| P2 | 高级详情／导航的上游视觉差异 | 当前固定35／22／16px密度属于工作台适配；上游扩展尺寸并非逐像素相同。两种详情落点已通过本地Electron；本轮Typora实窗已验证内嵌详情与窄分栏，停靠实窗及成对截图仍待补充 | 固定上游与本地相同状态的成对截图，以及本轮实窗交互证据 |
| P3 | 声明与测试粒度 | `Git + Meta` 或 `UI + Meta` 是相关套件入口，并不保证本行所有枚举组合、全部宿主路径均被单独执行 | 继续为新增或更改的真实行为建立精确断言；避免用字段／源码字符串存在代替测试 |
