<# .SYNOPSIS
Restore Typora Code hosted files and native window settings from the specified backup.
.DESCRIPTION
Backup for the first installation is used for uninstallation, and subsequent backups are used for rolling back to an enhanced version.
Save the document and exit Typora. Retain workbench settings, reading records and other native preferences.
Do not restore old startup files across Typora versions. See docs/installation.md for details.
.PARAMETER backup_root
Includes the complete backup directory with manifest.json, must belong to the current user and installation location. #>
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$backup_root)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'scripts/restore_workspace_windows.ps1') -backup_root $backup_root
