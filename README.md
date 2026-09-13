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

这是独立维护的社区增强项目，需要先安装 Typora。Typora 的下载、许可与更新由其官方提供；本项目维护增强代码、主题、安装脚本及说明文档。

| 能力 | 使用方式 |
| --- | --- |
| 多文档阅读 | 标签切换、左右/上下分栏、阅读前后退、恢复上次位置 |
| 文件与源码 | 文件树、重命名与管理操作、Monaco 源码编辑、编码和换行设置 |
| 搜索 | 工作区内容搜索；单击侧栏预览，双击或 Enter 打开；重复单击返回命中位置 |
| Git | [仓库列表、提交图与操作菜单](docs/git_scm_actions.md)、文件历史、只读差异、提交和远端操作 |
| 终端 | Windows 本机 Shell、多会话、分屏、查找及终端配置 |
| Markdown | 原生编辑、标题大纲、缩略图、代码高亮、长代码展开及[图片／Mermaid放大查看](docs/reading_media_viewer.md) |

Markdown 分栏共用一个活动的 Typora 原生编辑器，其余分栏提供预览；源码标签可分别编辑与保存。C/C++ 符号大纲需要本机 clangd。当前没有 VS Code 扩展宿主。平台支持和未覆盖能力见[环境要求](docs/installation.md#环境要求)与[功能范围](docs/workbench_parity.md)。

## 1.1\_安装、检查与恢复

**Windows 快速开始：**

1. 从 [Typora 官方网站](https://typora.io/)安装 Typora，并确认可以正常打开文档。
2. 在**本仓库网页**点击 **Code → Download ZIP**，完整解压下载包。进入能看到本文件和 `install_windows.cmd` 的目录。包内已含 `enhancements/dist/`，普通安装无需构建或预装 Node.js。
3. 保存正在编辑的文档。双击 **`install_windows.cmd`**，按提示完成安装并记下输出的 **Backup** 目录；首次安装需要联网下载经摘要校验的私有 Node 运行时。
4. 在该目录打开 PowerShell，执行下面的只读检查。返回 **`status: OK`** 后，正常重启 Typora，在“主题”菜单选择 **cpp github consolas**。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check_windows.ps1
```

**安装、离线准备、权限问题、更新、卸载及恢复原配置，统一见[安装与恢复指南](docs/installation.md)。** 卸载使用首次安装前的完整备份；后续备份用于回退增强版本。保留备份，不要直接删除 Typora 用户数据目录。Typora 更新可能替换启动入口，更新后重新检查并安装增强。

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
| Ctrl+= 放大、Ctrl+- 缩小整个窗口，含编辑器与终端 | [窗口缩放](docs/workspace_zoom.md) |
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

用户脚本在仓库根目录，以 `install`、`check`、`restore` 命名；平台与事务实现位于 `scripts/`。`enhancements/src/` 保存工作台源码，`enhancements/dist/` 保存配套预构建文件。第三方资产的许可证、来源和摘要随 `enhancements/vendor/` 与 `enhancements/dist/licenses/` 保留。
