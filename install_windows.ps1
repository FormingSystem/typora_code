<#
.SYNOPSIS
安装 Typora Code 工作台和主题，并输出恢复备份目录。
.DESCRIPTION
支持 Windows PowerShell 5.1。先保存文档，安装后正常重启 Typora。
完整环境、离线缓存、更新和恢复说明见 docs/installation.md。
.PARAMETER typora_root
Typora 安装目录、可执行文件或 resources/window.html；省略时自动发现。
.PARAMETER backup_root
可选的新备份目录，不能使用已存在的目录；省略时保存到用户数据目录。
.PARAMETER non_interactive
自动发现失败时立即报错，不等待输入。
#>
[CmdletBinding()]
param([string]$typora_root='', [string]$backup_root='', [switch]$non_interactive)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'scripts/install_workspace_windows.ps1') -typora_root $typora_root -backup_root $backup_root -non_interactive:$non_interactive -include_theme
Write-Host "Select 'cpp github consolas' from the Typora Theme menu. Existing preferences are preserved."
