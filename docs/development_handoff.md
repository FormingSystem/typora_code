# TyporaCode 开发交接

记录日期：2026-09-09。本文记录迁出后的任务边界与待办，不是完成声明。

## 当前产品与部署状态

Typora Code 已独立维护，工作区和所有构建、运行、测试入口均收敛在本仓库。普通文件夹可以直接使用，不依赖原知识库目录、元数据或根脚本，也没有跨仓代码同步约定。独立迁移时保留的改动已持续整改；当前差量必须按实际内容审查，不得恢复到迁入快照。

部署统一采用 **Typora Community Plugin 2.10.15 官方 loader/core + `enhancements/dist/community_plugin`**。插件包包含 `main.js`、`manifest.json`、`style.css`，三项摘要由构建写入 `SHA256SUMS`；Windows与Bash安装、检测及恢复共用同一资产定义。旧direct bundle不再是有效发布入口，部署检查拒绝旧分发文件残留。安装和恢复仅合并本插件设置，保留其他插件与用户后续设置；共享核心是否保留按其他插件实际存在情况判断。

Windows隔离安装回归已经覆盖安装、重复安装、恢复、再次安装、摘要错误预检和失败回退。最终基线已通过build、完整check和28/28隐藏UI；Git以core.autocrlf=true检出的干净副本也通过摘要校验及Windows安装回归。Bash文件事务与模拟Linux分支已有目标验证；原生Linux安装环境尚无实机证据，不能把Windows上的Bash模拟写成Linux验收。

本轮真实Typora阅读套件两次开窗共20项通过，Git套件68项通过；确认内嵌大纲、阅读位置恢复、拓扑、分栏详情、真实差异及临时仓库提交／回收／同步。Git Graph语言已补读取宿主appLocale，七种中英文优先级DOM场景通过。

UI继续以用户VS Code参考图与固定上游源码逐项核对。当前实现和明确缺口见[工作台对照矩阵](workbench_parity.md)与[Git Graph功能矩阵](../enhancements/git_graph_features.md)。这些矩阵区分代码已实现、目标测试通过与尚待集成验证，不以历史实窗记录替代本轮证据。

## 八类 UI 验收要求

1. **Git Graph 顶部控件**：单仓库隐藏 Repository，多仓库保留选择器；Branches 与 Show Remote Branches 对齐提交主体，统一工具栏内边距、标签、选择框、复选框和 20/22px 动作命中框。不能额外留出一层空框。
2. **标题栏下侧栏空带**：35px 标题栏底边同时对齐活动栏首项、侧栏标题、编辑标签和 resizer。工作台模式下 `#sidebar-content`／`.sidebar-content` 的 `top` 归零，覆盖社区核心额外的 18px 和原生偏移；同时检查底部及折叠状态。
3. **窗口按钮**：最小化、最大化／还原、关闭各为 46×35px，总宽 138px；重置原生 `.toolbar-icon.btn` 的 padding、margin、box-sizing、display 与 line-height。最大化容器不得增加宽度，图形使用稳定 SVG，关闭 hover 保持红底白图标。保留宿主原生命令与关闭行为。
4. **提交详情切换**：重复点击同一提交或用 Enter/Space 再次激活应收起，下一次可重新打开。工作树行一致；收起清空 selected/from/to/files，复位所有行 `aria-pressed`，Ctrl/Meta 比较选择保持正确。
5. **提交图断线与重复历史**：旧截图曾由同一 Git Graph 同时展示知识库历史与提取后的工具历史造成。迁出后应在当前实际仓库核对 remote、refs、过滤范围和拓扑；不误将两棵历史当成算法断线，不为开发同步重新导入原知识库引用。涉及连线仍需合并、分支、截断和加载更多等真实拓扑回归。
6. **所有面板几何与密度**：一次性审查活动栏、侧栏主标题、Explorer、Search、Outline、SCM 文件与历史、Git Graph 工具栏／列／详情／文件、编辑标签、状态栏、菜单和弹窗。共享 35px 主标题、22px 列表行／动作、16px 普通动作图标与 8/10/12px inset；活动栏可保留参考图对应的 48px 项和 24px 图标，不强制将不同角色混成同一尺寸。树的虚拟滚动步长必须与 CSS 行高一致。
7. **列表状态与对比度**：明暗主题分别给出稳定 hover、inactive selection、active selection、focus border。Explorer 当前文件、搜索结果、大纲、SCM 文件／历史和 Graph 统一语义；选中行文字、路径、图标均易读，不能被正文主题的过浅 active-file 背景削弱。不改变 Markdown 正文主题。
8. **总体视觉一致性**：同一水平线、同一密度、同一图标画布及状态语义，无无效空带和任意外边距；窄窗口不溢出。以截图和实际 DOM 几何共同验证，不能仅通过 CSS 字符串断言完成验收。

