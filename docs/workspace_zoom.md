# 窗口缩放

## R014 窗口缩放快捷键

2026-09-12：用户反馈 Ctrl+= 放大、Ctrl+- 缩小没有完整适配；后续再次明确主键盘使用等号键。现有视图菜单直接调用原生缩放，但工作台快捷键没有对应命令，终端焦点还会提前退出通用键盘处理。目标是让所有工作台区域使用同一窗口比例，键盘和菜单行为一致。

### 交互与边界

- 主键位为 Ctrl+= 放大、Ctrl+- 缩小；同时覆盖 Ctrl+Shift+=（“+”）与 Ctrl+小键盘加号放大；Ctrl+-、Ctrl+Shift+- 以及 Ctrl+小键盘减号缩小。主键盘也接受键盘布局报告的加减字符。
- 每个 keydown 执行一步；长按随系统重复事件逐步缩放，keyup 不重复调用。已处理事件不进入正文编辑器、终端输入或其他宿主快捷键。
- Markdown、代码与 diff、侧栏搜索、快速打开、普通对话框和终端都缩放当前窗口；不单独修改编辑器或终端字号，不用 CSS transform/zoom 缩放整个页面。
- 图表查看器打开时，保留既有 Ctrl+加减的图表局部缩放。输入法组合、Alt/AltGraph 组合不触发窗口缩放。Ctrl+0 保留 Typora 的“正文”格式操作；恢复窗口比例继续使用“视图 → 实际大小”，本次不抢占它。
- 保留宿主缩放提示、设置保存及载入语义；不增加第二套比例配置、不重建文档、编辑组或终端进程，不扩展为窗口之间的同步协议。

### 职责与实现

`workspace_zoom` 统一定义放大、缩小、实际大小的命令身份、菜单文字与原生适配；命令注册归工作台生命周期，失败回滚，卸载解除注册。实际缩放值与持久化由 Typora 管理。菜单和 `workspace_shortcuts` 都只调用共享命令。

窗口缩放属于全局操作，快捷键判定先于普通对话框和终端输入的退出分支；图表局部交互具有优先权。消费 keydown 与对应 keyup，防止原生或核心后续监听器重复执行。未提供原生缩放方法时菜单禁用、快捷键不消费，不伪造缩放成功。

### 已核对依据

- 固定 [VS Code 1.136.2 的窗口操作](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/src/vs/workbench/electron-browser/actions/windowActions.ts)：`ZoomInAction` 为 Ctrl/Cmd+Equal，另有 Shift+Equal、NumpadAdd；`ZoomOutAction` 为 Minus，Windows 另有 Shift+Minus、NumpadSubtract。每次改变一级。
- 同提交 `src/vs/platform/window/common/window.ts` 的 `zoomLevelToZoomFactor` 使用 `1.2 ** zoomLevel`。有效配置基线保持 [界面基线](vscode_design_baseline.md) 所记的窗口缩放 0；系统 DPI、窗口比例与 CSS 字号分别核对。
- 已核对 Typora 1.14.9 与当前 1.14.10 原始 `appsrc/window/frame.js` 的 `ClientCommand.zoomIn/zoomOut/resetZoom/setZoomLevel`：调用 Electron `webFrame`，更新原生 `zoomLevel/zoomFactor/customZoom` 和缩放提示。增强层复用该入口，不复制其内部实现。菜单使用本窗口的 ClientCommand，保持既有行为，不调用 `JSBridge.zoom` 的全窗口广播。

### 验收

目标回归覆盖主键盘与小键盘、长按、keyup 去重、输入法与 Alt 组合、模态优先级、菜单与命令一致、卸载和重装。隔离 Electron 使用真实键盘输入与真实窗口缩放，检查比例变化、正文与终端输入不被污染。

原生 Typora 隔离配置验证 Markdown、代码/diff 和终端焦点下缩放与恢复，检查缩放提示、底栏与弹层几何、编辑器模型/草稿和终端会话保持。构建、相关启动回归及安装检查通过后记录交付证据；不能把测试环境安装等同于用户现有窗口已经加载。

## R014 底栏缩放入口

2026-09-13，按用户截图增加底栏窗口缩放入口。入口使用固定官方Codicons放大镜，控件使用remove、add和settings-gear；图标只负责呈现，仍调用已有R014窗口缩放命令。比例与持久化只归Typora原生层所有，读实际Electron webFrame级别／比例；不使用包含系统DPI的devicePixelRatio推算，不为底栏另存一份比例。

底栏控件复用共享group、control和text角色；小面板在入口上方覆盖显示，不占正文和底栏新行。点击打开并支持键盘进入，悬停延迟与离开关闭使用统一机制；Esc取消并恢复打开前焦点／选区，外部点击关闭后继续操作目标，不抢焦点。缩放后重新读取实际值，持续同步来自快捷键或原生菜单的改变。宿主能力缺失时禁用相应动作，读取失败不显示伪造比例；卸载删除入口、浮层、监听及样式。

本轮对照VS Code 1.137.0固定提交645f29cc3176500b4b5762ba887cf2a7f0ffdf2c的WindowZoomStatusEntry，采用下列已核对规则及宿主适配。回归实际webFrame、同一命令所有权、明暗、底栏高度、缩放后的弹层定位、普通编辑与终端焦点、原生隔离实例和安装资产；不把UI测试当作其他待验收功能已完成。

### 固定来源与采用策略

