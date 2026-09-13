# 日志与运行时消息回归只写临时目录，下载由本地 ZIP 替身提供，不启动 Typora。
$ErrorActionPreference='Stop'
$tools_root=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $tools_root 'scripts/lib/typora_install_log.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_terminal.ps1')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('typora-install-logging-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
$previous_cache=$env:TYPORA_TERMINAL_CACHE
try {
    $log=new_typora_install_log (Join-Path $fixture 'user data')
    $another=new_typora_install_log (Join-Path $fixture 'user data')
    if ($log.path -eq $another.path) { throw 'Installation logs must be unique' }
    $result=@(start_typora_install_step $log 1 '检查环境'; write_typora_install_log $log INFO '中文日志'; complete_typora_install_step $log)
    if ($result.Count) { throw 'Logger polluted function return values' }
    $text=[IO.File]::ReadAllText($log.path,[Text.UTF8Encoding]::new($false,$true))
    if ($text -notmatch '\[STEP 1/6\]' -or $text -notmatch '中文日志' -or $text -notmatch '用时') { throw 'Missing formatted UTF-8 log' }
    $locked=[IO.File]::Open($log.path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try { write_typora_install_log $log INFO '文件锁定时不阻断安装' } finally { $locked.Dispose() }
    if ($log.path) { throw 'Unwritable log must fall back to console' }
    $blocked=Join-Path $fixture 'blocked'
    New-Item -ItemType Directory -Path $blocked | Out-Null
    [IO.File]::WriteAllText((Join-Path $blocked 'logs'),'not a directory')
    $fallback=new_typora_install_log $blocked
    $fallback_directory=Join-Path ([IO.Path]::GetTempPath()) 'TyporaCode/install_logs'
    if ((Split-Path -Parent $fallback.path) -ne $fallback_directory) { throw 'Missing temporary log fallback' }

    # 微型测试归档只验证下载、摘要与消息链；不执行其中的替身 node.exe。
    $fixture_tools=Join-Path $fixture 'tools'
    $archive_root=Join-Path $fixture 'archive'
    $archive_arch=(get_typora_node_release $tools_root).arch
    $name="node-v1.0.0-win-$archive_arch"
    $archive_entry=Join-Path $archive_root $name
    New-Item -ItemType Directory -Path $archive_entry | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixture_tools 'enhancements') | Out-Null
    [IO.File]::WriteAllText((Join-Path $archive_entry 'node.exe'),'test fixture, not executable')
    [IO.File]::WriteAllText((Join-Path $archive_entry 'LICENSE'),'fixture license')
    Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
    $fixture_archive=Join-Path $fixture 'fixture.zip'
    $zip=[IO.Compression.ZipFile]::Open($fixture_archive,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($filename in @('node.exe','LICENSE')) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $archive_entry $filename),"$name/$filename") | Out-Null
        }
    } finally { $zip.Dispose() }
    $release=[ordered]@{version='1.0.0';license_sha256=(Get-FileHash -LiteralPath (Join-Path $archive_entry 'LICENSE')).Hash.ToLowerInvariant();archives=@{$archive_arch=@{
        sha256=(Get-FileHash -LiteralPath $fixture_archive).Hash.ToLowerInvariant()
        executable_sha256=(Get-FileHash -LiteralPath (Join-Path $archive_entry 'node.exe')).Hash.ToLowerInvariant()
    }}}
    [IO.File]::WriteAllText((Join-Path $fixture_tools 'enhancements/node_runtime.json'),($release|ConvertTo-Json -Depth 10))
    $env:TYPORA_TERMINAL_CACHE=Join-Path $fixture 'cache'
    $script:download_count=0
    $script:bad_download=$false
    function Invoke-WebRequest {
        param([switch]$UseBasicParsing,[string]$Uri,[string]$OutFile)
        if ($Uri -ne "https://nodejs.org/dist/v1.0.0/$name.zip") { throw 'Unexpected download target' }
        $script:download_count++
        if ($script:bad_download) { [IO.File]::WriteAllText($OutFile,'corrupted archive') }
        else { Copy-Item -LiteralPath $fixture_archive -Destination $OutFile }
    }
    $events=[Collections.Generic.List[string]]::new()
    $callback={param($message) $events.Add($message)}
    $prepared=@(prepare_typora_node $fixture_tools -report $callback)
    if ($prepared.Count -ne 1 -or $prepared[0].assets.Count -ne 2) { throw 'Progress messages corrupted runtime return value' }
    if ($script:download_count -ne 1 -or ($events -join "`n") -notmatch '下载完成' -or $events[$events.Count-1] -ne '运行时已就绪。') { throw 'Missing cold download progress' }
    $events.Clear()
    $null=prepare_typora_node $fixture_tools -report $callback
    if ($script:download_count -ne 1 -or ($events -join "`n") -notmatch '无须重新下载') { throw 'Cache hit must be reported without download' }
    $events.Clear()
    $script:bad_download=$true
    $env:TYPORA_TERMINAL_CACHE=Join-Path $fixture 'bad cache'
    $rejected=$false
    try { $null=prepare_typora_node $fixture_tools -report $callback } catch { $rejected=$true }
    if (-not $rejected -or ($events -join "`n") -match '运行时已就绪') { throw 'Invalid archive reported ready' }
    Write-Host 'PASS: per-run UTF-8 logs, output isolation, file lock fallback, download/cache progress and digest failure'
    Write-Host "Fixtures: $fixture"
} finally {
    $env:TYPORA_TERMINAL_CACHE=$previous_cache
}