## 当前实现与尚待验证的边界

工作台已统一35px标题栏、46×35px窗口按钮、48px活动项、22px树行和状态栏，并按明暗主题提供hover、inactive/active selection及focus状态。标题菜单采用文件、编辑、选择、视图、转到、终端和帮助；Markdown段落与格式收进编辑子菜单。源码编辑动作路由Monaco；Quick Open增加命令和行列模式，标题右侧提供主侧栏与底部Panel开关。新增菜单、布局按钮及源码菜单已通过真实输入和几何回归。

Explorer已接通行内新建文件/目录、重命名、文件剪贴板、多选、删除确认与回收站、紧凑单目录链。单击请求预览打开，双击和Enter保持打开；顶部Open Editors区域最多显示9行，提供按组列表、活动叶、关闭与dirty状态；底部嵌入原生Markdown大纲，默认折叠；视图菜单与命令面板统一路由正式大纲命令并展开。终端默认位于独立底部Panel，可调整高度、隐藏、往返编辑区并保留会话。Explorer文件操作、区域折叠和preview调用契约已有目标PASS；完整插件目标进一步通过preview不降级、dirty保持打开、Open Editors双组定位和非活动关闭、Outline恢复，以及状态提示零占位和错误输入/取消后编辑行可见。搜索默认单击在编辑区预览打开，双击或Enter保持打开；下方阅读预览由“搜索视图选项”显式开启，最新files_search目标已通过。完整UI结果为28/28通过。

插件与阅读模块已补幂等dispose，移除持有的监听、observer、timer和DOM，恢复自己包装的宿主函数，并阻止取消后的导航与位置恢复继续回写。阅读生命周期与minimap目标回归已通过；完整插件启停/重载、草稿保护、加载取消及构造失败回退均通过。

明确功能边界仍包括系统文件剪贴板、同目录复制自动命名、多级新建名称、压缩目录每段独立操作，以及完整VSCode扩展/调试/任务宿主。Node文件路径接口不提供跨进程目录句柄锁；回收站批次无法原子撤销，复制回退遇到其他进程新建内容会保留并报告。跨设备移动明确失败，不隐式复制后永久删除。


## 社区插件验证入口

根 `configure`／`check_configuration`／`restore_configuration` 的Windows与Bash版本均使用社区插件目录。`enhancements/scripts/build.mjs`、`check.mjs`、`check_deployment.mjs`与安装fixture已收敛到 `dist/community_plugin/`；当前只读部署检查通过14个入口文件、7个固定核心资产与三文件插件摘要。迁移识别旧安装标记只用于清除旧注入，不构成第二正式入口。

最终构建和干净Git检出副本均已执行 `test_install_windows.ps1` 的独立临时fixture，通过安装、重复安装、检查、恢复、再次安装和故障回退。`test_workspace_install.sh`承担Bash文件事务；原生Linux环境验证仍待补充。安装回归不操作用户现有Typora目录。完整插件activate/deactivate与卸载重载由 `test_plugin_lifecycle.cjs` 等目标验证，已纳入本轮28/28通过记录。

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

完成目标测试和截图核验后，在 `enhancements/` 使用已有 `npm run build`、`npm run check`、`npm run check:ui`。旧会话测试仅作为历史基线；本轮目标测试与最终全量结果须分别记录。所有未执行或受阻项如实保留。共享产物构建应串行安排，最后再按实际独立结果审查与提交；未经授权不 push。

## 本轮分发与继续整改

Windows本机已通过正式安装入口更新，`check_configuration_windows.ps1`返回 `OK`。安装先备份后写入，不强制关闭用户窗口。正式入口是名为Typora Code的社区插件；发布包与官方loader按原始字节保存，manifest/style统一LF，Codicons元数据先规范LF再计算摘要，避免Git换行转换导致新克隆安装失败。

继续整改按两个矩阵的缺口执行，重点包括Git Graph设置页分组／检索与高级对象控件、未覆盖配置的逐项真实运行，以及工作台菜单／固定标签／更多文件操作。上游宿主和平台能力差异保留明确状态；不能把本轮回归通过写成“一比一全部完成”。原生Linux环境仍待验证。Git多步写操作会报告已完成步骤并保留数据，插件锁不提供跨外部Git进程的原子事务。
