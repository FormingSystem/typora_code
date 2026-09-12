[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$backup_root)
$ErrorActionPreference = 'Stop'
$tools_root = Split-Path -Parent $PSScriptRoot
. (Join-Path $tools_root 'scripts/lib/typora_environment.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_workspace.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_terminal.ps1')
$context = get_typora_restore_context $backup_root
$profile_stage = prepare_typora_node $tools_root
$profile_node = Join-Path $profile_stage.root ($profile_stage.assets | Where-Object { $_.relative_path.EndsWith('/node.exe') } | Select-Object -First 1).relative_path
$profile_path = resolve_typora_asset_path (get_typora_windows_user_data) 'profile.data'
$profile_before = invoke_typora_native_profile $profile_node $tools_root snapshot $profile_path
$null = invoke_typora_native_profile $profile_node $tools_root snapshot (Join-Path $context.backup_root 'native_profile/profile.data')
$profile_changed = $false
$backup_root = $context.backup_root
# 全部源和目标先校验，再保存恢复前状态；恢复失败可撤销这次恢复。
$attempt = Join-Path $backup_root ('restore_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $attempt | Out-Null
Copy-Item -LiteralPath $context.window -Destination (Join-Path $attempt 'window.html')
foreach ($group in $context.groups) {
    $before = @(backup_typora_workspace $group.root (Join-Path $attempt $group.name) $group.records)
    $group | Add-Member -NotePropertyName before -NotePropertyValue $before
}
try {
    foreach ($group in $context.groups) {
        if ($group.name -eq 'native_profile') { continue }
        if ($group.name -eq 'settings') {
            update_typora_plugin_settings (Join-Path $group.root 'plugins.json') (Join-Path $backup_root 'settings/plugins.json') restore
        } else { restore_typora_workspace $group.root (Join-Path $backup_root $group.name) $group.records '' }
    }
    $profile_result = invoke_typora_native_profile $profile_node $tools_root restore $profile_path $profile_before.sha256 (Join-Path $backup_root 'native_profile/profile.data')
    $profile_changed = $profile_result.changed
    Copy-Item -LiteralPath (Join-Path $backup_root 'window.html') -Destination $context.window -Force
} catch {
    $failure = $_
    foreach ($group in $context.groups) { if ($group.name -ne 'native_profile') { restore_typora_workspace $group.root (Join-Path $attempt $group.name) $group.before '' } }
    if ($profile_changed) { $current_profile = invoke_typora_native_profile $profile_node $tools_root snapshot $profile_path; $null = invoke_typora_native_profile $profile_node $tools_root restore $profile_path $current_profile.sha256 (Join-Path $attempt 'native_profile/profile.data') }
    Copy-Item -LiteralPath (Join-Path $attempt 'window.html') -Destination $context.window -Force
    throw $failure
}
Write-Host 'TyporaCode installation restored. Workspace settings, document state and other user data are preserved.'
