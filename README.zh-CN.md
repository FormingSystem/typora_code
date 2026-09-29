# Typora Code

简体中文 | [英文](README.md)

Typora Code 为 Typora 增加工程工作台：多文档标签、分栏、源码编辑、工作区搜索、Git 审阅和集成终端，与原生 Markdown 编辑器共处同一窗口。

这是独立维护的社区项目，并非 Typora 或 Visual Studio Code 官方产品。Typora 需要单独安装和授权。工作台设计参考 Visual Studio Code，不提供其扩展宿主。

## 功能

| 区域 | 已有能力 |
| --- | --- |
| 文档 | 标签、分栏、阅读位置、统一前后导航、按工作区恢复会话 |
| 资源管理器 | 文件、打开的编辑器和时间线；单击预览，Alt+单击常驻，编辑后自动常驻 |
| 源码编辑 | Monaco 编辑、编码和换行、语言服务、符号大纲与源码导航；外部语言服务另行配置 |
| 搜索 | 文件名和路径搜索、工作区内容搜索；单击预览，双击或按回车打开 |
| Markdown | Typora 原生编辑、标题大纲、缩略图、代码复制与折叠、图片和 Mermaid 查看器 |
| 链接预览 | 独立阅读历史、固定、尺寸调整、缩放与只读分栏；本地内容跟随当前主题 |
| Git | 改动、暂存、提交、分支历史、提交图、文件历史、源码和 Markdown 渲染比较 |
| 终端 | Windows 本机命令解释器、多会话、分栏、查找及终端配置 |
| SSH | 每个窗口服务一个本地工作区或一个远程连接，文件、搜索、Git 和默认终端共用身份 |
| 设置与扩展 | 可搜索设置、原生偏好、支持的社区插件；配置保留各自原始所有者 |
| 更新 | 带校验和备份的压缩包更新；立即安装，手动重启 |

Markdown 分栏共用一个活动的 Typora 原生编辑器，其余分栏提供预览。源码标签可以独立编辑与保存。C/C++ 分析需要本机 clangd。第三方插件、外部命令和语言服务各自保留其能力与限制。

## 在 Windows 安装

1. 安装 [Typora](https://typora.io/)，确认能够正常打开文档。
2. 在仓库网页通过“代码 → 下载压缩包”下载并完整解压，保留随包的 `enhancements/dist/`。普通安装不需要源码构建或系统 Node.js。
3. 保存文档，运行 `install_windows.cmd`。首次安装下载并校验固定的私有 Node 运行时，请保留输出的备份位置。
4. 执行下方只读检查。出现 `status: OK` 后正常重启 Typora，加载已安装文件。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check_windows.ps1
```

安装器仅在实际写入目标需要时申请系统授权，取消则保留旧安装。安装不关闭用户窗口，也不热替换正在运行的工作台。

Windows 卸载时，保存文档并退出 Typora，运行 `uninstall_windows.cmd`。公开卸载入口恢复兼容的安装前备份；没有兼容备份时撤销加载入口，保留文档、设置、主题和插件缓存。`uninstall_windows.ps1 -check_only` 用于只读预检；版本回退使用 `restore_windows.ps1`。

离线准备、写入范围、更新、恢复和其他平台见[安装指南](docs/installation.md)。Windows x64 是主要验证环境。Windows ARM64、MSYS2 UCRT64 与 Linux 尚有原生验收缺口；Linux 暂无随包集成终端运行文件。当前安装器不支持 macOS 和 Windows 32 位。

## 使用工作台

从[操作说明与快捷键](docs/user_guide.md)开始。帮助菜单也可打开已安装的离线说明和操作指导。工作台支持中文和英文，默认跟随 Typora；可在统一设置的“显示语言”中选择，保存后正常重启生效，离线帮助使用同一语言。

从“文件 → 打开文件夹”选择工程。左下齿轮或 `Ctrl+,` 打开设置；`Ctrl+P` 查找文件，`Ctrl+Shift+F` 搜索正文，`Alt+B` 切换侧栏，`Alt+左右方向键` 导航编辑器历史。Typora 原生 Markdown 快捷键保留，例如 `Ctrl+B` 加粗。

当前版本与公告以[发行清单](enhancements/release.json)为准。安装后重启全部 Typora 窗口才会生效。尚未推送的本地候选不能从 GitHub 获取。

## 开发

```powershell
cd enhancements
npm ci
npm run build
npm run check
npm run check:ui
```

以本仓库为工程根目录。实现位于 `enhancements/src/`，配套预构建文件位于 `enhancements/dist/`。构建保留来源和许可信息。目标界面测试复用现有运行器，例如 `npm run check:ui -- test_workspace_titlebar.cjs`。

修改行为前阅读[贡献指南](docs/contributing.zh-CN.md)。设计记录、开发交接和历史验收均提供独立中英文页及互切入口。隐藏窗口测试通过不能替代 Typora 原生验收或其他平台验证。

## 许可与署名

除特别说明外，原创代码、界面、文档、主题及安装脚本采用 **GPL-2.0-only**，见 [LICENSE](LICENSE)。第三方组件保留各自许可及声明，随 `enhancements/vendor/` 和 `enhancements/dist/licenses/` 提供。

维护者：**FormingSystem** · 联系邮箱：`lizhaojun97@qq.com` · [项目仓库](https://github.com/FormingSystem/typora_code)。

[版权与贡献声明](COPYRIGHT.md)目前以中文原文提供。用户文档和其他个人文件保留原有权利与许可。
