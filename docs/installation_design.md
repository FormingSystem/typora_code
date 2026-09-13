# 安装交付设计

## R025

2026-09-13，用户要求让初次接触 Typora Code 的读者明确产品是什么、从哪里下载、怎样安装、检查、卸载和恢复。范围为入口命名、环境契约、用户文档和安装事务的实际边界；不更换常驻启动架构，不发布远端，不改变用户日常设置或删除用户文档。

公开入口统一为根目录 `install_windows.ps1` / `install_windows.cmd`、`check_windows.ps1`、`uninstall_windows.ps1` / `uninstall_windows.cmd`、`restore_windows.ps1`，Bash 为 `install.sh`、`check.sh`、`restore.sh`。Windows 事务归 `scripts/install_workspace_windows.ps1` 和 `scripts/restore_workspace_windows.ps1`，共用 `scripts/lib/`；UCRT64 转交同一 Windows 事务，Linux 调用既有 Python 事务。旧名称与调用方一起替换，不增加重名别名或重复安装实现。

根 README 负责产品介绍、Windows 快速开始和阅读导航；`installation.md` 是唯一完整用户安装说明，维护平台、依赖、路径、权限、离线缓存、更新和恢复流程。旧配置说明保留阅读设置章节与已有标题锚点，安装部分改为指向新指南。历史交付记录保留当时命令的原名并注明改名关系。

恢复的状态所有者是所选备份清单。首次安装前的备份恢复此前环境，后续安装的备份用于回退增强版本，不能混称卸载；从旧插件迁入时首次备份可能恢复旧插件，因此卸载独立工作台也不代表删除所有第三方插件。用户设置、阅读记录与非托管文件继续保留。没有备份时不声称可以还原原配置，应通过 Typora 官方安装器修复宿主入口并保留用户数据。

安装与恢复继续执行预检、备份、摘要校验和失败回滚。恢复增加宿主启动文件比较：去除本工程拥有的入口后，现有文件与备份不一致则在写入前拒绝，防止旧备份覆写升级或外部修改后的启动页面；这不等同完整宿主版本兼容验证。升级 Typora 后使用新安装和新备份。取消/预检失败不写入目标，安装过程中失败使用已有事务回滚；不自动关闭用户窗口或提升权限。

验收覆盖 Windows 公开入口和含空格路径、重复安装、损坏资产、越界备份、宿主变化拒绝、原偏好恢复与后续偏好保留、故障回滚；Python 事务执行同类恢复边界。检查所有当前文档和脚本引用、帮助入口、构建检查与链接；无实际 Linux/UCRT64/ARM64 原生验证时明确标注。下载说明使用当前仓库网页的 Code / Download ZIP，不编造尚未验证的远端项目名或 Release 包。

## R025 卸载入口

2026-09-14，用户要求补齐采用 `uninstall` 命名的 Windows 双击入口。根目录新增 `uninstall_windows.cmd` 和 `uninstall_windows.ps1`；CMD 只转交参数并保留结果窗口，PowerShell 负责选择卸载备份，然后调用原有 `restore_windows.ps1` 事务。`restore` 继续用于明确选择备份后的恢复和版本回退，不复制文件恢复、摘要校验或回滚逻辑。

默认只扫描当前用户的 `backups/typora_code_configuration/` 直接子目录，读取 schema 4 清单、用户和宿主身份。卸载候选必须包含四个常驻入口资产的原始缺省记录，保存的启动页不含独立工作台入口；更新备份不能作为卸载候选。候选还要通过现有完整恢复预检，包括源文件摘要、路径范围和宿主启动页一致性。唯一候选直接执行，多个有效候选才列出时间和安装位置供选择；空输入取消，取消和找不到有效备份均不写入目标。自定义位置使用 `-backup_root`，指定宿主使用 `-typora_root`；`-non_interactive` 在缺失或歧义时失败，不等待输入、不按最新目录猜测。

执行前拒绝仍在运行的目标 Typora，提示保存文档并退出，不关闭进程或自动提权。显示所用备份，恢复事务仍保留文档、工作台设置和阅读记录；首次备份可能恢复迁入前的旧插件。备份发现和目标选择归 `scripts/lib/typora_uninstall.ps1`，托管文件和原生偏好恢复仍归现有事务。

验收在独立安装目录和 APPDATA 中覆盖：仅安装前备份、后续更新备份、多个候选及取消、自定义路径、不同用户/宿主、缺失或损坏备份、宿主已更新、运行进程拒绝、CMD 参数与退出码，以及实际恢复后正文、设置和阅读记录保持。此次不构建/安装工作台 bundle，不卸载用户正在使用的 Typora；Windows 原生安装位置的真实卸载未执行。

## 本次验证

2026-09-14：Windows PowerShell 5.1 卸载夹具通过38项断言，覆盖安装前/更新备份区分、多个候选和安装位置过滤、不同用户、宿主升级、损坏备份与越界记录、运行进程拒绝，以及实际 CMD 的成功、失败退出码和取消零写入。含空格及方括号的独立包调用原恢复事务，确认启动页、主题和原窗口字段恢复，正文、阅读记录与后来修改的偏好保留。部署检查通过，包含19个公开入口/共享部署文件与23个工作台资产；这不代表执行了工作台全量测试或真实安装卸载。证据：`.cache/uninstall_windows_verification_20260914.log`、`.cache/uninstall_deployment_verification_20260914.log`。

2026-09-13：Windows PowerShell 5.1 公开 install/check/restore 入口在含空格的隔离目录通过首次/重复安装、损坏清单、宿主变化零写入拒绝、原偏好恢复和故障回滚；Python 事务全部通过。完整 npm run check 通过；26份文档、50项需求、354本地链接与187锚点核对通过。Bash 命令所在环境未具备，未运行 UCRT64/Linux 入口或 ARM64 原生实例，已在用户指南明确。日志为 `.cache/install_entry_windows_final_20260913.log`、`install_entry_python_20260913.log`、`install_entry_check_20260913.log`；文档证据为 `.cache/issue_tracking/requirements_install_entry_verification_20260913.json`。测试仅使用临时安装和用户数据目录，未卸载或重启用户 Typora。
