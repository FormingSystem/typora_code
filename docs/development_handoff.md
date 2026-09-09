# TyporaCode 开发交接

记录日期：2026-09-09。本文记录迁出后的任务边界与待办，不是完成声明。

## 当前方向与优先级

用户已明确要求先将 Typora 实现迁出，再在本独立仓库继续开发；后续不再与原知识库建立代码同步关系。迁入时包含未提交的工作台修复、社区插件迁移及已有测试修改，保留在 `work/plugin-and-workbench` 分支的工作区，应保留并审查，不得恢复到旧快照。

下一阶段需主动统一所有同类面板，以用户提供的 VS Code 参考图为视觉验收基线。同时对 Git Graph 上游做全功能扫描，逐项实现、核对默认配置并建立回归矩阵。UI 统一、插件迁移和全功能验收均未完成；旧文档中的“已实现”也需要逐项核验。

## 八类 UI 验收要求

1. **Git Graph 顶部控件**：单仓库隐藏 Repository，多仓库保留选择器；Branches 与 Show Remote Branches 对齐提交主体，统一工具栏内边距、标签、选择框、复选框和 20/22px 动作命中框。不能额外留出一层空框。
2. **标题栏下侧栏空带**：35px 标题栏底边同时对齐活动栏首项、侧栏标题、编辑标签和 resizer。工作台模式下 `#sidebar-content`／`.sidebar-content` 的 `top` 归零，覆盖社区核心额外的 18px 和原生偏移；同时检查底部及折叠状态。
3. **窗口按钮**：最小化、最大化／还原、关闭各为 46×35px，总宽 138px；重置原生 `.toolbar-icon.btn` 的 padding、margin、box-sizing、display 与 line-height。最大化容器不得增加宽度，图形使用稳定 SVG，关闭 hover 保持红底白图标。保留宿主原生命令与关闭行为。
4. **提交详情切换**：重复点击同一提交或用 Enter/Space 再次激活应收起，下一次可重新打开。工作树行一致；收起清空 selected/from/to/files，复位所有行 `aria-pressed`，Ctrl/Meta 比较选择保持正确。
5. **提交图断线与重复历史**：旧截图曾由同一 Git Graph 同时展示知识库历史与提取后的工具历史造成。迁出后应在当前实际仓库核对 remote、refs、过滤范围和拓扑；不误将两棵历史当成算法断线，不为开发同步重新导入原知识库引用。涉及连线仍需合并、分支、截断和加载更多等真实拓扑回归。
6. **所有面板几何与密度**：一次性审查活动栏、侧栏主标题、Explorer、Search、Outline、SCM 文件与历史、Git Graph 工具栏／列／详情／文件、编辑标签、状态栏、菜单和弹窗。共享 35px 主标题、22px 列表行／动作、16px 普通动作图标与 8/10/12px inset；活动栏可保留参考图对应的 48px 项和 24px 图标，不强制将不同角色混成同一尺寸。树的虚拟滚动步长必须与 CSS 行高一致。
7. **列表状态与对比度**：明暗主题分别给出稳定 hover、inactive selection、active selection、focus border。Explorer 当前文件、搜索结果、大纲、SCM 文件／历史和 Graph 统一语义；选中行文字、路径、图标均易读，不能被正文主题的过浅 active-file 背景削弱。不改变 Markdown 正文主题。
8. **总体视觉一致性**：同一水平线、同一密度、同一图标画布及状态语义，无无效空带和任意外边距；窄窗口不溢出。以截图和实际 DOM 几何共同验证，不能仅通过 CSS 字符串断言完成验收。

## 已迁入的半成品与明确缺口

工作台几何代理仅写入了 `enhancements/src/workspace_chrome.css` 的共享尺寸／状态色／面板覆盖，以及 `workspace_explorer.css` 的 35/22px 几何；过程中发生默认编码问题，迁入时已转回 UTF-8。上述变更未运行新回归。Explorer TypeScript 虚拟滚动步长仍需核对，暗色调色板需要实际主题探测接通。窗口按钮 SVG、原生盒模型重置、其余面板整理和生命周期修复尚未由该代理完成。

Graph 代理已写入重复提交切换、单仓库 selector 隐藏及部分共享几何／状态 token；SCM 的 pane padding、行高、节标题与动作尺寸也已绑定共享 token。对应交互测试尚未修改，仍保留 40px 工具栏、30px 表头、24px 行高等旧断言；标题栏测试另有上一轮新增草稿。迁出时均暂停，需检查实际差量并补回归，不能直接标记完成。

当前共享 token 为 `--linux-note-shell-header-height`、`--linux-note-shell-row-height`、`--linux-note-shell-action-size`、`--linux-note-shell-icon-size`、`--linux-note-shell-inset-small`、`--linux-note-shell-inset`、`--linux-note-shell-inset-large`；状态 token 包括 hover、selection、inactive-selection 的 background/foreground 与 focus。名称是迁入源码现状，不代表与旧仓库的依赖。若独立产品命名整理改变这些名称，所有引用与测试应一并收敛，不保留双套别名。

