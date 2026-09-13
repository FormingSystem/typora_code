<#
.SYNOPSIS
卸载 Typora Code 增强，恢复安装前的 Typora 环境。
.DESCRIPTION
先保存文档并退出 Typora。默认发现当前用户的有效安装前备份；
唯一候选直接使用，多个候选时选择，空输入取消。保留文档和用户设置。
更新备份仅用于 restore，不用于 uninstall。详见 docs/installation.md。
.PARAMETER typora_root
可选的 Typora 安装目录，用于限定卸载对象。
.PARAMETER backup_root
可选的安装前完整备份目录，可位于默认备份目录之外。
.PARAMETER non_interactive
没有唯一有效候选时失败，不等待输入。
#>
[CmdletBinding()]
param([string]$typora_root='', [string]$backup_root='', [switch]$non_interactive)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/lib/typora_environment.ps1')
. (Join-Path $PSScriptRoot 'scripts/lib/typora_workspace.ps1')
. (Join-Path $PSScriptRoot 'scripts/lib/typora_uninstall.ps1')

if ($typora_root) { $typora_root = resolve_typora_windows_root -typora_root $typora_root -non_interactive }
$context = select_typora_uninstall_context -typora_root $typora_root -backup_root $backup_root -non_interactive:$non_interactive
if ($null -eq $context) {
    Write-Host 'Typora Code uninstall cancelled. No files changed.'
    return
}
assert_typora_uninstall_closed $context.manifest.typora_root
Write-Host "Uninstalling Typora Code from: $($context.manifest.typora_root)"
Write-Host "Backup: $($context.backup_root)"
& (Join-Path $PSScriptRoot 'restore_windows.ps1') -backup_root $context.backup_root
Write-Host 'Typora Code uninstalled. Open Typora and select your previous theme. Documents, settings and backups are preserved.'
