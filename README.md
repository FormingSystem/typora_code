---
id: tools.typora.readme
title: "Typora 安装与阅读工作区"
kind: reference
status: evolving
domains:
  - tools
---

# 第1章\_Typora安装与阅读工作区

本目录维护 Typora 的主题、社区插件核心和仓库阅读增强。配置后，默认在一个桌面窗口内使用多文档标签页，按需向右、向下分栏；同时提供阅读历史、上次阅读位置恢复、文档缩略图定位、中文源代码管理主侧栏及内嵌提交图、Git Graph 完整提交图、Monaco 同步双栏差异和文件历史、提交快捷键与文件忽略、分支同步状态栏、Git 操作与评审、可调整分界线、仓库集成终端及管理员入口、C/C++ 语法高亮、长代码展开／收起和 Mermaid 独立查看器。

## 1.1\_安装、检查与恢复

以下命令从本目录执行。普通安装使用仓库预构建文件，无需预装 Node.js 或联网下载核心；Windows 首次配置另从 Node 官方下载并校验终端私有运行时，离线环境可提供对应 ZIP 缓存；脚本根据参数、环境变量和系统信息发现 Typora，不包含本机盘符或用户名。

| 环境 | 安装 | 只读检查 | 恢复 |
| --- | --- | --- | --- |
| Windows PowerShell | `powershell -NoProfile -ExecutionPolicy Bypass -File .\configure_windows.ps1`，也可双击 `configure_windows.cmd` | `powershell -NoProfile -ExecutionPolicy Bypass -File .\check_configuration_windows.ps1` | `powershell -NoProfile -ExecutionPolicy Bypass -File .\restore_configuration_windows.ps1 -backup_root '<安装输出的备份目录>'` |
| Linux / MSYS2 UCRT64 Bash | `bash ./configure.sh` | `bash ./check_configuration.sh` | `bash ./restore_configuration.sh --backup-root '<安装输出的备份目录>'` |

安装内容包括 `cpp_github-consolas.css`、增强 bundle，以及固定版本 `2.10.15` 的社区核心、样式和语言包。安装器备份被覆盖的文件，校验复制结果，并在 Typora 入口保留唯一脚本引用；只读检查要求主题、bundle 和核心资产均与仓库一致。安装完成后保存文档并正常重启 Typora，选择 `cpp github consolas` 主题。

路径发现、非交互参数、支持环境和备份清单详见 [一键配置](./typora配置修改.md#第6章_PowerShell、UCRT64与Linux一键配置)。Typora 升级后应重新检查入口，按 [升级边界](./typora配置修改.md#7.3_Typora升级边界) 重新配置。Windows 已有实窗与安装回滚验证；原生 Linux / UCRT64 实机复核仍待补充。

## 1.2\_按需求阅读

| 需求 | 对应说明 |
| --- | --- |
| 同窗多文档标签、左右／上下分栏、Alt 方向键阅读历史 | [标签页、分栏与阅读历史](./enhancements/README.md#1.4_标签页、分栏与阅读历史) |
| 目标标题与目录定位、来源栏位置保留、重开文档继续阅读 | [阅读位置与标题定位](./enhancements/README.md#1.4.1_阅读位置与标题定位) |
| 复制文件或文件夹的相对路径、绝对路径 | [复制文件路径](./enhancements/README.md#1.4.2_复制文件路径) |
| 中文源代码管理主侧栏、分支操作、远端同步与评审 | [Git Graph 提交关系图](./enhancements/README.md#1.5_Git_Graph提交关系图) |
| 左右源码差异、改动导航、重命名前后的文件历史 | [差异编辑器与时间线](./enhancements/README.md#1.5.2_中央差异编辑器与文件时间线) |
| 仓库终端、管理员入口、右键配置和面板拖动 | [集成终端与分界线](./enhancements/README.md#1.6_集成终端、管理员入口与分界线) |
| 终端依赖、离线缓存和测试边界 | [终端运行文件与验证](./enhancements/README.md#1.7_终端运行文件、安装与验证) |
| VS Code Git Graph 功能收集、选项与实现边界 | [完整功能对照](./enhancements/git_graph_features.md#第1章_Git_Graph功能对照与操作说明) |
| C/C++ 宏、函数和类型的语法高亮 | [语法识别与颜色映射](./typora配置修改.md#4.1_为什么主题CSS不等于语法识别器) |
| 在代码框外点击后直接展开、收起长代码 | [长代码块限高与完整展开](./typora配置修改.md#4.3_长代码块限高与完整展开) |
| Mermaid 全屏、缩放、拖动与适应宽度 | [查看器操作](./typora配置修改.md#5.2_查看器操作) |
| Typora 原生偏好设置 | [原有设置截图](./typora配置展示.md#第1章_文件) |
| 修改扩展源码、重建 bundle 和运行回归测试 | [开发者构建](./enhancements/README.md#1.2_开发者构建) |

社区工作区使用一个活动的 Typora 原生编辑器，其他分栏显示预览，点击正文后切入编辑。它提供同窗多文档布局；保存确认仍由 Typora 处理，多份独立未保存缓冲区不属于本实现。

## 1.3\_维护文件分工

| 文件或目录 | 职责 |
| --- | --- |
| `configure*`、`check_configuration*`、`restore_configuration*` | 用户安装、校验与恢复入口 |
| `scripts/lib/typora_environment.*` | 平台检测、路径发现与公共环境操作 |
| `scripts/lib/typora_workspace.*` | 固定版本插件文件的摘要、备份、复制与恢复 |
| `enhancements/src/`、`enhancements/dist/` | 扩展源码及供普通安装使用的预构建 bundle |
| `enhancements/bundle_markers.txt` | 安装和检查共同使用的功能标记清单 |
| `enhancements/vendor/` | 固定的语法库与社区核心、许可证、来源和摘要 |
| `enhancements/fixtures/`、`enhancements/scripts/test_*` | 交互、语法、历史状态与安装事务回归 |

功能变动时同步源码、预构建、标记清单、受影响的安装与检查入口及操作说明；升级社区核心时还需同步 bootstrap 版本、原始发行文件和 `SHA256SUMS`。配置截图保留原始资料位置，新增插件能力由上述说明维护。

Windows UCRT64 的安装、检查和回退入口调用同一 PowerShell 实现。当前集成终端运行包支持 Windows 10 1903+ x64 / ARM64；Linux 的工作区和 Git Graph 继续可用，集成终端原生包尚未提供。
