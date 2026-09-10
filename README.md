---
id: tools.typora.readme
title: "Typora Code 阅读工作台"
kind: reference
status: evolving
domains:
  - tools
---

# 第1章\_Typora\_Code阅读工作台

Typora Code 是基于 Typora 的独立阅读工作台，面向 linux-note 中链接跳转密集、源码阅读与修改频繁的使用场景，集中提供多文档阅读、位置恢复、源码编辑与 Git 审阅。它也可以打开普通文件夹独立使用，不要求 linux-note 的目录结构、元数据或启动脚本。

本仓库维护主题、常驻工作区核心和阅读增强。配置后，默认在一个桌面窗口内使用多文档标签页，按需向右、向下分栏；文件树显示全部文件及隐藏项目，Markdown 保留原生渲染，源码使用占满编辑组的 Monaco，支持编辑和 Ctrl+S 保存。窗口唯一的全局底栏显示活动源码的行列、语言、编码及换行设置，随标签和编辑组切换。工作区搜索按文件展示路径和高亮结果，悬停可查看行列位置，支持精确跳转、仅搜索 Git 更改文件与替换预览；活动栏可拖动排序并标出当前功能。

搜索同时支持手动输入和选中文字后 Ctrl／Cmd 加鼠标左键。命中文件统一列在搜索侧栏，单击在搜索结果下方预览，双击或 Enter 打开文件并选中命中内容；Markdown 使用原生渲染视图，标题、段落与代码围栏按行列精确定位，并保留既有标签和阅读历史。预览可以收起、展开，工具栏右侧直接显示百分比滑块，与 Ctrl／Cmd 加滚轮共用字号比例，预览期间保留中央文档的阅读位置。Markdown 预览包含围栏高亮和隔离的 Mermaid 图表，本地随附图表库无需联网下载。

资源管理器支持文件与文件夹重命名：选中后按 F2，或使用右键菜单，Enter 确认、Esc 取消。同名目标会提示；改名同步打开标签、源码草稿保存路径、阅读历史和搜索列表。

阅读历史、上次位置恢复、文档缩略图、中文源代码管理与提交图、Monaco 双栏差异和文件历史、提交与远端同步、Git 操作评审、仓库终端及管理员入口、C/C++ 代码高亮、长代码展开／收起和 Mermaid 独立查看器共用这个工作区。

Windows／Linux 使用 Typora 标准原生窗口边框和文件、编辑、段落、格式、视图、主题、帮助七个系统菜单，各栏目由宿主直接打开自己的子菜单。保存文档并正常重启后生效；安装不强制关闭窗口。工作台不再自绘系统标题栏或窗口按钮。

> 当前采用 head 静态样式和常驻工作台，不通过插件注册或文件夹切换重载。本轮构建、检查、37个 UI 目标（首轮36项通过加 Graph 完整复跑）、原生18项及真实安装核验已通过；物理键盘 accelerator 冲突仍未实证。当前范围见 [工作台矩阵](docs/workbench_parity.md) 和 [Git Graph矩阵](enhancements/git_graph_features.md)。

## 1.1\_安装、检查与恢复

以下命令从本目录执行。普通安装使用仓库预构建文件，无需预装 Node.js 或联网下载核心；Windows 首次配置另从 Node 官方下载并校验终端私有运行时，离线环境可提供对应 ZIP 缓存；脚本根据参数、环境变量和系统信息发现 Typora，不包含本机盘符或用户名。

| 环境 | 安装 | 只读检查 | 恢复 |
| --- | --- | --- | --- |
| Windows PowerShell | `powershell -NoProfile -ExecutionPolicy Bypass -File .\configure_windows.ps1`，也可双击 `configure_windows.cmd` | `powershell -NoProfile -ExecutionPolicy Bypass -File .\check_configuration_windows.ps1` | `powershell -NoProfile -ExecutionPolicy Bypass -File .\restore_configuration_windows.ps1 -backup_root '<安装输出的备份目录>'` |
| Linux / MSYS2 UCRT64 Bash | `bash ./configure.sh` | `bash ./check_configuration.sh` | `bash ./restore_configuration.sh --backup-root '<安装输出的备份目录>'` |

