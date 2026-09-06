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
- 在工作区标签中使用 Git Graph，查看当前仓库的提交、分支、合并关系和文件差异；
- 使用 VS Code 内置 C/C++ TextMate 语法和 Oniguruma 解析 Typora 的 `c`、`cpp` 等代码围栏，并把识别出的语法角色映射到 GitHub Light 代码配色；
- 对超过响应式阅读高度的普通代码块默认限高，提供 `展开全部代码` / `收起代码` 切换；正文或代码块获焦时都能直接点击，按钮获焦后支持 Enter / 空格，打印时自动完整展开且不修改 Markdown；
- 在 Mermaid 图正上方放置随正文自然滚动的静态工具行，不悬浮、不跟随视口，也不覆盖图；工具行挂在预览容器内部，并按 Mermaid 代码块去重，避免 Typora 的隐藏或重建预览产生重复按钮；
- 为 Typora 已渲染的 Mermaid SVG 增加独立全屏查看器，默认保持 `100%`，支持按钮缩放、`Ctrl + 滚轮` 指针中心缩放、左键拖动、适应宽度、适应屏幕、恢复 `100%` 和 `Esc` 退出。

扩展不按 `int`、`struct` 或 Linux API 名称写私有规则。VS Code grammar 负责产生 `entity.name.function.c`、`entity.name.type.c`、`variable.*` 等语法作用域，样式只映射作用域颜色。TextMate 是语法级解析，不是编译器或语言服务器；它不会读取项目头文件、宏展开结果和编译数据库，因此不宣称提供 VS Code C/C++ 扩展的完整语义分析。

多行 `#define` 中的 `meta.preprocessor` 表示整个宏体所在的上下文，不能据此把所有内容染成蓝色。指令和宏定义名使用预处理器颜色，宏体内的 `do` / `while`、`unsigned long`、函数调用、注释、字符串和运算符仍按各自语法角色着色。

## 1.1\_普通用户一键配置

仓库已经提交预构建 bundle，普通用户无需安装 Node.js。部署脚本不写死 Typora 安装位置；它先检查显式参数、`TYPORA_ROOT`、运行进程和系统发现信息，仍找不到时才询问用户。

Windows PowerShell 或资源管理器入口：

```text
tools\typora\configure_windows.cmd
```

MSYS2 UCRT64 或 Linux Bash 入口：

```bash
cd tools/typora
bash ./configure.sh
```

