[CmdletBinding()]
param([string]$typora_root='', [string]$backup_root='', [switch]$non_interactive, [switch]$include_theme)
$ErrorActionPreference = 'Stop'
$tools_root = Split-Path -Parent $PSScriptRoot
. (Join-Path $tools_root 'scripts/lib/typora_environment.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_workspace.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_terminal.ps1')
$typora_root = resolve_typora_windows_root -typora_root $typora_root -non_interactive:$non_interactive
$user_data = [IO.Path]::GetFullPath((get_typora_windows_user_data))
$source = Join-Path $tools_root 'enhancements/dist'
$assets = @(assert_typora_release $tools_root)
assert_typora_migration_available $user_data
$migrated_settings = get_typora_migrated_settings $user_data
$head = [IO.File]::ReadAllText((Join-Path $tools_root 'enhancements/runtime_head.html'), [Text.Encoding]::UTF8)
$window = resolve_typora_asset_path $typora_root 'resources/window.html'
$window_source = get_typora_window_source ([IO.File]::ReadAllText($window, [Text.Encoding]::UTF8)) $head
assert_typora_window_source $window_source $head
$terminal_source = Join-Path $source 'terminal_runtime'
$terminal_assets = @(get_typora_terminal_assets $terminal_source)
assert_typora_workspace_assets $terminal_source $terminal_assets
$theme_source = Join-Path $tools_root 'cpp_github-consolas.css'
if ($include_theme -and -not (Test-Path -LiteralPath $theme_source -PathType Leaf)) { throw 'Theme source is missing.' }
if (-not $backup_root) { $backup_root = Join-Path $user_data ('backups/typora_code_configuration/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N')) }
$backup_root = [IO.Path]::GetFullPath($backup_root)
$manifest_path = resolve_typora_asset_path $backup_root 'manifest.json'
if (Test-Path -LiteralPath $backup_root) { throw 'Use a new, empty backup destination for each transaction.' }
$node_stage = prepare_typora_node $tools_root
$profile_node = Join-Path $node_stage.root ($node_stage.assets | Where-Object { $_.relative_path.EndsWith('/node.exe') } | Select-Object -First 1).relative_path
$profile_path = resolve_typora_asset_path $user_data 'profile.data'
$profile_before = invoke_typora_native_profile $profile_node $tools_root snapshot $profile_path
$profile_changed = $false
$assets += [pscustomobject]@{relative_path='SHA256SUMS';sha256=(Get-FileHash -LiteralPath (Join-Path $source 'SHA256SUMS') -Algorithm SHA256).Hash}
$retired_assets = @(get_typora_retired_product_assets)
$groups = @(
    [pscustomobject]@{name='product';root=(Join-Path $user_data 'typora_code');assets=@($assets + $retired_assets)},
    [pscustomobject]@{name='migration';root=(Join-Path $user_data 'plugins');assets=@(get_typora_migration_assets)},
    [pscustomobject]@{name='terminal';root=(Join-Path $user_data 'linux_note_enhancements/terminal_runtime');assets=@($terminal_assets + $node_stage.assets)},
    [pscustomobject]@{name='settings';root=(Join-Path $user_data 'plugins/settings');assets=@([pscustomobject]@{relative_path='plugins.json'})},
    [pscustomobject]@{name='theme';root=(Join-Path $user_data 'themes');assets=$(if ($include_theme) { @([pscustomobject]@{relative_path='cpp_github-consolas.css'}) } else { @() })},
    [pscustomobject]@{name='native_profile';root=$user_data;assets=@([pscustomobject]@{relative_path='profile.data'})}
)
foreach ($group in $groups) {
    foreach ($asset in $group.assets) {
        $target = resolve_typora_asset_path $group.root $asset.relative_path
        if (Test-Path -LiteralPath $target -PathType Container) { throw "Managed file target is a directory: $target" }
    }
}
New-Item -ItemType Directory -Path $backup_root | Out-Null
Copy-Item -LiteralPath $window -Destination (Join-Path $backup_root 'window.html')
$manifest = [ordered]@{schema_version=4;installed_at=(Get-Date).ToString('o');typora_root=$typora_root;user_data=$user_data;window_sha256=(Get-FileHash -LiteralPath (Join-Path $backup_root 'window.html') -Algorithm SHA256).Hash.ToLowerInvariant()}
foreach ($group in $groups) {
    $records = @(backup_typora_workspace $group.root (Join-Path $backup_root $group.name) $group.assets)
    $group | Add-Member -NotePropertyName records -NotePropertyValue $records
    $manifest[$group.name] = $records
}
$settings_target = Join-Path $user_data 'typora_code/settings/workspace.json'
$created_settings = $false
try {
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
    if ($include_theme) { New-Item -ItemType Directory -Force -Path $groups[4].root | Out-Null; Copy-Item -LiteralPath $theme_source -Destination (resolve_typora_asset_path $groups[4].root 'cpp_github-consolas.css') -Force }
    [IO.File]::WriteAllText($window, $window_source, [Text.UTF8Encoding]::new($false))
    assert_typora_window_source ([IO.File]::ReadAllText($window, [Text.Encoding]::UTF8)) $head
    assert_typora_workspace_assets $groups[0].root $assets
    $profile_result = invoke_typora_native_profile $profile_node $tools_root install $profile_path $profile_before.sha256
    $profile_changed = $profile_result.changed
    [IO.File]::WriteAllText($manifest_path, ($manifest | ConvertTo-Json -Depth 100), [Text.UTF8Encoding]::new($false))
} catch {
    $failure = $_
    foreach ($group in $groups) { if ($group.name -ne 'native_profile') { restore_typora_workspace $group.root (Join-Path $backup_root $group.name) $group.records '' } }
    if ($profile_changed) { $current_profile = invoke_typora_native_profile $profile_node $tools_root snapshot $profile_path; $null = invoke_typora_native_profile $profile_node $tools_root restore $profile_path $current_profile.sha256 (Join-Path $backup_root 'native_profile/profile.data') }
    if ($created_settings -and (Test-Path -LiteralPath $settings_target -PathType Leaf)) { Move-Item -LiteralPath $settings_target -Destination ($settings_target + '.disabled.' + [guid]::NewGuid().ToString('N')) }
    Copy-Item -LiteralPath (Join-Path $backup_root 'window.html') -Destination $window -Force
    throw $failure
}
Write-Host 'TyporaCode independent workbench installed. Save documents and restart Typora.'
Write-Host "Backup: $backup_root"
