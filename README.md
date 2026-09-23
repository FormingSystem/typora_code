---
id: tools.typora.readme
title: "Typora Code 阅读工作台"
kind: reference
status: evolving
domains:
  - tools
---

# 第1章\_Typora\_Code阅读工作台

Typora Code 为 Typora 增加多文档标签、源码编辑、文件搜索、Git 审阅和集成终端，把 Markdown 阅读与日常项目操作放在同一个窗口内。打开普通文件或文件夹即可使用，无需特定知识库目录或元数据。

工作台布局、交互方式和部分功能设计参考并模仿 [Visual Studio Code（VS Code）](https://code.visualstudio.com/)，设计来源见 [界面基线](docs/vscode_design_baseline.md)。

这是独立维护的社区增强项目，并非 Typora 或 VS Code 官方产品，需要先安装 Typora。Typora 的下载、许可与更新由其官方提供；本项目维护增强代码、主题、安装脚本及说明文档。

| 能力 | 使用方式 |
| --- | --- |
| 多文档阅读 | 标签切换、左右/上下分栏、阅读前后退、恢复上次位置；按原生恢复配置记住各目录打开的文件 |
| 文件与源码 | 文件树、重命名与管理操作、Monaco 源码编辑、编码和换行设置 |
| SSH远程 | 连接Linux主机并打开远端文件夹，主资源树、文件操作、搜索、Git和默认终端共同操作远端；Markdown原生即时编辑，支持链接导航、多电脑/多账号别名管理、系统凭据和独立查看保险箱；[使用与边界](docs/remote_ssh.md#当前状态) |
| 搜索 | 工作区内容搜索；单击侧栏预览，双击或 Enter 打开；重复单击返回命中位置 |
| 链接预览 | 选中Markdown链接在左下独立预览，右上关闭；顶部、右边和右上角可调整高宽，收起功能栏仍保留预览，正文不预留整列空白；本地预览提供50%—150%缩放滑条和百分比；右键左右/上下分屏只读预览，本地目标可打开源文件编辑。网页在隔离页面加载，见[使用边界](docs/link_preview.md) |
| Git | [仓库列表、提交图与操作菜单](docs/git_scm_actions.md)、文件历史、只读差异、提交和远端操作 |
| 终端 | Windows 本机 Shell、多会话、分屏、查找及终端配置 |
| 统一设置 | 左下齿轮 → 设置；Typora原生、社区插件、TyporaCode分层，自有配置搜索、分类、恢复默认；[配置归属](docs/workspace_settings.md) |
| 社区插件 | 左侧扩展（Ctrl+Shift+X）；左下齿轮 → 设置 → 社区插件设置；真实社区市场或本地ZIP安装，空安装直接浏览市场；默认停用，启用后进入插件自身设置，支持独立启停及更新；[兼容边界](docs/community_plugins.md) |
| 更新 | 按GitHub提交hash下载ZIP，无需Git或历史；Windows多窗口启动仅提醒一次，全阶段进度反馈，检查失败可直接重试；帮助菜单可打开项目GitHub仓库下载ZIP；立即安装、手动重启 |
| Markdown | 原生编辑、标题大纲、缩略图、代码高亮、代码块一键复制、长代码展开及[图片／Mermaid放大查看](docs/reading_media_viewer.md) |

Markdown 分栏共用一个活动的 Typora 原生编辑器，其余分栏提供预览；源码标签可分别编辑与保存。C/C++ 符号大纲需要本机 clangd。当前没有 VS Code 扩展宿主。平台支持和未覆盖能力见[环境要求](docs/installation.md#环境要求)与[功能范围](docs/workbench_parity.md)。

开发与稳定性验收入口：[需求设计](docs/requirements_design.md)、[测试架构与用例](docs/stability_testing.md)、[问题分类索引](docs/stability_issues.md)。

**2026.09.22.13** 新增代码和纯文本围栏一键复制，悬停右上角或键盘进入即可使用；复制完整当前内容并给出成功/失败反馈，正文和只读预览共用。

**2026.09.23.4** 增加SSH连接目录：按电脑分组保存多个账号，支持别名、搜索、编辑和删除，一键选中连接。默认终端跟随当前窗口的SSH身份，也可明确选择其他已存连接；密码通过系统凭据及ASKPASS复用。顶栏显示`SSH: 用户名`。密码查看需独立保险密码，重置只清除查看域，自动登录保留；详见[连接与密码管理](docs/remote_ssh.md#r0705-多连接与账号管理)。

**2026.09.22.14** 将SSH接入主工作区：远端文件/文件夹选择、资源操作、搜索和SCM/Graph共享远端身份，Markdown直接使用原生编辑器，保存先确认远端写入。图片按需加载，中文相对链接、锚点和前后导航可用；Windows文件连接支持可选加密密码记忆。该版终端的独立认证边界由2026.09.23.4统一凭据能力替代。外部改动自动加载、完整会话恢复及其他未覆盖范围见[当前边界](docs/remote_ssh.md#当前边界与未完成项)，不宣称完整VS Code Remote SSH等价。

**2026.09.22.10** 增加[统一设置](docs/workspace_settings.md)：左下齿轮“设置…”打开自有功能搜索与统一配置，原生偏好和社区插件各自管理；SSH连接配置、可见目录定时刷新与独立Git审阅标签已接入，慢Git不阻塞文件操作。同时保留Win10端已交付的PowerShell历史滚动修复。继续改善[Git刷新隔离与大列表响应](docs/workspace_responsiveness.md)：Git确认后释放全局弹窗，变更及历史文件按可见范围绘制；空文件夹提供初始化入口，嵌套仓库按实际Git身份识别。保留[SSH远程目录、项目终端与只读Git状态](docs/remote_ssh.md)，以及[Markdown链接左右/上下只读分屏预览](docs/link_preview.md)。

当前发行版本为 **2026.09.23.5**，帮助菜单可直接打开项目GitHub仓库下载完整ZIP；检查更新失败或超时可直接重试。已安装此版本的用户保存文档后正常重启生效；Win10 PowerShell连续回车的历史丢失已在19045.7725、Typora 1.14.10原始宿主隔离副本修复并复测；滚动条仍按原有规则在悬停/滚动时显示、离开渐隐。保留长代码展开后短代码框高度隔离修复。保留路径搜索等待磁盘检查时已枚举文件继续可用并显示等待/错误状态的修复；保留终端末行边界修复，各版本修复公告以[发行记录](enhancements/release.json)为准。Alt＋左右键及顶栏箭头共用[导航历史](docs/navigation_history.md)，记录链接起终点、源码行列及编辑组，关闭标签后可以回溯重开；普通源码近邻移动合并，明确跳转保留位置。共享弹窗提供右上角×关闭，底部操作统一右对齐，窄窗口按钮自动换行；关闭沿用原有取消逻辑。点击终端先显示面板，准备目录、检测Shell、启动进程和等待首次输出时显示状态与活动进度；Shell启动等待不再阻挡界面展示。检查、校验和安装更新持续显示活动进度；下载显示实际大小，有有效总量才显示百分比。取消立即反馈，关闭后可重新查看同一更新任务；安装完成后手动重启生效。切换目录会隔离旧工作区，并按原生恢复配置恢复目标目录上次打开的文件；空编辑区不再显示假文件。Git 提交详情支持 Markdown 列表与代码显示。底栏图标复用共享居中规则，滚动条离开后渐隐；社区插件在工作台显示后加载。资源管理器、时间线和Git一级分区共用留白与整行悬停背景；共享菜单完整显示名称及快捷键，极窄窗口换行。原生图标启动后一次呈现完整工作台，不显示加载提示覆盖层；侧栏功能切换保持展开，详见[启动与切换稳定性](docs/startup_stability.md)。

本轮统一了资源管理器与Git分区的折叠图标槽位；提交详情可按远端识别GitHub、Gitee、GitLab和Bitbucket并打开网页。安装按实际写权限决定是否申请系统授权；更新下载和解压默认创建Typora用户数据下的`temp`，同版本新提交也可更新。详细行为见[安装与更新](docs/installation.md)及[提交网页入口](docs/git_commit_web.md)。

分屏与拖动已修复删除/合并后的比例错位，分隔线只调整相邻两栏；标签重排保留当前编辑器，拖动停止滚动后不再空转动画。拖出仅接收指定文件，不恢复原目录整组标签；同文件正文/保存格式一致时复用目标标签及撤销，确有差异保留双方并提示；合并不需要额外确认，宿主短暂切换会自动等待，失败保留文档并轻提示。20／100／1000轮协议压力、源码/Markdown的已保存与未保存四种状态各20次原生往返的结果及操作边界见[拖动与多窗口](docs/drag_and_windows.md)。

验证与限制以[最新交付记录](docs/feedback_review.md)为准；仍有启动长任务及跨机器/平台验收缺口。更新安装后需要保存文档并手动重启所有 Typora 窗口，已运行窗口不会热替换。

设置从左下齿轮或 `Ctrl+,` 打开独立浮层，支持最大化与右上关闭；编辑器分类可配置标签换行和自动链接预览。选中Markdown链接会在左下独立只读预览，右上可关闭，顶部、右边及右上角可拖动调高宽；收起功能侧栏仍保留预览；预览只覆盖左下角自身区域，正文保持正常宽度，不留下整列空白。本地Markdown和源码预览提供50%—150%滑条、百分比及加减按钮，与搜索预览共用比例记忆，Ctrl/Meta滚轮同步显示。右键可左右或上下分屏，图标提供打开源文件和刷新。标签更多菜单使用可搜索的已打开编辑器列表。详见[预览与标签](docs/link_preview.md)和[设置](docs/workspace_settings.md)。

## 1.1\_安装、检查与恢复

**Windows 快速开始：**

1. 从 [Typora 官方网站](https://typora.io/)安装 Typora，并确认可以正常打开文档。
2. 在**本仓库网页**点击 **Code → Download ZIP**，完整解压下载包。进入能看到本文件和 `install_windows.cmd` 的目录。包内已含 `enhancements/dist/`，普通安装无需构建或预装 Node.js。
3. 保存正在编辑的文档。双击 **`install_windows.cmd`**，按提示完成安装并记下输出的 **Backup** 目录；首次安装需要联网下载经摘要校验的私有 Node 运行时。普通权限优先；遇受保护写入目标时说明原因并请求Windows系统授权，取消保留原安装。
4. 在该目录打开 PowerShell，执行下面的只读检查。返回 **`status: OK`** 后，正常重启 Typora，在“主题”菜单选择 **cpp github consolas**。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check_windows.ps1
```

**Windows 卸载：**保存文档并退出 Typora，双击 **`uninstall_windows.cmd`**。脚本自动查找当前用户的有效安装前备份；只有多个候选时才需要选择，空输入取消。没有兼容备份时，备份当前启动页后移除工作台加载入口，保留当前宿主版本与文档、主题、用户设置及插件缓存。可用 `uninstall_windows.ps1 -check_only` 只读预检；日志和失败回滚见安装指南。

**安装、离线准备、权限问题、更新、卸载及恢复原配置，统一见[安装与恢复指南](docs/installation.md)。** 后续更新备份通过 `restore_windows.ps1` 回退版本，不能用于卸载。保留备份，不要直接删除 Typora 用户数据目录。Typora 更新可能替换启动入口，更新后重新检查并安装增强。

Linux / MSYS2 UCRT64 用户请从[对应环境步骤](docs/installation.md#linux与ucrt64)开始；Linux 原生环境、Windows ARM64 和 UCRT64 的完整实机验收尚未完成，Linux 暂无集成终端运行包。

## 1.2\_按需求阅读

| 需求 | 对应说明 |
| --- | --- |
| 同窗多文档标签、左右／上下分栏、Alt 方向键阅读历史 | [标签页、分栏与阅读历史](./enhancements/README.md#1.4_标签页、分栏与阅读历史) |
| 目标标题与目录定位、来源栏位置保留、重开文档继续阅读 | [阅读位置与标题定位](./enhancements/README.md#1.4.1_阅读位置与标题定位) |
| 复制文件或文件夹的相对路径、绝对路径 | [复制文件路径](./enhancements/README.md#1.4.2_复制文件路径) |
| 全文件资源管理器、隐藏目录、源码编辑保存及编码／换行设置 | [文件与语言识别](./enhancements/README.md#1.4.3_全部文件与语言识别) |
| 按文件搜索、精确行列跳转、范围筛选及替换预览 | [工作区搜索与替换](./enhancements/README.md#1.4.4_工作区搜索与替换) |
| 选中文字设置常用／自定义字体颜色、恢复默认及明暗主题适配 | [Markdown 字体颜色](docs/markdown_text_color.md) |
| Ctrl／Cmd 加左键查找选中文字、单击预览及双击打开 | [选中文字的跳转预览](./enhancements/README.md#1.4.6_选中文字的跳转预览) |
| 多文件时搜索卡顿、渐进结果与性能数据 | [搜索性能](docs/search_performance.md) |
| 标签及侧栏工具的左键拖动、移至新窗口 | [拖动与多窗口](docs/drag_and_windows.md) |
| Ctrl+= / Ctrl+- 缩放窗口；Ctrl+滚轮在正文缩放窗口、在终端调整字号，100%底栏入口常驻 | [窗口缩放](docs/workspace_zoom.md) |
| 活动栏排序、侧栏缩窄收起、大纲紧凑布局及减少动画 | [活动栏与侧栏布局](./enhancements/README.md#1.4.5_活动栏与侧栏布局) |
| 中文源代码管理主侧栏、分支操作、远端同步与评审 | [Git Graph 提交关系图](./enhancements/README.md#1.5_Git_Graph提交关系图) |
| 宽窄自动切换差异、红绿概览、改动导航及只读历史正文 | [差异编辑器与时间线](./enhancements/README.md#1.5.2_中央差异编辑器与文件时间线) |
| 文件菜单、系统选择窗口和资源管理器操作 | [文件操作](docs/file_operations.md) |
| 终端面板、本机 Shell 识别、会话和设置 | [终端操作与配置](docs/terminal_operations.md) |
| 终端展开时的目录浮层与字数居中 | [底栏布局设计](docs/statusbar_layout.md) |
| 统一命令、领域服务和资源生命周期 | [工作台架构](docs/workspace_architecture.md) |
| 需求编号、对应设计文档和持续更新规则 | [需求设计索引](docs/requirements_design.md) |
| 终端依赖、离线缓存和测试边界 | [终端运行文件与验证](./enhancements/README.md#1.7_终端运行文件、安装与验证) |
| VS Code Git Graph 功能收集、选项与实现边界 | [完整功能对照](./enhancements/git_graph_features.md#第1章_Git_Graph功能对照与操作说明) |
| C/C++ 宏、函数和类型的语法高亮 | [语法识别与颜色映射](./typora配置修改.md#4.1_为什么主题CSS不等于语法识别器) |
| 在代码框外点击后直接展开、收起长代码 | [长代码块限高与完整展开](./typora配置修改.md#4.3_长代码块限高与完整展开) |
| Mermaid 全屏、缩放、拖动与适应宽度 | [查看器操作](./typora配置修改.md#5.2_查看器操作) |
| Typora 原生偏好设置 | [原有设置截图](./typora配置展示.md#第1章_文件) |
| 修改扩展源码、重建 bundle 和运行回归测试 | [开发者构建](./enhancements/README.md#1.2_开发者构建) |

## 1.3\_维护与参与开发

| 入口 | 内容 |
| --- | --- |
| [安装与恢复指南](docs/installation.md) | 用户下载安装、环境、离线缓存、更新与卸载 |
| [增强模块说明](enhancements/README.md#1.2_开发者构建) | 源码构建、依赖和测试命令 |
| [开发交接](docs/development_handoff.md) | 架构边界、当前实现和后续工作 |
| [需求设计索引](docs/requirements_design.md) | 稳定需求编号与设计入口 |
| [反馈复查记录](docs/feedback_review.md) | 各次实际验证和交付记录 |

用户脚本在仓库根目录，以 `install`、`check`、`uninstall`（Windows 卸载）、`restore`（备份恢复）命名；平台与事务实现位于 `scripts/`。`enhancements/src/` 保存工作台源码，`enhancements/dist/` 保存配套预构建文件。第三方资产的许可证、来源和摘要随 `enhancements/vendor/` 与 `enhancements/dist/licenses/` 保留。

## 1.4\_版权与来源声明

本项目的原创代码、界面、文档、主题和安装脚本，除特别说明外，采用根目录 [LICENSE](LICENSE) 中的 **GNU GPL version 2（GPL-2.0-only）** 发布。

原创维护者为 **FormingSystem**，联系邮箱为 `lizhaojun97@qq.com`，项目地址为 [FormingSystem/typora_code](https://github.com/FormingSystem/typora_code)。原创署名、二次开发与官方贡献、非官方分叉及未来版本边界统一见 [版权、开源与贡献声明](COPYRIGHT.md)。

Typora Code 是独立维护的社区增强项目。Typora 本体、第三方依赖与资源保留其原有版权和许可证；用户打开、编辑和导出的文档仍归各自权利人。本项目的许可证不重新授权这些内容。
