[CmdletBinding()]
param([string]$typora_root=$env:TYPORA_NATIVE_TEST_ROOT)
$ErrorActionPreference='Stop'
if(!$typora_root){throw 'Select the verified original Typora 1.14.10 installation.'}
foreach($target in @('workspace/front.md','workspace/context code.cpp','workspace')){
 $case_root=(& python -X utf8 (Join-Path $PSScriptRoot 'prepare_stability_native.py') $typora_root 'shell_open_native.js' | Select-Object -Last 1)
 if($LASTEXITCODE -ne 0){throw 'Native preparation failed.'}
 & (Join-Path $PSScriptRoot 'run_private_desktop.ps1') -case_root $case_root -open_target $target
 $checks=[IO.File]::ReadAllText((Join-Path $case_root 'checks.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
 if($checks.status -ne 'PASS'){throw ($checks|ConvertTo-Json -Depth 8)}
 Write-Output ('PASS: '+$target+'; evidence '+$case_root)
}
