[CmdletBinding()]
param([string]$typora_root=$env:TYPORA_NATIVE_TEST_ROOT)
$ErrorActionPreference='Stop'
if (!$typora_root) { throw 'Set TYPORA_NATIVE_TEST_ROOT to verified Typora 1.14.10.' }
foreach ($language in @('en','zh-cn')) {
    $case_root = & python -X utf8 (Join-Path $PSScriptRoot 'prepare_stability_native.py') $typora_root localization_native.js
    if ($LASTEXITCODE -ne 0) { throw 'Native fixture preparation failed' }
    $case_root = ($case_root | Select-Object -Last 1).Trim()
    Write-Output ('Native evidence: '+$case_root)
    [IO.File]::WriteAllText((Join-Path $case_root 'expected_locale.json'),('"'+$language+'"'),[Text.UTF8Encoding]::new($false))
    $settings_root=Join-Path $case_root 'user_data/typora_code/settings'
    [IO.Directory]::CreateDirectory($settings_root)|Out-Null
    [IO.File]::WriteAllText((Join-Path $settings_root 'workspace.json'),(@{version=1;settings=@{displayLang=$language}}|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run_private_desktop.ps1') -case_root $case_root
    if ($LASTEXITCODE -ne 0) { throw 'Private desktop failed' }
    $checks_file=Join-Path $case_root 'checks.json'
    if (!(Test-Path -LiteralPath $checks_file)) { throw ('Native fixture timed out: '+$case_root) }
    $checks=[IO.File]::ReadAllText($checks_file,[Text.Encoding]::UTF8)|ConvertFrom-Json
    if ($checks.status -ne 'PASS') { throw ($checks|ConvertTo-Json -Depth 12) }
    $checks|ConvertTo-Json -Depth 12
}
