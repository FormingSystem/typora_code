[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$backup_root)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'enhancements/scripts/restore_windows.ps1') -backup_root $backup_root
