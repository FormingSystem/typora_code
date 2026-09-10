# Typora Code 冻结工作台范围与回归矩阵

记录日期：2026-09-10。当前目标以用户最后提供的周一截图及其布局、功能为准，源码参照 `59412a2`（2026-09-06）。这是范围冻结，不再以补齐全部 VS Code 功能作为后续路线。截图对应的区域关系优先；旧代码中的已知缺陷不随布局恢复。

针对此前全部截图的最新复查、遗漏及验证边界见[反馈复查记录](feedback_review.md)。下方旧运行计数保留为历史，不能据此推断当前宿主几何已经逐项验收。

## 冻结范围

| 区域 | 保留行为 | 已撤去的本轮扩展 |
| --- | --- | --- |
| 标题栏 | 35px单行顶栏：左七类 Typora 菜单、中后退前进搜索、右宿主窗控 | Command Center、七类菜单重组及额外布局按钮 |
| Explorer | 工具栏、根目录、树和按需状态提示；单击文件保持打开；文件图标按最新用户要求使用固定 Seti | Open Editors 分节、默认预览标签替换 |
| 活动栏与大纲 | 连续活动栏、原有顺序调整、独立大纲入口和原生大纲实例 | Modern UI 卡片和间隔；嵌入 Explorer 底部的大纲 |
| 搜索 | 查询、过滤、结果分组；单击下方阅读预览、双击打开准确命中；保留预览缩放及定位 | 默认中央编辑器预览标签 |
| 编辑与终端 | 原生 Markdown、源码及差异视图；终端在下方编辑组打开 | 新增独立底部 Panel 布局 |
| SCM 与 Graph | 已有操作及独立功能矩阵，保留已确认图标、折叠和文件状态修复 | 不因本次冻结新增功能 |
| 启动与清理 | 静态样式和常驻启动脚本，单次初始化、资源释放、未保存文档保护 | 不恢复社区插件加载、设置或市场入口 |

[VS Code 来源记录](vscode_design_baseline.md)用于保留官方图标等已核实素材的可追溯性，其中 Modern UI 的卡片、密度和布局数值不再是本次冻结布局目标。Graph 功能范围由[独立矩阵](../enhancements/git_graph_features.md)记录，本表不声明完整 VS Code 等价。

## 布局数值及来源边界

| 对象 | 当前冻结约定 | 来源与保留修复 |
| --- | --- | --- |
| 单行顶栏 / 窗控 | 高35px，左七菜单、中导航搜索、右宿主窗控；窗控按钮宽46px | 固定 VS Code 源码取值；不改 ASAR |
| 顶栏菜单 / 搜索 | 菜单行24px、搜索框22px；长菜单在顶栏下方滚动 | 支持 Shift+滚轮；renderer及本轮原生长菜单检查通过 |
| 文件标签条 | 高 35px，13px Segoe UI；Light 2026／Dark 2026 状态颜色 | 属于编辑区标签，不改变原生系统标题栏 |
| 文件选择器 | 宽 `min(62vw, 600px, calc(100vw - 12px))`，最大高 `min(70vh, 560px)`，结果行22px、输入框23px | 保留 `440ec3f` 的选择器；提交标识不表示尺寸 |
| 活动项 | 48×48px，连续排列 | 周一活动栏骨架，无卡片及 8px 项间空隙 |
| Explorer | 行 26px、工具栏最小 38px、动作 25px、根标题最小 27px | 周一 CSS；虚拟列表步长与行高一致 |
| 大纲 | 原生行布局及原始 `fa-list` 入口图标 | 保留原生树，仅修复入口、隐藏状态与选中同步，不强制套入 Explorer 行高 |
| 状态栏 | 原生区域与既有操作 | 保留已修复的窄窗口重叠及节点清理 |

这些约定不应被旧 Modern 32/28/22 数值表覆盖。状态提示为空时不占位；出现错误及取消重命名后，当前操作行仍须可见。

## 2026-09-10 已知问题与验证矩阵

上一版标准窗口历史证据：构建与 `check` 通过。UI 首轮为36/37（`.cache/final_ui.log`），唯一失败是新增打开／丢弃／暂存按钮后的旧 Graph 首按钮列断言；仅修正测试后，完整 Graph 目标复跑通过（`.cache/graph_final_columns_target.log`，64.657秒），上一版同一产品构建的37个目标全部通过，并非首轮整批零失败。上一版原生集成18/18通过（`.cache/native_integrity_compare/native_integrated_release_final/`），覆盖原始 ASAR 下存活55秒、七菜单与真实未保存草稿。 上一版标准窗口的真实安装与核验通过（`.cache/final_live_install.log`、`.cache/final_live_check.log`），ASAR 未修改；实际 profile 仅 `framelessWindow:true→false`，其余字段完全一致。未强制关闭或重载用户窗口；请保存文档并正常重启 Typora 加载更新。

