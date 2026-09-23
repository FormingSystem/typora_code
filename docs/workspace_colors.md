# R074 工作台颜色与视觉层次

2026-09-23 用户要求：功能增加后，正文与功能页面大面积同色，难以区分；统一参考 VS Code 的颜色、分界及上下层策略。本次授权覆盖原颜色冻结约定，保留既有布局、操作、尺寸和文档主题。

## 目标与来源

继续固定 VS Code `88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f`。此次功能区域采用其 [Light Modern](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/extensions/theme-defaults/themes/light_modern.json)／[Dark Modern](https://github.com/microsoft/vscode/blob/88e44fa0e00b08f7758b4f6d05632e4fd5e4df6f/extensions/theme-defaults/themes/dark_modern.json) 中明确声明的语义色，替代此前 Light/Dark 2026 的接近正文底色及更淡边框。不是更换用户 Markdown 主题，也不增加卡片、边距或圆角。

| 层次 | 明色／暗色 | 来源及采用范围 |
| --- | --- | --- |
| 功能框架 | `#F8F8F8`／`#181818` | sideBar、panel、titleBar、statusBar、editorGroupHeader；活动栏、侧栏、终端框架、标签底板、工具栏、设置分类 |
| 工作内容 | `#FFFFFF`／`#1F1F1F` | editor.background；自有设置表单、Git主内容；Markdown正文及预览正文继续由文档主题拥有 |
| 同层分界 | `#E5E5E5`／`#2B2B2B` | sideBar.border、panel.border、tabsBorder；既有1px分隔线，不改变内容盒 |
| 控件边框 | `#CECECE`／`#3C3C3C` | input.border；输入框、菜单外框；浮层使用边界和既有阴影区分上下层 |
| 操作提示 | `#005FB8`／`#0078D4` | focusBorder、button、panelTitle；主操作、键盘焦点、活动功能标记，错误/警告仍保留语义色 |
| 输入背景 | `#FFFFFF`／`#313131` | input.background；与功能背景成对区分，不把正文输入或第三方表单纳入 |
| 文本层级 | `#3B3B3B`／`#CCCCCC`，说明`#3B3B3B`／`#9D9D9D` | foreground、descriptionForeground；名称与说明保持可辨 |

同层兄弟模块共用背景与分隔线；工具区与内容区采用不同角色；浮层使用菜单背景、独立边界和已有阴影；活动/选择/悬停/禁用不以同一个底色代替。设置右侧原生偏好和社区 SettingTab 保留原始节点、样式和保存归属。

选择背景复用浅色 Modern 的 `list.activeSelectionBackground=#E8E8E8` 与暗色默认 `list.inactiveSelectionBackground=#37373D`；悬停采用 `#F2F2F2`／`#2A2D2E`。后两项默认值核对同提交的 `src/vs/platform/theme/common/colors/listColors.ts`。这是对现有工作台选中语义的映射，保留原焦点和选择逻辑，不宣称复制 VS Code 的整个焦点模型。活动栏非活动图标另用其 `#616161`／`#868686`。

## 职责与实现

共享主题服务从宿主实际背景判断明暗，按帧合并原有主题事件，不依赖主题文件名或系统颜色。颜色表集中声明 VS Code 语义变量及工作台角色，现有控件读取同一角色；领域只映射根面板、标题、输入和内容区域，不各自生成调色板。文件图标与终端共用明暗判断，但不能用终端背景反推宿主主题。终端屏幕通过 xterm theme API 使用 panel 背景，不能只改外层造成屏幕色块。不重新创建终端、编辑器或面板，不写用户偏好。

正文、代码高亮、媒体、网页沙箱、原生偏好和社区设置是独立所有者，不在 document/body 上覆写 `--bg-color`、`--text-color` 等原生主题变量。主题切换只换变量和已有终端主题，不清空选择、滚动、展开状态。卸载释放主题订阅并恢复自有标记；加载失败保留原生可读界面。

## 验收

- 明暗主题下检查资源树、搜索、大纲、SSH、扩展、Git、终端、设置、预览工具栏、菜单及底栏；同角色颜色一致，相邻角色有区别，正文/第三方样式不变。
- 默认、选中、悬停、焦点、禁用、错误、窄窗口、缩放及动态加入控件；实际文字与底色成对核对。
- 连续主题事件合并、无静止刷新循环；保持DOM身份、终端历史/进程、输入焦点、阅读位置和布局尺寸。
- 原始Typora隔离窗口截图与计算样式同时验证，不能仅凭发出切换主题命令判断成功；安装和卸载采用同一候选。运行证据与未覆盖平台在交付记录单独列出。

## 本次验证与交付

2026-09-23，2026.09.23.7：构建、完整check及198套测试目录校验通过；10组相关UI回归通过，颜色专项补充后22项通过。1000次相同通知不写调色板、不刷新终端；20次主题切换保持节点、焦点、滚动和几何。原始Typora1.14.10隔离窗口75项通过，实际打开六类侧栏并校验可见命中，核对明暗设置、菜单及终端截图。主要/次要文字及主操作颜色组合对比度至少4.5。

同候选公开入口完成隔离安装→检查→恢复卸载→重装→检查→无兼容备份卸载→重装→检查，65项卸载失败/取消/回滚回归通过。本机只读卸载预检、最终安装及资产摘要核对通过；用户窗口未重启。仅Windows11实机隔离宿主，未现场覆盖Win10和全部第三方主题；宿主操作通过程序入口与合成事件驱动，非物理鼠标验收。详见[本次证据](../enhancements/tests/evidence/workspace_colors_20260923.json)，固定源码摘要见[来源清单](vscode_design_sources.json)。
