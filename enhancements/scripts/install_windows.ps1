[CmdletBinding()]
param(
    [string]$typora_root = "",
    [string]$backup_root = "",
    [switch]$non_interactive
)

$ErrorActionPreference = "Stop"

function get_sha256([string]$path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
}

function restore_managed_file([string]$target, [bool]$existed, [string]$backup, [string]$timestamp) {
    if ($existed) {
        Copy-Item -LiteralPath $backup -Destination $target -Force
    } elseif (Test-Path -LiteralPath $target -PathType Leaf) {
        Move-Item -LiteralPath $target -Destination (Join-Path (Split-Path -Parent $target) ("disabled_" + $timestamp + "_" + [guid]::NewGuid().ToString("N")))
    }
}

$typora_tools_root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$environment_helper = Join-Path $typora_tools_root "scripts\lib\typora_environment.ps1"
if (-not (Test-Path -LiteralPath $environment_helper -PathType Leaf)) {
    throw "Typora environment helper is missing: $environment_helper"
}
. $environment_helper
. (Join-Path $typora_tools_root "scripts\lib\typora_workspace.ps1")

$typora_root = resolve_typora_windows_root -typora_root $typora_root -non_interactive:$non_interactive
$window_html = Join-Path $typora_root "resources\window.html"
$user_data = get_typora_windows_user_data
$community_root = Join-Path $user_data "plugins"
$community_vendor = Join-Path $typora_tools_root "enhancements\vendor\typora_workspace"
$community_assets = @(get_typora_workspace_assets $community_vendor)
$plugin_id = "forming_system.linux_note_enhancements"
$plugin_source = Join-Path $typora_tools_root "enhancements\dist\community_plugin"
$plugin_target = Join-Path $community_root "plugins\$plugin_id"
$plugin_assets = @(get_typora_community_plugin_assets $plugin_source)
$plugin_settings = Join-Path $community_root "settings\plugins.json"
$terminal_vendor = Join-Path $typora_tools_root "enhancements\dist\terminal_runtime"
$terminal_target = Join-Path $user_data "linux_note_enhancements\terminal_runtime"
. (Join-Path $typora_tools_root "scripts\lib\typora_terminal.ps1")
$node_stage = prepare_typora_node $typora_tools_root
$terminal_assets = @(get_typora_terminal_assets $terminal_vendor)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
if ([string]::IsNullOrWhiteSpace($backup_root)) {
    $backup_root = Join-Path $user_data "backups\linux_note_typora_enhancements\$timestamp"
}
$window_backup = Join-Path $backup_root "window.html"
$community_backup = Join-Path $backup_root "community_core"
$plugin_backup = Join-Path $backup_root "community_plugin"
$settings_backup = Join-Path $backup_root "plugins.json"
$terminal_backup = Join-Path $backup_root "terminal_runtime"
$manifest_path = Join-Path $backup_root "manifest.json"
$official_tag = '<script src="typora://app/userData/plugins/loader.js" type="module"></script>'
$official_pattern = '<script\s+src="typora://app/userData/plugins/loader\.js"\s+type="module"></script>'
$legacy_pattern = '<script\s+defer\s+src="typora://app/userData/linux_note_enhancements/typora_enhancements\.js"\s+data-linux-note-enhancements="true"></script>'

foreach ($required in @($window_html, (Join-Path $plugin_source "main.js"), (Join-Path $plugin_source "manifest.json"))) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required file is missing: $required" }
}
assert_typora_workspace_assets -asset_root $community_vendor -assets $community_assets
assert_typora_workspace_assets -asset_root $plugin_source -assets $plugin_assets
assert_typora_workspace_assets -asset_root $terminal_vendor -assets $terminal_assets
$plugin_manifest = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $plugin_source "manifest.json") -Raw | ConvertFrom-Json
if ($plugin_manifest.id -ne $plugin_id -or $plugin_manifest.minCoreVersion -ne "2.10.15") {
    throw "Community plugin manifest identity or core version is invalid."
}

$window_source = [System.IO.File]::ReadAllText($window_html)
$window_source = [regex]::Replace($window_source, $legacy_pattern, "")
$window_source = [regex]::Replace($window_source, $official_pattern, "")
if (-not $window_source.Contains("</body>")) {
    throw "Typora resources/window.html does not contain </body>; installation stopped before overwrite."
}
$window_source = $window_source.Replace("</body>", "$official_tag</body>")