| 固定VS Code源码 | 核对结果与本产品采用方式 |
| --- | --- |
| `src/vs/workbench/electron-browser/window.ts:1132–1256` | 偏离配置默认值时显示，正／负方向用zoom-in／zoom-out；弹层顺序为remove、实际level、plus、Reset、settings-gear。Typora重置为原生level0，2026-09-13实现曾在非零级显示、恢复100%后隐藏，现由下文R014.1覆盖为常驻；level与百分比都读取当前窗口，不从用户配置或DPI推断。 |
| `src/vs/workbench/browser/parts/statusbar/statusbarPart.ts:186–211` | HTML悬停500ms、compact模式，点击聚焦后可持续操作；本产品复用bind_workspace_hover，增加显式打开、交互焦点保留及上方优先定位，不复制定时器／边界算法。 |
| `src/vs/platform/hover/browser/hover.css:37–48`、`src/vs/workbench/electron-browser/media/window.css:6–35` | 紧凑正文12px、内距2px 8px、图形16px、右组间隔10px。保留公共浮层主题、边框和公共控件4px圆角；本产品按钮保持22px操作目标，底栏高度完全由现有共同布局决定。 |
| `src/vs/workbench/browser/parts/statusbar/statusbarItem.ts:153–164,230–231` | 鼠标／Enter／Space打开并聚焦。本产品浮层按钮按Tab或左右方向移动，Esc与外点取消复用统一退出栈；不用截图中的减号或加号字符代替图标。 |
| `src/vs/workbench/electron-browser/desktop.contribution.ts:203–215` | zoomLevel默认0，支持小数；zoomPerWindow默认true，没有专门的入口显隐设置。本产品不复制这两项配置，保持宿主本窗口命令及原生持久化。 |

上述路径均固定到提交`645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`。图形来自本项目已固定的Codicons提交`1c47ab36a4bb845c437866405c2fa67b8ca0fe36`，新增zoom-in、zoom-out原始SVG；plus与已有add是上游同一图形映射，复用add，remove和settings-gear也复用既有资源，许可与摘要随vendor清单维护。

Typora1.14.10的`appsrc/window/frame.js`中zoomIn／zoomOut读取webFrame级别±1，再调用setZoomLevel；后者更新原生持久化、File.option.zoomFactor与`#zoom-hint-current`。因此入口通过该节点只读观察、窗口resize及focus合并读取实际状态，无轮询、函数替换或窗口广播。自有控制面板打开时仅用限定样式隐藏顶部原生`#zoom-hint`，保留节点、文本更新和3秒生命周期；关闭或卸载恢复。

齿轮调用已核对的无参`ClientCommand.showPreferencePanel()`，用户在原生“外观 → 缩放”设置比例及Ctrl+滚轮选项。原生makeHighlight不支持缩放深链，因此不传入猜测的定位参数；入口提示注明设置位置，未引入另一套比例表单或持久化字段。

入口使用同提交2026-light.json的statusBarItem.prominentBackground `#0069CCDD`、前景 `#FFFFFF` 和hover背景 `#0069CC`；Night引用2026-dark.json的 `#3994BC` 背景／hover与白色前景。配置变量可覆写，公共交互层应用hover，不将显著状态色扩散到浮层普通按钮。

### 底栏入口验收结果

67项目标回归、共享悬停3目标、启动／底栏2目标、完整check与隔离原生验收通过。补测Esc后的650ms稳定状态，覆盖键盘恢复到入口及焦点／鼠标等待显示，均保持关闭；共同hover在恢复焦点期间抑制再进入。真实主题、几何、安装资产边界与原生输入方法统一记录在[反馈](feedback_review.md#2026-09-13-底栏窗口缩放入口)。

## R014.1 指针区域滚轮缩放与常驻入口

2026-09-23用户要求覆盖旧的100%隐藏约定。右下窗口缩放入口在可读取宿主比例时常驻，重置后仍可继续操作；保持原图标、尺寸、共同底栏与浮层规则，读取失败不伪造状态。

终端内容区的Ctrl+滚轮每步改变1px字号，范围6—100px。采用固定VS Code `645f29cc3176500b4b5762ba887cf2a7f0ffdf2c` 的 `src/vs/workbench/contrib/terminalContrib/zoom/browser/terminal.zoom.contribution.ts`：捕获阶段、阻止默认/冒泡、修改共享fontSize配置及6—100范围；本产品按明确授权默认启用，不复制上游可选开关或触控板分类器。滚轮写入按帧合并，使用已有终端配置所有者持久化并通知所有表面；不改变窗口比例或发送Shell输入。修改字号前使用xterm公共marker固定逻辑行起点及字符格偏移，FitAddon重排并完成像素同步后恢复该行；处于底部则继续跟随底部。隐藏表面在重新挂载时恢复，退出释放marker/帧任务。缓冲被Shell清空或容量淘汰时不伪造历史；全屏备用缓冲由应用及PTY重绘所有者负责。

正文/标题/列表/表格里的Ctrl+滚轮调用原有R014宿主窗口缩放命令，每帧至多一步，沿用原有字符锚点保持。仅在命中`#write`或普通Markdown分栏内容时处理；代码块、行内代码、CodeMirror/Monaco、图片/视频/音频/图表/数学、链接、输入控件、独立预览及模态界面交还原所有者。Ctrl+Alt/Shift/Meta组合不接管；不使用键盘焦点替代鼠标命中，不修改宿主缩放偏好。正文使用窗口比例是对已有R014的适配，不新增另一份字号配置。排版重排保留所读字符，文末/缓冲边界无法精确对齐时遵守合法滚动范围。

验收覆盖真实Electron滚轮、原始Typora候选、终端普通历史/长行重排/底部/备用缓冲、面板与分栏、字体设置同步和会话不重建，正文长文与被排除区域，100%常驻/重置/键盘/明暗/窄窗，以及连续操作资源释放。测试替身和原生平台分别记录；不把Windows11证据当作Win10现场验收。
