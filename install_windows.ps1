<# .SYNOPSIS
Install Typora Code workbench and theme, and output the restore backup directory.
.DESCRIPTION
Support Windows PowerShell 5.1. Save the document first, then restart Typora normally after installation.
Complete environment, offline cache, update and restore instructions see docs/installation.md.
.PARAMETER typora_root
Typora installation directory, executable files or resources/window.html; omitting automatically discovers.
.PARAMETER backup_root
Optional new backup directory, cannot use existing directories; omitting saves to user data directory.
.PARAMETER user_data
Actual Typora user data directory; omitting uses the default directory for the current account, automatically updates to the real location of the passed host.
.PARAMETER non_interactive
Immediately report an error if automatic discovery fails, without waiting for input.
.PARAMETER allow_elevation
Allow unattended entry to apply once Windows system authorization after confirming write permission is insufficient; interactive installation defaults to applying as needed. #>
[CmdletBinding()]
param([string]$typora_root='', [string]$backup_root='', [switch]$non_interactive, [string]$user_data='', [switch]$allow_elevation)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'scripts/install_workspace_windows.ps1') -typora_root $typora_root -backup_root $backup_root -non_interactive:$non_interactive -include_theme -user_data $user_data -allow_elevation:$allow_elevation