生命周期初查：chrome、activity、outline、footer、sidebar_sash 已有 dispose 返回；titlebar、titlebar_menu、quick_open、tab actions 仍需补齐或重新核验。插件卸载必须取消全局监听器、MutationObserver、定时／动画任务，移除自有节点、样式与标记；重新加载不能重复安装。父级工作区需统一收集和调用各绑定的 dispose。

## 社区插件迁移剩余点

目标为单一官方 Typora Community Plugin 加载方式，上游研究版本为 2.10.15。已迁入 `enhancements/src/community_plugin.ts`、`community_plugin/` 资源、官方 loader/core 缓存，以及部分构建、Windows 安装／恢复和 fixture 改动。

继续审查以下闭环；文件可能在迁入整理中已有部分修改，状态以当前差量和新测试为准：

- 根配置／检查脚本与 Windows、Linux 安装恢复是否统一检测社区插件目录和产物。
- `enhancements/scripts/build.mjs`、`check.mjs`、`check_deployment.mjs`、`test_install_windows.ps1` 是否全部收敛到 `dist/community_plugin/`。
- tracked 旧 `dist/typora_enhancements.js`、直接 script 注入标记和旧安装检测仍需清理，不能保留双入口或两套正式运行路径。
- Windows、Linux 均验证安装、重复安装、检查、卸载和恢复；不得仅由一个平台推断另一个平台通过。
- 插件 activate/deactivate 需验证完整销毁与再次加载；说明文档同步删除“bundle 直接加载 core”等过时表述。
- 安装不覆盖用户无关插件、配置或主题；恢复流程应准确归还自身改动。

## Git Graph 全功能扫描与回归矩阵

用户新增要求是完整扫描上游功能后逐项兑现，不能只修截图中已指出的控件。现有 [功能对照](../enhancements/git_graph_features.md) 是审查入口，不能代替扫描结果。扫描开始时核对实际上游版本、提交和来源；README、package.json 的 commands/configuration 与源码入口交叉核对。

建立可审查矩阵，每行至少记录：上游功能／配置名、上游版本与文件入口、真实触发方式、上游默认值、本项目当前行为和默认值、实现位置、缺口、回归用例、最新执行结果及证据。没有验证的行标记待验证；缺失项逐项实现，明确平台或宿主边界，不用笼统“功能齐全”收尾。

扫描范围至少包括仓库发现与多仓库、分支范围和远端过滤、拓扑排序／分页、提交与工作树详情、版本比较与文件历史、分支／标签／stash／remote 操作、fetch/pull/push 与认证失败、merge/rebase/cherry-pick/revert/reset 等流程及冲突继续／中止、右键菜单、搜索与快捷键、设置持久化、默认布局、国际化、主题、无障碍、窄窗口及卸载重载。涉及 Git 写操作的测试在临时 fixture 仓库执行，不作用于用户仓库。

默认配置需要逐项核对上游定义、实际初始化、用户覆盖和重新打开后的行为；不只比较配置名称。交互回归覆盖鼠标和键盘、空仓库／单仓库／多仓库、无选择／单选／比较、加载中／失败／取消、明暗主题及必要平台差异。

## 上游与截图缓存

本仓库内现有只读研究入口：

- `.cache/upstream_typora_community_plugin_2_10_15/`：社区核心源码。
- `.cache/typora_community_release/`：官方 loader/release 材料。
- `.cache/vscode_git_graph_research/`：Git Graph 上游研究树；使用前核对其 Git 身份。
- `.cache/git_graph_evidence/`、`.cache/git_graph_responsive_evidence/`：已有截图材料。

缓存与测试证据不作为正式源码提交，也不是运行时依赖。引用证据时标明对应版本、测试、时间和限制；旧截图只说明旧状态。

## 接续验证

先检查当前差量和测试草稿，再补齐目标回归。重点入口为 `test_workspace_titlebar.cjs`、`test_scm_vscode_geometry.cjs`、`test_git_graph_interaction.cjs`、`test_workspace_files_search.cjs`、`test_workspace_outline.cjs`、`test_workspace_tabs.cjs` 和 `test_workspace_footer.cjs`，均位于 `enhancements/scripts/`。

完成目标测试和截图核验后，在 `enhancements/` 使用已有 `npm run build`、`npm run check`、`npm run check:ui`。旧会话曾通过的标题栏、Graph、SCM、搜索、大纲、标签与底栏测试是修复前基线，不是本次新证据。所有未执行或受阻项如实保留。共享产物构建应串行安排，最后再按实际独立结果审查与提交；未经授权不 push。
