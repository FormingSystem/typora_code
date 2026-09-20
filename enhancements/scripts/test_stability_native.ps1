# 专属宿主副本 + 私有桌面；无需关闭或重启用户窗口。
[CmdletBinding()]
param([string]$typora_root=$env:TYPORA_NATIVE_TEST_ROOT,
 [ValidateSet('stability_native.js','drag_windows_native.js')][string]$fixture='stability_native.js')
$ErrorActionPreference='Stop'
if (!$typora_root) { throw 'Set TYPORA_NATIVE_TEST_ROOT to the verified original Typora 1.14.10 installation.' }
$case_root = & python -X utf8 (Join-Path $PSScriptRoot 'prepare_stability_native.py') $typora_root $fixture
if ($LASTEXITCODE -ne 0) { throw 'Native fixture preparation failed' }
$case_root = ($case_root | Select-Object -Last 1).Trim()
Write-Output ('Native evidence: ' + $case_root)
& (Join-Path $PSScriptRoot 'run_private_desktop.ps1') -case_root $case_root
$checks_file=Join-Path $case_root 'checks.json'
if (!(Test-Path -LiteralPath $checks_file)) { throw ('Native fixture timed out: '+$case_root) }
$checks=[IO.File]::ReadAllText($checks_file,[Text.Encoding]::UTF8)|ConvertFrom-Json
if ($checks.status -ne 'PASS') { throw ($checks | ConvertTo-Json -Depth 12) }
$checks | ConvertTo-Json -Depth 12
