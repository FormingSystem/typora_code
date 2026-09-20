# R056 直接启动工作台与宿主升级接入

2026-09-20，用户要求直接显示配置后的工作台，保留原生Typora图标和现有UI布局；社区插件在工作台显示后接入。Typora继续提供编辑内核、文档保存、窗口及官方更新。当前实现将直接head入口、显式单次挂载和完整首帧显示组合为一条启动链，正常路径不再展示原生中间布局或“正在加载工作台…”提示。

## 目标、范围与取舍

“直接启动”指工作台拥有界面呈现，原始编辑节点和宿主内核继续加载；不另造Markdown编辑器，不改变现有布局、设置和默认操作。工作区切换只更换业务上下文，不能重建窗口工作台；第三方插件不作为基础UI依赖。

前版提出的head静态模板接管是研究方案，本版以用户后续“UI优先、布局不变”约束替代：head阶段只有require，尚无reqnode、_options及已连接的原生编辑节点。继续复制静态模板会维护第二份布局和配置移交，因此沿用原DOM工厂及唯一Settings服务，只进行一次显式挂载。没有实现或声称实现第二套静态模板；准备阶段仍耗时，不承诺零延迟首帧。

## 启动顺序与状态所有者

1. 标准安装器在当前宿主window.html的head接入静态CSS及两份常驻脚本，原Typora.exe图标直接使用该入口，无社区loader或独立启动器。
2. 核心等待已经核对的File、reqnode、_options、editor、原生writingArea/sidebar与样式就绪，由App创建服务。设置只由现有Settings/ConfigRepository拥有，不复制到第二套localStorage或JSON。
3. Workspace.mount按根布局、侧栏和原组件顺序同步挂载，再发布core.ready。移除三处分散构造定时任务，增强层等待同一个ready，取消重复settings/root轮询。原生编辑节点不删除、不替换；重复mount/start幂等。
4. 基础增强登记Git、浏览器、顶栏与当前工作区，发布browser ready。Git结果、搜索数据和语法加载不阻止基本布局呈现；插件管理在两个动画帧之后才加载已启用插件，不运行第二个核心。
5. 首次显示控制只在上述ready之前生效：旧正文/侧栏、工作台根、自有顶栏菜单和底栏暂不可见，避免核心标签先出现再被增强修饰。没有加载提示覆盖层，原生窗控保持可用。ready释放后观察器立即结束；切库、切面板与插件加载都不能再次遮挡。

15秒超时或初始化错误会释放显示控制，回退可操作的原生界面并报告错误，不把用户锁在空白窗口。增强初始化中的资源由既有lifetime回滚；文件草稿和进行中的写操作继续遵守关闭保护。仅发生错误时显示原生界面，和正常启动路径分别验证。

## 模块映射与影响

| 职责 | 权威实现 | 影响与回归 |
| --- | --- | --- |
| 宿主入口和一次性显示 | enhancements/runtime_head.html、src/workspace_entry.css | 原窗控、错误/超时、后续切换、明暗主题 |
| 唯一挂载与ready | vendor/workspace_core/src/runtime.ts、ui/workspace.ts、ui/layout/workspace-root.ts、ui/sidebar/sidebar.ts | 同一根/编辑节点，20/100/1000重复初始化不增节点 |
| 基础UI与插件顺序 | src/typora_enhancements.ts、src/workspace_bootstrap.ts、src/community_plugins.ts | 原生文件会话恢复、Git/搜索/终端、真实社区插件 |
| 升级后接入 | scripts/lib/typora_workspace.ps1及Python同类事务 | 基于新版宿主备份与安装，不回写旧内核；保留插件个人数据 |

## Typora更新与增强重新接入

用户已明确采用与社区相同的方式：Typora通过官方渠道更新后，重新运行本工程标准安装和检查，保存文档后手动正常重启；原生图标不变。自动修复、后台服务、独立启动器不属于需求。R047仍独立管理增强自身的ZIP更新与公告；社区插件程序更新也不覆盖本工程核心。

