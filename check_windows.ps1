<#
.SYNOPSIS
只读核验当前安装与本下载包的启动入口、主题和运行资产是否一致。
.DESCRIPTION
失败会返回非零退出码。不会安装、修复或重启 Typora。
完整说明见 docs/installation.md。
#>
[CmdletBinding()]
param([string]$typora_root='', [switch]$non_interactive)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/lib/typora_environment.ps1')
. (Join-Path $PSScriptRoot 'scripts/lib/typora_workspace.ps1')
. (Join-Path $PSScriptRoot 'scripts/lib/typora_terminal.ps1')
$typora_root = resolve_typora_windows_root -typora_root $typora_root -non_interactive:$non_interactive
$user_data = get_typora_windows_user_data
$assets = @(assert_typora_release $PSScriptRoot)
foreach ($asset in get_typora_retired_product_assets) {
    if (Test-Path -LiteralPath (resolve_typora_asset_path (Join-Path $user_data 'typora_code') $asset.relative_path)) { throw "Retired product asset remains: $($asset.relative_path)" }
}
assert_typora_workspace_assets (Join-Path $user_data 'typora_code') $assets
if ((Get-FileHash -LiteralPath (Join-Path $user_data 'typora_code/SHA256SUMS') -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'enhancements/dist/SHA256SUMS') -Algorithm SHA256).Hash) { throw 'Installed release manifest differs.' }
$head = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'enhancements/runtime_head.html'), [Text.Encoding]::UTF8)
assert_typora_window_source ([IO.File]::ReadAllText((Join-Path $typora_root 'resources/window.html'), [Text.Encoding]::UTF8)) $head
assert_typora_migration_available $user_data
foreach ($asset in get_typora_migration_assets) {
    if (Test-Path -LiteralPath (resolve_typora_asset_path (Join-Path $user_data 'plugins') $asset.relative_path)) { throw "Old runtime asset remains: $($asset.relative_path)" }
}
$settings_path = Join-Path $user_data 'plugins/settings/plugins.json'
if (Test-Path -LiteralPath $settings_path -PathType Leaf) {
    $settings = [IO.File]::ReadAllText($settings_path, [Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($settings.PSObject.Properties['forming_system.linux_note_enhancements']) { throw 'Old product plugin registration remains.' }
}
$terminal = Join-Path $user_data 'linux_note_enhancements/terminal_runtime'
assert_typora_workspace_assets $terminal @(get_typora_terminal_assets (Join-Path $PSScriptRoot 'enhancements/dist/terminal_runtime'))
assert_typora_node $PSScriptRoot $terminal
$profile_node = Join-Path $terminal ('node/' + (get_typora_node_release $PSScriptRoot).version + '/node.exe')
$null = invoke_typora_native_profile $profile_node $PSScriptRoot check (resolve_typora_asset_path $user_data 'profile.data')
$theme = resolve_typora_asset_path $user_data 'themes/cpp_github-consolas.css'
if ((Get-FileHash -LiteralPath $theme -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'cpp_github-consolas.css') -Algorithm SHA256).Hash) { throw 'Installed theme differs from this release.' }
Write-Host 'status: OK (independent head startup, static CSS, release hashes, migration and terminal)'
