[CmdletBinding()]
param([string]$typora_root=$env:TYPORA_NATIVE_TEST_ROOT)
$ErrorActionPreference='Stop'
if(!$typora_root){throw 'Select the verified original Typora 1.14.10 installation.'}
foreach($target in @('workspace/front.md','workspace/context code.cpp','workspace',('workspace/empty space & '+[char]0x4e2d+[char]0x6587))){
 $case_root=(& python -X utf8 (Join-Path $PSScriptRoot 'prepare_stability_native.py') $typora_root 'shell_open_native.js' | Select-Object -Last 1)
 if($LASTEXITCODE -ne 0){throw 'Native preparation failed.'}
 $profile_path=Join-Path $case_root 'user_data/profile.data'
 $profile=@{framelessWindow=$true;enableAutoSave=$false;restoreWhenLaunch='2';sidebar_tab='outline'}
 [IO.File]::WriteAllText($profile_path,([BitConverter]::ToString([Text.Encoding]::UTF8.GetBytes(($profile|ConvertTo-Json -Compress))).Replace('-','').ToLowerInvariant()),[Text.UTF8Encoding]::new($false))
 $other_folder=Join-Path $case_root 'previous folder';[IO.Directory]::CreateDirectory($other_folder)|Out-Null
 $other_file=Join-Path $other_folder 'previous.md';[IO.File]::WriteAllText($other_file,'# Previous workspace',[Text.UTF8Encoding]::new($false))
 $history=@{recentFolder=@(@{name='previous folder';path=$other_folder;date=1});recentDocument=@(@{name='previous.md';path=$other_file;date=1})}
 [IO.File]::WriteAllText((Join-Path $case_root 'user_data/history.data'),([BitConverter]::ToString([Text.Encoding]::UTF8.GetBytes(($history|ConvertTo-Json -Depth 5 -Compress))).Replace('-','').ToLowerInvariant()),[Text.UTF8Encoding]::new($false))
 if($target.StartsWith('workspace/empty')){[IO.Directory]::CreateDirectory((Join-Path $case_root $target))|Out-Null}
 & (Join-Path $PSScriptRoot 'run_private_desktop.ps1') -case_root $case_root -open_target $target -shell_directory_argument:($target -notmatch '\.(md|cpp)$')
 $checks=[IO.File]::ReadAllText((Join-Path $case_root 'checks.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
 if($checks.status -ne 'PASS'){throw ($checks|ConvertTo-Json -Depth 8)}
 Write-Output ('PASS: '+$target+'; evidence '+$case_root)
}