| 问题 | 当前处理及边界 | 本次已核证据 / 尚待验证 |
| --- | --- | --- |
| 大纲入口图标被替换 | 按用户要求保留核心原始 `i.fa.fa-list.typ-lighter-icon`，不自行选择近似 Codicon | activity 目标 PASS：原节点、尺寸居中、点击及 dispose 保留；对应 Electron 目标通过；不据此推定所有视觉细节均有原生截图验收 |
| 末级标题误显箭头 | 原生仅隐藏伪元素，SVG 曾绕过隐藏；现在按真实直接子标题隐藏叶子 SVG，保留缩进槽与跳转 | activity + outline 目标 2/2 PASS；覆盖动态增删子标题、重开、父折叠展开及恢复；`.cache/outline_leaf_arrow_targets.log` |
| SCM 父子层级错误 | 顶层 Changes 包含提交区、Staged Changes 和 Changes，统一折叠；Graph 独立 | SCM 几何及交互目标通过；原生集成结果见本节总记录 |
| 顶部入口重复 | 按最新要求改为35px同排顶栏，避免系统标题与菜单分成两行 | 原生窗口配置事务目标 PASS；上一版原生七菜单与真实安装核验通过 |
| Light 2026 计数徽章颜色 | 使用已核蓝底白字，避免旧主题背景与前景混用 | SCM geometry 目标 PASS，`.cache/badge_color_target.log`；精确色值以 Electron 目标为证据 |
| Graph 分支色与 stash | 分支图形颜色和 stash 表示按已核扩展语义修复，不套用状态栏颜色或一般文件图标 | 引用颜色目标及最终 Graph 完整目标复跑通过 |
| 状态栏整组灰色 | 移除 Git 容器误用的原生 `footer-item` 类；分支、同步和 Graph 各自 hover / focus，不表示多个选中标签 | 真实状态栏模块及原生碰撞 CSS 目标 PASS，`.cache/status_hover_target.log` |
| 空画布显示 New tab | 仅隐藏 `typ://core.empty/` 系统占位标签与全空标签栏；空路径 Untitled 草稿仍显示 | 真实核心 smoke PASS，`.cache/empty_tab_target.log`；覆盖空→文件→关闭、未保存新建与分栏 |
| 七个真实子菜单 | renderer 分别组织七类菜单并调用已核宿主API；`framelessWindow=true`，不修改 ASAR 或桥接主进程 | 合成配置安装／重装／恢复、损坏拒绝及回滚 PASS；上一版原生七菜单及55秒正常存活验证通过 |
| 快速打开与文件操作 | Ctrl+P 恢复 `440ec3f` 中的文件选择器，鼠标入口在顶栏中央搜索框；新文件默认打开并渲染；SCM 提供打开、丢弃、暂存及差异视图打开文件按钮 | 快捷键 renderer 目标 PASS，原生快捷键冲突验证中；文件与 SCM 目标通过；硬件按键冲突未实证 |
| 阅读残影与 minimap 缩退 | 保留 Markdown / 非 Markdown 切换时隐藏与尺寸恢复、原阅读位置及异步保护 | reading / source Electron 目标及原生集成通过，具体证据不超出各套件场景 |
| Explorer 文件图标 | 最新要求覆盖此前 generic 图标冻结：文件按固定 Seti 字形颜色，文件夹遵从主题不显示 folder glyph，保留 chevron；大纲原图例外不变 | file icons + Explorer 目标 2/2 PASS，`.cache/seti_icon_targets.log`；不恢复 Open Editors、预览标签或改变布局；对应 Electron 目标通过；不据此推定所有视觉细节均有原生截图验收 |
| YAML 与相对文件链接 | 保留已有 YAML/yml 识别；应用及原生 library 文件入口统一路由。Markdown 相对链接按当前文档父目录解析，file URL 只在协议边界解码 | `test_workspace_files_search.cjs`、`test_reading_lifecycle.cjs` 2/2 PASS，`test_workspace_file_uri.mjs` PASS；未修改用户文件 |
| 不存在的文件清空正文 | 进入宿主或切换标签前检查目标存在且为普通文件；callback 入口保留原参数、接收对象及回调 | 上述目标覆盖正文、草稿、标签身份、宿主调用、磁盘文件与 Git 索引不变；有效回调和异步取消覆盖保留 |
| 链接悬停信息 | 正文链接悬停 1 秒后显示提示，离开或清理时取消等待 | Electron 目标通过；此项未包含在原生18项中 |
| 原生偏好入口 | 活动栏底部齿轮恢复打开 Typora 原生偏好设置；不恢复插件设置或市场 | 已核实际调用 `ClientCommand.showPreferencePanel`，Electron 目标通过；此项未包含在原生18项中 |

