# Exclusive host copy + private desktop; no need to close or restart user window.
[CmdletBinding()]
param([string]$typora_root=$env:TYPORA_NATIVE_TEST_ROOT,
 [ValidateSet('stability_native.js','drag_windows_native.js','button_boundary_native.js','native_preferences_theme.js','reading_scroll_native.js','sidebar_resize_native.js','search_preview_native.js','image_layout_native.js','split_markdown_native.js','code_edit_stability_native.js')][string]$fixture='stability_native.js', [switch]$enable_gpu)
$ErrorActionPreference='Stop'
if (!$typora_root) { throw 'Set TYPORA_NATIVE_TEST_ROOT to the verified original Typora 1.14.10 installation.' }
$case_root = & python -X utf8 (Join-Path $PSScriptRoot 'prepare_stability_native.py') $typora_root $fixture
if ($LASTEXITCODE -ne 0) { throw 'Native fixture preparation failed' }
$case_root = ($case_root | Select-Object -Last 1).Trim()
Write-Output ('Native evidence: ' + $case_root)
& (Join-Path $PSScriptRoot 'run_private_desktop.ps1') -case_root $case_root -enable_gpu:$enable_gpu -wait_ms $(if ($fixture -in @('drag_windows_native.js','reading_scroll_native.js','sidebar_resize_native.js','search_preview_native.js','image_layout_native.js','split_markdown_native.js','code_edit_stability_native.js')) { 180000 } else { 60000 })
$checks_file=Join-Path $case_root 'checks.json'
if (!(Test-Path -LiteralPath $checks_file)) { throw ('Native fixture timed out: '+$case_root) }
$checks=[IO.File]::ReadAllText($checks_file,[Text.Encoding]::UTF8)|ConvertFrom-Json
if ($checks.status -ne 'PASS') { throw ($checks | ConvertTo-Json -Depth 12) }
$checks | ConvertTo-Json -Depth 12
