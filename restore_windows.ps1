<#
.SYNOPSIS
从指定安装备份恢复 Typora Code 托管文件与原生窗口设置。
.DESCRIPTION
首次安装前备份用于卸载，后续备份用于回退增强版本。
先保存文档并退出 Typora。保留工作台设置、阅读记录与其他原生偏好。
不要跨 Typora 版本恢复旧启动文件。详见 docs/installation.md。
.PARAMETER backup_root
包含 manifest.json 的完整备份目录，必须属于当前用户和安装位置。
#>
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$backup_root)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'scripts/restore_workspace_windows.ps1') -backup_root $backup_root
