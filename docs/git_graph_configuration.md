# Git Graph配置与VS Code核对

## R024

2026-09-12，用户要求取得VS Code的Graph配置后修复Typora，并确认本轮先对齐截图相关按钮、悬停和布局，其余配置记录差异。截图是VS Code内置源代码管理Graph；Marketplace Git Graph扩展不作为本轮配置来源。用户最终撤销“详情应等待1秒”的判断，按核实的默认与实际行为实施。搜索预览回定位仍由[R023](search_performance.md#r023)独立负责。

本机发行文件本次读到 **VS Code 1.137.0，提交`645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`**，不同于先前1.136.2基线。用户设置使用Light 2026，未显式覆写`scm.*`、`git-graph.*`或`workbench.hover.*`；当前项目没有`.vscode/settings.json`，没有用户Profile目录。以下为本机本地文件夹场景的默认核对，不代表未知远端工作区或扩展运行时设置。只读核对，不修改VS Code配置；其余工作台设计基线不随本次版本升级整体迁移。

## 全部Graph专用配置差异

固定版本[SCM配置注册](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/scm.contribution.ts)只注册以下5个`scm.graph.*`键。Typora原有完整Graph与侧栏共用仓库控制器，但并非所有设置都同时作用于两种视图；表中明确区分，不能以“设置页有该项”宣称侧栏已支持。

| VS Code配置 | 默认、范围 | Typora现状与本轮处理 |
| --- | --- | --- |
| `scm.graph.pageOnScroll` | true，布尔 | `auto_load=true`只接通中央完整Graph自动分页；侧栏使用“加载更多”。本轮记录差异 |
| `scm.graph.pageSize` | 50，整数1–1000 | `initial_count=300`、`page_count=100`，1–2000；控制器与侧栏复用已读提交。本轮保留已有配置 |
| `scm.graph.badges` | filter；all/filter | 侧栏展示通过show_tags/show_remotes/show_remote_heads开关的全部引用，不提供按引用过滤器选徽标和同类引用计数合并；中央combine_refs也不等价。本轮记录差异 |
| `scm.graph.showIncomingChanges` | true，布尔 | 没有Graph独立传入标记开关；已有同步状态不是同一功能。本轮记录差异 |
| `scm.graph.showOutgoingChanges` | true，布尔 | 没有Graph独立传出标记开关；已有推送操作不是同一功能。本轮记录差异 |

## 按钮、悬停与布局

| VS Code配置或实现规则 | 核实值 | Typora采用及边界 |
| --- | --- | --- |
| `scm.alwaysShowActions` | false；hover或focused行立即显示动作，true常显 | `history_always_show_actions=false`，仅管理侧栏Graph提交/文件行；保留其他SCM现有动作策略。展开不等于焦点 |
| `workbench.hover.delay` | Windows/Linux500ms；macOS1500ms，最小0 | 公共默认500ms，模块可通过delay_ms覆写；本轮验证Windows，不宣称macOS默认已对齐 |
| `workbench.hover.reducedDelay` | 500ms，最小0 | Graph没有启用reducedDelay；不为未使用分支新增设置 |
| 悬停组 | `scm-history-item`，已显示时同组切换即时更新 | 由共同hover的grouped局部策略实现；退出/点击/滚动/取消后恢复首次等待 |
| 位置 | RIGHT，目标是完整history-item，带指示角；纵向居中 | Git提供完整列表避让区，额外包括滚动条；触发与焦点仍归提交行。右、左、下、上候选及空间约束由公共层处理，绝不覆盖操作区域 |
| 外形 | compact=true，12px字号、19px行高、2px 8px内距；with-pointer圆角3px | 共同紧凑角色与指示角，Git只组织内容；长消息换行，最大内容边界沿用公共500px，空间不足时内部滚动 |
| 图形/字段 | 行22px、轨道11px、引用18px、字段/动作间隔4px | 保留现有行高、轨道和引用；提交动作显示槽22px，鼠标或焦点出现才占位；展开文件行保留22px动作槽与状态列，文字自动截断 |
| 关闭与异步 | 点击/离开/Esc、失效目标取消；旧详情不能替换新对象 | 共同取消信号与250ms移入宽限；滚动/窗口缩放关闭，仓库+提交缓存不变。不会执行Git写操作 |

位置与外形依据[Graph渲染器](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/scmHistoryViewPane.ts)、[SCM样式](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/contrib/scm/browser/media/scm.css)、[HoverWidget](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/hover/browser/hoverWidget.ts)和[hover.css](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/hover/browser/hover.css)；时序依据[配置注册](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/workbench.contribution.ts)和[HoverService](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/hover/browser/hoverService.ts)。未复制上游实现。

## 周边设置边界

`scm.defaultViewMode`、`scm.compactFolders`负责SCM文件树，`scm.defaultViewSortKey`负责文件排序，`scm.showActionButton`是提交按钮，`scm.countBadge`是活动栏数量；均不是Graph专用键。Typora侧栏的tree/history_tree/sort_order与分区高度、开关保存在既有SCM布局状态，中央file_view/compact_folders在Graph设置；两者用途独立，未宣称配置互通。Graph默认右侧详情不是中央`details_location`的inline/docked设置。

Typora还有排序/首父、stash/reflog、图线样式/颜色、中央列宽与列显隐、引用、头像、签名、审阅、PR和Git命令等独立设置；本轮不删除或强行改成VS Code默认，也不引入新的分页和传入/传出实现。已有配置的保存、校验、取消、仓库隔离与导入导出继续由`git_graph_settings`和控制器管理。

## 验收

基线复现相同结果不回预览及卡片遮住动作；真实Chromium指针验证动作即时出现、卡片与整个列表/滚动条不重叠、移入复制和行末操作可点击。覆盖明暗、不同缩放、窄宽侧栏、展开/焦点、长消息、边缘回退、异步增长、刷新/销毁，以及设置保存重载。原生Typora隔离验证与构建、脚本检查分别记录证据；未完成测试不得用旧通过代替。交付状态集中在[反馈记录](feedback_review.md)，本地台账管理本轮进度。
