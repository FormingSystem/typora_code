# Typora Code 安装与恢复指南

Typora Code 是运行在 Typora 中的社区工作台增强。普通用户使用下载包中的预构建文件安装；开发者修改源码后再按[构建说明](../enhancements/README.md#1.2_开发者构建)生成同一套文件。

## 环境要求

| 环境 | 必要条件 | 当前验证范围 |
| --- | --- | --- |
| Windows x64 | Windows 10 1903+ / Windows 11，Windows PowerShell 5.1，已安装 Typora | 主要使用环境；Typora 1.14.10 原生窗口及事务安装已验证，历次结果见[反馈记录](feedback_review.md) |
| Windows ARM64 | PowerShell 5.1，ARM64 系统；包内提供对应终端原生文件 | 运行资产已准备，ARM64 实机尚未验收 |
| Windows MSYS2 UCRT64 | `MSYSTEM=UCRT64`，Bash、`cygpath`、`powershell.exe` | Bash 转交 Windows 事务；完整 UCRT64 实机流程尚未验收 |
| Linux | Bash、Python 3.9+，可写的 Typora 安装目录与用户配置目录 | Python 安装事务已测试；Linux 原生界面和权限流程尚未验收；暂无集成终端运行包 |

macOS、Git Bash、MSYS2 MINGW64 和 Windows 32 位不属于当前安装支持范围。路径转换支持 WSL 风格路径不代表支持在 WSL 中运行 Windows 安装流程。Typora 自身的系统要求以[官方下载页](https://typora.io/)为准；Linux 的宿主安装方式见[官方 Linux 指南](https://support.typora.io/Typora-on-Linux/)。

核心工作台使用随包文件。Windows 首次安装还会从 `nodejs.org` 下载固定的私有 Node 运行时并检查 SHA-256，不修改系统 PATH；已装系统 Node 不能替代该固定运行时。Git 功能需要 `git` 可从当前环境找到；C/C++ 大纲需要 clangd，可在工作台“解析环境设置”中指定路径。没有这些可选工具时，先安装所需工具再使用对应功能。

## 下载完整安装包

在提供本 README 的仓库网页选择 **Code → Download ZIP**，解压整个目录。请确认同时存在：

```text
install_windows.cmd / install_windows.ps1 / install.sh
check_windows.ps1 / check.sh
restore_windows.ps1 / restore.sh
cpp_github-consolas.css
scripts/
enhancements/dist/SHA256SUMS
enhancements/dist/terminal_runtime/
enhancements/node_runtime.json
```

从 Git 获取的工作树同样适用。不要只下载一个脚本或只复制主题文件；安装器需要同一个版本的脚本、主题、清单和运行文件。当前指南使用仓库源包，不假定已有独立 Release 安装程序。

## Windows安装

1. 先安装并打开 Typora，确认宿主可正常运行。保存所有未保存的文档；安装器不会强制关闭窗口。
2. 完整解压 Typora Code。双击根目录的 `install_windows.cmd`；它调用同目录 PowerShell 脚本，显示结果并保留窗口供查看。
3. 自动发现安装位置失败时，按提示输入 Typora 安装目录。安装器也接受 `Typora.exe`、`resources` 或 `resources/window.html` 的路径。
4. 记录末尾 `Backup:` 后的完整备份目录。首次安装前的备份是以后恢复原环境的依据，更新时也要保留。
5. 执行只读检查，正常重启 Typora，选择“主题 → cpp github consolas”。

需要明确指定路径或用于自动化时，在下载包根目录执行：

```powershell
# 将引号内占位文字替换成实际安装目录
powershell -NoProfile -ExecutionPolicy Bypass -File .\install_windows.ps1 -typora_root '<Typora安装目录>' -non_interactive
powershell -NoProfile -ExecutionPolicy Bypass -File .\check_windows.ps1 -typora_root '<Typora安装目录>' -non_interactive
```

安装额外支持 `-backup_root '<新的备份目录>'`，指定目录必须尚未存在。默认使用用户数据目录下的 `backups/typora_code_configuration/`。`-non_interactive` 在无法发现路径时直接失败，适合自动化，不会等待输入。PowerShell 帮助可通过 `Get-Help .\install_windows.ps1 -Detailed` 查看；`ExecutionPolicy Bypass` 仅作用于本次 PowerShell 进程。

安装目录受系统权限保护时，先确认错误指向哪个目录。必要时在**同一用户**的管理员 PowerShell 中执行明确路径的安装命令；换成另一管理员账户会使用另一套用户数据。不要给整个磁盘或用户目录开放写权限。

## Linux与UCRT64

在完整下载包根目录执行：

```bash
bash ./install.sh --typora-root '<Typora安装目录>' --non-interactive
bash ./check.sh --typora-root '<Typora安装目录>' --non-interactive
```

省略路径与 `--non-interactive` 时允许自动发现和交互输入。三个 Bash 入口都支持 `--help`。Windows 上必须使用 **MSYS2 UCRT64**，Bash 会把安装、检查和恢复交给同一 PowerShell 实现。Linux 由 Python 事务管理工作台与主题。

Linux 以调用者身份操作，要求当前用户能写入宿主 `resources/window.html` 和自己的配置目录。请使用当前用户可写的独立 Typora 安装；脚本不会自动调用 sudo。不要对整条安装命令盲目使用 sudo，否则配置可能落入 root 的用户目录。只读挂载的 AppImage 不能直接持久修改，需要先采用可写的安装形式。包管理器升级或重装 Typora 可能替换宿主文件，之后按下方更新步骤检查。

## 路径与写入范围

路径优先使用显式参数。未指定时读取 `TYPORA_ROOT`，再检查运行进程和系统发现信息；Windows 还检查 PATH 与 App Paths 注册信息，Linux 检查可执行文件路径。最终无法定位时交互询问或在非交互模式下退出。

下表的“用户数据目录”在 Windows 为 `%APPDATA%\Typora`，Linux 为 `$XDG_CONFIG_HOME/Typora`，未设置 XDG 时为 `$HOME/.config/Typora`。

| 位置 | 安装用途与保留规则 |
| --- | --- |
| Typora 安装目录 `resources/window.html` | 加入静态 CSS 和常驻脚本入口；`app.asar` 保持原样 |
| 用户数据 `typora_code/` | 工作台运行资产；`settings/workspace.json` 中既有设置保留 |
| 用户数据 `linux_note_enhancements/terminal_runtime/` | 当前 Windows 终端运行资产的既有目录名 |
| 用户数据 `themes/cpp_github-consolas.css` | 本项目主题；覆盖前备份同名文件 |
| 用户数据 `profile.data` | 完整备份，只调整无边框窗口字段；恢复该字段时保留后来的其他偏好 |
| 用户数据 `backups/typora_code_configuration/` | 每次独立安装的备份清单与原文件 |

安装不向打开的项目写配置，不修改文档正文。阅读位置、工作台设置和非托管文件保留。安装会迁移本工程过去部署的确定旧插件资产；检测到仍启用其他社区插件时会停止，应先在原插件管理中停用依赖旧加载器的插件，并保留原备份。

## 离线安装

核心资产无需联网；Windows 私有 Node 的下载缓存可以提前准备。固定版本、架构、ZIP 和可执行文件摘要以当前包的 [`enhancements/node_runtime.json`](../enhancements/node_runtime.json) 为准。

1. 在联网机器从 `https://nodejs.org/dist/v<version>/node-v<version>-win-<arch>.zip` 获取清单对应 ZIP；`arch` 为 `x64` 或 `arm64`，与目标 Windows 架构一致。
2. 将完整 ZIP 放到目标机器自选缓存目录，保留官方文件名，无需解压。
3. 在执行安装或恢复的同一个 PowerShell 中设置缓存并运行：

```powershell
$env:TYPORA_TERMINAL_CACHE = '<已准备ZIP的缓存目录>'
powershell -NoProfile -ExecutionPolicy Bypass -File .\install_windows.ps1
```

默认缓存为 `%LOCALAPPDATA%\Typora\terminal_downloads`。命中且摘要正确就复用；缺失或摘要错误会尝试官方下载，完全离线时因此失败。不要跳过摘要校验或用其他版本文件改名充当缓存。Windows 恢复也使用该私有运行时处理原生配置，离线恢复前同样要保留缓存。

## 检查与更新

`check_windows.ps1` / `check.sh` 只读比较**本下载包**与已安装入口、主题和发布摘要；成功显示 `status: OK`，失败返回非零。它不修复文件。自定义改过本项目同名主题也会报告不同，这不等同 Typora 文档损坏。

**更新 Typora Code：**保存文档，获取新完整包，运行新包的 install，再运行 check。每次产生新备份；既有工作台设置保留。完成后正常重启 Typora。

**更新 Typora：**照常使用官方更新。更新可能覆盖 `window.html`，增强随之不再加载；用当前增强包检查，核对新宿主兼容情况后重新安装并生成新备份。脚本不会阻止或改写官方更新流程。当前没有更新后自动重注入机制，也不能保证未来 Typora 版本无需适配。

恢复脚本会拒绝启动页面中**本工程入口以外**的内容变化，防止旧备份盖掉升级或外部改动后的页面；这不是完整宿主版本检测。不要跨 Typora 版本恢复旧的 `window.html`，也不要手工用旧文件绕过拒绝。新宿主需要修复时使用其官方安装包，再安装匹配的增强版本。

## 卸载与恢复

先保存文档并退出 Typora，然后选择正确的备份目录：

| 目标 | 应选择的备份 |
| --- | --- |
| 卸载独立工作台，回到安装前环境 | **首次安装前**的完整备份 |
| 撤销某次增强更新 | 该次更新输出的备份，恢复到更新前的增强版本 |
| 从旧插件迁入后退回原环境 | 迁入时的备份；它可能恢复原插件及旧加载器，不代表纯净 Typora |

备份目录必须含 `manifest.json` 和对应子目录，不能只复制 `window.html`。清单记录原用户数据和安装路径，不能用其他用户或机器的备份替代；当前恢复支持 schema 4 的本工程事务备份。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\restore_windows.ps1 -backup_root '<所选备份目录>'
```

```bash
bash ./restore.sh --backup-root '<所选备份目录>'
```

恢复会校验摘要和路径，先保存恢复前快照，按清单还原原有托管文件、移除当时新安装的托管文件。原生窗口字段还原，其他后来修改的偏好保留；工作台设置、阅读记录、非托管文件和文档正文保留。恢复前快照保存在所选备份的 `restore_*` 子目录用于故障调查，它不是另一份可直接传给 restore 的完整安装备份。

恢复成功后重新打开 Typora；如果卸载移除了当前主题，在“主题”菜单选择一个原生或自己保留的主题。此时增强安装检查出现缺失是预期结果，不能再次运行 install 作为“卸载验证”。检查原生菜单、编辑和自己的文档是否正常。

**备份丢失：**无法保证还原安装前的同名主题、旧插件或原窗口字段。可用 Typora 官方同版本安装包修复宿主文件、恢复原生启动，再选择原生主题；这只能撤除入口，不能重建丢失的原配置。保留用户数据和文档，避免整目录删除。

## 常见问题

| 提示或现象 | 处理 |
| --- | --- |
| 找不到 Typora / 等待路径 | 指定 `-typora_root` 或 `--typora-root`；确认不是 Typora Code 下载包目录 |
| Asset / digest / SHA-256 mismatch | 重新获取同一版本的完整包；缓存错误按离线章节核对，不跳过校验 |
| Access denied / Permission denied | 检查具体目标目录权限和当前账户；按对应平台步骤处理 |
| Other enabled community plugins | 先在原环境停用依赖旧加载器的其他插件，再安装 |
| 安装后仍是旧界面 | 先保存，再完整退出并重新打开 Typora；检查本包 check 的结果与主题选择 |
| 升级后增强不见了 | 按“检查与更新”重新安装当前宿主入口 |
| 恢复拒绝宿主页面变化 | 停止使用该旧备份覆盖宿主；通过官方安装器修复当前版本 |

每次报错先保留完整控制台输出、使用的增强版本、Typora 版本和备份目录；反馈时隐去个人目录信息。脚本不会自动删除备份。
