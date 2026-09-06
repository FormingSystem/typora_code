---
id: tools.typora.enhancements
title: "Typora 工作区、阅读导航与代码增强"
kind: reference
status: evolving
domains:
  - tools
---

# 第1章\_Typora\_工作区、阅读导航与代码增强

用户入口见 [Typora 安装与阅读工作区](../README.md#1.1_安装、检查与恢复)；原生偏好设置另见 [配置截图](../typora配置展示.md#第1章_文件)。本页集中说明扩展能力、构建与依赖维护。

本扩展补足主题 CSS 无法承担的以下能力：

- 安装固定版本的 Typora Community Plugin 核心：同一个桌面窗口内使用多文档标签页，按需向右、向下拆分编辑区；
- 使用 `Alt + ←` / `Alt + →` 后退、前进，记录文内锚点和跨 Markdown 文件跳转，并恢复光标与滚动位置；
- 带标题的链接在目标栏定位光标、正文和目录，来源栏保留阅读位置；关闭标签或窗口后重新打开文件，继续上次阅读；
- 在标签和侧栏文件树的右键菜单复制相对路径、绝对路径，并提供 VS Code 风格的复制路径快捷键；
- 在原有主侧栏使用中文源代码管理，在原有编辑标签中查看 Git Graph、文件历史和 Monaco 左右差异；
- 按对象配置 Git 右键菜单，拖动面板分界线；从仓库根目录打开集成终端，支持多会话、分栏和管理员入口；
- 使用 VS Code 内置 C/C++ TextMate 语法和 Oniguruma 解析 Typora 的 `c`、`cpp` 等代码围栏，并把识别出的语法角色映射到 GitHub Light 代码配色；
- 对超过响应式阅读高度的普通代码块默认限高，提供 `展开全部代码` / `收起代码` 切换；正文或代码块获焦时都能直接点击，按钮获焦后支持 Enter / 空格，打印时自动完整展开且不修改 Markdown；
- 在 Mermaid 图正上方放置随正文自然滚动的静态工具行，不悬浮、不跟随视口，也不覆盖图；工具行挂在预览容器内部，并按 Mermaid 代码块去重，避免 Typora 的隐藏或重建预览产生重复按钮；
- 为 Typora 已渲染的 Mermaid SVG 增加独立全屏查看器，默认保持 `100%`，支持按钮缩放、`Ctrl + 滚轮` 指针中心缩放、左键拖动、适应宽度、适应屏幕、恢复 `100%` 和 `Esc` 退出。

扩展不按 `int`、`struct` 或 Linux API 名称写私有规则。VS Code grammar 负责产生 `entity.name.function.c`、`entity.name.type.c`、`variable.*` 等语法作用域，样式只映射作用域颜色。TextMate 是语法级解析，不是编译器或语言服务器；它不会读取项目头文件、宏展开结果和编译数据库，因此不宣称提供 VS Code C/C++ 扩展的完整语义分析。

多行 `#define` 中的 `meta.preprocessor` 表示整个宏体所在的上下文，不能据此把所有内容染成蓝色。指令和宏定义名使用预处理器颜色，宏体内的 `do` / `while`、`unsigned long`、函数调用、注释、字符串和运算符仍按各自语法角色着色。

## 1.1\_普通用户一键配置

仓库已经提交预构建 bundle，普通用户无需预装 Node.js；Windows 安装器管理终端所需的私有运行时。部署脚本不写死 Typora 安装位置；它先检查显式参数、`TYPORA_ROOT`、运行进程和系统发现信息，仍找不到时才询问用户。

Windows PowerShell 或资源管理器入口：

```text
tools\typora\configure_windows.cmd
```

MSYS2 UCRT64 或 Linux Bash 入口：

```bash
cd tools/typora
bash ./configure.sh
```

PowerShell 能识别 Windows、UCRT64 和 WSL 风格路径；UCRT64 Bash 能识别 Windows 与 POSIX 路径；Linux Bash 只接受 Linux 路径。Windows 首次配置会下载并校验官方 Node `24.20.0` 私有运行时，供集成终端使用；无需安装到系统或修改 PATH。再次配置复用校验过的下载缓存。脚本先校验 bundle 功能标记、社区核心与终端资产 `SHA256SUMS`，再统一备份主题、Typora `resources/window.html`、旧 bundle、插件文件和终端运行文件。Windows UCRT64 入口调用同一 PowerShell 安装事务；Linux 保留主题、工作区和 Git Graph，当前没有 Linux 集成终端原生运行包。安装完成后保存文档并重启 Typora。完整安装、检查和回退说明见 [`../typora配置修改.md`](../typora配置修改.md#第6章_PowerShell、UCRT64与Linux一键配置)。

## 1.2\_开发者构建

```powershell
cd tools/typora/enhancements
npm ci
npm run build
npm run check
```

`vendor/vscode_cpp/` 保存 VS Code 内置 C/C++ grammar；`vendor/gemoji/` 保存固定版本的 emoji 数据及随 bundle 安装的 MIT 许可；`vendor/typora_workspace/` 保存社区核心 `2.10.15` 的原始发行文件、许可证、来源与摘要。`npm run check` 检查预构建功能标记、部署入口、源码与 bundle 的核心版本一致性、核心文件摘要、C/C++ 解析、阅读历史状态机和持久化位置存储。

Git Graph 开发回归另需 PATH 中的 Git 和 `ssh-keygen`，用于临时仓库及临时密钥签名验证。测试不使用用户密钥和远端账号；普通扩展安装无需这些开发测试依赖。

交互回归可用开发环境已有的 Electron 可执行文件运行 `scripts/test_interaction.cjs`（子进程不能设置 `ELECTRON_RUN_AS_NODE`）。它在隐藏的 Chromium 窗口中加载模拟宿主夹具和生产 bundle，发送真实鼠标与键盘输入，检查首次展开/收起、按钮重建、Enter / 空格、空闲 DOM、宏体颜色和 Alt 方向键导航。跨文件夹具包含社区工作区的延迟锚点步骤，后退一次必须回到来源文档。该夹具测试不替代 Typora 实窗验收。

Windows 安装当前 bundle 后，可从本目录运行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test_reading_native.ps1`。脚本通过共享环境助手发现 Typora，生成临时 Markdown，验证预览栏中的中文标题链接、目标光标及目录、来源段落与栏内偏移、Alt 前后导航、关闭标签重开和新窗口续读；比较源文件摘要，确认正文没有被改写。测试入口只对两个临时文档生效，完成后关闭自己的测试窗口并移除入口，不退出其他窗口。结果 JSON 保留在脚本输出的临时目录。

同一命令增加 `-suite paths` 验证复制路径：标签右键菜单、文件树菜单事件、快捷键、非活动标签和活动预览栏的目标识别，以及光标和阅读位置保持。该套件用剪贴板桥接替身核对复制文本，不覆盖系统剪贴板。`npm run check` 另覆盖 Windows、UNC 和 Linux 路径、根目录边界、中文与空格、未保存文档。

增加 `-suite git` 验证 Git Graph：脚本生成临时 Git 仓库，在真实 Typora 中检查提交图、分栏、分支筛选、合并父提交、中文差异、查找、非零阅读位置、菜单预览与执行、评审记录、Ctrl 比较和内嵌详情。只读阶段比较正文与索引字节；写入阶段只操作脚本创建的仓库。`npm run check` 同时覆盖真实 Git 的历史读取、stash、远端同步、提交和冲突流程。`scripts/test_git_graph_interaction.cjs` 使用开发环境的 Electron 执行真实鼠标和键盘测试，第二个命令行参数可指定截图目录；它独立创建临时 Git 仓库与用户数据。

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test_install_windows.ps1` 在临时副本、含空格路径和隔离的 `APPDATA` 中测试安装、重复安装、摘要检查、恢复、失败回滚与预检拒绝。`bash scripts/test_workspace_install.sh` 测试公共插件文件事务；仅在兼容 shell 中通过时，不能据此宣称原生 Linux 或 UCRT64 平台验收完成。

`fixtures/visual_test.md` 用于 Typora 实窗验收；可调试的隔离 Typora 实例还可运行 `node scripts/smoke_typora.mjs <端口> <截图路径>`，脚本会先点击正文，再用鼠标按下/松开分别验证展开和收起。

## 1.3\_PowerShell单独安装扩展与备份

安装脚本先把 Typora 的 `resources/window.html`、旧扩展 bundle 和同版本插件文件备份到：

```text
%APPDATA%\Typora\backups\linux_note_typora_enhancements\<时间戳>\
```

随后在 `window.html` 的 `</body>` 前加入一个用户数据脚本入口。主体 bundle 保存在 Typora 用户数据的 `linux_note_enhancements/`，社区核心、样式和语言包保存在 `plugins/2.10.15/`。用户后来安装的其他插件和设置不属于安装器的覆盖清单。执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_windows.ps1
```

该脚本复用 `tools/typora/scripts/lib/typora_environment.ps1`，不维护自己的固定安装目录候选。Typora 更新会替换安装目录，更新后若入口消失，应重新运行安装脚本。不要在文档有未保存修改时强制退出 Typora；安装完成后保存文档并正常重启，扩展才会进入新窗口。

回退时传入安装输出的备份目录：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restore_windows.ps1 `
  -backup_root "$env:APPDATA\Typora\backups\linux_note_typora_enhancements\<时间戳>"
```

恢复脚本在覆盖当前入口前还会生成 `window.before_restore.<时间戳>.html` 安全副本；恢复原插件文件，并将本次新增的插件文件改名停用。

## 1.4\_标签页、分栏与阅读历史

默认布局采用 VS Code 的 **单窗口、一组多标签页** 形式：在当前窗口打开其他 Markdown 后保留文件标签；需要并排阅读时再拆分。标签支持关闭、拖动排序和组间移动，标签右键菜单提供分栏操作。

| 操作 | 结果 |
| --- | --- |
| `Ctrl + \` | 将当前文档打开到右侧分栏 |
| `Ctrl + K`，再按 `Ctrl + \` | 将当前文档打开到下方分栏 |
| 拖动组间分隔线 | 调整各组宽高 |
| 点击非活动分栏正文 | 切入该分栏的 Typora 编辑器 |
| `Alt + ←` / `Alt + →` | 返回上一个／下一个阅读位置 |

社区工作区在活动分栏使用 Typora 原生编辑器，其他分栏显示预览；点击预览正文后交换编辑器所在分栏。它提供同窗多文档布局，但并非 VS Code 的多个独立未保存编辑缓冲区。切换文件仍经过 Typora 的保存确认；不会为实现导航自动保存、丢弃或复制正文。新建但尚未命名的文档不进入跨文件历史。历史只保留当前窗口最近 100 个跳转位置，重启清空；源代码模式和输入对话框保留原有方向键行为。

插件管理由 [Typora Community Plugin](https://github.com/typora-community-plugin/typora-community-plugin) 提供，可从侧边工具栏的设置入口管理插件。仓库固定核心版本并附带预构建文件，安装无需联网下载核心，也不需要本机 Node.js；核心升级应更新仓库发行文件、摘要和 bootstrap 版本后重新验收。布局参考 [VS Code 自定义布局](https://code.visualstudio.com/docs/configure/custom-layout)，快捷键参考 [默认键位](https://code.visualstudio.com/docs/reference/default-keybindings)。

### 1.4.1\_阅读位置与标题定位

带 `#标题` 的 Markdown 链接会等待目标文件及目标栏就绪，再把原生编辑器移到目标栏，将光标和正文定位到标题；目录随目标文件更新并选中该标题。其他栏保留各自离开前的段落与栏内偏移，不再由全局延迟锚点改变来源文档。新窗口恢复会同时核对正文高度、视口尺寸和实际滚动位置；宿主延迟恢复选区造成的滚动重置不会覆盖上次位置，真实滚动或编辑输入会立即结束自动恢复。预览栏的相对链接以该栏文档所在目录解析。

普通打开、关闭标签后重开，以及关闭窗口后重开，都会恢复文件上次的阅读位置。明确指定的标题链接和 Alt 历史位置优先于“上次位置”。位置记录使用可见块的短文本指纹、块内偏移及滚动坐标，避免把旧文件的临时光标编号或过期字符偏移应用到新文件；文本改变导致定位块不存在时回退到滚动坐标。

上次位置独立于窗口的前后跳转历史，保留最近使用的 500 个文件，存入 Typora 当前用户配置中的 Local Storage；不在 Markdown 或仓库中创建状态文件。各文件独立写入，滚动写入合并到 300ms，关闭窗口时提交待写记录。安装、重复安装和恢复扩展不清空阅读记录；清除 Typora 用户数据会清除这些位置。首次安装前尚未记录的位置无法补回。

### 1.4.2\_复制文件路径

在 **文件标签** 或 **侧栏文件树的文件／文件夹** 上右键，选择“复制绝对路径”或“复制相对路径”。右键操作以被点中的项目为准，不切换标签、不打开文件、不改变正文光标或阅读位置。命令面板也提供这两个命令，作用于当前活动栏的文档。

| Windows 快捷键 | 结果 |
| --- | --- |
| `Ctrl + K`，松开后按 `P` | 复制活动文档的绝对路径 |
| `Shift + Alt + C` | 复制活动文档的绝对路径 |
| `Ctrl + K`，再按 `Ctrl + Shift + C` | 复制活动文档相对当前打开文件夹根目录的路径 |

这些键位对应 [VS Code 默认文件命令](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileCommands.ts)。路径按当前系统格式输出：Windows 使用反斜杠，Linux 使用正斜杠，保留中文、空格、`#` 和 `%`，不额外加入引号或 Markdown 转义。普通 `Ctrl + C` 继续复制正文选区；分栏快捷键继续有效。

相对路径的基准是 **Typora 当前打开的文件夹**，不是正在编辑的 Markdown 所在子目录。例如根目录为 `notes`，文件为其中的 `rcu/example.md`，Windows 下复制结果为 `rcu\example.md`。未打开文件夹或文件位于根目录之外时返回完整路径；根目录自身的相对路径为空，与 [VS Code 的路径标签规则](https://github.com/microsoft/vscode/blob/main/src/vs/base/common/labels.ts) 一致。切换文件夹后立即使用新的根目录。尚未保存、没有文件路径的文档不执行复制。

## 1.5\_Git\_Graph提交关系图

点击左侧活动栏中 **文件、大纲下方的分支图标**，或按 `Ctrl + Shift + G`，在原有主侧栏打开 **源代码管理**；中央文档保持打开。主侧栏下方的 **提交图**、状态栏 **Git Graph** 和命令面板的提交图命令，在上方原有标签栏打开 Git Graph。主侧栏、正文、提交图和差异编辑器复用同一个工作区布局。

| 阅读或操作目标 | 入口 |
| --- | --- |
| 查看提交、引用、stash 与未提交改动 | 提交图；分支框支持单选、多选与 glob |
| 比较任意两个版本 | 点击第一条，再 Ctrl / Cmd 点击第二条；也可选择工作区 |
| 查看差异、历史文件与路径 | 单击文件打开中央 Monaco 左右差异；右键查看文件历史和操作 |
| 创建分支、合并、变基、标签、stash 等 | 右键相应节点或引用，预览参数后执行 |
| Fetch、Pull、Push 与远端 URL 管理 | 主侧栏省略号 → 获取、拉取、推送、远端 |
| 暂存、取消暂存、提交与冲突恢复 | 主侧栏文件分组、提交消息和省略号菜单 |
| 持续评审单提交或区间 | 详情中的开始评审；从命令面板恢复或结束 |
| 图形、快捷键、默认操作、共享配置 | 设置 |

完整收集结果、操作选项、快捷键及 VS Code 宿主差异集中维护在 [功能对照与操作说明](./git_graph_features.md#第1章_Git_Graph功能对照与操作说明)。历史读取和实际写入共用系统 Git；刷新只读，网络同步和修改操作由用户从图内发起。

普通安装已包含预构建实现，无需额外 Node.js。Git 默认从 Typora 进程的 PATH 查找，也可在图内本地设置中指定可执行文件。安装器不写固定路径、不修改系统 PATH。配置检查报告 `git_graph_features` 和 `git_graph_runtime`，并要求主侧栏、Monaco 差异等完整功能标记、bundle 摘要和社区核心资产均一致。缺少 Git 时图内提供提示，其他阅读增强仍可使用。

默认每次读取 200 条，可调整加载数量、分支范围和自动加载；不再使用旧版 5000 条上限。读取超时 30 秒，写操作 5 分钟，单次输出上限 16 MiB。显示、冲突保护、签名与平台验证的详细边界见 [宿主差异与验证边界](./git_graph_features.md#1.4_宿主差异与验证边界)。


### 1.5.1\_主侧栏与中文菜单

源代码管理与文件树、大纲共用左侧原有区域；再次点击活动图标可以折叠侧栏，拖动原有侧栏分界线调整宽度。提交图内部没有额外的活动栏、源代码管理栏或标签栏。选择提交前，历史列表占满中央区域；选中后默认在下方显示提交详情，也可通过布局设置调整。

**暂存的更改、更改、未跟踪的文件、合并更改** 分组区分文件状态。同一文件同时存在已暂存和未暂存修改时，会出现在两个对应分组中：点击暂存文件比较 HEAD 与暂存区，点击普通更改比较暂存区与磁盘工作区。首次提交和新文件使用空文件作为左侧基准。

文件行上的 `+` / `−` 和右键的暂存／取消暂存直接执行；分组按钮只处理本组文件，重命名操作同时处理原路径和新路径。输入提交消息后点击 **提交** 或按 `Ctrl + Enter` 提交已暂存内容；成功后清空消息，失败时保留消息并显示错误。放弃更改、删除未跟踪文件和改写历史等操作保留明确的目标与确认步骤。

省略号与侧栏右键菜单使用中文，按 **视图与排序、提交、更改、拉取与推送、分支、远端、贮藏、标签** 分组，提供克隆、检出、Git 输出、提交图、仓库终端及管理员终端入口。分支、远端、贮藏和标签子菜单使用仓库真实对象。鼠标悬停或 `→` 展开子菜单，`←` 返回，`↑` / `↓` 移动，`Esc` 关闭。文件右键提供打开更改、打开文件、时间线、路径复制、文件资源管理器定位、暂存和放弃更改；文件树中的普通文件也可直接打开所属仓库历史与更改。

### 1.5.2\_中央差异编辑器与文件时间线

单击变更文件直接在原有编辑标签栏打开 **Monaco 0.56.0 左右差异编辑器**。两侧显示版本名称、完整源码、行号和语法高亮；删除与新增行使用不同底色，新增或删除造成的空缺行自动对齐，行内变化另行标色，右侧概览条标出改动位置。`F7` / `Shift + F7` 跳转下一处／上一处改动，工具栏可切换前后文件、刷新差异或折叠主侧栏。双栏中线支持鼠标拖动。

差异右键提供复制、全选、查找、前后改动、并排／行内比较、自动换行、折叠未修改区域、忽略首尾空白和所选文件的 Git 操作。`Ctrl + F` 由差异编辑器处理；Monaco 的查找提示也使用中文。相同文件及版本组合复用标签，刷新内容保留查看位置；分栏、关闭与拖动使用工作区原有标签菜单。

**文件历史（时间线）** 是单独的编辑标签。它按文件显示提交，沿重命名前的路径继续追踪；单击历史记录比较该次提交前后的文件。首次添加与删除分别显示为空左侧、空右侧。历史源文件保持只读，当前工作区差异也用于审阅；修改正文请用 **打开文件** 返回 Typora。当前未提供选中行暂存、三方合并编辑器或在差异右侧直接保存文件。

Monaco 的代码、简体中文界面、图标和浏览器 Worker 全部内嵌在预构建 bundle，运行时无需 CDN，也不要求另装 Node。它与 Typora 正文中的 TextMate C/C++ 代码围栏高亮属于两个独立编辑表面。

## 1.6\_集成终端、管理员入口与分界线

点击 Git Graph 工具栏的 **终端**、左侧底部终端图标，或按 **Ctrl + `** 打开仓库根目录的终端。有活动终端时，该快捷键重新聚焦最近会话；**Ctrl + Shift + `** 新建会话。文件树右键提供 **在所属仓库根目录打开集成终端**，从子目录文件操作时也会先定位 Git 根目录；文件不属于 Git 仓库时使用所在文件夹。

默认在下方编辑组打开，终端设置可选当前组新标签、右侧或下方。终端顶部可以选择 Shell、新建、左右拆分、查找、清屏、终止和设置；右键还可向下拆分、重启 Shell、复制选中文本、粘贴、全选及复制仓库根路径。默认使用 Windows PowerShell，另外提供 Command Prompt、已安装的 PowerShell 7 和 PATH 中的 Bash。选择框决定新会话的 Shell，当前会话的 Shell 不会被静默替换。

终端采用与 [VS Code 终端](https://code.visualstudio.com/docs/terminal/advanced) 相同的 [xterm.js](https://github.com/xtermjs/xterm.js) 显示组件和 [node-pty](https://github.com/microsoft/node-pty/tree/1.1.0) 伪终端组件。支持 ANSI 控制、交互程序、方向键历史、Ctrl+C、中英文输入、滚动缓冲和窗口尺寸同步；**Ctrl + Shift + C / V / F** 分别复制、粘贴和查找。右键或此快捷键粘贴多行内容时先展示文本，点击后发送给 Shell。终端焦点内的普通 Ctrl+K 等按键交给 Shell，不触发正文快捷键。

切换 Markdown 或 Git Graph 标签只隐藏终端，进程与输出保留；终止按钮、关闭终端标签或真正关闭宿主窗口时回收对应会话。关闭窗口后不恢复旧进程及输出，重新打开会创建新 Shell。当前没有移植 VS Code 的扩展 API、任务系统、调试器和跨窗口会话恢复。

**以管理员身份打开仓库终端（UAC）** 位于文件树、Git Graph 空白处和终端的右键菜单中，也能从命令面板执行。它通过 Windows UAC 启动独立的管理员 PowerShell，并用 `Set-Location -LiteralPath` 定位同一仓库根目录；取消 UAC 时显示未启动。普通集成终端和 Typora 本身不会随之提权。自动测试验证命令编码和含中文、引号及特殊字符的路径，不自动接受或触发管理员授权。

提交列表与详情之间、只读历史双栏之间，以及工作区编辑组之间，都可以用鼠标拖动分界线。详情放在下方时上下调整，放在右侧时左右调整；窄面板自动上下排列。Git 图面板比例按仓库保存，表头列宽单独保存。新增的图内分界线可用 Tab 聚焦后按方向键调整，双击或 Home 复位；表头右键可以勾选列显隐，**布局** 按钮调整详情位置并重置列宽。

Git Graph 的提交、分支、远端、标签、stash、未提交行、变更文件和空白处菜单均提供 **配置此右键菜单**。勾选决定显示项，修改立即保存在当前仓库配置中；`hidden_actions` 中 `commit:branch_create` 表示只在提交菜单隐藏该项，单独的 `branch_create` 表示全局隐藏。配置入口始终保留，避免隐藏全部操作后无法恢复。

## 1.7\_终端运行文件、安装与验证

Windows 集成终端要求 Windows 10 1903 或更新版本、x64 或 ARM64。已在 x64 Typora `1.14.9` 实测，ARM64 运行文件来自上游预构建，尚未完成 ARM64 实机验证。

安装器通过系统环境发现 Typora 和用户目录。前端依赖锁定为 xterm.js `6.0.0`、FitAddon `0.11.0`、SearchAddon `0.16.0`；node-pty `1.1.0` 的原始 JavaScript、MIT 许可证与 Windows Node-API 模块保存于 `dist/terminal_runtime/`，由 `scripts/build_terminal_assets.mjs` 从锁定 npm 包生成并附 SHA-256 清单。安装器不编译本机模块，不下载或复制已安装 VS Code 的私有文件。

独立后台运行时固定为 Node `24.20.0`，官方来源与 x64 / ARM64 ZIP、可执行文件摘要见 [运行时清单](./node_runtime.json)；来源为 [Node 官方发行目录](https://nodejs.org/dist/v24.20.0/)。首次配置下载约 38 MB 的架构对应 ZIP，校验后只提取 `node.exe` 和 `LICENSE`。运行文件安装到 Typora 用户数据中的 `linux_note_enhancements/terminal_runtime/`，不依赖系统 Node，不修改 PATH。离线环境可把相同官方 ZIP 放进 `TYPORA_TERMINAL_CACHE` 指向的目录；默认缓存通过系统本地应用数据目录发现。缓存和提取文件仍须通过摘要校验。

Typora 编辑页不支持 node-pty 的后台排空线程，因此每个会话使用独立的 Node 后台进程，通过 IPC 传递输入、输出和尺寸；输出采用确认与暂停机制限制积压。标签切换不销毁进程；进程断开 IPC 或收到关闭命令后清理伪终端。运行文件与 bundle、工作区核心一起校验、备份、安装和回滚。安装不会覆盖阅读位置、Git 评审、设置或用户后来安装的插件。

`test_terminal.mjs` 验证真实后台进程、特殊字符工作目录、输入输出、尺寸、退出、环境隔离和 UAC 命令编码。`test_terminal_interaction.cjs` 用隐藏 Electron 发送真实鼠标与键盘，验证输入、方向键历史、Ctrl+C、复制、查找、菜单及窗口缩放。`test_reading_native.ps1 -suite terminal` 则在临时仓库的真实 Typora 窗口中检查会话、切换、分栏与回收；`-suite git`、`-suite reading` 和 `-suite paths` 继续检查原有功能。管理员 UAC 的人工交互和 ARM64、原生 Linux 环境不在已通过的自动验收范围内。
