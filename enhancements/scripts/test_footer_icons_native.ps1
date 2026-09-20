[CmdletBinding()]
param([string]$typora_root=$env:TYPORA_NATIVE_TEST_ROOT)
$ErrorActionPreference='Stop'
if (!$typora_root) { throw 'Set TYPORA_NATIVE_TEST_ROOT to verified Typora 1.14.10.' }
$case_root = & python -X utf8 (Join-Path $PSScriptRoot 'prepare_stability_native.py') $typora_root footer_icons_native.js
if ($LASTEXITCODE -ne 0) { throw 'Native fixture preparation failed' }
$case_root = ($case_root | Select-Object -Last 1).Trim()
Write-Output ('Native evidence: '+$case_root)
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run_private_desktop.ps1') -case_root $case_root
if ($LASTEXITCODE -ne 0) { throw 'Private desktop failed' }
$checks_file=Join-Path $case_root 'checks.json'
if (!(Test-Path -LiteralPath $checks_file)) { throw ('Native fixture timed out: '+$case_root) }
$checks=[IO.File]::ReadAllText($checks_file,[Text.Encoding]::UTF8)|ConvertFrom-Json
if ($checks.status -ne 'PASS') { throw ($checks|ConvertTo-Json -Depth 12) }
$checks|ConvertTo-Json -Depth 12
