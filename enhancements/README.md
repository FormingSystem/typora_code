---
id: tools.typora.enhancements
title: "Typora 工作区、阅读导航与代码增强"
kind: reference
status: evolving
domains:
  - tools
---

# 第1章\_Typora\_工作区、阅读导航与代码增强

本扩展补足主题 CSS 无法承担的以下能力：

- 安装固定版本的 Typora Community Plugin 核心：同一个桌面窗口内使用多文档标签页，按需向右、向下拆分编辑区；
- 使用 `Alt + ←` / `Alt + →` 后退、前进，记录文内锚点和跨 Markdown 文件跳转，并恢复光标与滚动位置；
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
npm install
npm run build
npm run check
```

`vendor/vscode_cpp/` 保存 VS Code 内置 C/C++ grammar；`vendor/typora_workspace/` 保存社区核心 `2.10.15` 的原始发行文件、许可证、来源与摘要。`npm run check` 检查预构建功能标记、部署入口、核心文件摘要、C/C++ 解析和阅读历史状态机。

交互回归可用开发环境已有的 Electron 可执行文件运行 `scripts/test_interaction.cjs`（子进程不能设置 `ELECTRON_RUN_AS_NODE`）。它在隐藏的 Chromium 窗口中加载模拟宿主夹具和生产 bundle，发送真实鼠标与键盘输入，检查首次展开/收起、按钮重建、Enter / 空格、空闲 DOM、宏体颜色和 Alt 方向键导航。跨文件夹具包含社区工作区的延迟锚点步骤，后退一次必须回到来源文档。该夹具测试不替代 Typora 实窗验收。

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
