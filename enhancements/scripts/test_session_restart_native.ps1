param([Parameter(Mandatory=$true)][string]$typora_root)
$ErrorActionPreference='Stop'
$case_root = & python -X utf8 (Join-Path $PSScriptRoot 'prepare_stability_native.py') $typora_root session_restart_native.js
if($LASTEXITCODE -ne 0){throw 'Native fixture preparation failed'}
$case_root=($case_root | Select-Object -Last 1).Trim()
Write-Output ('Native evidence: '+$case_root)
try {
foreach($phase in @(1,2)){
  $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'run_private_desktop.ps1'),'-case_root',$case_root,'-wait_for_normal_exit','-keep_test_work','-wait_ms','180000')
  if($phase -eq 2){$arguments+='-restore_session'}
  & powershell @arguments
  if($LASTEXITCODE -ne 0){throw 'Private desktop failed'}
  $checks=Get-Content -LiteralPath (Join-Path $case_root 'checks.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $result=Get-Content -LiteralPath (Join-Path $case_root 'result.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  Copy-Item -LiteralPath (Join-Path $case_root 'checks.json') -Destination (Join-Path $case_root ('checks_phase_'+$phase+'.json'))
  Copy-Item -LiteralPath (Join-Path $case_root 'result.json') -Destination (Join-Path $case_root ('result_phase_'+$phase+'.json'))
  if($checks.status -ne 'PASS' -or $checks.phase -ne $phase -or $result.wait_result -ne 0 -or $result.exit_code -ne 0){throw ($checks | ConvertTo-Json -Depth 8)}
  Write-Output ('PASS phase '+$phase+': '+$checks.checks.Count+' assertions')
}

} finally {
 & python -X utf8 (Join-Path $PSScriptRoot 'manage_test_artifacts.py') claim $case_root --pid $PID
 if($LASTEXITCODE -eq 0){ & python -X utf8 (Join-Path $PSScriptRoot 'manage_test_artifacts.py') finish $case_root --pid $PID }
}
