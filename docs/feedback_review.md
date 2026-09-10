# 已提出问题的复查记录

本表对应用户截至 2026-09-10 的截图和反馈，覆盖顶栏、活动栏、Git、文件识别、链接与大纲。检查以当前实现及本轮重新运行的场景为准；此前通过的计数不能替代本轮验收。

## 本次发现的遗漏

- 活动栏实际位于宿主 `header` 内，旧样式限定为 `body` 的直接子节点，因此没有应用固定定位；第一槽被顶栏遮挡。此前测试只检查 Explorer 没有越过顶栏，没有验证整个活动栏的起点和连续槽位。
- Git Graph 的“未提交改动”详情没有复用 SCM 的默认打开分流，新文件仍进入空基线差异视图。
- 搜索结果和快速打开列表仍使用通用文件图标，没有调用 Explorer 使用的同一 Seti 图标函数。
- 快捷键切换标签按全局路径查找，同一文件在多个编辑组打开时可能取错标签位置；系统空页也未按真实 URI 排除。
- 快速打开未忽略输入法组字期间的 Enter，可能在中文选词时提前打开文件。
- 菜单与快捷键打开文件夹使用不同根目录来源，顶部搜索标签、Explorer 与文件操作可能不同步。删除局部 `chosen_root` 覆盖，统一使用已核对的宿主挂载目录接口及其变化通知。
- 更换根目录时，快速打开仍可能展示旧目录的异步扫描结果；现在关闭旧选择器并使旧扫描失效，盘符根目录也能显示有效标签。
- 保留的旧仓库差异页可能在切库后调用新仓库上下文；现在刷新、上下文件、打开及已生成菜单中的暂存／丢弃均在执行时校验原仓库身份。

## 反馈覆盖表

| 用户反馈 | 应有行为及本轮检查入口 |
| --- | --- |
| 保留七类菜单，各自打开功能 | 顶栏七个入口分别组织对应菜单；`test_workspace_titlebar_entries.cjs`、`test_workspace_titlebar.cjs` |
| 段落／格式菜单过长，遮住主菜单 | 从 35px 顶栏下沿展开，限制可用高度，普通滚轮和 Shift+滚轮只滚动菜单内容；titlebar 目标及独立原生实例 |
| 搜索、左右跳转放在上方 | 顶栏中央保留 Markdown 阅读历史后退、前进及文件搜索；搜索沿用已有选择器样式；titlebar、shortcuts、reading lifecycle 目标 |
| 文件夹与搜索显示错位 | 菜单、快捷键和 Explorer 共用打开文件夹动作；成功后各面板读取同一挂载根，取消／失败保留原根和草稿 |
| 资源管理器图标不见、位置不对 | 实际宿主层级下活动栏从顶栏下沿开始，每槽 48px；默认 Explorer、搜索、大纲、SCM 连续排列，已有拖动顺序优先；activity 目标及独立原生实例 |
| 侧栏上方多出空白、模块白成一片 | 侧栏与编辑区使用共同顶边；活动栏、侧栏、标签、底栏应用共同明暗边界色；activity、sidebar sash、first frame、titlebar 目标 |
| Typora 左上图标太小 | 原始图标在 24px 方框中完整显示，清除宿主透明边框压缩；titlebar 目标及独立原生实例 |
| 右上角窗口按钮比例 | 最小化、还原／最大化、关闭按钮高 35px，各宽 46px；titlebar 目标 |
| 设置入口丢失 | 底部原有齿轮打开 Typora 原生偏好设置；preferences、activity 目标 |
| 多个底部 Git 按钮一起选中 | 分支、同步、Graph 各自 hover/focus，容器不产生整组高亮；footer、SCM geometry 目标 |
| SCM 顶部重复分支／刷新按钮 | SCM 总标题保留更多菜单，Graph 独立工具栏处理图操作；SCM sidebar/geometry 目标 |
| 计数徽章颜色不对 | 当前浅色主题采用蓝底白字；SCM geometry 目标 |
| stash 断开的辅助节点、线条颜色 | stash 每项仅一个节点，内部 index/untracked 辅助提交不独立显示；支线到共同父节点保持同色，引用徽章跟随节点色；graph 数据、ref colors、interaction 目标 |
| Git Graph 详情位置、背景不对 | 详情插在所选节点之后，图线贯穿详情高度，内容与节点共同滚动；Graph interaction、history layout 目标 |
| 新文件没有比较对象仍做 diff | SCM 和 Graph 工作区入口的新增／未跟踪文件默认直接打开；Markdown 渲染，其余文本进入源码页；已有修改保留 diff，历史版本比较仍为明确的比较动作 |
| Git 文件行和差异页缺操作 | SCM 行提供打开／丢弃／暂存，差异页提供打开文件；SCM、diff status、graph interaction 目标 |
| 文件与文件夹图标不一致 | 所有真实文件入口共用 `workspace_file_icon`：Explorer、搜索、快速打开、SCM、历史、Graph 详情、文件及 diff 标签；Seti 未定义文件夹字形，树保留展开箭头；file icons、SCM icons、files search、shortcuts 目标 |
| 文件名太大、活动笔记不明显 | 标签采用 13px 字号、35px 高度及独立活动背景／顶线；tab controls、core smoke、titlebar 目标 |
| 没文件却有 New tab | 隐藏真实系统空页 `typ://core.empty/`，保留用户创建的 Untitled 草稿；core smoke、tab controls、shortcuts 目标 |
| VS Code 快捷键配置 | 核对已有命令映射、当前编辑组切换及中文组字 Enter 不提前打开文件；shortcuts、titlebar entries、files search 目标。本轮未完成真实宿主 accelerator／物理键盘输入验收 |
| YAML/yml 和其他代码文件打不开 | 文件名及语言识别共用注册表，普通文本进入源码页；file language、file URI、files search、file editing 目标 |
| 相对链接跳错目录、失败清空文档 | 相对文件以来源文档父目录解析；切换前检查目标，缺失时保留正文、草稿、标签和磁盘字节；reading lifecycle、files search、file URI 目标及独立原生实例 |
| 链接悬停改为 1 秒 | 等待 1 秒再显示，提前离开取消；link hover 目标 |
| 提示路径写死本机地址 | 生成位置使用项目根起点的 `/path`，原始链接不改写；项目外目标明确标记；link hover 目标 |
| 鼠标移入提示应保持，支持复制 | 浮层与链接间保留移动宽限，提示文字可选择、Ctrl+C，复制按钮复制原始链接；link hover 目标 |
| Markdown 与代码分别识别大纲、可定位 | Markdown 原生标题目录；代码使用语言符号范围，点击定位当前模型；outline、source outline、真实 clangd UI 目标 |
| C/C++ 必须使用编译器分析、有类别颜色和配置 | C/C++ 唯一解析路径为 clangd，读取工程编译数据库与当前内存正文；提供解析环境设置和符号分类颜色；clangd 服务、clangd UI、source outline settings 目标 |
| 同章节滚动时大纲反复闪烁 | 只有跨标题才更新选中项，调用宿主时关闭闪烁；outline 目标及独立原生实例 |
| 末级大纲仍显示折叠箭头 | 没有子标题时不显示折叠箭头，增删子标题及重新打开后同步更新；outline 目标 |

