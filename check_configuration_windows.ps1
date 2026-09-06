[CmdletBinding()]
param(
    [string]$typora_root = "",
    [switch]$non_interactive
)

$ErrorActionPreference = "Stop"

$environment_helper = Join-Path $PSScriptRoot "scripts\lib\typora_environment.ps1"
if (-not (Test-Path -LiteralPath $environment_helper -PathType Leaf)) {
    throw "Typora environment helper is missing: $environment_helper"
}
. $environment_helper
. (Join-Path $PSScriptRoot "scripts\lib\typora_workspace.ps1")
$typora_root = resolve_typora_windows_root -typora_root $typora_root -non_interactive:$non_interactive
$window_html = Join-Path $typora_root "resources\window.html"
$user_data = get_typora_windows_user_data
$theme = Join-Path $user_data "themes\cpp_github-consolas.css"
$bundle = Join-Path $user_data "linux_note_enhancements\typora_enhancements.js"

foreach ($required in @($window_html, $theme, $bundle)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Installed configuration file is missing: $required"
    }
}

$window_source = [System.IO.File]::ReadAllText($window_html)
$tag_count = ([regex]::Matches($window_source, 'data-linux-note-enhancements="true"')).Count
if ($tag_count -ne 1) {
    throw "Expected exactly one Typora enhancement entry, found $tag_count"
}

$repository_bundle = Join-Path $PSScriptRoot "enhancements\dist\typora_enhancements.js"
$repository_theme = Join-Path $PSScriptRoot "cpp_github-consolas.css"
if ((Get-FileHash -LiteralPath $theme -Algorithm SHA256).Hash -ne
    (Get-FileHash -LiteralPath $repository_theme -Algorithm SHA256).Hash) {
    throw "Installed theme differs from this repository's theme. Run configure_windows.cmd again."
}
$workspace_assets = @(get_typora_workspace_assets (Join-Path $PSScriptRoot "enhancements\vendor\typora_workspace"))
assert_typora_workspace_assets -asset_root (Join-Path $user_data "plugins") -assets $workspace_assets
assert_typora_bundle -bundle_path $bundle -markers_path (Join-Path $PSScriptRoot "enhancements\bundle_markers.txt")
if ((Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash -ne
    (Get-FileHash -LiteralPath $repository_bundle -Algorithm SHA256).Hash) {
    throw "Installed extension differs from this repository's prebuilt bundle. Run configure_windows.cmd again."
}

[pscustomobject]@{
    typora_version = get_typora_windows_version $typora_root
    enhancement_entries = $tag_count
    workspace_assets = $workspace_assets.Count
    git_graph_runtime = if (Get-Command git -CommandType Application -ErrorAction SilentlyContinue) { "Git available on PATH" } else { "Git missing on PATH; install Git to use Git Graph" }
    theme_sha256 = (Get-FileHash -LiteralPath $theme -Algorithm SHA256).Hash
    bundle_sha256 = (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash
    status = "OK"
} | Format-List