New-Item -ItemType Directory -Force -Path $backup_root | Out-Null
Copy-Item -LiteralPath $window_html -Destination $window_backup
$settings_existed = Test-Path -LiteralPath $plugin_settings -PathType Leaf
if (Test-Path -LiteralPath $plugin_settings -PathType Container) { throw "Plugin settings target is a directory: $plugin_settings" }
if ($settings_existed) { Copy-Item -LiteralPath $plugin_settings -Destination $settings_backup }
$community_records = @(backup_typora_workspace -asset_root $community_root -backup_root $community_backup -assets $community_assets)
$plugin_records = @(backup_typora_workspace -asset_root $plugin_target -backup_root $plugin_backup -assets $plugin_assets)
$terminal_records = @(backup_typora_workspace -asset_root $terminal_target -backup_root $terminal_backup -assets @($terminal_assets + $node_stage.assets))

try {
    install_typora_workspace -vendor_root $node_stage.root -asset_root $terminal_target -assets $node_stage.assets
    install_typora_workspace -vendor_root $terminal_vendor -asset_root $terminal_target -assets $terminal_assets
    install_typora_workspace -vendor_root $community_vendor -asset_root $community_root -assets $community_assets
    install_typora_workspace -vendor_root $plugin_source -asset_root $plugin_target -assets $plugin_assets
    update_typora_plugin_settings -settings_path $plugin_settings -backup_path $settings_backup -operation enable
    [System.IO.File]::WriteAllText($window_html, $window_source, [System.Text.UTF8Encoding]::new($false))

    $installed_source = [System.IO.File]::ReadAllText($window_html)
    if (([regex]::Matches($installed_source, [regex]::Escape($official_tag))).Count -ne 1) {
        throw "Expected one official Typora Community Plugin loader entry after installation."
    }
    if (([regex]::Matches($installed_source, $legacy_pattern)).Count -ne 0) {
        throw "Legacy linux-note bootstrap entry remains after installation."
    }
    assert_typora_workspace_assets -asset_root $community_root -assets $community_assets
    assert_typora_workspace_assets -asset_root $plugin_target -assets $plugin_assets

    $manifest = [ordered]@{
        schema_version = 2
        installed_at = (Get-Date).ToString("o")
        typora_root = $typora_root
        typora_version = get_typora_windows_version $typora_root
        window_html = $window_html
        window_backup = $window_backup
        window_before_sha256 = get_sha256 $window_backup
        window_after_sha256 = get_sha256 $window_html
        community_root = $community_root
        community_assets = $community_records
        plugin_id = $plugin_id
        plugin_target = $plugin_target
        plugin_assets = $plugin_records
        plugin_settings = $plugin_settings
        plugin_settings_existed = $settings_existed
        plugin_settings_backup = if ($settings_existed) { $settings_backup } else { $null }
        terminal_assets = $terminal_records
    }
    [System.IO.File]::WriteAllText($manifest_path, ($manifest | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
} catch {
    restore_typora_workspace -asset_root $terminal_target -backup_root $terminal_backup -records $terminal_records -timestamp $timestamp
    restore_managed_file -target $plugin_settings -existed $settings_existed -backup $settings_backup -timestamp $timestamp
    restore_typora_workspace -asset_root $plugin_target -backup_root $plugin_backup -records $plugin_records -timestamp $timestamp
    restore_typora_workspace -asset_root $community_root -backup_root $community_backup -records $community_records -timestamp $timestamp
    Copy-Item -LiteralPath $window_backup -Destination $window_html -Force
    throw
}

Write-Host "Typora enhancements installed as a Typora Community Plugin."
Write-Host "Typora version: $($manifest.typora_version)"
Write-Host "Typora root: $typora_root"
Write-Host "Plugin: $plugin_target"
Write-Host "Backup: $backup_root"
Write-Host "Restart Typora after saving open documents."
Write-Host "Integrated terminal: xterm.js + node-pty ConPTY (Windows 10 1903+, x64/ARM64). Administrator terminal uses Windows UAC."
