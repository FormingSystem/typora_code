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

已安装用户可从 **帮助 → Typora Code GitHub 仓库** 用系统浏览器打开[项目仓库](https://github.com/FormingSystem/typora_code)，选择 **Code → Download ZIP**，解压整个目录。该入口不依赖更新检查成功。目标机无法连接GitHub时，可在其他可联网设备下载后转移完整包；纯离线首次安装还需准备下文“离线安装”所述运行时缓存。请确认同时存在：

```text
install_windows.cmd / install_windows.ps1 / install.sh
check_windows.ps1 / check.sh
uninstall_windows.cmd / uninstall_windows.ps1
restore_windows.ps1 / restore.sh
cpp_github-consolas.css / cpp_github-consolas_light.css / cpp_github-consolas_dark.css
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

安装支持 `-user_data '<实际Typora用户目录>'` 指定便携／独立配置目录，自动更新会传入当前宿主使用的真实位置；省略仍使用默认用户数据目录。额外支持 `-backup_root '<新的备份目录>'`，指定目录必须尚未存在。默认使用用户数据目录下的 `backups/typora_code_configuration/`。`-non_interactive` 在无法发现路径时直接失败，适合自动化，不会等待输入。PowerShell 帮助可通过 `Get-Help .\install_windows.ps1 -Detailed` 查看；`ExecutionPolicy Bypass` 仅作用于本次 PowerShell 进程。

普通安装无需预先用管理员启动。脚本先下载并校验运行时，再检查本次真正需要写入的目标；未变化的宿主启动页和运行资产不覆盖。若目标受保护，会显示具体路径与原因，再请求一次Windows UAC授权；取消保留原版本。授权续装显式沿用原用户目录、备份和缓存，不改用管理员账户的默认配置。只读、占用、网络故障不会误触发提权；已授权仍被拒绝时说明需核对ACL或安全软件策略。

`-non_interactive`默认不弹UAC；需要系统授权的自动化调用可增加`-allow_elevation`。内置更新在用户点击安装后已传此开关。备份可用`-backup_root`指定到Typora安装目录下`backup`的新子目录，但该位置也受目录权限约束，不能靠移动备份绕过宿主写权限；自定义备份恢复/卸载时须显式传入其完整路径。默认用户备份和可写用户配置继续保留。

## 查看安装进度与日志

安装窗口按阶段显示时间戳、当前操作和实际耗时，例如：

```text
[14:32:10] [STEP 3/6] 准备终端运行时
[14:32:10] [INFO] 已复用通过 SHA-256 校验的缓存，无须重新下载。
[14:32:11] [OK] 准备终端运行时完成，用时 1.2 秒。
[14:32:11] [STEP 4/6] 备份现有配置
```

阶段编号表示执行顺序，不是下载百分比。首次下载会说明等待原因，下载结束后继续显示摘要校验和解压。只有安装及校验都通过才显示 `SUCCESS`；出错时显示当前阶段、原因，以及“尚未写入目标文件”“已回滚”或“自动回滚未完成”的实际状态。不要把最后一种状态当作已恢复成功，应保留备份和日志后处理。

每次安装独立保存 UTF-8 日志，完整路径显示在 `Log:` 后。默认目录为用户数据下的 `logs/installation/`（Windows 为 `%APPDATA%\Typora\logs\installation`）；不可写时尝试系统临时目录下的 `TyporaCode/install_logs/`。日志存储不可用会提示，控制台仍继续输出；安装器不会自动上传日志。反馈前可按需要遮去其中的个人路径。

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

安装不向打开的项目写配置，不修改文档正文。阅读位置、工作台设置和非托管文件保留。安装会迁移本工程过去部署的确定旧插件资产；检测到旧加载器仍启用其他社区插件时会停止，应先在原插件管理中停用依赖旧加载器的插件，并保留原备份。

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

**查看当前运行版本：**打开“帮助 → 检查 Typora Code 更新”，各阶段顶部都会显示当前窗口实际加载的版本，不依赖联网。若磁盘已安装不同版本或新提交，会另外显示“已安装版本（重启后生效）”；保存文件并正常重启所有 Typora 窗口后才会切换运行版本。

**更新 Typora Code：**安装含更新模块的版本后，Windows 启动时会在多个窗口中合计检查一次；检测到新提交且远端发布序号不低于本地时显示版本号、提交hash和修复公告。选择“稍后”不下载、不安装；选择“立即更新”后下载官方仓库 ZIP、校验并立即原地安装，完成后保存文档，手动重启所有 Typora 窗口生效。不会自动关闭窗口。帮助菜单的“检查 Typora Code 更新”会立即显示“正在检查更新…”，完成后显示最新版本、新版公告或失败原因。后台正在检查时复用同一请求，重复点击不会重复联网；可取消后重试，取消的迟到结果不会重新弹窗。已有安装任务时显示该任务的进度。检查、校验解压和安装持续显示活动条；下载显示实际已接收大小，服务器提供有效总量时显示下载百分比。下载100%不代表安装完成；进入安装后不可中途取消，关闭进度窗不会中断后台任务，可从帮助菜单再次查看。成功后明确提示手动重启。

2026.09.20.2首次启动会短暂显示“正在加载工作台…”，就绪后显示工作区；发生初始化错误或超过15秒则恢复原生操作。持续卡在旧界面时先保留错误信息并运行check，按[稳定性设计](startup_stability.md)区分启动失败与正常数据加载。


下载／校验期间可取消；进入安装事务后等待完成。关闭进度窗不终止后台更新。手动检查遇到离线、限流或超时会说明错误；未手动介入的启动检查失败只记日志；实际写权限不足会解释原因并请求Windows系统授权，不静默提权，取消保留原版本。错误与日志可查看，安装写入失败沿用备份回滚。用户设置保留，当前窗口不热替换。多文件安装期间不要主动新建窗口，完成后再正常重启。

下载与解压默认使用Typora用户数据目录的 `temp/typora_code_updates/<任务ID>`，没有就创建；不是往受保护的程序安装目录写缓存。更新器只从GitHub API取得提交SHA、下载固定SHA的ZIP，不要求Git、`.git`、clone或历史。成功安装的hash记录在用户数据目录的 `typora_code_update_identity.json`；首次手工ZIP安装由资产清单建立等价身份。下载不提权；需要修改受保护的宿主入口时才沿用安装授权流程。

首次从不含更新模块的旧版升级，或使用尚不支持自动安装的平台，仍需获取完整新包，运行 install，再运行 check。每次安装产生新备份。同序号的新提交也会提示并显示提交说明；维护者发布功能修复仍需要递增版本、编写公告并推送经过验证的资产，详见[更新设计与发布契约](workspace_update.md)。

**更新 Typora：**照常使用官方更新。更新可能覆盖 `window.html`，增强随之不再加载；用当前增强包检查，核对新宿主兼容情况后重新安装并生成新备份。脚本不会阻止或改写官方更新流程。当前没有更新后自动重注入机制，也不能保证未来 Typora 版本无需适配。

恢复脚本会拒绝启动页面中**本工程入口以外**的内容变化，防止旧备份盖掉升级或外部改动后的页面；这不是完整宿主版本检测。不要跨 Typora 版本恢复旧的 `window.html`，也不要手工用旧文件绕过拒绝。新宿主需要修复时使用其官方安装包，再安装匹配的增强版本。

## 卸载与恢复

**Windows 卸载增强：**保存文档并退出 Typora，双击根目录 `uninstall_windows.cmd`。它自动发现当前用户默认备份目录中的有效安装前备份；唯一候选直接使用，多个候选显示时间、安装位置和备份路径，输入编号选择，直接按 Enter 或输入 Q 取消。结果窗口保留供查看。

`uninstall` 会排除更新备份，并使用原有恢复事务完成卸载。目标 Typora 仍在运行时会停止并提示退出，不会关闭进程。没有兼容的安装前备份时（例如旧schema备份、Typora已经升级），会先备份当前启动页，再只移除TyporaCode自己的加载入口，保留当前宿主版本、主题、偏好、插件包及配置。不会把更新备份当作卸载来源，也不会删除整个用户数据目录；无法确认入口完整性时仍拒绝修改。需要限定安装位置、自定义备份位置或用于自动化时，在包根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -non_interactive
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -typora_root '<Typora安装目录>' -non_interactive
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -backup_root '<安装前完整备份目录>' -non_interactive
```

以上为三种独立用法。`-non_interactive` 遇到无法确定安装位置或多个备份候选直接失败，不等待输入；加 `-Verbose` 可查看备份被跳过的原因。CMD 也接受相同参数。卸载保留 Typora 本体、文档、用户设置、阅读记录与备份；最初从旧插件迁入的环境会恢复该备份中的旧插件。

**回退增强版本，或在 Linux / UCRT64 手动恢复：**继续使用 `restore`，显式指定所选备份。

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

**备份丢失：**无法保证还原安装前的同名主题、旧插件或原窗口字段。新版卸载可先备份并撤销当前完整的工作台入口；若入口损坏而不能安全识别，再用 Typora 官方同版本安装包修复宿主文件、恢复原生启动，随后选择原生主题。两种方式都不能重建丢失的原配置。保留用户数据和文档，避免整目录删除。

可先运行只读预检，不必退出Typora：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall_windows.ps1 -check_only -non_interactive
```

预检显示 `restore`（有效安装前备份）、`detach`（移除当前入口）或 `absent`（已无工作台入口）。实际卸载仍需先保存并退出。每次实际运行生成用户数据目录 `logs/installation/uninstall-*.log`；移除入口前的备份在 `backups/typora_code_uninstall/`，保存原始启动页及事务摘要。权限不足时会指出安装目录并说明需要以管理员运行的原因。卸载保留的主题可在Typora主题菜单切换；它不代表增强仍在加载。

## 常见问题

| 提示或现象 | 处理 |
| --- | --- |
| 找不到 Typora / 等待路径 | 指定 `-typora_root` 或 `--typora-root`；确认不是 Typora Code 下载包目录 |
| Asset / digest / SHA-256 mismatch | 重新获取同一版本的完整包；缓存错误按离线章节核对，不跳过校验 |
| Access denied / Permission denied | Windows交互安装按实际写权限请求一次UAC；无人值守可传-allow_elevation。已授权仍失败则核对具体目标ACL或安全软件；只读/占用需单独处理 |
| Other enabled community plugins | 先在原环境停用依赖旧加载器的其他插件，再安装 |
| 安装后仍是旧界面 | 先保存，再完整退出并重新打开 Typora；检查本包 check 的结果与主题选择 |
| 升级后增强不见了 | 按“检查与更新”重新安装当前宿主入口 |
| 恢复拒绝宿主页面变化 | 停止使用该旧备份覆盖宿主；通过官方安装器修复当前版本 |

每次报错先保留完整控制台输出、使用的增强版本、Typora 版本和备份目录；反馈时隐去个人目录信息。脚本不会自动删除备份。

## 社区插件与宿主更新

工作台安装后，从左侧“扩展”（Ctrl+Shift+X）打开管理；插件配置从统一设置页的“社区插件设置”或插件行“设置”进入。可从社区目录或本地ZIP安装；新插件默认停用，点击“信任并启用”后运行。插件拥有Typora进程权限，仅启用可信来源。启停在已打开窗口间同步；已运行插件更新后保存文档并手动重启所有窗口，新版本才生效。卸载保留个人设置及可能被其他窗口引用的旧包缓存。

Typora官方更新若覆盖启动入口，重新运行本工程标准安装与检查即可，仍使用原Typora图标。安装基于升级后的宿主页面，不恢复旧版内核；社区包、启用配置和个人设置保留。Windows文件事务模拟已验证此行为，不能替代尚未执行的真实官方升级兼容验收。完整API与平台边界见[社区插件设计](community_plugins.md)。

## 文本呈现默认值迁移（R034.5）

2026.09.24.3首次加载统一文本呈现服务时，缺少契约或早于2026092403的软换行配置采用自动换行默认值。该版本及之后的有效选择保留；仅迁移word_wrap，不重置其他宿主、工作台、SSH或终端配置。设置和契约保存在宿主用户数据的Local Storage，由运行时唯一服务读取；标准卸载保留用户数据，重装后沿用。磁盘安装完成与旧窗口加载新契约是两个阶段，需正常重启。存储不可用时本窗口使用内存设置并记录警告，不修改正文。

## 明暗主题与自定义颜色

安装后在主题菜单选择 **CppGithubConsoles_Light** 或 **CppGithubConsoles_Dark**。两者使用相同Consolas字体优先级和正文排版，Dark使用Night风格暗色。原主题仍可选。

**主题 → 自定义颜色…** 或 **设置 → 自定义颜色** 打开同一张配色表，可搜索正文、链接、标题、工作台、终端等颜色项目。输入有效十六进制色值或拖动取色器，立即显示并自动保存；单项或当前主题可恢复默认，支持JSON导入/导出。明暗配置分别保存，改动另一主题的配置后需切到该主题观察。

手工试色可从“主题 → 打开主题文件夹”找到 `cpp_github-consolas_dark.css`，链接选择器为 `a, a:hover, a:visited`；工作台运行时链接默认角色位于源码 `enhancements/src/workspace_colors.css` 的 `--workspace-markdown-link`，优先于主题CSS。日常调试建议直接用配色表的 `markdown_link`，无需编辑安装文件或再次构建。JSON保存的是颜色配置而非整份主题，字体与排版继续由主题拥有。
