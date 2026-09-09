# Typora Code 工作台与 VS Code 对照矩阵

记录日期：2026-09-09。本文是逐入口审查台账，不是“一比一完成”声明。扫描对象是已经存在的阅读、源码、文件、搜索、SCM和终端工作台；Git Graph 扩展专属功能、设置和连线由[独立功能矩阵](../enhancements/git_graph_features.md)维护。

## 对照身份与判定边界

官方[发布说明](https://code.visualstudio.com/updates/v1_136)在本次检查显示 1.136 系列及 1.136.2 修订；本文固定 **VS Code 1.136.2 / commit `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`**，来源为官方 `microsoft/vscode` 标签解引用。所有源码证据链接固定到该提交；在线用户文档只辅助解释入口，不代替版本源码默认值。

本次采用与用户参考图一致的 **Windows、经典工作台、自绘标题栏、普通标签高度、默认左主侧栏与底部Panel** 对照。VS Code 1.136另有实验Modern UI和Compact密度，活动栏/标签尺寸以及面板间距不同，不能把这些分支的像素值拼成一个“默认VS Code”。需在截图证据中同时记录版本、窗口大小、OS缩放、窗口zoom、主题、字体和布局设置；目前尚无覆盖全部面板的成对截图。

每行依次记录上游入口、上游默认或契约、本项目实际行为、实现位置、最新回归、明确缺口。**参数吻合** 只说明源码数值一致；**部分** 表示存在能力但入口/默认/状态或证据不齐；**缺失/明确差异** 需要继续实现或取得产品范围决定。历史测试通过不得填入“本轮PASS”。本文源码扫描与矩阵先落地，后续整改须逐行更新实际行为和测试，不能只改状态。

## 几何基准

| 对象 | 固定版本证据 | 经典分支值 | 本项目当前值 |
| --- | --- | --- | --- |
| 有Command Center的标题栏 | [window.ts][window] / `DEFAULT_CUSTOM_TITLEBAR_HEIGHT` | 35px | 35px |
| Windows窗口控制按钮 | [titlebarpart.css][title] | 单按钮46px宽 | 46×35px，总宽138px |
| 左活动栏 | [activitybarPart.ts][activity] | 栏宽48px、ACTION_HEIGHT=48 | 48px项、24px图标 |
| 普通/compact标签 | [editorTabsControl.ts][tabs] | 35px / 22px | 普通35px；未提供全部上游密度模式 |
| Explorer行 | [explorerViewer.ts][explorer] / ITEM_HEIGHT | 22px | TS步长和CSS均22px |
| 全局状态栏 | [statusbarPart.ts][status] / HEIGHT | 22px | 共享footer高度22px |

上述值不规定所有标题/输入/按钮必须同高；Panel页签、视图节标题、普通树行和主标题属于不同角色。布局验收同时检查盒模型、有效内容边界、padding/margin、滚动范围和隐藏状态，而不是仅检查CSS变量。

## 逐入口矩阵

实现列路径均相对 `enhancements/src/`；测试简称均指 `enhancements/scripts/test_<简称>.cjs`，单元测试为 `.mjs`。

| ID / 入口 | 上游源码 | 上游默认或契约 | Typora Code 当前行为 | 实现 | 最新回归 | 结论与明确缺口 |
| --- | --- | --- | --- | --- | --- | --- |
| T01 标题栏几何 | [window][window] / [title][title] | 启用Command Center的自绘标题栏35px；Windows按钮46px宽 | 共享35px；最小化/最大化/关闭46×35px，侧栏与标签从底边开始 | [workspace_titlebar.ts](../enhancements/src/workspace_titlebar.ts) / .css（同名） | workspace_titlebar、scm_vscode_geometry：本轮PASS | 参数吻合；缺相同DPI/缩放/窗口状态的上游与宿主并列截图 |
| T02 标题栏内容 | [menubar][menubar] | 应用菜单、导航、Command Center与布局控制分区 | 应用图标、文件/编辑/选择/视图/转到/终端/帮助、导航、Quick Open；右侧主侧栏与底部Panel切换按钮 | [workspace_titlebar.ts](../enhancements/src/workspace_titlebar.ts) / [workspace_titlebar_entries.ts](../enhancements/src/workspace_titlebar_entries.ts) | workspace_titlebar、plugin_lifecycle：本轮PASS | 部分；没有第二侧栏和全部上游布局选项 |
| T03 菜单语义 | [menubar][menubar] | File/Edit/Selection/View/Go/Run/Terminal/Help按上下文启用 | 七个工作台菜单；Markdown段落/格式移入编辑子菜单；源代码编辑动作路由Monaco | [workspace_titlebar_entries.ts](../enhancements/src/workspace_titlebar_entries.ts) | workspace_titlebar、workspace_file_editing：本轮PASS | 部分；没有调试/任务运行宿主，因此不提供等价Run菜单；原生文档专有动作按上下文禁用 |
| T04 Quick Open | [layout_actions][layout_actions] | Ctrl+P快速打开；独立于Ctrl+Shift+P命令面板 | Ctrl+P文件快速打开；Ctrl+Shift+P或 > 前缀检索已注册命令；: 前缀转到行列 | [workspace_quick_open.ts](../enhancements/src/workspace_quick_open.ts) | workspace_titlebar、workspace_file_editing：本轮PASS | 部分；符号前缀、完整MRU与上游命令覆盖仍有缺口 |
| A01 活动栏尺寸与状态 | [activity][activity] | 经典栏宽48px、项高48px；compact与ModernUI另有尺寸 | 48px项/24px图标；选中边线、hover、inactive、收起状态 | [workspace_activity.ts](../enhancements/src/workspace_activity.ts) / .css（同名） | workspace_activity：本轮PASS | 参数吻合；活动项不同主题高对比、更多项溢出菜单未全验 |
| A02 活动栏顺序/位置 | [activity][activity] / [layout][layout] | 支持拖动排列、显示隐藏及位置设置 | 活动项可拖动，固定左侧；文件/搜索/SCM；大纲嵌入Explorer，独立活动项隐藏 | [workspace_activity.ts](../enhancements/src/workspace_activity.ts) | workspace_activity：本轮PASS | 部分；顶部/底部/隐藏模式、账户/管理入口和位置菜单缺失 |
| S01 主侧栏尺寸/分界 | [layout][layout] / [layout_actions][layout_actions] | 主侧栏默认left；可移动right及Ctrl+B开关 | 单主侧栏、拖动宽度和窄栏收起，Ctrl+B；标题35px | [workspace_sidebar_sash.ts](../enhancements/src/workspace_sidebar_sash.ts) / [workspace_chrome.css](../enhancements/src/workspace_chrome.css) | workspace_sidebar_sash：本轮PASS | 部分；右移、第二侧栏、跨区域拖动视图无等价 |
| S02 视图归属 | [outline][outline] / [layout][layout] | Explorer容器下可组织Open Editors、Folders、Outline、Timeline；Panel独立 | Explorer顶部Open Editors、目录树、底部原生Markdown大纲；大纲命令保留；终端默认底部Panel | [workspace_bootstrap.ts](../enhancements/src/workspace_bootstrap.ts) / [workspace_outline.ts](../enhancements/src/workspace_outline.ts) | 完整插件目标：Open Editors双组定位/非活动关闭、内嵌Outline恢复PASS | 部分；视图跨容器移动、第二侧栏与Timeline节不完整 |
| E01 树行与选择 | [explorer][explorer] | Explorer ITEM_HEIGHT=22；焦点与选中分离 | ROW_HEIGHT=22与CSS一致；虚拟树、hover/active/inactive/focus状态 | [workspace_explorer.ts](../enhancements/src/workspace_explorer.ts) / .css（同名） | workspace_explorer与完整插件目标：22px虚拟步长、状态提示零占位、错误/取消后编辑行可见PASS | 部分；鼠标多选与Ctrl/Cmd+A已接，拖入/拖出、键盘范围选区未覆盖 |
| E02 遍历/隐藏/链接 | [files][files] / [explorer][explorer] | 默认排除模式可配置，自动定位当前文件；按需展开 | 全部文件含隐藏项；可见目录watch；符号链接不递归遍历 | [workspace_explorer.ts](../enhancements/src/workspace_explorer.ts) | workspace_explorer：本轮PASS | 明确默认差异；显示所有文件不等价files.exclude与autoReveal配置 |
| E03 compactFolders | [files][files] | explorer.compactFolders=true，单子目录链合并显示 | 默认合并单子目录链；根菜单可切换；分叉处停止，链探测上限32层 | [workspace_explorer.ts](../enhancements/src/workspace_explorer.ts) | workspace_explorer：本轮新增链压缩PASS | 部分；压缩行操作末端目录，各路径段独立焦点/菜单、持久设置尚缺 |
| E04 新文件/新文件夹 | [file_actions][file_actions] | 树标题动作与目录右键；在目标目录内联输入名称 | 根标题动作与目录右键新建，目标目录内联输入，Enter确认/Esc取消 | [workspace_explorer.ts](../enhancements/src/workspace_explorer.ts) | workspace_explorer、workspace_file_operations：本轮PASS | 部分；单名称创建已接通，包含多级目录的名称尚不支持 |
| E05 剪切/复制/粘贴 | [file_actions][file_actions] | Explorer焦点域Ctrl+X/C/V及右键；文件复制不同于复制路径 | 文件剪贴板、Ctrl/Cmd+X/C/V与目录右键；鼠标多选；批次冲突预检和失败回退 | [workspace_explorer.ts](../enhancements/src/workspace_explorer.ts) / [file_path_actions.ts](../enhancements/src/file_path_actions.ts) | workspace_explorer、workspace_file_operations：本轮PASS | 部分；未接系统文件剪贴板，同目录副本自动命名缺失，跨设备移动明确失败 |
| E06 重命名 | [file_actions][file_actions] | F2或菜单进入内联名称；失败保留编辑 | 单项F2/菜单；单击及双击名称均打开文件；更新标签与搜索路径 | [workspace_explorer.ts](../enhancements/src/workspace_explorer.ts) / [workspace_rename.ts](../enhancements/src/workspace_rename.ts) | workspace_explorer、workspace_rename：有对应测试；本轮explorer PASS | 部分；压缩目录链、大小写重命名、多文件重命名语义待扩展 |
| E07 删除/回收站 | [files][files] / [file_actions][file_actions] | 确认删除默认true；Delete回收站，永久删除为另一操作 | Delete/右键删除，确认后调用系统回收站；失败不转永久删除 | [workspace_explorer.ts](../enhancements/src/workspace_explorer.ts) | workspace_explorer、workspace_file_operations：本轮确认/取消/部分失败PASS | 部分；dirty源码/Markdown保护与移动保留model目标PASS；多项目回收站不能原子回滚 |
| E08 Open Editors/预览打开 | [files][files] / [layout][layout] | Open Editors可见数默认9；enablePreview=true，每组最多一个预览标签 | 顶部打开的编辑器列表按组显示活动叶、关闭与dirty；最多9行；Explorer单击preview、双击/Enter keep-open，dirty自动保持打开 | [workspace_open_editors.ts](../enhancements/src/workspace_open_editors.ts) / [workspace_files.ts](../enhancements/src/workspace_files.ts) | workspace_explorer、files_search与完整插件目标：preview不降级、dirty保持、双组定位及非活动关闭PASS | 部分；固定标签与完整上游标签配置尚缺 |
| Q01 搜索控件 | [search][search] / [search_config][search_config] | 搜索、替换、大小写/全词/正则、include/exclude、忽略开关 | 同类控件已存在，替换默认收起；新增仅打开/仅Git更改范围 | [workspace_search.ts](../enhancements/src/workspace_search.ts) / [workspace_files.css](../enhancements/src/workspace_files.css) | workspace_files_search、workspace_selection_search：本轮PASS | 部分；统一默认展开状态、输入高度、按钮hitbox与空结果/错误布局还需同场景测量 |
| Q02 搜索结果 | [search_config][search_config] / [search][search] | collapseResults默认alwaysExpand；文件分组、列表/树显示 | 默认列表、路径与文件分组、命中高亮及折叠；单击在编辑区preview打开，双击/Enter保持打开 | [workspace_search.ts](../enhancements/src/workspace_search.ts) | workspace_files_search：最新目标PASS | 部分；列表/树配置及空/加载/错误状态仍需同场景上游对照 |
| Q03 替换事务 | [search][search] | 搜索结果替换操作与确认按文件/匹配处理 | 预览后按验证过的内容替换；保留未保存冲突提示 | [workspace_search.ts](../enhancements/src/workspace_search.ts) / [workspace_search_engine.ts](../enhancements/src/workspace_search_engine.ts) | files_search与search相关单元：有测试 | 部分；本轮报告未逐项证明所有regex/保留大小写/拒绝路径的UI等价 |
| Q04 搜索下方预览 | [search][search] | 搜索面板没有默认常驻Markdown阅读预览分区 | 默认不显示；搜索视图选项中显式开启阅读预览，保留独立缩放与可拖动分区 | [workspace_lookup_preview.ts](../enhancements/src/workspace_lookup_preview.ts) / [workspace_selection_search.ts](../enhancements/src/workspace_selection_search.ts) | workspace_files_search：最新默认行为目标PASS；阅读预览已有目标PASS | 项目可选扩展；默认布局按编辑区preview打开，开启后的新增阅读区域不纳入上游像素同图对照 |
| O01 大纲数据与跟随 | [outline_view][outline_view] | Outline依赖活动编辑器符号；支持排序、筛选、跟随等视图能力 | 使用Typora Markdown标题；默认折叠；菜单与命令面板一致展开嵌入大纲；高亮当前标题并展开祖先、移除原生搜索过滤条 | [workspace_outline.ts](../enhancements/src/workspace_outline.ts) / .css（同名） | workspace_outline：本轮PASS | 部分；源码符号大纲、按名称/类型排序、类型筛选与跟随开关缺失 |
| C01 SCM主侧栏 | [scm][scm] | 默认list；showActionButton=true；输入与变更分组 | 提交输入、提交按钮、暂存/未暂存、分支与历史分区 | [git_source_control.ts](../enhancements/src/git_source_control.ts) / [git_graph.css](../enhancements/src/git_graph.css) | scm_vscode_geometry、scm_sidebar_layout：本轮PASS | 局部对齐；仓库选择、输入工具栏、各分组空/多文件状态仍需逐入口矩阵 |
| C02 SCM文件操作 | [scm][scm] | 按资源组暂存/撤销；命令随状态启用 | hover行内操作、右键暂存/忽略/放弃；Ctrl+Enter仅提交暂存 | [git_source_control.ts](../enhancements/src/git_source_control.ts) / [git_ignore.ts](../enhancements/src/git_ignore.ts) | interaction及Git单元：见Git专项回归记录 | 部分；Git Graph专用命令与连线详见独立矩阵，不在此重复宣称 |
| B01 标签尺寸/排列 | [tabs][tabs] / [multi_tabs][multi_tabs] / [layout][layout] | 普通35px、compact22px；tabSizing=fit、wrapTabs=false | 35px标签；多组、右键关闭组/其他/右侧/全部 | [workspace_tabs.ts](../enhancements/src/workspace_tabs.ts) / [workspace_chrome.css](../enhancements/src/workspace_chrome.css) | workspace_tabs：本轮PASS | 部分；固定/收缩/换行模式、pinned/sticky、预览斜体、溢出行为不完整 |
| B02 编辑组 | [layout_actions][layout_actions] | 网格拆分、拖动标签/组、侧边打开、组焦点命令 | 社区core左右/上下拆分与源码草稿跨组保留 | [workspace_bootstrap.ts](../enhancements/src/workspace_bootstrap.ts) / [workspace_files.ts](../enhancements/src/workspace_files.ts) | workspace_file_editing、workspace_tabs：本轮PASS | 部分；Ctrl+1/2/3组切换、复杂网格均分、组内split与浮动窗口需逐项核对 |
| D01 编辑表面 | [layout][layout] | 源码编辑器作为常规文件表面，Markdown预览另开 | Markdown原生所见即所得；源码Monaco 0.56.0；一个活动原生Markdown编辑器 | [workspace_files.ts](../enhancements/src/workspace_files.ts) / [workspace_text_document.ts](../enhancements/src/workspace_text_document.ts) | workspace_file_editing、workspace_source_lifecycle：本轮PASS | 宿主边界；不是完整VSCode编辑器/扩展宿主，不能以Monaco相同证明全部动作一致 |
| D02 保存/关闭 | [file_actions][file_actions] | 保存、另存、保存全部及dirty关闭确认 | 源码Ctrl+S、保存全部、编码/换行、关闭保存/放弃/取消 | [workspace_files.ts](../enhancements/src/workspace_files.ts) / [workspace_source_lifecycle.ts](../enhancements/src/workspace_source_lifecycle.ts) | workspace_file_editing、workspace_source_lifecycle、interaction：本轮PASS | 部分；崩溃恢复/Hot Exit与外部改动多窗口协调不能由正常关闭PASS推出 |
| D03 编辑菜单上下文 | [menubar][menubar] | 活动文本编辑器的撤销/重做/剪贴板/查找均可调用 | 撤销/重做、剪切复制粘贴、全选、查找替换及部分选择/转到动作在源码上下文调用Monaco；Markdown调用宿主 | [workspace_titlebar_entries.ts](../enhancements/src/workspace_titlebar_entries.ts) | 源码路由已实现，最新菜单目标回归待验证 | 部分；Markdown专有排版与原生文件动作仍按宿主能力启用，不代表完整VSCode动作覆盖 |
| D04 面包屑/Sticky Scroll | [layout][layout] | 编辑器可显示面包屑与粘性滚动 | 当前未见工作台面包屑；Markdown标题跟随在大纲实现 | [workspace_files.ts](../enhancements/src/workspace_files.ts) / [reading_minimap.ts](../enhancements/src/reading_minimap.ts) | 无等价测试 | 缺失；大纲跟随与minimap不能替代这两个入口 |
| D05 阅读导航/缩略图 | [tabs][tabs] / [layout_actions][layout_actions] | 编辑历史导航与minimap；功能按编辑器上下文执行 | Alt方向键阅读历史、跨文件标题/选区恢复、原文与源码缩略图 | [reading_navigation.ts](../enhancements/src/reading_navigation.ts) / [reading_minimap.ts](../enhancements/src/reading_minimap.ts) | reading_lifecycle、reading_minimap：本轮PASS | 阅读扩展；位置/取消已测，不意味着VSCode所有导航历史语义相同 |
| F01 全局状态栏 | [status][status] | 经典高度22px，左右区域与按上下文显示的状态项 | 唯一footer；活动源码行列/语言/编码/换行，Git项；窄宽度压缩 | [workspace_footer.ts](../enhancements/src/workspace_footer.ts) / [workspace_editor_status.ts](../enhancements/src/workspace_editor_status.ts) | workspace_footer、workspace_editor_status、workspace_diff_status：有测试；geometry本轮集成 | 部分；statusbar项显隐菜单、Problems/通知/同步/远程状态没有完整对应 |
| R01 终端归属与标签 | [terminal][terminal] / [layout][layout] | defaultLocation=view；Panel默认bottom；tabs.enabled=true | 终端默认底部Panel，独立会话标签、隐藏、分隔调整高度；可往返编辑区；原PTY会话继续使用 | [terminal_workspace.ts](../enhancements/src/terminal_workspace.ts) / [terminal_panel.ts](../enhancements/src/terminal_panel.ts) | terminal_theme、plugin_lifecycle及PTY：本轮PASS | 部分；完整终端列表、任意Panel方位、Panel组的分割布局仍需核对 |
| R02 终端进程与恢复 | [terminal][terminal] | enablePersistentSessions=true，可恢复会话/历史 | 私有Node+node-pty Windows ConPTY；插件卸载释放进程；无跨窗口重启恢复 | [terminal_pty_client.ts](../enhancements/src/terminal_pty_client.ts) / [terminal_runtime.ts](../enhancements/src/terminal_runtime.ts) | terminal_theme/PTY：本轮PASS | 缺失；原生Linux终端包、shell integration、持久会话不能宣称等价 |
| R03 终端菜单/快捷键 | [terminal][terminal] | 新建、拆分、配置选择、终止、查找等上下文命令 | Ctrl+反引号、profile选择、复制粘贴/查找/重启/终止/UAC | [terminal_workspace.ts](../enhancements/src/terminal_workspace.ts) | terminal_theme/PTY：本轮PASS | 部分；命令装饰、工作目录跟随、终端tabs的完整右键项需补核 |
| K01 工作台键位 | [layout_actions][layout_actions] / [file_actions][file_actions] | 按焦点和平台解析keybinding及chord | Ctrl+B、Ctrl+反斜杠、Ctrl+K组合、Ctrl+P、路径快捷键；编辑器/终端/弹窗有避让 | [workspace_shortcuts.ts](../enhancements/src/workspace_shortcuts.ts) / [workspace_titlebar.ts](../enhancements/src/workspace_titlebar.ts) | workspace_shortcuts：本轮PASS | 部分；可配置keybindings/冲突诊断与完整VSCode默认表没有实现 |
| K02 菜单/树键盘 | [menu][menu] / [explorer][explorer] | 方向键/Home/End、子菜单左右、Esc与焦点恢复 | 通用菜单具备方向/Home/End/子菜单/Esc；树方向键与F2 | [workspace_widgets.ts](../enhancements/src/workspace_widgets.ts) / [workspace_explorer.ts](../enhancements/src/workspace_explorer.ts) | workspace_explorer、workspace_titlebar：本轮PASS | 部分；mnemonic、type-ahead、多选、键盘调用上下文菜单需专用断言 |
| M01 通用右键菜单 | [menu][menu] | 一致的菜单列/快捷键/状态/子菜单，限制在视口内 | workspace_menu使用git-graph-menu样式；标题菜单另有实现；核心标签菜单又一套 | [workspace_widgets.ts](../enhancements/src/workspace_widgets.ts) / [workspace_titlebar_menu.ts](../enhancements/src/workspace_titlebar_menu.ts) | titlebar及Graph菜单相关测试 | 明显结构风险；至少三套容器，统一token不证明行高/快捷键列/滚动一致 |
| M02 弹窗/焦点 | [dialog][dialog] | 焦点循环、按钮顺序、Esc/Enter、错误信息与可访问名称 | workspace_dialog有role/aria-modal、Tab循环、Esc、归还焦点；复用Git样式 | [workspace_widgets.ts](../enhancements/src/workspace_widgets.ts) | reading_lifecycle、interaction：部分覆盖 | 部分；无可聚焦项/动态禁用/嵌套弹窗/默认确认与窄窗口专用测试不足 |
| P01 主题与缩放 | [layout][layout] / [activity][activity] | 工作台主题token与系统DPI/缩放、对比度模式共同决定外观 | 优先vscode token并给明暗fallback；正文主题隔离；共享35/22等token | [workspace_chrome.ts](../enhancements/src/workspace_chrome.ts) / .css（同名） / [workspace_ui_appearance.ts](../enhancements/src/workspace_ui_appearance.ts) | chrome_theme及geometry：本轮PASS | 部分；没有上游相同字体/字号/缩放/高对比的逐面板截图证明 |

## 本轮验证记录与不能推出的结论

- 已执行目标：`npm run check:ui -- test_reading_lifecycle.cjs test_reading_minimap.cjs`，2/2通过；reading history、positions与file paths单元通过。覆盖取消后不回写、命令/订阅/DOM释放和重载；不覆盖完整VS Code功能。
- 同轮目标记录：source_lifecycle、files_search、file_editing、interaction（新增卸载重载）通过；既有几何10项目标通过；终端theme/PTY通过。这些是目标fixture结果，不代表官方VS Code实窗并列复核。
- 当前基线已执行完整 `npm run build`、`npm run check` 和 `npm run check:ui`，隐藏Electron **28/28 PASS**；Windows安装与干净Git检出副本安装回归通过。已有fixture若仅检查Typora Code自洽尺寸，不等于比较了官方VS Code实窗。需要继续留存同场景成对截图与DOM/视觉证据。
- 本轮真实Typora阅读两次开窗20项通过，Git套件68项通过；覆盖内嵌大纲同步、来源位置、拓扑、分栏详情、差异和临时Git写操作。宿主appLocale语言修复已通过七种DOM场景与实窗验证。实窗功能通过不替代官方VS Code同DPI的成对视觉检查。
- 已有运行边界继续有效：Typora原生Markdown编辑、社区core、Monaco与Windows ConPTY各有独立契约；VS Code扩展宿主、语言服务器、调试、Tasks、Problems、账户同步、远程开发、AI功能没有因此被实现。用户要求扩大范围时应增加矩阵行和具体测试，不把未知项默认标成不需要。

## 优先整改队列

1. **Explorer文件动作**：E03～E07已有创建/剪贴/回收站和compactFolders基础实现，继续核对矩阵列出的系统剪贴板、副本命名和压缩路径段缺口。每个动作必须核对目标目录、名称、权限、冲突、符号链接、未保存编辑器、失败后树状态；仅菜单上出现按钮不算完成。
2. **活动编辑器菜单**：D03已路由当前Monaco实例；菜单与键盘目标回归通过；另存为等仍受原生文档上下文限制，继续按矩阵补齐。
3. **区域归属**：S02、O01、R01已实现内嵌Outline、Open Editors与底部Terminal Panel；已验证活动文件切换、折叠和终端往返编辑区；继续核对矩阵内尚缺的区域操作。
4. **多套菜单/弹窗**：M01/M02统一所有容器的行高、列宽、快捷键对齐、子菜单、焦点循环与窄窗口滚动；补菜单从边缘弹出与动态禁用测试。
5. **标签/状态/键位**：E08、B01、F01、K01核对已实现预览/Open Editors，继续补固定标签、状态项显隐及完整上下文键位表，逐条区分“实现”“未实现”“测试未覆盖”。
6. **视觉收口**：对每个实际区域同时截取light/dark、正常/窄窗、active/inactive/hover/focus/disabled状态。先排除无效空带和错位，再核字体、图标画布和颜色。交付前更新每行测试及缺口，保留仍不满足项。

官方辅助阅读：[工作台布局](https://code.visualstudio.com/docs/editing/getting-started/userinterface)、[快捷键配置](https://code.visualstudio.com/docs/configure/keybindings)、[终端基本用法](https://code.visualstudio.com/docs/terminal/basics)。

[window]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/platform/window/common/window.ts
[title]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/parts/titlebar/media/titlebarpart.css
[menubar]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/parts/titlebar/menubarControl.ts
[activity]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/parts/activitybar/activitybarPart.ts
[layout]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/workbench.contribution.ts
[layout_actions]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/actions/layoutActions.ts
[files]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/files/browser/files.contribution.ts
[file_actions]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/files/browser/fileActions.contribution.ts
[explorer]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/files/browser/views/explorerViewer.ts
[search]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/search/browser/searchView.ts
[search_config]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/search/browser/search.contribution.ts
[outline]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/outline/browser/outline.contribution.ts
[outline_view]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/outline/browser/outlinePane.ts
[scm]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/scm/browser/scm.contribution.ts
[tabs]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/parts/editor/editorTabsControl.ts
[multi_tabs]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/parts/editor/multiEditorTabsControl.ts
[status]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/browser/parts/statusbar/statusbarPart.ts
[terminal]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/contrib/terminal/common/terminalConfiguration.ts
[dialog]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/base/browser/ui/dialog/dialog.ts
[menu]: https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/base/browser/ui/menu/menu.ts
