<#
.SYNOPSIS
卸载 Typora Code 增强，安全恢复备份或移除当前加载入口。
.DESCRIPTION
先保存文档并退出 Typora。默认发现当前用户的有效安装前备份；
唯一候选直接使用，多个候选时选择，空输入取消。保留文档和用户设置。
更新备份仅用于 restore，不用于 uninstall。详见 docs/installation.md。
.PARAMETER typora_root
可选的 Typora 安装目录，用于限定卸载对象。
.PARAMETER backup_root
可选的安装前完整备份目录，可位于默认备份目录之外。
.PARAMETER non_interactive
有多个有效备份时失败，不等待输入。
.PARAMETER check_only
仅预检卸载方式，不修改文件或要求退出Typora。
#>
[CmdletBinding()]
param([string]$typora_root='', [string]$backup_root='', [switch]$non_interactive, [switch]$check_only)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/lib/typora_environment.ps1')
. (Join-Path $PSScriptRoot 'scripts/lib/typora_workspace.ps1')
. (Join-Path $PSScriptRoot 'scripts/lib/typora_uninstall.ps1')
. (Join-Path $PSScriptRoot 'scripts/lib/typora_install_log.ps1')
. (Join-Path $PSScriptRoot 'scripts/lib/typora_install_permissions.ps1')
$user_data = get_typora_windows_user_data
$log = $null
$mutex = $null
$owns_mutex = $false
try {
    if ($typora_root) { $typora_root = resolve_typora_windows_root -typora_root $typora_root -non_interactive }
    if (-not $check_only) {
        $log = new_typora_install_log $user_data -operation uninstall
        $mutex = new_typora_install_mutex $user_data
        try { $owns_mutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owns_mutex = $true }
        if (-not $owns_mutex) { throw 'Another Typora Code installation or uninstall is running. Retry after it completes.' }
    }
    $plan = get_typora_uninstall_plan -typora_root $typora_root -backup_root $backup_root -non_interactive:$non_interactive
    if ($null -eq $plan) { Write-Host 'Typora Code uninstall cancelled. No files changed.'; return }
    Write-Host "Uninstall plan: $($plan.mode) | $($plan.typora_root)"
    if ($check_only) { Write-Host 'Read-only preflight complete. No files changed.'; return }
    if ($plan.mode -eq 'absent') { write_typora_install_log $log SUCCESS 'Typora Code is already detached. No startup entry remains.'; return }
    assert_typora_uninstall_closed $plan.typora_root
    if ($plan.mode -eq 'restore') {
        write_typora_install_log $log INFO ("Backup: " + $plan.context.backup_root)
        & (Join-Path $PSScriptRoot 'restore_windows.ps1') -backup_root $plan.context.backup_root
    } else {
        write_typora_install_log $log INFO 'No compatible pre-install backup. Removing only the current managed startup entry; the current Typora host, preferences, themes and plugin data are preserved.'
        $attempt = invoke_typora_current_uninstall $plan $user_data
        write_typora_install_log $log INFO ("Startup backup: " + $attempt)
    }
    write_typora_install_log $log SUCCESS 'Typora Code uninstalled. Open Typora and select your previous theme. Documents, settings and backups are preserved.'
} catch {
    if ($null -ne $log) { write_typora_install_log $log ERROR $_.Exception.Message }
    throw
} finally {
    if ($owns_mutex) { $mutex.ReleaseMutex() }
    if ($null -ne $mutex) { $mutex.Dispose() }
}