安装先解析当前宿主与用户目录，获取标准互斥，验证入口锚点及候选资产；备份升级后的页面，再生成增强入口。保留新版脚本、资源与内核，不把旧备份window.html或ASAR覆盖回去。失败回滚至本次重装前的新宿主，权限错误保留日志，不静默提权或反复覆盖。社区包、启用配置、个人设置和文档保留。

标准Windows事务已模拟官方覆盖入口后重新安装和恢复，证明新版页面、内核及社区数据保留。实际官方在线升级及其他宿主版本未实测，不能仅因找到head便宣称任意版本兼容。旧备份恢复仍拒绝覆盖已经变化的宿主页面。

### 社区插件核对结果

2026-09-20核对本工程继承的2.10.15来源提交 `d3fccbd3b8e134dd4268f5486fd17e49fc0ed615`，并通过GitHub提交API取得上游main当时提交 `601a1dcbaf905b7b7a40229f7109f0411d71671c`。最新安装、加载及框架更新路径如下：

| 来源 | 核对到的实际行为 | 对本需求的结论 |
| --- | --- | --- |
| [Windows 安装器](https://github.com/typora-community-plugin/typora-community-plugin/blob/601a1dcbaf905b7b7a40229f7109f0411d71671c/packages/installer/templates/windows/install.ps1) | 修改 window.html，插入指向用户目录 loader.js 的 module script | 原图标能启动插件；安装接入仍依赖被修改的宿主页面 |
| [社区加载器](https://github.com/typora-community-plugin/typora-community-plugin/blob/601a1dcbaf905b7b7a40229f7109f0411d71671c/packages/loader/index.ts) | 读取 loader.json 和插件环境，动态 import 指定版本 core.js | 入口被删除后加载器不会执行；这条路径没有官方更新完成后的重新注入 |
| [关于页更新实现](https://github.com/typora-community-plugin/typora-community-plugin/blob/601a1dcbaf905b7b7a40229f7109f0411d71671c/packages/core/src/ui/settings/tabs/about-tab.ts) | updateCore 查询社区仓库发行版；installCore 解压并把文件移动到社区核心的父目录 | “Core更新”指社区框架更新，不是 Typora 官方内核更新或重新安装宿主入口 |
| [obgnail 项目维护者的升级答复](https://github.com/obgnail/typora_plugin/issues/1039) | 2025-07-23明确要求 Typora 升级后重新执行其安装程序 | 另一个常用框架同样不能据“插件”身份推断官方升级后自动存续 |

结论限定在上述核对版本和路径：尚未找到可直接复用的官方更新完成注入机制。用户已确认采用相同方式：官方更新后重新运行现有标准增强安装器，继续使用原生图标。自动修复、独立启动器不再属于需求或未完成子项；插件自身更新与宿主更新仍分开。

本轮原始 Typora 1.14.10 隔离副本还核对了 head 时序：此时 `window.require` 已存在，`reqnode` 和 `_options` 尚未定义，不能把依赖它们的社区加载器直接搬到 head 并宣称可提前运行。现有45项启动／20轮面板切换通过，是当前基线复查，不是新启动架构验收。

## 验收依据与边界

TC-startup-presentation对明暗主题分别验证加载期无提示、根不提前显示、窗控可用、ready/错误/超时后节点不替换及后续切库不遮挡。新增断言在旧版本先复现失败，再对候选通过。

TC-startup-native从原始Typora隔离副本head开始记录rAF状态，核对首个可见根与正文沿用至当前、无旧正文或半成品工作台；20/100/1000重复挂载保持身份/数量，20轮四面板切换不先收起。TC-workspace-sessions-native验证真实正常退出/第二进程重开；TC-community-plugins-native验证真实社区发行包启停不重建UI。TC-delivery-002验证官方覆盖后的标准重装模拟；测试分类与需求关联统一在测试目录维护。

记录阶段耗时及长任务，不把减少中间画面当作所有启动性能问题已消失。PERF-startup-002的残余长任务继续独立记录；隔离桌面的DOM/rAF采样和静态截图不是物理屏幕启动录像。当前交付证据见[反馈复查](feedback_review.md)，历史阶段记录不替代本次验收。
