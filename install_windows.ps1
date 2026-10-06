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
param([string]$typora_root='', [string]$backup_root='', [switch]$non_interactive, [string]$user_data='', [switch]$allow_elevation, [switch]$cli, [ValidateSet('keep','on','off')][string]$add_path='keep', [ValidateSet('keep','on','off')][string]$file_menu='keep', [ValidateSet('keep','on','off')][string]$folder_menu='keep', [ValidateSet('keep','on','off')][string]$modern_menu='keep')
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'scripts/install_workspace_windows.ps1') -typora_root $typora_root -backup_root $backup_root -non_interactive:$non_interactive -include_theme -user_data $user_data -allow_elevation:$allow_elevation
. (Join-Path $PSScriptRoot 'scripts/lib/typora_environment.ps1')
. (Join-Path $PSScriptRoot 'scripts/lib/typora_shell_integration.ps1')
if (!$user_data) {$user_data=get_typora_windows_user_data}
$previous=get_typora_shell_state $user_data
$refresh_modern=$previous.PSObject.Properties['modern_menu'] -and $previous.modern_menu
if ($add_path -ne 'keep' -or $file_menu -ne 'keep' -or $folder_menu -ne 'keep' -or $modern_menu -ne 'keep' -or $refresh_modern) {
    $typora_root=resolve_typora_windows_root -typora_root $typora_root -non_interactive
    try {set_typora_shell_integration -typora_root $typora_root -user_data $user_data -modern_menu $modern_menu -add_path $(if($add_path -ne 'keep'){$add_path -eq 'on'}else{$previous.add_path}) -file_menu $(if($file_menu -ne 'keep'){$file_menu -eq 'on'}else{$previous.file_menu}) -folder_menu $(if($folder_menu -ne 'keep'){$folder_menu -eq 'on'}else{$previous.folder_menu})}
    catch {throw ('Workbench installed, but shell integration failed: '+$_.Exception.Message)}
}