安装包括主题 `cpp_github-consolas.css`。发布资产为 `workspace_core.css`、`workspace.css`、`workspace_core.js`、`workbench.js` 与语言、许可资源，安装到用户数据目录 `typora_code/`。`window.html` 的 head 先加载两份静态 CSS，再 defer 启动核心与工作台。核心等待宿主及样式就绪后只初始化一次，工作台等待其 `ready`，切换文件或文件夹不会重建。当前安装与恢复使用 schema 4 JSON 清单；先预检、备份、复制校验，失败回滚。 安装使用 schema 4 的 `native_profile` 记录完整备份及 SHA：`profile.data` 是 UTF-8 JSON 的小写十六进制文本，只把 `framelessWindow` 设为 `false`；原文件不存在时不创建。恢复只还原该字段原值或缺省，保留安装后其他设置。未知编码、非对象、非布尔窗口设置及写前摘要冲突均拒绝写入，失败按事务回滚。安装不修改 `app.asar`，也不部署主进程菜单桥接。旧业务设置仅在新配置不存在时迁移至 `typora_code/settings/workspace.json`，后续安装保留用户设置，不在打开的文件夹写配置。旧列表仍启用其他插件时拒绝写入，要求先停用，其他插件文件不被覆盖；不保留并行运行的旧插件入口。 安装完成后保存文档并正常重启 Typora，选择 `cpp github consolas` 主题。

当前以 `59412a2` 为平直布局与功能范围参考，保留已验证的稳定修复，并非整库恢复旧提交。VS Code `1.136.2` 与主题取证用于已明确要求的修复，不授权继续扩充工作台或恢复 Modern 布局。按用户 2026-09-10 的最新要求，Explorer 文件和真实文件标签使用随包提供的 Seti `10.0.0` 原始字形与颜色；文件夹只保留展开箭头。独立大纲保留原生 `fa-list` 图标及原节点，SCM 与 Graph 的图标各按自身语义处理。此调整仅涉及图标，不恢复 Open Editors、底部 Panel 或预览标签行为；普通安装不读取本机 VS Code。详见 [设计基线](docs/vscode_design_baseline.md) 和 [图标映射](docs/icon_mapping.md)。

