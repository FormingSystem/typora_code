# TyporaCode 开发交接

记录日期：2026-09-10。本轮按用户指定，以 `59412a2` 为平直布局和功能范围参考，保留已验证的稳定修复；这不是整库恢复旧提交，不再继续全量一比一功能扩充。

## 当前定稿边界

- 保留 Typora 原生七菜单：文件、编辑、段落、格式、视图、主题、帮助。
- Explorer 展示普通目录层级，不提供 Open Editors 区域，不启用紧凑目录链；大纲使用独立入口与唯一原生树。
- 活动栏为48px连续项目；编辑标签条为35px、13px Segoe UI并使用 Light 2026／Dark 2026 状态色；Explorer树行为26px，SCM文件行与分区标题为22px；本轮顶栏左中区由renderer组织，右侧复用宿主窗口按钮。不恢复Modern卡片、胶囊及外围空隙。
- Explorer 和真实文件标签使用固定 Seti 字形与颜色，文件夹仅保留展开箭头；大纲保留原始 `fa-list`。正式图标来源与许可见 [图标映射](icon_mapping.md)。
- 搜索单击在结果下方预览，双击或Enter打开文件；保留阅读定位和草稿保护。
- 终端默认位于下方编辑组（down），没有独立底部Panel。
- SCM保留暂存／更改两个分组的独立官方箭头、空组切换、白色提交图标和对齐标题；提交按钮下不增加筛选框。
- Git Graph保留当前已验证的中央历史、Find、PR与既有Git操作；设置恢复简洁表单，对象使用JSON文本框，不再提供追加的复杂设置编辑器。

## 常驻部署

工程独立维护，不依赖原知识库目录，也不向打开的文件夹写入工作台配置。`window.html` 的head依次加载 `workspace_core.css`、`workspace.css`，再以defer加载 `workspace_core.js`、`workbench.js`。四个核心文件及语言、许可资源安装到用户数据目录 `typora_code/`；已删除首帧外观脚本，不注册社区插件，不因文件或文件夹切换重建工作台。

核心来源见 [SOURCE.json](../enhancements/vendor/workspace_core/SOURCE.json) 和 [MIT许可](../enhancements/vendor/workspace_core/LICENSE.md)。安装／恢复使用schema 4清单，预检、备份、摘要校验和失败回滚保持。旧业务设置仅在新 `typora_code/settings/workspace.json` 不存在时迁移；已有用户设置和业务数据不得被恢复操作删除。其他启用插件构成预检冲突，不静默覆盖。

安装使用 schema 4 的 `native_profile` 记录完整备份及 SHA：`profile.data` 是 UTF-8 JSON 的小写十六进制文本，只把 `framelessWindow` 设为 `true`；原 profile 不存在时创建仅含该字段的最小 HEX JSON，并记录原文件缺省。恢复只还原该字段原值或缺省，保留安装后其他设置。未知编码、非对象、非布尔窗口设置及写前摘要冲突均拒绝写入，失败按事务回滚。安装不修改 `app.asar`，也不部署主进程菜单桥接。

Ctrl+P 使用 `440ec3f` 中的文件选择器，鼠标入口在顶栏中央搜索框；renderer 快捷键目标通过，原生冲突仍在验证。新建文件默认打开并渲染；SCM 文件提供打开、丢弃、暂存，差异视图提供打开文件按钮。

## 保留的正确性与已知缺陷验证

1. Git Graph重复click／Enter／Space激活同一行关闭详情，清空选择及比较状态；Ctrl／Meta比较保持。
2. 标签隐藏／显示不取消在途查询，不重复加载，也不重建已完成详情DOM；真正dispose才取消请求并阻止迟到结果写入。
3. 分支、远端、HEAD、tag和stash引用颜色与对应轨道一致，切换标签不残留图层。
4. 设置未修改保存保持显式false及空文本；存储失败恢复内存，写操作或仓库变化阻止保存。导入／导出保留本机敏感配置边界。
5. SCM两个分组箭头可见且不遮挡名称，展开向下、收起向右；提交按钮与引用图标前景正确。检查原生正文主题不会污染这些控件。
6. 文件保存、重命名、移动和关闭继续检查草稿、格式、路径及冲突；Git写操作只在临时仓库验证。工作台内写锁不等于跨外部Git原子保护。
7. 保留窄窗口、长名称、空仓库、单／多仓库、失败／取消的交互检查，不以源码字符串或一张截图替代实际操作。

新增路径修复保留已有 YAML/yml 映射，修正应用路由绕过阅读上下文后把相对链接错误解析到挂载根的问题；现在按来源文档父目录解析，同时支持 file URL。文件进入宿主、创建或切换标签前校验存在且为普通文件，缺失文件不清空正文。带 callback 的 Markdown 入口保留原参数、接收对象和回调语义。隐藏目标覆盖缺失路径、草稿及标签身份保持、文件与 Git 索引字节不变，原异步取消检查仍保留。

正文链接悬停 1 秒显示提示；活动栏底部齿轮恢复打开 Typora 原生偏好设置，不包含插件设置或市场。快捷键 renderer 目标已通过，最终原生 accelerator 冲突仍待核对，不能据此声明所有快捷键 live 通过。

## 本轮结果与验证边界

