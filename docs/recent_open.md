# R059 最近文件与目录统一管理

2026-09-20：自有菜单直接调用文件/目录打开，遗漏宿主的失效历史移除，造成同一已删除项目反复报错。本次将两个菜单合并为“打开最近”，目录在前、文件在后，完整路径区分同名项目；各组保留宿主最近访问顺序。菜单各组最多10项，“更多…”及Ctrl+R打开可筛选、单项移除的完整列表，“清空最近打开记录…”清理历史。

## 行为与失败边界

展示列表不逐项访问磁盘，避免离线盘拖慢菜单。用户选择时异步核对路径及类型；确认ENOENT/ENOTDIR且盘根/共享根可达，或目标类型改变时，从宿主历史移除并用非模态提示说明，不调用文件打开、不清空现有文档。再次打开不会留下同一失效记录。权限、I/O、超时或不可达盘根保留历史，提示可以重试或手动移除。读取/移除失败必须可见，不能伪造已清理。校验不可能消除外部删除竞态；打开失败中的同类缺失再复核移除。

单项移除立即生效，只删除历史索引。清空前确认范围，按确认时快照逐项使用宿主移除接口，不覆盖整份配置，也不删除确认后其他窗口新增的不同项目。取消零写入；部分失败显示错误并重新读取实际记录。列表每次打开及重新获得窗口焦点读取主进程历史，不维护第二份本地存储。已打开文件、工作区会话、草稿、固定目录设置和磁盘内容都不属于清理范围。

目录打开复用R040.1/R040.2目录切换及会话恢复；文件复用文件服务，不把父目录隐式切成工作区。异步校验绑定工作区代次及浮层存活，取消、切库和销毁后的结果不打开文件。执行期间重复接受只运行一次。Ctrl+R保留终端/IME和上层模态输入所有权；列表支持筛选、命中高亮、上下/首尾、Enter、Escape和Tab访问移除按钮。

## 职责与方案

`workspace_recent_service.ts`拥有宿主历史读取/规范化、路径有效性、移除和打开事务；宿主`setting.getRecentFiles/removeRecentDocument/removeRecentFolder`是唯一持久化所有者。`workspace_recent.ts`适配共同文件/目录服务及菜单；`workspace_recent_view.ts`只拥有筛选、选择、忙碌及确认界面。文件命令层登记生命周期，顶栏和快捷键复用这些入口。共用QuickPick外观、固定上游匹配高亮、工作台焦点与交互服务；不改变主工作台布局。

原始Typora1.14.10的`frame.js`库目录失败分支调用`setting.removeRecentFolder`，最近文件点击失败调用`setting.removeRecentDocument`。本次复用这些已核对端口，不写profile.data、不修改ASAR。完整VS Code工作区文件、远程URI、多根和热退出备份尚非宿主能力，不伪造这些类型；Ctrl+P文件检索与Ctrl+R历史选择是不同用途。

## 固定上游依据

VS Code1.137.0，提交`645f29cc3176500b4b5762ba887cf2a7f0ffdf2c`：

- [windowActions.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/actions/windowActions.ts)：BaseOpenRecentAction的目录/文件分组、matchOnDescription、sortByLabel=false、removeClose、Ctrl+R。
- [windowsMainService.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/platform/windows/electron-main/windowsMainService.ts)：路径解析失败移除最近项。本工程将权限/离线和确定缺失分开，避免误清临时不可用资源。
- [menubar.ts](https://github.com/microsoft/vscode/blob/645f29cc3176500b4b5762ba887cf2a7f0ffdf2c/src/vs/workbench/browser/parts/titlebar/menubarControl.ts)：菜单分组及More/Clear入口。QuickPick复用R058核对的600px宽、22px行和共同主题/选中规则，不从截图放大估算。

## 验收与影响

单元：真实临时路径、失效/类型改变、权限/离线/超时、取消/代次/重复请求、移除失败和20/100/1000轮清理；历史只在明确操作后变化。功能：真实菜单/快捷键、分组与顺序、长路径、筛选高亮、键盘移除/清空取消、动态刷新、明暗/缩放和焦点恢复。系统：原始宿主独立副本，真实最近目录及文件持久化移除、重读/再次选择、正常文件/目录打开及现有内容保持。相关回归覆盖顶栏、快捷键、工作区切换/会话、QuickOpen、文件服务。执行证据登记统一测试目录，不以设计条款当成已通过。
