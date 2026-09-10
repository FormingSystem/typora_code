# 工作台图标槽位映射

当前以 `59412a2` 的功能与平直布局为参考，保留正式官方图标及已确认的状态修复。用户 2026-09-10 最新要求明确将 Explorer 和真实文件标签图标改为设备 VS Code 对应的 Seti；该图标范围覆盖此前 generic 文件图标决定，不改变周一功能布局，也不恢复 Open Editors、底部 Panel 或自定义标题布局按钮。

官方资源来自 `microsoft/vscode-codicons`，固定提交 `1c47ab36a4bb845c437866405c2fa67b8ca0fe36`。原始SVG、Git blob、SHA-256与许可证见 [资源清单](../enhancements/vendor/codicons/source_manifest.json)。显示保持原始viewBox，不重绘近似路径。Seti 使用 VS Code `1.136.2` / `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f` 的 `vscode-theme-seti 10.0.0`，见 [Seti 清单](../enhancements/vendor/vscode_seti/source_manifest.json) 和 [第三方许可](../enhancements/vendor/vscode_seti/ThirdPartyNotices.txt)。运行时加载随包字体与关联数据，不访问本机 VS Code 目录。

| 当前槽位 | 官方图标／行为 | 说明 |
| --- | --- | --- |
| Explorer 文件及真实文件标签 | 固定 Seti 文件名／扩展名／语言关联 | 16px 槽；主题字体比例150%，当前13px文本对应19.5px字形字体 |
| Markdown / TypeScript / TXT | `_markdown` U+E060 / `_typescript` U+E099 / `_default` U+E023 | 浅色前两者 `#498ba7`，TXT `#bfc2c1`；深色按主题对应定义 |
| Explorer 文件夹 | 无 folder glyph，仅 `chevron-right` | Seti 无 folder / rootFolder 定义；保留展开、折叠和对齐 |
| SCM更改及历史文件 | `file` | 独立通用官方文件图标，SCM槽位16px，不被Seti覆盖 |
| 目录／SCM分组折叠 | `chevron-right` | 展开旋转90度；SCM空组也显示16px箭头 |
| 独立大纲 | 原生 `fa-list` 列表图标及原生大纲树 | 用户明确要求恢复原图标，保留原节点；不在Explorer重复嵌入 |
| Activity文件／搜索／SCM | `files / search / source-control` | 24px图标，48px连续活动项 |
| 差异／终端／搜索结果标签 | `compare-changes / terminal / search` | 不把功能标签当成普通文件 |
| Git Graph工具栏 | `search / terminal / settings-gear / git-fetch / refresh` | 保留已验证的扩展专属尺寸 |
| Git Graph引用 | `git-branch / tag / archive` | 图标背景与行轨道颜色一致，文字遵循主题；HEAD随所属引用 |
| Git Graph 详情文件树 | Font Awesome Free 6.7.2 实心 `file / folder / folder-open` | 13px，继承灰色；与 Explorer 的 Seti 文件类型图标分开，保留官方 SVG 原路径 |
| Graph Find | `case-sensitive / regex / arrow-up / arrow-down / diff-multiple / close` | 保留已有查找能力，不追加新模式 |
| SCM提交及更多选项 | `check / chevron-down` | 图标继承提交按钮白色前景 |
| SCM历史引用 | 对应正式引用图标 | 继承彩色标签前景，不被通用灰色覆盖 |
| 共享菜单 | `check / chevron-right` | 勾选和子菜单语义 |
| Mermaid工具 | `remove / add / close / screen-full` | 保留阅读增强入口 |

真实文件图标入口为 [workspace_file_icons.ts](../enhancements/src/workspace_file_icons.ts) 与 [workspace_explorer.ts](../enhancements/src/workspace_explorer.ts)：源码 URI 先还原真实路径，Graph、虚拟 diff、终端及第三方视图不按 URI 前缀选择文件字形。自有 Graph／diff SVG 槽单独屏蔽迟到的 FA 伪元素；不修改原生大纲入口。关闭标签立即释放图标原节点引用，卸载恢复仍在使用的原节点与样式。

其他实现入口包括 [git_icons.ts](../enhancements/src/git_icons.ts)、[git_source_control.ts](../enhancements/src/git_source_control.ts)、[git_scm_history.ts](../enhancements/src/git_scm_history.ts) 与 [git_graph_panel.ts](../enhancements/src/git_graph_panel.ts)。详情图标的固定来源和许可见 [Font Awesome 清单](../enhancements/vendor/fontawesome/SOURCE.json)。本轮35px单行顶栏恢复左七菜单、中间导航搜索和右侧宿主窗口按钮；窗口按钮仅替换为已核官方 Codicons 外观，保留原动作，不绘制近似图标。菜单只复用已核 Typora API，不声称完整原生菜单树等价。

上一版曾通过37个 UI 目标及18项原生检查。本轮 `test_scm_file_icons.cjs` 已改为核对与 Explorer 共用的 Seti 文件识别、颜色和字形，覆盖真实点击比较、空／非空分组、箭头及白色按钮；引用颜色目标仍检查分支／远端／HEAD／tag／stash与自定义调色板。原生通过项不表示所有图标槽均已有同DPI截图验收，资源数量不构成完成证明。

本次 `test_workspace_file_icons.cjs` 与 Explorer 目标通过；新增图标目标覆盖真实字体、明暗字形颜色、源文件标签、虚拟 URI 隔离、迟到原生图标、12 次关闭后的引用释放及 dispose 恢复。单项通过不代表最新统一构建和原生安装已经验收。

本轮按用户新要求恢复35px单行顶栏：左侧为 Typora 文件、编辑、段落、格式、视图、主题、帮助七类菜单，中间为后退、前进和文件搜索，右侧复用宿主窗口按钮。菜单由本地 renderer 组织，只调用已核对的 Typora API，不使用整棵 `Menu.popup` 或修改 ASAR；能力与动态状态以实际接线为界，不声称完整原生菜单等价。菜单在顶栏下方按可用高度滚动，支持 Shift+滚轮。

本轮单行顶栏构建、`check` 与整批39/39 UI基线通过（`.cache/single_row_build.log`、`.cache/single_row_check.log`、`.cache/single_row_ui.log`）。保留宿主标题节点的修复后，标题／启动／阅读三个目标回归通过；独立原生实例45项通过，正常存活约60秒，27个发布资产摘要一致；原始 ASAR 和临时文档字节未变。证据位于 `.cache/native_single_row_compare/single_row_title_fix/`。原生场景覆盖七菜单、长菜单 Shift+滚轮、TypeScript 大纲点击定位、Markdown／YAML跳转、真实未保存草稿及缺失目标保护，不等于七种语言都已逐一原生验收或物理键盘 accelerator 已验证。 profile=true 的 PS／Python 隔离安装事务通过；此前标准窗口数字与 true→false 安装记录仅为历史。
