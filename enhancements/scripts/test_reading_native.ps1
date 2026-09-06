[CmdletBinding()]
param([string]$typora_root = '', [ValidateSet('reading', 'paths', 'git', 'terminal')][string]$suite = 'reading')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../../scripts/lib/typora_environment.ps1')
$typora_root = resolve_typora_windows_root -typora_root $typora_root -non_interactive
$window_file = Join-Path $typora_root 'resources/window.html'
$probe_root = Join-Path ([IO.Path]::GetTempPath()) ('typora_reading_test_' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probe_root | Out-Null
$fixture_name = switch ($suite) { 'terminal' { 'terminal_native_test.js' } 'paths' { 'file_path_native_test.js' } 'git' { 'git_graph_native_test.js' } default { 'reading_native_test.js' } }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "../fixtures/$fixture_name") -Destination $probe_root
$source = @('# Source', '', '[Target](target.md#13.7_目标_标题)', '', '## Origin', '') + (1..90 | ForEach-Object { "Source paragraph $_.`n" }) + @('## 13.7_目标_标题', '') + (1..30 | ForEach-Object { "Source tail $_.`n" })
$target = @('# Destination', '') + (1..60 | ForEach-Object { "Target paragraph $_.`n" }) + @('## 13.7_目标_标题', '') + (1..30 | ForEach-Object { "Target tail $_.`n" })
[IO.File]::WriteAllLines((Join-Path $probe_root 'source.md'), $source, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllLines((Join-Path $probe_root 'target.md'), $target, [Text.UTF8Encoding]::new($false))
if ($suite -in @('git', 'terminal')) {
    function invoke_probe_git {
        & git -C $probe_root -c user.name=Typora_Test -c user.email=typora@example.invalid -c commit.gpgsign=false -c core.autocrlf=false -c core.hooksPath=.git/unused_hooks @args | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Git fixture setup failed: $args" }
    }
    invoke_probe_git init -b main
    invoke_probe_git add source.md target.md
    invoke_probe_git commit -m 'Initial <img src=x onerror=alert(1)>'
    invoke_probe_git checkout -b feature
    [IO.File]::WriteAllText((Join-Path $probe_root '中文 #%.md'), "branch`n", [Text.UTF8Encoding]::new($false))
    invoke_probe_git add -- '中文 #%.md'
    invoke_probe_git commit -m 'Feature commit'
    invoke_probe_git checkout main
    [IO.File]::AppendAllText((Join-Path $probe_root 'target.md'), "`nMain change`n", [Text.UTF8Encoding]::new($false))
    invoke_probe_git add target.md
    invoke_probe_git commit -m 'Main commit'
    invoke_probe_git merge --no-ff feature -m 'Merge feature'
    [IO.File]::AppendAllText((Join-Path $probe_root 'source.md'), "`nUncommitted draft`n", [Text.UTF8Encoding]::new($false))
}
$phases = if ($suite -eq 'reading') { @(1, 2) } else { @(1) }
foreach ($phase in $phases) {
    $script_uri = [Uri]::new((Join-Path $probe_root $fixture_name)).AbsoluteUri + '?phase=' + $phase
    $tag = '<script defer src="' + $script_uri + '" data-linux-note-reading-test="true"></script>'
    $original = [IO.File]::ReadAllText($window_file)
    if ($original.Contains('data-linux-note-reading-test')) { throw 'A native reading test is already installed.' }
    try {
        [IO.File]::WriteAllText($window_file, $original.Replace('</body>', $tag + '</body>'), [Text.UTF8Encoding]::new($false))
        $filename = if ($phase -eq 1) { 'source.md' } else { 'target.md' }
        Start-Process -FilePath (Join-Path $typora_root 'Typora.exe') -ArgumentList @('"' + (Join-Path $probe_root $filename) + '"') -WindowStyle Hidden
        $result_file = Join-Path $probe_root "result_$phase.json"
        $started = Get-Date
        while (!(Test-Path -LiteralPath $result_file)) {
            if (((Get-Date) - $started).TotalSeconds -gt 90) { throw "Native test timed out. Evidence: $probe_root" }
            Start-Sleep -Milliseconds 200
        }
        $result = [IO.File]::ReadAllText($result_file, [Text.Encoding]::UTF8) | ConvertFrom-Json
        $result | ConvertTo-Json -Depth 5
        if ($result.status -ne 'PASS') { throw "Native reading test failed. Evidence: $probe_root" }
        Start-Sleep -Milliseconds 500
    } finally {
        $current = [IO.File]::ReadAllText($window_file)
        [IO.File]::WriteAllText($window_file, $current.Replace($tag, ''), [Text.UTF8Encoding]::new($false))
    }
}
Write-Output "Native reading test evidence: $probe_root"
