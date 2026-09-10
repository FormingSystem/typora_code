[CmdletBinding()]
param([string]$typora_root='', [switch]$non_interactive)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'enhancements/scripts/install_windows.ps1') -typora_root $typora_root -non_interactive:$non_interactive -include_theme
Write-Host "Select 'cpp github consolas' from the Typora Theme menu. Existing preferences are preserved."
