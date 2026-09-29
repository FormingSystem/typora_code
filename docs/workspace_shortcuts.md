# R079 原生 Markdown 快捷键优先

2026-09-27用户明确：保留Typora编辑习惯；与原生Markdown编辑冲突的工作台Ctrl键改Alt。同日后续R014.2明确例外：Ctrl+=/-恢复窗口缩放，编辑区Ctrl+滚轮只调内容字号；此最新约定替代此前Alt缩放键，其他已迁移键保持。

## 核对与采用

依据Typora官方[快捷键表](https://support.typora.io/Shortcut-Keys/)（2026-09-06更新）及1.14.10原始appsrc/window/frame.js的KeyMaster/样式命令。VS Code固定6807068的workbench/browser/actions/layoutActions.ts、workbench/electron-browser/actions/windowActions.ts只作工作台命令参考；发生冲突时按用户规则迁移，不修改宿主快捷键配置。

| 原生保留 | 工作台原动作 | 工作台新键位 |
| --- | --- | --- |
| Ctrl+B 加粗 | 侧栏显隐 | Alt+B |
| Ctrl+K 插入链接 | 工作台组合键前缀 | Alt+K，后续Ctrl也改Alt，如Alt+K Alt+O打开工程目录 |
| Ctrl+\ 清除格式 | 向右拆分编辑组 | Alt+\ |
| Ctrl+= / Ctrl+- 按R014.2明确让给窗口缩放 | 窗口放大/缩小 | Ctrl+= / Ctrl+-，含Shift及小键盘变体；标题升降仍可从原生菜单执行 |
| Ctrl+Shift+` 行内代码 | 新建终端 | Alt+Shift+` |

Ctrl+P原生即快速打开，Ctrl+O/S/Shift+S是同义文件操作；Ctrl+R最近、Ctrl+Shift+P命令、Ctrl+Shift+X扩展、Ctrl+Shift+F工作区查找和Ctrl+`终端显隐无本次原生编辑冲突，保留。Ctrl+Shift+=/-与Ctrl+=/-共用唯一窗口命令。差异编辑器局部Ctrl+K Ctrl+Alt+S/R属于独立源码选区操作，不在可编辑原生正文注册，不改其私有键位。远端地址栏Ctrl+L和终端局部键不越过视图所有权。

## 职责、失败与取消

workspace_shortcuts唯一拥有工作台侧栏和组合键，移除Git局部重复Ctrl+B；workspace_keyboard提供严格Alt判定，拒绝Ctrl/Meta/AltGraph及输入法。workspace_zoom和terminal_workspace仍拥有其命令及生命周期。Alt+K后的第二键先于单键动作解析，未知/超时/失焦取消，不把旧Ctrl+K保留为别名；模态与终端保留现有输入边界。菜单、标签、树和工具栏提示同步新键位，原生格式菜单显示原生快捷键。不模拟新的Markdown编辑、不改conf.user.json或用户热键；用户自定义第三方键位冲突另按实际配置核对。

## 验收

隐藏Electron验证新键位、旧键不被消费、组合键第二键优先级、重复抬键、IME/AltGraph、终端/模态与卸载。原始Typora隔离窗口核对真实正文加粗/链接/清除格式/标题升降/行内代码入口及侧栏状态，分开合成事件与物理输入证据。全量检查、菜单/缩放/终端关联回归、同候选两类卸载重装及本机安装后再交付；不关闭用户窗口。

本次2026.09.27.3验证与安装结果见[证据](../enhancements/tests/evidence/native_shortcuts_20260927.json)。真实宿主已验证Ctrl+B生成加粗；其余编辑组合键只确认工作台放行，物理键盘与OS accelerator仍需实机补验。

## R079.1 源码剪贴板命令接线（2026-09-29）

问题与目标：原始Typora中源码Ctrl+V被Monaco阻止默认行为后没有修改模型，而同一位置的菜单粘贴能插入。固定VS Code `6807068` 的 `src/vs/editor/contrib/clipboard/browser/clipboard.ts` 将桌面粘贴交给 `IClipboardService.triggerPaste`；`src/vs/workbench/services/clipboard/electron-browser/clipboardService.ts` 再调用原生宿主。嵌入的Monaco沿用了桌面快捷键，却只有返回undefined的BrowserClipboardService，且桌面分支不会进入Web readText后备，形成静默空操作。

范围与职责：源码、源码比较和只读版本的Monaco剪贴板命令统一接到已有 `monaco_source_command` 宿主适配。沿用上游命令注册和键位，只为当前具有正文焦点的已登记编辑器提供高优先级实现；每个编辑器销毁时注销。查找/替换输入框继续用自己的文本适配，普通搜索、Markdown、终端、文件树保留原所有者，不增加全局Ctrl+V拦截或复制另一份快捷键表。

实现与失败：复制、剪切、粘贴均与菜单共用命令，保留整行/多光标元数据和撤销；只读允许复制，拒绝剪切/粘贴。无Electron剪贴板端口时不接管原命令，宿主失败不改写模型或重复后备执行。同步剪贴板读取不会在异步等待后把内容写进另一文档。剪贴板服务仍不修改系统配置。

验收：以当前构建的原始宿主记录Ctrl+V默认已阻止但模型未改变的修复前证据；修复后验证实际模型、单次插入、中文多行、整行/多光标、撤销/重做、只读、搜索输入和Markdown边界。Electron可信键盘与原始宿主renderer事件分别记录，不能把菜单通过算作物理键盘通过。压力按20轮真实输入、100/1000轮可低成本的命令/生命周期覆盖。完整检查与隔离卸载重装、本机安装各自留证。


同轮扩查终端：可信Ctrl+V实际向xterm发送了控制字符`0x16`，没有执行粘贴。固定上游 `terminalContrib/clipboard/browser/terminal.clipboard.contribution.ts` 的Paste命令在Windows为Ctrl+V/ Ctrl+Shift+V，Linux保留Ctrl+V给Shell。本地终端按同样平台边界在自己的按键处理器接到既有paste入口；Electron读取与原菜单共用该入口，浏览器环境保留navigator回退，仍走原多行确认与销毁保护。Ctrl+C无选区仍中断进程，AltGr与输入法不触发粘贴；不把终端命令转交正文服务。

## R079.2 终端焦点下的工作台入口（2026-09-29）

问题：共同快捷键在判断Ctrl+P之前直接排除了全部终端输入，导致快速打开不可达。固定VS Code `6807068` 的 `terminal/common/terminal.ts` 将 `workbench.action.quickOpen` 和 `workbench.action.showCommands` 列入默认跳过Shell的命令；`terminal/browser/terminalInstance.ts` 在xterm处理之前按实际命令决定路由，而非禁用整个工作台。

本次范围：共同窗口路由先处理Ctrl+P/Ctrl+Shift+P这组全局入口，再把其他终端输入交还原所有者；正文、侧栏、底部终端和编辑组终端共用同一分支及同一选择器，不在terminal_surface复制快捷键。保留已有窗口缩放优先级，输入法/229、AltGr及模态保护；不顺带改变其他终端键位或新增设置页。取代原“终端输入全部不参与工作台入口”的对应部分。

快速打开自身持有查询、取消及原焦点快照：重复Ctrl+P使用原实例；Esc恢复触发终端焦点，打开文件交给文件服务，失败沿已有反馈并保留当前内容。已处理的抬键由共同consumed集合阻止重复调用，销毁清空。选择器尚未初始化时不吞键；命令面板仍走command:open。

验收覆盖终端可见但正文获焦、真实xterm获焦、底部/编辑组搬移、Ctrl+P及Ctrl+Shift+P单次调用、重复/抬键不泄漏PTY、Esc后继续输入、文件选择以及输入法/模态保护。可信Electron输入与原始Typora合成事件分别记录，20轮开关及既有剪贴板/IME回归；构建、隔离安装/卸载、本机安装各自留证。
