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
