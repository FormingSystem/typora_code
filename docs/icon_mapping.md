# 工作台图标槽位映射

当前以 `59412a2` 的功能与平直布局为参考，保留正式官方图标及已确认的状态修复。用户 2026-09-10 最新要求明确将 Explorer 和真实文件标签图标统一使用随包固定的 VS Code Seti；该图标范围覆盖此前 generic 文件图标决定，不改变周一功能布局，也不恢复 Open Editors、底部 Panel 或自定义标题布局按钮。

官方资源来自 `microsoft/vscode-codicons`，固定提交 `1c47ab36a4bb845c437866405c2fa67b8ca0fe36`。原始SVG、Git blob、SHA-256与许可证见 [资源清单](../enhancements/vendor/codicons/source_manifest.json)。显示保持原始viewBox，不重绘近似路径。Seti 使用 VS Code `1.136.2` / `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f` 的 `vscode-theme-seti 10.0.0`，见 [Seti 清单](../enhancements/vendor/vscode_seti/source_manifest.json) 和 [第三方许可](../enhancements/vendor/vscode_seti/ThirdPartyNotices.txt)。运行时加载随包字体与关联数据，不访问本机 VS Code 目录。

| 当前槽位 | 官方图标／行为 | 说明 |
| --- | --- | --- |
| Explorer、搜索、快速打开及真实文件标签 | 固定 Seti 文件名／扩展名／语言关联 | 共用 `workspace_file_icon`；16px 槽，主题字体比例150%，当前13px文本对应19.5px字形字体 |
| Markdown / TypeScript / TXT | `_markdown` U+E060 / `_typescript` U+E099 / `_default` U+E023 | 浅色前两者 `#498ba7`，TXT `#bfc2c1`；深色按主题对应定义 |
| Explorer 文件夹 | 无 folder glyph，仅 `chevron-right` | Seti 无 folder / rootFolder 定义；保留展开、折叠和对齐 |
| SCM更改、历史文件及差异标签 | 固定 Seti 文件类型图标 | 使用实际文件路径调用同一个 `workspace_file_icon`，SCM槽位16px |
| 目录／SCM分组折叠 | `chevron-right` | 展开旋转90度；SCM空组也显示16px箭头 |
| 独立大纲 | 原生 `fa-list` 列表图标及原生大纲树 | 用户明确要求恢复原图标，保留原节点；不在Explorer重复嵌入 |
| Activity文件／搜索／SCM | `files / search / source-control` | 24px图标，48px连续活动项 |
| 终端／搜索结果等功能标签 | `terminal / search` 等对应功能图标 | 没有真实文件身份的视图保留功能图标；真实文件差异标签仍使用共享 Seti |
| Git Graph工具栏 | `search / terminal / settings-gear / git-fetch / refresh` | 保留已验证的扩展专属尺寸 |
| Git Graph引用 | `git-branch / tag / archive` | 图标背景与行轨道颜色一致，文字遵循主题；HEAD随所属引用 |
| Git Graph 详情文件树 | 文件共用 Seti；目录保留 Font Awesome Free 6.7.2 `folder / folder-open` | 文件按实际路径识别；目录保留 Graph 自身树语义及官方 SVG 原路径 |
| Graph Find | `case-sensitive / regex / arrow-up / arrow-down / diff-multiple / close` | 保留已有查找能力，不追加新模式 |
| SCM提交及更多选项 | `check / chevron-down` | 图标继承提交按钮白色前景 |
| SCM历史引用 | 对应正式引用图标 | 继承彩色标签前景，不被通用灰色覆盖 |
| 共享菜单 | `check / chevron-right` | 勾选和子菜单语义 |
| Mermaid工具 | `remove / add / close / screen-full` | 保留阅读增强入口 |

真实文件图标入口为 [workspace_file_icons.ts](../enhancements/src/workspace_file_icons.ts) 与 [workspace_explorer.ts](../enhancements/src/workspace_explorer.ts)：源码 URI 先还原真实路径；Graph 差异标签由其真实文件路径提供 Seti 图标。没有真实文件身份的 Graph、终端及第三方视图不按 URI 前缀猜测文件字形。自有 Graph／diff SVG 槽单独屏蔽迟到的 FA 伪元素；不修改原生大纲入口。关闭标签立即释放图标原节点引用，卸载恢复仍在使用的原节点与样式。[拖动跟随预览](drag_and_windows.md)使用来源已有图标和名称，不维护第二套文件类型映射；[渐进搜索结果](search_performance.md)同样沿用共享Seti入口。

其他实现入口包括 [git_icons.ts](../enhancements/src/git_icons.ts)、[git_source_control.ts](../enhancements/src/git_source_control.ts)、[git_scm_history.ts](../enhancements/src/git_scm_history.ts) 与 [git_graph_panel.ts](../enhancements/src/git_graph_panel.ts)。详情图标的固定来源和许可见 [Font Awesome 清单](../enhancements/vendor/fontawesome/SOURCE.json)。35px单行顶栏使用左七菜单、中间导航搜索和右侧宿主窗口按钮；窗口按钮仅替换为已核官方 Codicons 外观，保留原动作，不绘制近似图标。菜单只复用已核 Typora API，不声称完整原生菜单树等价。

验证入口包括 `test_workspace_file_icons.cjs`、`test_scm_file_icons.cjs`、Explorer、搜索及文件选择器目标，检查共享识别结果、真实字体、明暗颜色、虚拟 URI 隔离、点击打开和图标资源释放。引用颜色另按分支、远端、HEAD、tag、stash 及自定义调色板检查。代码大纲的分类图标与配色见[代码大纲与解析环境](source_outline.md)。

运行结果与历史计数统一见[反馈复查记录](feedback_review.md)。已通过的具体场景不代表所有图标槽均有同 DPI 的成对截图，资源数量也不构成全视觉验收证明。
