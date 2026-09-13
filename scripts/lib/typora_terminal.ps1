# 固定官方 Node 运行时仅供终端后台进程使用，不修改 PATH 或全局 Node 环境。
function get_typora_node_release {
    param([string]$tools_root)
    $release = [IO.File]::ReadAllText((Join-Path $tools_root 'enhancements/node_runtime.json')) | ConvertFrom-Json
    if ($release.version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') { throw 'Invalid terminal Node version.' }
    $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $arch = switch ($architecture) { 'AMD64' { 'x64' } 'ARM64' { 'arm64' } default { throw 'Integrated terminal supports Windows x64 and ARM64.' } }
    $entry = $release.archives.$arch
    if ($entry.sha256 -notmatch '^[a-f0-9]{64}$' -or $entry.executable_sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid terminal Node digest.' }
    return [pscustomobject]@{ version = $release.version; arch = $arch; sha256 = $entry.sha256; executable_sha256 = $entry.executable_sha256; license_sha256 = $release.license_sha256 }
}

function prepare_typora_node {
    param([string]$tools_root, [scriptblock]$report = { param($message) Write-Host $message })
    $release = get_typora_node_release $tools_root
    $cache_root = if ($env:TYPORA_TERMINAL_CACHE) { [IO.Path]::GetFullPath($env:TYPORA_TERMINAL_CACHE) } else { Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Typora/terminal_downloads' }
    New-Item -ItemType Directory -Force -Path $cache_root | Out-Null
    $name = "node-v$($release.version)-win-$($release.arch)"
    $archive = Join-Path $cache_root ($name + '.zip')
    & $report ("检查 Node $($release.version) / $($release.arch) 的本地缓存。")
    if (!(Test-Path -LiteralPath $archive -PathType Leaf) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $release.sha256) {
        $partial = Join-Path $cache_root ($name + '.' + [Guid]::NewGuid().ToString('N') + '.part')
        & $report '正在从 nodejs.org 下载运行时；首次安装可能需要几分钟，请保持此窗口打开。'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$($release.version)/$name.zip" -OutFile $partial
        & $report '下载完成，正在校验 SHA-256。'
        if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $release.sha256) { throw 'Terminal Node archive digest mismatch; installation stopped.' }
        Move-Item -LiteralPath $partial -Destination $archive -Force
    } else { & $report '已复用通过 SHA-256 校验的缓存，无须重新下载。' }
    & $report '正在解压并校验运行时文件。'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $stage = Join-Path $cache_root ($name + '-verified')
    $target_directory = Join-Path $stage "node/$($release.version)"
    New-Item -ItemType Directory -Force -Path $target_directory | Out-Null
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    try {
        foreach ($filename in @('node.exe', 'LICENSE')) {
            $entry = $zip.GetEntry("$name/$filename")
            if (!$entry) { throw "Official Node archive is missing $filename" }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $target_directory $filename), $true)
        }
    } finally { $zip.Dispose() }
    $executable = Join-Path $target_directory 'node.exe'
    if ((Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $release.executable_sha256) { throw 'Terminal Node executable digest mismatch.' }
    if ((Get-FileHash -LiteralPath (Join-Path $target_directory 'LICENSE') -Algorithm SHA256).Hash -ne $release.license_sha256) { throw 'Terminal Node license digest mismatch.' }
    $assets = @()
    foreach ($filename in @('node.exe', 'LICENSE')) { $assets += [pscustomobject]@{ relative_path = "node/$($release.version)/$filename"; sha256 = (Get-FileHash -LiteralPath (Join-Path $target_directory $filename) -Algorithm SHA256).Hash } }
    & $report '运行时已就绪。'
    return [pscustomobject]@{ root = $stage; assets = $assets }
}

function assert_typora_node {
    param([string]$tools_root, [string]$runtime_root)
    $release = get_typora_node_release $tools_root
    $executable = Join-Path $runtime_root "node/$($release.version)/node.exe"
    if (!(Test-Path -LiteralPath $executable -PathType Leaf) -or (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $release.executable_sha256) { throw 'Private terminal Node runtime is missing or has changed.' }
    $license = Join-Path $runtime_root "node/$($release.version)/LICENSE"
    if (!(Test-Path -LiteralPath $license -PathType Leaf) -or (Get-FileHash -LiteralPath $license -Algorithm SHA256).Hash -ne $release.license_sha256) { throw 'Node runtime license is missing or has changed.' }
}