PowerShell 能识别 Windows、UCRT64 和 WSL 风格路径；UCRT64 Bash 能识别 Windows 与 POSIX 路径；Linux Bash 只接受 Linux 路径。脚本先校验 bundle 功能标记和社区核心 `SHA256SUMS`，再统一备份主题、Typora `resources/window.html`、旧 bundle 和将被覆盖的插件文件。安装完成后保存文档并重启 Typora。完整安装、检查和回退说明见 [`../typora配置修改.md`](../typora配置修改.md#第6章_PowerShell、UCRT64与Linux一键配置)。

## 1.2\_开发者构建

```powershell
cd tools/typora/enhancements
npm ci
npm run build
npm run check
```

`vendor/vscode_cpp/` 保存 VS Code 内置 C/C++ grammar；`vendor/typora_workspace/` 保存社区核心 `2.10.15` 的原始发行文件、许可证、来源与摘要。`npm run check` 检查预构建功能标记、部署入口、源码与 bundle 的核心版本一致性、核心文件摘要、C/C++ 解析、阅读历史状态机和持久化位置存储。

交互回归可用开发环境已有的 Electron 可执行文件运行 `scripts/test_interaction.cjs`（子进程不能设置 `ELECTRON_RUN_AS_NODE`）。它在隐藏的 Chromium 窗口中加载模拟宿主夹具和生产 bundle，发送真实鼠标与键盘输入，检查首次展开/收起、按钮重建、Enter / 空格、空闲 DOM、宏体颜色和 Alt 方向键导航。跨文件夹具包含社区工作区的延迟锚点步骤，后退一次必须回到来源文档。该夹具测试不替代 Typora 实窗验收。

Windows 安装当前 bundle 后，可从本目录运行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test_reading_native.ps1`。脚本通过共享环境助手发现 Typora，生成临时 Markdown，验证预览栏中的中文标题链接、目标光标及目录、来源段落与栏内偏移、Alt 前后导航、关闭标签重开和新窗口续读；比较源文件摘要，确认正文没有被改写。测试入口只对两个临时文档生效，完成后关闭自己的测试窗口并移除入口，不退出其他窗口。结果 JSON 保留在脚本输出的临时目录。

同一命令增加 `-suite paths` 验证复制路径：标签右键菜单、文件树菜单事件、快捷键、非活动标签和活动预览栏的目标识别，以及光标和阅读位置保持。该套件用剪贴板桥接替身核对复制文本，不覆盖系统剪贴板。`npm run check` 另覆盖 Windows、UNC 和 Linux 路径、根目录边界、中文与空格、未保存文档。

增加 `-suite git` 验证 Git Graph：脚本生成临时 Git 仓库，在真实 Typora 中检查工具栏入口、提交图、分支筛选、合并父提交、中文文件差异、查找、刷新和切回正文的非零阅读位置；未提交 Markdown 与 Git 索引必须保持原字节。`npm run check` 另使用真实 Git 验证空仓库、注解标签、远端引用、分页、独立 worktree、非仓库错误和外部 diff 禁用。

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

带 `#标题` 的 Markdown 链接会等待目标文件及目标栏就绪，再把原生编辑器移到目标栏，将光标和正文定位到标题；目录随目标文件更新并选中该标题。其他栏保留各自离开前的段落与栏内偏移，不再由全局延迟锚点改变来源文档。预览栏的相对链接以该栏文档所在目录解析。

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

点击左侧工具栏底部的 **分支图标**，或在社区插件命令面板执行 **Git Graph：查看提交关系图**，即可在当前编辑区打开 Git Graph 标签。它读取活动文档所属的 Git 仓库；没有已保存文档时使用当前打开的文件夹。子目录通过 Git 查找仓库根，子模块和独立 worktree 保持自己的仓库上下文。图标签可使用已有分栏操作并排展示，切回 Markdown 时保持原来的阅读位置。

| 操作 | 展示内容 |
| --- | --- |
| 全部分支 | 本地分支、已有远端跟踪引用、标签和 HEAD 的提交关系；圆点为提交，向下的连线指向父提交 |
| 分支选择框 | 切换为指定分支、标签或当前 HEAD 的历史 |
| 点击提交 | 完整编号、作者、日期、提交说明和变更文件 |
| 对比父提交 | 合并提交可选择任一父提交；首次提交与空树比较 |
| 点击变更文件 | 带增删颜色的统一差异；文件名保留中文、空格和特殊符号 |
| 查找／Enter | 按说明、作者或编号查找已加载的提交，再按一次定位下一个匹配项 |
| 刷新／加载更多 | 重新读取当前分支尖端；每次增加 200 条历史 |

这是仓库增强中的 Git 历史查看工具，使用社区核心的标签和工具栏接口，不是把 VS Code 的扩展包直接装入 Typora。历史查询使用 [Git log](https://git-scm.com/docs/git-log)，父提交差异使用 [Git diff-tree](https://git-scm.com/docs/git-diff-tree)。读取不执行提交、暂存、切换分支或网络同步；图中的远端分支名称来自本地已有的远端跟踪引用，刷新不会 fetch。

普通安装已包含预构建实现，无需额外安装 Node.js。**Git 必须在 Typora 进程的 PATH 中可执行**；安装 Git 或修改 PATH 后，保存文档并正常重启 Typora。配置检查增加 `git_graph_runtime` 字段报告检查进程能否发现 Git；缺少 Git 时，图内显示提示，其他阅读增强仍可使用。安装器不写固定 Git 路径，也不自动改动系统 PATH。

初始读取 200 条，单个视图最多加载 5000 条；达到上限时可选择分支缩小范围。每次查询最长 15 秒、输出最多 4 MiB；文件差异最多展示前 4000 行，截断会明确提示。二进制文件显示 Git 的差异提示；重命名按删除、增加分别展示。关闭或隐藏图标签会取消未完成查询，重新进入后补齐尚未完成的内容。空仓库和非 Git 文件夹分别显示状态及错误说明。
