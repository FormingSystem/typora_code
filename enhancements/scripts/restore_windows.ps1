[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$backup_root
)

$ErrorActionPreference = "Stop"

$typora_tools_root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$environment_helper = Join-Path $typora_tools_root "scripts\lib\typora_environment.ps1"
if (-not (Test-Path -LiteralPath $environment_helper -PathType Leaf)) {
    throw "Typora environment helper is missing: $environment_helper"
}
. $environment_helper
. (Join-Path $typora_tools_root "scripts\lib\typora_workspace.ps1")

$backup_root = convert_typora_input_path $backup_root
$backup_root = (Resolve-Path -LiteralPath $backup_root).Path
$manifest_path = Join-Path $backup_root "manifest.json"
$window_backup = Join-Path $backup_root "window.html"
foreach ($required in @($manifest_path, $window_backup)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required backup file is missing: $required" }
}

$manifest = Get-Content -Encoding UTF8 -LiteralPath $manifest_path -Raw | ConvertFrom-Json
if ($manifest.schema_version -ne 2) { throw "Unsupported Typora enhancement backup schema: $($manifest.schema_version)" }
$user_data = get_typora_windows_user_data
$community_root = Join-Path $user_data "plugins"
$plugin_id = "forming_system.linux_note_enhancements"
$expected_plugin_target = Join-Path $community_root "plugins\$plugin_id"
$expected_settings = Join-Path $community_root "settings\plugins.json"
$resolved_typora_root = get_typora_root_from_candidate $manifest.window_html
$expected_window_html = if ($resolved_typora_root) { Join-Path $resolved_typora_root "resources\window.html" } else { $null }
if (-not $resolved_typora_root -or
    $manifest.window_html -ne $expected_window_html -or
    $manifest.community_root -ne $community_root -or
    $manifest.plugin_id -ne $plugin_id -or
    $manifest.plugin_target -ne $expected_plugin_target -or
    $manifest.plugin_settings -ne $expected_settings) {
    throw "Backup targets do not match the current validated Typora paths; restore stopped."
}
if (-not (Test-Path -LiteralPath $manifest.window_html -PathType Leaf)) {
    throw "Current Typora window.html is missing: $($manifest.window_html)"
}
if ($manifest.plugin_settings_existed -and -not (Test-Path -LiteralPath $manifest.plugin_settings_backup -PathType Leaf)) {
    throw "Recorded plugin settings backup is missing: $($manifest.plugin_settings_backup)"
}

$community_records = @($manifest.community_assets)
$plugin_records = @($manifest.plugin_assets)
$terminal_records = @($manifest.terminal_assets)
$community_backup = Join-Path $backup_root "community_core"
$plugin_backup = Join-Path $backup_root "community_plugin"
$terminal_backup = Join-Path $backup_root "terminal_runtime"
assert_typora_workspace_backup -backup_root $community_backup -records $community_records
assert_typora_workspace_backup -backup_root $plugin_backup -records $plugin_records
assert_typora_workspace_backup -backup_root $terminal_backup -records $terminal_records

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safety_backup = Join-Path $backup_root "window.before_restore.$timestamp.html"
Copy-Item -LiteralPath $manifest.window_html -Destination $safety_backup
restore_typora_workspace -asset_root (Join-Path $user_data "linux_note_enhancements\terminal_runtime") -backup_root $terminal_backup -records $terminal_records -timestamp $timestamp
update_typora_plugin_settings -settings_path $manifest.plugin_settings -backup_path (Join-Path $backup_root "plugins.json") -operation restore
restore_typora_workspace -asset_root $manifest.plugin_target -backup_root $plugin_backup -records $plugin_records -timestamp $timestamp
$other_plugins = @(Get-ChildItem -LiteralPath (Join-Path $community_root 'plugins') -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne $plugin_id -and (Test-Path -LiteralPath (Join-Path $_.FullName 'manifest.json') -PathType Leaf) })
if ($other_plugins.Count -eq 0) {
    restore_typora_workspace -asset_root $manifest.community_root -backup_root $community_backup -records $community_records -timestamp $timestamp
    Copy-Item -LiteralPath $window_backup -Destination $manifest.window_html -Force
} else {
    # 其他社区插件仍依赖共享核心，保留其官方入口，仅卸载本插件。
    $window_source = [IO.File]::ReadAllText($window_backup, [Text.Encoding]::UTF8)
    $window_source = [regex]::Replace($window_source, '<script\s+defer\s+src="typora://app/userData/linux_note_enhancements/typora_enhancements\.js"\s+data-linux-note-enhancements="true"></script>', '')
    $official_tag = '<script src="typora://app/userData/plugins/loader.js" type="module"></script>'
    if (-not $window_source.Contains($official_tag)) { $window_source = $window_source.Replace('</body>', "$official_tag</body>") }
    [IO.File]::WriteAllText($manifest.window_html, $window_source, [Text.UTF8Encoding]::new($false))
    Write-Host 'Other community plugins remain installed; shared loader/core retained.'
}

Write-Host "Typora Community Plugin entry and linux-note plugin restored."
Write-Host "Pre-restore safety copy: $safety_backup"
Write-Host "Restart Typora after saving open documents."