上一版标准窗口历史证据：构建与 `check` 通过。UI 首轮为36/37（`.cache/final_ui.log`），唯一失败是新增打开／丢弃／暂存按钮后的旧 Graph 首按钮列断言；仅修正测试后，完整 Graph 目标复跑通过（`.cache/graph_final_columns_target.log`，64.657秒），上一版同一产品构建的37个目标全部通过，并非首轮整批零失败。上一版原生集成18/18通过（`.cache/native_integrity_compare/native_integrated_release_final/`），覆盖原始 ASAR 下存活55秒、七菜单与真实未保存草稿。 原生菜单 accelerator 与物理键盘的冲突尚未实证；renderer 或隔离原生夹具中的合成按键不能替代硬件快捷键验证。链接悬停、偏好入口等以 Electron 目标为证据，不归入原生18项。

上一版通过的Graph／SCM目标包括设置、国际化、引用颜色、可见性、行交互、文件图标与几何。本轮文件图标目标已改为验证与 Explorer 相同的 Seti 资源和关联，完整结果见下文。

YAML／相对路径与缺失预检的 `test_workspace_files_search.cjs`、`test_reading_lifecycle.cjs` 2/2 PASS，文件 URI 单元目标通过。上一版 dist 的 Windows 隔离安装／重装／恢复事务和 Python 事务已通过，日志分别为 `.cache/final_windows_install.log`、`.cache/final_python_install.log`；profile codec 与部署 checker 通过（16 个部署文件、8 个发布资产）。Python 在 Windows 执行，不代表原生 Linux 权限验证。最终构建、检查、UI与原生结果见上述记录；本交接不沿用迁移前测试数字。原生Linux、UCRT64实机与管理员UAC人工交互仍需分别说明验证边界。原生fixture应验证最终产品，不加载已经撤销的chrome样式或复杂设置入口。

## 研究资料使用边界

[VS Code设计取证](vscode_design_baseline.md)保留版本、源码和数值事实，作为已核对参考，不是强制Modern目标。[工作台矩阵](workbench_parity.md)和[Git Graph矩阵](../enhancements/git_graph_features.md)记录当前入口与限制；缺口不自动成为后续扩功能授权。只修已确认bug，新增范围须有新的明确需求。

上一版标准窗口的真实安装与核验通过（`.cache/final_live_install.log`、`.cache/final_live_check.log`），ASAR 未修改；实际 profile 仅 `framelessWindow:true→false`，其余字段完全一致。未强制关闭或重载用户窗口；请保存文档并正常重启 Typora 加载更新。

本轮按用户新要求恢复35px单行顶栏：左侧为 Typora 文件、编辑、段落、格式、视图、主题、帮助七类菜单，中间为后退、前进和文件搜索，右侧复用宿主窗口按钮。菜单由本地 renderer 组织，只调用已核对的 Typora API，不使用整棵 `Menu.popup` 或修改 ASAR；能力与动态状态以实际接线为界，不声称完整原生菜单等价。菜单在顶栏下方按可用高度滚动，支持 Shift+滚轮。

用户本轮另外授权代码大纲、点击定位及可配置解析环境。目标采用内置离线 Tree-sitter，覆盖 C、C++、JavaScript、TypeScript、Python、CMake、YAML 七种语法的定义／声明，按需 worker 解析，无需编译器环境；七种语法的离线解析与点击定位已实现并通过目标验证，本轮原生检查实证 TypeScript 函数解析与行定位。它提取语法定义／声明，不执行宏、构建脚本或编译器语义分析；不把 Markdown 大纲结果当作代码大纲证明。

本轮单行顶栏构建、`check` 与整批39/39 UI基线通过（`.cache/single_row_build.log`、`.cache/single_row_check.log`、`.cache/single_row_ui.log`）。保留宿主标题节点的修复后，标题／启动／阅读三个目标回归通过；独立原生实例45项通过，正常存活约60秒，27个发布资产摘要一致；原始 ASAR 和临时文档字节未变。证据位于 `.cache/native_single_row_compare/single_row_title_fix/`。原生场景覆盖七菜单、长菜单 Shift+滚轮、TypeScript 大纲点击定位、Markdown／YAML跳转、真实未保存草稿及缺失目标保护，不等于七种语言都已逐一原生验收或物理键盘 accelerator 已验证。 profile=true 的 PS／Python 隔离安装事务通过；此前标准窗口数字与 true→false 安装记录仅为历史。

本轮原生验证曾发现删除 `#title-text` 会使 Typora 的 `changeCounter.reset` 中断加载，表现为路径已改变但正文与标签仍是来源文件。现将所有宿主标题节点保留在连接的隐藏容器中，窗口按钮保留原节点；修复后完整原生链路45项通过，原生标题与未保存状态检查通过。

原生45项对应标题节点修复后的构建。后续 C 返回函数指针声明、TypeScript 裸枚举项与 Python 链式赋值已补充对应回归，`test_workspace_source_outline.cjs` 的19项真实 grammar／Worker／Monaco 检查通过，不把原生 TypeScript 样例扩展为这些边界已实窗覆盖。最终重建、发布资产与部署检查通过。

最终版本已通过真实 Windows 安装及配置核验（`.cache/single_row_live_install.log`、`.cache/single_row_live_check.log`），自动创建事务备份，原始 ASAR 摘要保持不变。未强制关闭或重载用户窗口；保存文档并正常重启即可加载本轮顶栏及大纲。