目标日志均位于忽略的 `.cache/`，长期结论以场景和脚本为准，不以临时目录或旧通过计数作为当前发布证明。

## 必须保留的安全回归

搜索默认下方预览，单击不切中央文件，双击准确定位；保留源码选区、长文档阅读位置和缩放检查。文件编辑继续覆盖草稿、撤消、外部冲突、编码行尾，以及原生异步切换期间不保存错文件。Graph 操作必须保留临时目录隔离、文件字节与 Git 索引保护。启动继续验证静态样式、单次初始化和资源清理。

文件快速打开使用 `440ec3f` 中的文件选择器，Ctrl+P 或顶栏中央搜索入口打开。本轮使用宿主无边框窗口和 renderer 单行顶栏，中部承载导航与文件搜索。最终 UI 与原生集成结果见本节记录；renderer 快捷键目标通过不等于宿主冲突已经排除。

安装使用 schema 4 的 `native_profile` 记录完整备份及 SHA：`profile.data` 是 UTF-8 JSON 的小写十六进制文本，只把 `framelessWindow` 设为 `true`；原 profile 不存在时创建仅含该字段的最小 HEX JSON，并记录原文件缺省。恢复只还原该字段原值或缺省，保留安装后其他设置。未知编码、非对象、非布尔窗口设置及写前摘要冲突均拒绝写入，失败按事务回滚。安装不修改 `app.asar`，也不部署主进程菜单桥接。

原生菜单 accelerator 与物理键盘的冲突尚未实证；renderer 或隔离原生夹具中的合成按键不能替代硬件快捷键验证。链接悬停、偏好入口等以 Electron 目标为证据，不归入原生18项。

## 本轮新增授权及验证边界

本轮按用户新要求恢复35px单行顶栏：左侧为 Typora 文件、编辑、段落、格式、视图、主题、帮助七类菜单，中间为后退、前进和文件搜索，右侧复用宿主窗口按钮。菜单由本地 renderer 组织，只调用已核对的 Typora API，不使用整棵 `Menu.popup` 或修改 ASAR；能力与动态状态以实际接线为界，不声称完整原生菜单等价。菜单在顶栏下方按可用高度滚动，支持 Shift+滚轮。

按用户最新要求，C/C++ 大纲统一接入本机 clangd，通过 LSP 使用当前内存正文和工程编译配置，点击符号精确定位；已移除 C/C++ Tree-sitter 路径。其他五种语言继续内置离线解析，Markdown 保留原生标题目录。代码大纲的设置入口支持 clangd 路径、项目相对编译数据库目录和后备参数，失败不覆盖原设置。详细范围见 [代码大纲与解析环境](source_outline.md)。

上一版 `629fc6a` 的单行顶栏构建、`check` 与整批39/39 UI基线通过（`.cache/single_row_build.log`、`.cache/single_row_check.log`、`.cache/single_row_ui.log`）。保留宿主标题节点的修复后，标题／启动／阅读三个目标回归通过；独立原生实例45项通过，正常存活约60秒，27个发布资产摘要一致；原始 ASAR 和临时文档字节未变。证据位于 `.cache/native_single_row_compare/single_row_title_fix/`。原生场景覆盖七菜单、长菜单 Shift+滚轮、TypeScript 大纲点击定位、Markdown／YAML跳转、真实未保存草稿及缺失目标保护，不等于七种语言都已逐一原生验收或物理键盘 accelerator 已验证。 profile=true 的 PS／Python 隔离事务通过（`.cache/single_row_windows_install.log`、`.cache/single_row_python_install.log`）；上述旧37／18记录仅为历史基线。

当前 clangd 大纲、链接可复制提示、活动栏与滚动高亮修复，以及对应验证边界，统一见 [代码大纲与本轮验证](source_outline.md)。
