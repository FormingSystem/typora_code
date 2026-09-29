[CmdletBinding()]
param([string]$typora_root='', [string]$backup_root='', [switch]$non_interactive, [switch]$include_theme, [string]$user_data='', [switch]$allow_elevation, [switch]$elevation_attempted, [switch]$managed_backup)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/typora_locale.ps1')

[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$tools_root = Split-Path -Parent $PSScriptRoot
. (Join-Path $tools_root 'scripts/lib/typora_environment.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_workspace.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_backup_retention.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_terminal.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_install_log.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_install_permissions.ps1')
$user_data = [IO.Path]::GetFullPath($(if($user_data){$user_data}else{get_typora_windows_user_data}))
$install_log = new_typora_install_log $user_data
$install_mutex=$null
$owns_mutex=$false
$rollback_state = 'not_required'
try {
start_typora_install_step $install_log 1 (get_typora_text -key 'checking_the_installation_environment')
$typora_root = resolve_typora_windows_root -typora_root $typora_root -non_interactive:$non_interactive
# Manual installation and background update share mutual exclusion to avoid backup and rollback overlap; process exit automatically releases.
$install_mutex=new_typora_install_mutex $user_data
try {$owns_mutex=$install_mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$owns_mutex=$true}
if(!$owns_mutex){throw 'Another Typora Code installation is running. Retry after it finishes.'}
write_typora_install_log $install_log INFO ((get_typora_text -key 'installation_directory') + $typora_root)
write_typora_install_log $install_log INFO ((get_typora_text -key 'user_data') + $user_data)
start_typora_install_step $install_log 2 (get_typora_text -key 'validating_the_package')
$source = Join-Path $tools_root 'enhancements/dist'
$assets = @(assert_typora_release $tools_root)
assert_typora_migration_available $user_data
$migrated_settings = get_typora_migrated_settings $user_data
$head = [IO.File]::ReadAllText((Join-Path $tools_root 'enhancements/runtime_head.html'), [Text.Encoding]::UTF8)
$window = resolve_typora_asset_path $typora_root 'resources/window.html'
$window_before = [IO.File]::ReadAllText($window, [Text.Encoding]::UTF8)
$window_source = get_typora_window_source $window_before $head
$window_changed = $window_source -cne $window_before
$window_written = $false
assert_typora_window_source $window_source $head
$terminal_source = Join-Path $source 'terminal_runtime'
$terminal_assets = @(get_typora_terminal_assets $terminal_source)
assert_typora_workspace_assets $terminal_source $terminal_assets
$theme_names = @('cpp_github-consolas.css','cpp_github-consolas_light.css','cpp_github-consolas_dark.css','vscode2026_light.css','vscode2026_dark.css')
if ($include_theme) { foreach ($name in $theme_names) { if (-not (Test-Path -LiteralPath (Join-Path $tools_root $name) -PathType Leaf)) { throw 'Theme source is missing.' } } }
if (-not $backup_root) { $managed_backup = $true; $backup_root = Join-Path $user_data ('backups/typora_code_configuration/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N')) }
$backup_root = [IO.Path]::GetFullPath($backup_root)
$manifest_path = resolve_typora_asset_path $backup_root 'manifest.json'
if (Test-Path -LiteralPath $backup_root) { throw 'Use a new, empty backup destination for each transaction.' }
write_typora_install_log $install_log INFO ((get_typora_text -key 'validated_workbench_assets_and_terminal_assets') -f $assets.Count, $terminal_assets.Count)
start_typora_install_step $install_log 3 (get_typora_text -key 'preparing_the_terminal_runtime')
$node_stage = prepare_typora_node $tools_root -report { param($message) write_typora_install_log $install_log INFO $message }
$profile_node = Join-Path $node_stage.root ($node_stage.assets | Where-Object { $_.relative_path.EndsWith('/node.exe') } | Select-Object -First 1).relative_path
$profile_path = resolve_typora_asset_path $user_data 'profile.data'
$profile_before = invoke_typora_native_profile $profile_node $tools_root snapshot $profile_path
$profile_changed = $false
$assets += [pscustomobject]@{relative_path='SHA256SUMS';sha256=(Get-FileHash -LiteralPath (Join-Path $source 'SHA256SUMS') -Algorithm SHA256).Hash}
$retired_assets = @(get_typora_retired_product_assets)
$groups = @(
    [pscustomobject]@{name='product';root=(Join-Path $user_data 'typora_code');assets=@($assets + $retired_assets + [pscustomobject]@{relative_path='installation.json'})},
    [pscustomobject]@{name='migration';root=(Join-Path $user_data 'plugins');assets=@(get_typora_migration_assets)},
    [pscustomobject]@{name='terminal';root=(Join-Path $user_data 'linux_note_enhancements/terminal_runtime');assets=@($terminal_assets + $node_stage.assets)},
    [pscustomobject]@{name='settings';root=(Join-Path $user_data 'plugins/settings');assets=@([pscustomobject]@{relative_path='plugins.json'})},
    [pscustomobject]@{name='theme';root=(Join-Path $user_data 'themes');assets=$(if ($include_theme) { @($theme_names | ForEach-Object { [pscustomobject]@{relative_path=$_} }) } else { @() })},
    [pscustomobject]@{name='native_profile';root=$user_data;assets=@([pscustomobject]@{relative_path='profile.data'})}
)
foreach ($group in $groups) {
    foreach ($asset in $group.assets) {
        $target = resolve_typora_asset_path $group.root $asset.relative_path
        if (Test-Path -LiteralPath $target -PathType Container) { throw "Managed file target is a directory: $target" }
    }
}
# Download and digest verification are still completed under the current account; decide whether system authorization is needed before backup and all hosting writes.
$write_targets = @($manifest_path)
if ($window_changed) { $write_targets += $window }
if ($null -ne $migrated_settings) { $write_targets += Join-Path $user_data 'typora_code/settings/workspace.json' }
foreach ($group in $groups) {
    foreach ($asset in $group.assets) {
        $target = resolve_typora_asset_path $group.root $asset.relative_path
        $exists = Test-Path -LiteralPath $target -PathType Leaf
        # Same digest rules as install_typora_workspace; loaded and unchanged Node/native modules do not need to be opened for writing.
        if ($group.name -in @('product','terminal') -and $null -ne $asset.PSObject.Properties['sha256']) {
            if ($exists -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $asset.sha256) { continue }
        } elseif ($group.name -in @('product','migration') -and -not $exists) { continue }
        $write_targets += $target
    }
}
$denied_paths = @(get_typora_write_denials $write_targets)
$permission_action = get_typora_permission_action $denied_paths (test_typora_administrator) ([bool]$elevation_attempted) (-not $non_interactive) ([bool]$allow_elevation)
if ($permission_action -ne 'continue') {
    write_typora_install_log $install_log WARN ((get_typora_text -key 'the_current_account_cannot_write_to_these_installation_targets') + ($denied_paths -join '; '))
    if ($window_changed) { write_typora_install_log $install_log INFO (get_typora_text -key 'the_workbench_must_update_resources_window_html_in_the_typora_in') }
    else { write_typora_install_log $install_log INFO (get_typora_text -key 'the_host_entry_is_unchanged_so_this_update_does_not_need_to_writ') }
    write_typora_install_log $install_log INFO ((get_typora_text -key 'keeping_the_original_user_directory') + $user_data + (get_typora_text -key 'backup') + $backup_root)
    if ($permission_action -eq 'blocked') { throw (get_typora_text -key 'the_administrator_or_already_authorized_process_still_cannot_wri') }
    if ($permission_action -eq 'unattended') { throw (get_typora_text -key 'unattended_installation_has_not_been_authorized_to_display_uac_r') }
    write_typora_install_log $install_log INFO (get_typora_text -key 'windows_administrator_authorization_will_be_requested_canceling')
    $install_mutex.ReleaseMutex(); $owns_mutex = $false
    $install_mutex.Dispose(); $install_mutex = $null
    $cache_root = Split-Path -Parent $node_stage.root
    $rollback_state = 'delegated'
    invoke_typora_elevated_install ([pscustomobject]@{installer=(Join-Path $tools_root 'scripts/install_workspace_windows.ps1');typora_root=$typora_root;user_data=$user_data;backup_root=$backup_root;cache_root=$cache_root;include_theme=[bool]$include_theme;managed_backup=[bool]$managed_backup})
    write_typora_install_log $install_log SUCCESS ((get_typora_text -key 'authorized_installation_completed_backup') + $backup_root)
    write_typora_install_log $install_log INFO (get_typora_text -key 'save_your_documents_and_restart_typora_normally_to_load_the_new')
    return
}
start_typora_install_step $install_log 4 (get_typora_text -key 'backing_up_existing_configuration')
write_typora_install_log $install_log INFO ('Backup: ' + $backup_root)
New-Item -ItemType Directory -Path $backup_root | Out-Null
Copy-Item -LiteralPath $window -Destination (Join-Path $backup_root 'window.html')
$manifest = [ordered]@{schema_version=4;installed_at=(Get-Date).ToString('o');typora_root=$typora_root;user_data=$user_data;window_sha256=(Get-FileHash -LiteralPath (Join-Path $backup_root 'window.html') -Algorithm SHA256).Hash.ToLowerInvariant()}
if ($managed_backup) { $manifest['retention'] = @{schema=1;kind=$(if(Test-Path -LiteralPath (Join-Path $user_data 'typora_code/assets/update/release.json')){'upgrade'}else{'baseline'})} }
foreach ($group in $groups) {
    $records = @(backup_typora_workspace $group.root (Join-Path $backup_root $group.name) $group.assets)
    $group | Add-Member -NotePropertyName records -NotePropertyValue $records
    $manifest[$group.name] = $records
}
$settings_target = Join-Path $user_data 'typora_code/settings/workspace.json'
$created_settings = $false
try {
    start_typora_install_step $install_log 5 (get_typora_text -key 'installing_the_workbench')
    install_typora_workspace $node_stage.root $groups[2].root $node_stage.assets
    install_typora_workspace $terminal_source $groups[2].root $terminal_assets
    install_typora_workspace $source $groups[0].root $assets
    foreach ($asset in $retired_assets) {
        $retired = resolve_typora_asset_path $groups[0].root $asset.relative_path
        if (Test-Path -LiteralPath $retired -PathType Leaf) { Remove-Item -LiteralPath $retired }
    }
    foreach ($asset in $groups[1].assets) {
        $target = resolve_typora_asset_path $groups[1].root $asset.relative_path
        if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target }
    }
    update_typora_plugin_settings (Join-Path $groups[3].root 'plugins.json') (Join-Path $backup_root 'settings/plugins.json') remove
    if ($null -ne $migrated_settings -and -not (Test-Path -LiteralPath $settings_target)) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $settings_target) | Out-Null
        [IO.File]::WriteAllText($settings_target, $migrated_settings, [Text.UTF8Encoding]::new($false))
        $created_settings = $true
    }
    if ($include_theme) { New-Item -ItemType Directory -Force -Path $groups[4].root | Out-Null; foreach ($name in $theme_names) { Copy-Item -LiteralPath (Join-Path $tools_root $name) -Destination (resolve_typora_asset_path $groups[4].root $name) -Force } }
    if ($window_changed) {
        # Registration begins upon writing; partial writing failure also must follow the original backup rollback.
        $window_written = $true
        [IO.File]::WriteAllText($window, $window_source, [Text.UTF8Encoding]::new($false))
    }
    start_typora_install_step $install_log 6 (get_typora_text -key 'verifying_the_installation')
    assert_typora_window_source ([IO.File]::ReadAllText($window, [Text.Encoding]::UTF8)) $head
    assert_typora_workspace_assets $groups[0].root $assets
    $profile_result = invoke_typora_native_profile $profile_node $tools_root install $profile_path $profile_before.sha256
    $profile_changed = $profile_result.changed
    $release = ([IO.File]::ReadAllText((Join-Path $source 'assets/update/release.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json).releases[0]
    $receipt = @{schema=1;install_id=[guid]::NewGuid().ToString('N');sequence=$release.sequence}
    [IO.File]::WriteAllText((Join-Path $groups[0].root 'installation.json'), ($receipt | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($manifest_path, ($manifest | ConvertTo-Json -Depth 100), [Text.UTF8Encoding]::new($false))
} catch {
    $failure = $_
    $rollback_state = 'running'
    write_typora_install_log $install_log WARN ((get_typora_text -key 'installation_did_not_complete_restoring_the_previous_state_reaso') + $failure.Exception.Message)
    try {
    foreach ($group in $groups) { if ($group.name -ne 'native_profile') { restore_typora_workspace $group.root (Join-Path $backup_root $group.name) $group.records '' } }
    if ($profile_changed) { $current_profile = invoke_typora_native_profile $profile_node $tools_root snapshot $profile_path; $null = invoke_typora_native_profile $profile_node $tools_root restore $profile_path $current_profile.sha256 (Join-Path $backup_root 'native_profile/profile.data') }
    if ($created_settings -and (Test-Path -LiteralPath $settings_target -PathType Leaf)) { Move-Item -LiteralPath $settings_target -Destination ($settings_target + '.disabled.' + [guid]::NewGuid().ToString('N')) }
    if ($window_written) { Copy-Item -LiteralPath (Join-Path $backup_root 'window.html') -Destination $window -Force }
    $rollback_state = 'completed'
    write_typora_install_log $install_log OK (get_typora_text -key 'this_installation_was_rolled_back_the_backup_has_been_preserved')
    } catch {
        $rollback_state = 'failed'
        write_typora_install_log $install_log ERROR ((get_typora_text -key 'automatic_rollback_did_not_complete') + $_.Exception.Message)
        write_typora_install_log $install_log INFO ((get_typora_text -key 'keep_the_backup_and_logs_for_recovery_backup') + $backup_root)
    }
    throw $failure
}
if ($managed_backup) {
    try { prune_typora_automatic_backups $backup_root $user_data $typora_root {param($message) write_typora_install_log $install_log INFO $message} }
    catch { write_typora_install_log $install_log WARN ((get_typora_text -key 'old_upgrade_backup_cleanup_did_not_complete_the_installation_res') + $_.Exception.Message) }
}
complete_typora_install_step $install_log
write_typora_install_log $install_log SUCCESS ((get_typora_text -key 'installation_completed_in_seconds') -f $install_log.clock.Elapsed.TotalSeconds)
write_typora_install_log $install_log INFO ('Backup: ' + $backup_root)
if ($install_log.path) { write_typora_install_log $install_log INFO ('Log: ' + $install_log.path) }
write_typora_install_log $install_log INFO (get_typora_text -key 'save_your_documents_and_restart_typora_normally_to_load_this_ins')
if ($include_theme) { write_typora_install_log $install_log INFO (get_typora_text -key 'select_vscode2026_light_or_vscode2026_dark_in_the_theme_menu_exi') }
} catch {
    write_typora_install_log $install_log ERROR ((get_typora_text -key 'failed') -f $install_log.step, $_.Exception.Message)
    if ($rollback_state -eq 'not_required') { write_typora_install_log $install_log INFO (get_typora_text -key 'installation_has_not_written_any_target_files_rollback_is_unnece') }
    if ($install_log.path) { write_typora_install_log $install_log INFO ('Log: ' + $install_log.path) }
    throw
} finally {
    if($owns_mutex){$install_mutex.ReleaseMutex()}
    if($null -ne $install_mutex){$install_mutex.Dispose()}
}