## 验证边界

隐藏 Electron 目标使用真实 DOM、Monaco 和临时工作区；独立原生检查使用未修改的 Typora ASAR 和私有桌面，不能以 fixture 中的简化宿主结构替代原生几何。用户已有文件、草稿和 Git 索引不用于破坏性测试。

C/C++ 大纲显示 clangd 实际返回的符号。编译参数诊断、未返回的宏与局部变量、当前未提供的跨文件补全／重构等范围，见[代码大纲说明](source_outline.md)。本表不会把大纲接入表述成完整 VS Code C/C++ 扩展。

## 本轮验证与安装结果

- 最终 `npm run build`、`npm run check` 通过，包含核心来源摘要、发布摘要、Git 操作、路径与文件安全检查。
- 完整隐藏界面套件通过 **40/40**。随后补充的盘符根标签、快速打开旧扫描及跨仓库差异页保护，分别重跑 titlebar、files search、Graph interaction、SCM file icons，**4/4** 通过。
- 真实 clangd 服务 **16 项**、clangd 与 Monaco 界面 **11 项**通过；使用当前文件内存正文验证函数、声明、变量、类型和定位。
- 最终构建的独立 Typora 原生实例 **80 项**通过，观察 60 秒，未切换用户桌面。活动栏四槽顶边为 **35／83／131／179px**；实际 Explorer 点击、搜索、设置、长菜单、大纲与草稿保护均已核对。证据保存在本机忽略目录 `.cache/native_single_row_compare/activity_feedback_release/`，包括 `checks.json`、`verification.json` 及 8 张阶段截图。
- 原生实例的 **23 个发布文件**与最终构建摘要相同；原始 ASAR、应用图标及 7 个测试文件字节未变。早先两次夹具失败（选择器隐藏断言、截图助手缺程序集）保留失败记录，不计入通过结果。
- 2026-09-10 已运行安装脚本及 `check_configuration_windows.ps1`，结果为 `OK`，安装事务已自动备份。实际用户配置、原始 ASAR、已核对的 Zephyr 文档／YAML 及另一个笔记仓库的 6 个暂存文件和索引均保持原样。当前打开的 Typora 未强制刷新；保存后正常重启载入本次构建。

快捷键的现有命令接线、输入法及编辑组场景已检查，**宿主原生 accelerator 与物理键盘输入尚未完成验收**；不得把上述通过数量解释成与 VS Code 所有快捷键完全等价。
