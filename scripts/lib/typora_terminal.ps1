. (Join-Path $PSScriptRoot 'typora_locale.ps1')
# Fixed official Node is provided for terminal and update background processes, without modifying PATH or global Node environment.
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
    # Different user configurations still share the download cache; serial preparation and no overwrite of verified, possibly executing Node.
    $provider=[Security.Cryptography.SHA256]::Create()
    try {$cache_key=[BitConverter]::ToString($provider.ComputeHash([Text.Encoding]::UTF8.GetBytes(($cache_root.ToLowerInvariant()+'|'+$name)))).Replace('-','')} finally {$provider.Dispose()}
    $cache_mutex=[Threading.Mutex]::new($false,('Local\TyporaCodeNodeCache_'+$cache_key))
    $owns_cache=$false
    $partial=$null
    try {
    try {$owns_cache=$cache_mutex.WaitOne(120000)} catch [Threading.AbandonedMutexException] {$owns_cache=$true}
    if(!$owns_cache){throw 'Timed out waiting for the shared Node cache. Retry after the other installation finishes.'}
    $archive = Join-Path $cache_root ($name + '.zip')
    & $report ((get_typora_text -key 'checking_the_local_cache_for_node' -values @{value_0=$($release.version);value_1=$($release.arch)}))
    if (!(Test-Path -LiteralPath $archive -PathType Leaf) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $release.sha256) {
        $partial = Join-Path $cache_root ($name + '.' + [Guid]::NewGuid().ToString('N') + '.part')
        & $report (get_typora_text -key 'downloading_the_runtime_from_nodejs_org_the_first_installation_m')
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$($release.version)/$name.zip" -OutFile $partial
        & $report (get_typora_text -key 'download_complete_verifying_sha_256')
        if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $release.sha256) { throw 'Terminal Node archive digest mismatch; installation stopped.' }
        Move-Item -LiteralPath $partial -Destination $archive -Force
    } else { & $report (get_typora_text -key 'reusing_the_cache_verified_by_sha_256_no_download_is_needed') }
    & $report (get_typora_text -key 'extracting_and_verifying_runtime_files')
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $stage = Join-Path $cache_root ($name + '-verified')
    $target_directory = Join-Path $stage "node/$($release.version)"
    New-Item -ItemType Directory -Force -Path $target_directory | Out-Null
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    try {
        foreach ($filename in @('node.exe', 'LICENSE')) {
            $entry = $zip.GetEntry("$name/$filename")
            if (!$entry) { throw "Official Node archive is missing $filename" }
            $target=Join-Path $target_directory $filename
            $expected=if($filename -eq 'node.exe'){$release.executable_sha256}else{$release.license_sha256}
            if(!(Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $expected){
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
            }
        }
    } finally { $zip.Dispose() }
    $executable = Join-Path $target_directory 'node.exe'
    if ((Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $release.executable_sha256) { throw 'Terminal Node executable digest mismatch.' }
    if ((Get-FileHash -LiteralPath (Join-Path $target_directory 'LICENSE') -Algorithm SHA256).Hash -ne $release.license_sha256) { throw 'Terminal Node license digest mismatch.' }
    $assets = @()
    foreach ($filename in @('node.exe', 'LICENSE')) { $assets += [pscustomobject]@{ relative_path = "node/$($release.version)/$filename"; sha256 = (Get-FileHash -LiteralPath (Join-Path $target_directory $filename) -Algorithm SHA256).Hash } }
    & $report (get_typora_text -key 'the_runtime_is_ready')
    return [pscustomobject]@{ root = $stage; assets = $assets }
    } finally {try {if($partial -and (Test-Path -LiteralPath $partial -PathType Leaf)){[IO.File]::Delete($partial)}} finally {if($owns_cache){$cache_mutex.ReleaseMutex()};$cache_mutex.Dispose()}}
}

function assert_typora_node {
    param([string]$tools_root, [string]$runtime_root)
    $release = get_typora_node_release $tools_root
    $executable = Join-Path $runtime_root "node/$($release.version)/node.exe"
    if (!(Test-Path -LiteralPath $executable -PathType Leaf) -or (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $release.executable_sha256) { throw 'Private terminal Node runtime is missing or has changed.' }
    $license = Join-Path $runtime_root "node/$($release.version)/LICENSE"
    if (!(Test-Path -LiteralPath $license -PathType Leaf) -or (Get-FileHash -LiteralPath $license -Algorithm SHA256).Hash -ne $release.license_sha256) { throw 'Node runtime license is missing or has changed.' }
}