路径发现、非交互参数、支持环境和备份清单详见 [一键配置](./typora配置修改.md#第6章_PowerShell、UCRT64与Linux一键配置)。Typora 升级后应重新检查入口，按 [升级边界](./typora配置修改.md#7.3_Typora升级边界) 重新配置。本轮最终验证见 [验证记录](./enhancements/README.md#1.2_开发者构建)，当前 `check` 和 Windows／Python 隔离安装事务已通过，同一构建的37个 UI 目标（36+1复跑）、原生18项与真实安装核验通过；原生菜单快捷键冲突尚未验证，合成键盘事件不能替代物理键盘验证；原生 Linux／UCRT64 实机验证仍需单独记录。

## 1.2\_按需求阅读

| 需求 | 对应说明 |
| --- | --- |
| 同窗多文档标签、左右／上下分栏、Alt 方向键阅读历史 | [标签页、分栏与阅读历史](./enhancements/README.md#1.4_标签页、分栏与阅读历史) |
| 目标标题与目录定位、来源栏位置保留、重开文档继续阅读 | [阅读位置与标题定位](./enhancements/README.md#1.4.1_阅读位置与标题定位) |
| 复制文件或文件夹的相对路径、绝对路径 | [复制文件路径](./enhancements/README.md#1.4.2_复制文件路径) |
| 全文件资源管理器、隐藏目录、源码编辑保存及编码／换行设置 | [文件与语言识别](./enhancements/README.md#1.4.3_全部文件与语言识别) |
| 按文件搜索、精确行列跳转、范围筛选及替换预览 | [工作区搜索与替换](./enhancements/README.md#1.4.4_工作区搜索与替换) |
| Ctrl／Cmd 加左键查找选中文字、单击预览及双击打开 | [选中文字的跳转预览](./enhancements/README.md#1.4.6_选中文字的跳转预览) |
| 活动栏排序、侧栏缩窄收起、大纲紧凑布局及减少动画 | [活动栏与侧栏布局](./enhancements/README.md#1.4.5_活动栏与侧栏布局) |
| 中文源代码管理主侧栏、分支操作、远端同步与评审 | [Git Graph 提交关系图](./enhancements/README.md#1.5_Git_Graph提交关系图) |
| 左右源码差异、红绿概览、改动导航及重命名历史 | [差异编辑器与时间线](./enhancements/README.md#1.5.2_中央差异编辑器与文件时间线) |
| 仓库终端、管理员入口、右键配置和面板拖动 | [集成终端与分界线](./enhancements/README.md#1.6_集成终端、管理员入口与分界线) |
| 终端依赖、离线缓存和测试边界 | [终端运行文件与验证](./enhancements/README.md#1.7_终端运行文件、安装与验证) |
| VS Code Git Graph 功能收集、选项与实现边界 | [完整功能对照](./enhancements/git_graph_features.md#第1章_Git_Graph功能对照与操作说明) |
| C/C++ 宏、函数和类型的语法高亮 | [语法识别与颜色映射](./typora配置修改.md#4.1_为什么主题CSS不等于语法识别器) |
| 在代码框外点击后直接展开、收起长代码 | [长代码块限高与完整展开](./typora配置修改.md#4.3_长代码块限高与完整展开) |
| Mermaid 全屏、缩放、拖动与适应宽度 | [查看器操作](./typora配置修改.md#5.2_查看器操作) |
| Typora 原生偏好设置 | [原有设置截图](./typora配置展示.md#第1章_文件) |
| 修改扩展源码、重建 bundle 和运行回归测试 | [开发者构建](./enhancements/README.md#1.2_开发者构建) |

Markdown 使用一个活动的 Typora 原生编辑器，其他分栏显示预览，点击正文后切入编辑；普通源码标签可编辑和保存，格式按文档独立保留，切换与跨组移动保留草稿。关闭未保存标签或窗口时提供保存、不保存或取消，原生 Markdown 的关闭确认继续有效；该 Markdown 的源码草稿未保存时，先处理草稿再打开原生渲染。Git 历史、差异和搜索侧预览仍为只读。语言服务器和 VS Code 扩展宿主不属于本实现。

Git 双栏差异保留两侧各 8px 滚动条和 30px 原生红绿概览，关闭全文缩略图；普通单文件源码与 Markdown 阅读继续提供缩略图。侧栏提交历史按紧凑行显示局部拓扑、文件图标和彩色引用标签。大纲去掉最外层重复留白和原生过滤框，保留标题层级；全文搜索集中在搜索功能中。

## 1.3\_维护文件分工

| 文件或目录 | 职责 |
| --- | --- |
| `configure*`、`check_configuration*`、`restore_configuration*` | 用户安装、校验与恢复入口 |
| `scripts/lib/typora_environment.*` | 平台检测、路径发现与公共环境操作 |
| `scripts/lib/typora_workspace.*` | 发布资产摘要、schema 4 备份、迁移与恢复 |
| `enhancements/src/`、`enhancements/dist/` | 工作台源码及预构建核心、静态样式与脚本 |
| `enhancements/bundle_markers.txt` | 构建能力检查使用的功能标记清单 |
| `enhancements/vendor/` | 固定的语法库、Codicons SVG、emoji 数据与常驻工作区核心，以及许可证、来源和摘要 |
| `enhancements/fixtures/`、`enhancements/scripts/test_*` | 交互、语法、历史状态与安装事务回归 |

功能变动时同步源码、预构建、功能标记、安装检查入口与操作说明；核心更新另需同步固定来源、源码摘要和启动回归。核心构建使用仓库内 vendor 源码，不依赖研究缓存。配置截图位于 `assets/images/`，新增工作台能力由上述说明维护。

Windows UCRT64 的安装、检查和回退入口调用同一 PowerShell 实现。当前集成终端运行包支持 Windows 10 1903+ x64 / ARM64；Linux 的工作区和 Git Graph 继续可用，集成终端原生包尚未提供。

真实安装与核验通过（`.cache/final_live_install.log`、`.cache/final_live_check.log`），ASAR 未修改；实际 profile 仅 `framelessWindow:true→false`，其余字段完全一致。未强制关闭或重载用户窗口；请保存文档并正常重启 Typora 加载更新。
