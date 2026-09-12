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
