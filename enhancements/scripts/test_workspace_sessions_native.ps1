[CmdletBinding()]
param([string]$typora_root=$env:TYPORA_NATIVE_TEST_ROOT)
$ErrorActionPreference='Stop'
if (!$typora_root) { throw 'Set TYPORA_NATIVE_TEST_ROOT to the verified original Typora 1.14.10 installation.' }
$case_root = & python -X utf8 (Join-Path $PSScriptRoot 'prepare_stability_native.py') $typora_root workspace_sessions_native.js
if ($LASTEXITCODE -ne 0) { throw 'Native fixture preparation failed' }
$case_root = ($case_root | Select-Object -Last 1).Trim()
Write-Output ('Native evidence: ' + $case_root)
foreach ($phase in @(1,2)) {
 & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run_private_desktop.ps1') -case_root $case_root -wait_for_normal_exit
 if ($LASTEXITCODE -ne 0) { throw 'Private desktop failed' }
 $checks_file=Join-Path $case_root 'checks.json'
 if (!(Test-Path -LiteralPath $checks_file)) { throw ('Native fixture timed out: '+$case_root) }
 $checks=[IO.File]::ReadAllText($checks_file,[Text.Encoding]::UTF8)|ConvertFrom-Json
 if ($checks.status -ne 'PASS' -or $checks.phase -ne $phase) { throw ($checks | ConvertTo-Json -Depth 12) }
 $result_file=Join-Path $case_root 'result.json'
 $result=[IO.File]::ReadAllText($result_file,[Text.Encoding]::UTF8)|ConvertFrom-Json
 if ($result.wait_result -ne 0 -or $result.exit_code -ne 0) { throw 'Native process did not exit normally' }
 Copy-Item -LiteralPath $result_file -Destination (Join-Path $case_root ('result_phase_'+$phase+'.json'))
 $checks | ConvertTo-Json -Depth 12
 Move-Item -LiteralPath $checks_file -Destination (Join-Path $case_root ('checks_phase_'+$phase+'.json'))
}
