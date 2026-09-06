[CmdletBinding()]
param([string]$typora_root = '', [ValidateSet('reading', 'paths')][string]$suite = 'reading')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../../scripts/lib/typora_environment.ps1')
$typora_root = resolve_typora_windows_root -typora_root $typora_root -non_interactive
$window_file = Join-Path $typora_root 'resources/window.html'
$probe_root = Join-Path ([IO.Path]::GetTempPath()) ('typora_reading_test_' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probe_root | Out-Null
$fixture_name = if ($suite -eq 'paths') { 'file_path_native_test.js' } else { 'reading_native_test.js' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "../fixtures/$fixture_name") -Destination $probe_root
$source = @('# Source', '', '[Target](target.md#13.7_目标_标题)', '', '## Origin', '') + (1..90 | ForEach-Object { "Source paragraph $_.`n" }) + @('## 13.7_目标_标题', '') + (1..30 | ForEach-Object { "Source tail $_.`n" })
$target = @('# Destination', '') + (1..60 | ForEach-Object { "Target paragraph $_.`n" }) + @('## 13.7_目标_标题', '') + (1..30 | ForEach-Object { "Target tail $_.`n" })
[IO.File]::WriteAllLines((Join-Path $probe_root 'source.md'), $source, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllLines((Join-Path $probe_root 'target.md'), $target, [Text.UTF8Encoding]::new($false))
$phases = if ($suite -eq 'paths') { @(1) } else { @(1, 2) }
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
            if (((Get-Date) - $started).TotalSeconds -gt 50) { throw "Native test timed out. Evidence: $probe_root" }
            Start-Sleep -Milliseconds 200
        }
        $result = Get-Content -LiteralPath $result_file -Raw | ConvertFrom-Json
        $result | ConvertTo-Json -Depth 5
        if ($result.status -ne 'PASS') { throw "Native reading test failed. Evidence: $probe_root" }
        Start-Sleep -Milliseconds 500
    } finally {
        $current = [IO.File]::ReadAllText($window_file)
        [IO.File]::WriteAllText($window_file, $current.Replace($tag, ''), [Text.UTF8Encoding]::new($false))
    }
}
Write-Output "Native reading test evidence: $probe_root"
