[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$source_root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$test_root = Join-Path ([IO.Path]::GetTempPath()) ('typora-uninstall-' + [guid]::NewGuid().ToString('N'))
$package_root = Join-Path $test_root 'portable package [test]'
$previous_appdata = $env:APPDATA
$previous_cache = $env:TYPORA_TERMINAL_CACHE
$passed = $false
$script:checks = 0

function assert_equal($actual, $expected, [string]$message) {
    if ($actual -cne $expected) { throw "$message (actual: $actual; expected: $expected)" }
    $script:checks++
}
function assert_rejected([scriptblock]$operation, [string]$message_pattern) {
    $message = ''
    try { & $operation | Out-Null } catch { $message = $_.Exception.Message }
    if ($message -notmatch $message_pattern) { throw "Expected rejection '$message_pattern', got '$message'" }
    $script:checks++
}
function write_fixture([string]$path, [string]$text) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null
    [IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($false))
}
function profile_text([bool]$frameless, [string]$note) {
    $json = @{framelessWindow=$frameless;note=$note} | ConvertTo-Json -Compress
    return [BitConverter]::ToString([Text.Encoding]::UTF8.GetBytes($json)).Replace('-', '').ToLowerInvariant()
}
function saved_record([string]$directory, [string]$relative_path, [string]$text) {
    $path = Join-Path $directory $relative_path
    write_fixture $path $text
    return [pscustomobject]@{relative_path=$relative_path;existed=$true;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
}
function new_backup([string]$directory, [string]$installation, [bool]$update=$false) {
    write_fixture (Join-Path $installation 'Typora.exe') 'fixture, not an executable'
    write_fixture (Join-Path $installation 'resources/window.html') $installed
    $saved_window = if ($update) { $installed } else { $original }
    write_fixture (Join-Path $directory 'window.html') $saved_window
    $product = foreach ($name in $product_names) {
        if ($update) { saved_record (Join-Path $directory 'product') $name "previous:$name" }
        else { [pscustomobject]@{relative_path=$name;existed=$false;sha256=$null} }
    }
    $manifest = [ordered]@{
        schema_version=4;installed_at='2026-09-14T00:00:00+08:00';typora_root=$installation;user_data=$user_data
        window_sha256=(Get-FileHash -LiteralPath (Join-Path $directory 'window.html') -Algorithm SHA256).Hash.ToLowerInvariant()
        product=@($product);migration=@();terminal=@()
        theme=@(saved_record (Join-Path $directory 'theme') 'cpp_github-consolas.css' 'original theme')
        settings=@(saved_record (Join-Path $directory 'settings') 'plugins.json' '{}')
        native_profile=@(saved_record (Join-Path $directory 'native_profile') 'profile.data' (profile_text $false 'old note'))
    }
    write_fixture (Join-Path $directory 'manifest.json') ($manifest | ConvertTo-Json -Depth 20)
}
function snapshot {
    return (@(Get-ChildItem -LiteralPath $test_root -Recurse -Force | Sort-Object FullName | ForEach-Object {
        if ($_.PSIsContainer) { 'D:' + $_.FullName }
        else { 'F:' + $_.FullName + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    }) -join "`n")
}
function run_cmd([string]$arguments, [string]$input_text='') {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $env:ComSpec
    $info.Arguments = '/d /c ""' + (Join-Path $package_root 'uninstall_windows.cmd') + '" ' + $arguments + '"'
    $info.WorkingDirectory = $test_root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    try {
        $null = $process.Start()
        $output_task = $process.StandardOutput.ReadToEndAsync()
        $error_task = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.WriteLine($input_text)
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(45000)) { $process.Kill(); throw 'Isolated CMD fixture timed out.' }
        return [pscustomobject]@{code=$process.ExitCode;output=$output_task.Result;error=$error_task.Result}
    } finally { $process.Dispose() }
}

try {
    # 复制入口和事务到含空格、方括号的独立包；不读取或修改真实 APPDATA。
    foreach ($relative in @('uninstall_windows.cmd','uninstall_windows.ps1','restore_windows.ps1',
        'scripts/restore_workspace_windows.ps1','scripts/lib/typora_environment.ps1','scripts/lib/typora_workspace.ps1',
        'scripts/lib/typora_uninstall.ps1','scripts/lib/typora_terminal.ps1','scripts/lib/typora_native_profile.cjs','enhancements/node_runtime.json')) {
        $destination = Join-Path $package_root $relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
        Copy-Item -LiteralPath (Join-Path $source_root $relative) -Destination $destination
    }
    $env:APPDATA = Join-Path $test_root 'user data'
    $env:TYPORA_TERMINAL_CACHE = Join-Path $test_root 'node cache'
    $user_data = Join-Path $env:APPDATA 'Typora'
    $installation = Join-Path $test_root 'Typora installation'
    $other_installation = Join-Path $test_root 'other Typora'
    $backups = Join-Path $user_data 'backups/typora_code_configuration'
    $first = Join-Path $backups 'original backup'
    $update = Join-Path $backups 'newer update'
    $second = Join-Path $backups 'other installation'
    $original = '<html><head><title>fixture</title></head><body>document</body></html>'
    $installed = $original.Replace('</head>', '<!-- typora-code:begin --><script src="typora://app/userData/typora_code/workbench.js"></script><!-- typora-code:end --></head>')
    $product_names = @('workspace_core.js','workspace_core.css','workspace.css','workbench.js')
    . (Join-Path $package_root 'scripts/lib/typora_environment.ps1')
    . (Join-Path $package_root 'scripts/lib/typora_workspace.ps1')
    . (Join-Path $package_root 'scripts/lib/typora_uninstall.ps1')
    new_backup $first $installation
    new_backup $update $installation $true
    foreach ($name in $product_names) { write_fixture (Join-Path $user_data "typora_code/$name") "installed:$name" }
    $profile = Join-Path $user_data 'profile.data'
    write_fixture $profile (profile_text $true 'later preference')
    $settings = Join-Path $user_data 'typora_code/settings/workspace.json'
    $reading = Join-Path $user_data 'Local Storage/reading.log'
    $document = Join-Path $test_root 'notes.md'
    write_fixture $settings '{"custom":"keep"}'
    write_fixture $reading 'reading position 37'
    write_fixture $document '# 中文文档保持原字节'
    write_fixture (Join-Path $user_data 'themes/cpp_github-consolas.css') 'installed theme'

    $before = snapshot
    assert_equal (@(find_typora_uninstall_backups).Count) 1 'Update backup was treated as an uninstall candidate'
    assert_equal (select_typora_uninstall_context -non_interactive).backup_root $first 'Unique original backup not selected'
    assert_rejected { get_typora_uninstall_context $update } 'not a complete pre-install backup'
    assert_equal (snapshot) $before 'Read-only discovery or rejected update wrote files'

    new_backup $second $other_installation
    $before = snapshot
    assert_rejected { select_typora_uninstall_context -non_interactive } 'Several pre-install backups'
    assert_equal (select_typora_uninstall_context -typora_root $installation -non_interactive).backup_root $first 'Installation filter failed'
    assert_rejected { get_typora_uninstall_context -backup_root $first -typora_root $other_installation } 'another Typora installation'
    function Read-Host { return '' }
    try { assert_equal ($null -eq (select_typora_uninstall_context)) $true 'Blank input did not cancel' }
    finally { Remove-Item Function:\Read-Host }
    function Read-Host { return '2' }
    try { assert_equal (select_typora_uninstall_context).backup_root $second 'Candidate number was not accepted' }
    finally { Remove-Item Function:\Read-Host }
    function Get-Process { [pscustomobject]@{Path=(Join-Path $installation 'Typora.exe')} }
    try { assert_rejected { & (Join-Path $package_root 'uninstall_windows.ps1') -backup_root $first } 'Save your documents' }
    finally { Remove-Item Function:\Get-Process }
    assert_equal (snapshot) $before 'Cancelled, ambiguous, wrong-target or running-host request wrote files'

    $manifest_path = Join-Path $first 'manifest.json'
    $manifest_text = [IO.File]::ReadAllText($manifest_path, [Text.Encoding]::UTF8)
    $manifest = $manifest_text | ConvertFrom-Json
    $manifest.user_data = Join-Path $test_root 'another user'
    write_fixture $manifest_path ($manifest | ConvertTo-Json -Depth 20)
    assert_rejected { get_typora_uninstall_context $first } 'another user-data'
    assert_rejected { select_typora_uninstall_context -typora_root $installation -non_interactive } 'No valid pre-install backup'
    write_fixture $manifest_path $manifest_text
    $window = Join-Path $installation 'resources/window.html'
    write_fixture $window ($installed.Replace('fixture', 'upgraded host'))
    $before = snapshot
    assert_rejected { get_typora_uninstall_context $first } 'startup page changed'
    assert_equal (snapshot) $before 'Host mismatch changed files'
    write_fixture $window $installed
    write_fixture (Join-Path $first 'window.html') ($original + 'corruption')
    assert_rejected { get_typora_uninstall_context $first } 'integrity check failed'
    write_fixture (Join-Path $first 'window.html') $original
    write_fixture (Join-Path $first 'theme/cpp_github-consolas.css') 'corruption'
    assert_rejected { get_typora_uninstall_context $first } 'integrity check failed'
    write_fixture (Join-Path $first 'theme/cpp_github-consolas.css') 'original theme'
    $manifest = $manifest_text | ConvertFrom-Json
    $manifest.product += [pscustomobject]@{relative_path='../outside';existed=$false;sha256=$null}
    write_fixture $manifest_path ($manifest | ConvertTo-Json -Depth 20)
    assert_rejected { get_typora_uninstall_context $first } 'outside the managed product scope'
    write_fixture $manifest_path $manifest_text
    $custom = Join-Path $test_root 'custom backup [original]'
    new_backup $custom $installation
    assert_equal (select_typora_uninstall_context -backup_root $custom -non_interactive).backup_root $custom 'Custom backup was not accepted'

    $before = snapshot
    $failure = run_cmd ('-backup_root "' + $update + '" -non_interactive')
    assert_equal $failure.code 1 'CMD did not propagate failure exit code'
    assert_equal (snapshot) $before 'Failed CMD changed files'
    $cancelled = run_cmd ''
    assert_equal $cancelled.code 0 'Cancelling the CMD picker returned failure'
    assert_equal ($cancelled.output.Contains('uninstall cancelled.')) $true 'CMD did not report cancellation'
    assert_equal (snapshot) $before 'Cancelled CMD changed files'

    # 复用经过摘要校验的缓存副本，恢复事务仅在本测试的专属缓存中解压。
    . (Join-Path $package_root 'scripts/lib/typora_terminal.ps1')
    $release = get_typora_node_release $package_root
    $archive_name = "node-v$($release.version)-win-$($release.arch).zip"
    $existing_cache = if ($previous_cache) { $previous_cache } else { Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Typora/terminal_downloads' }
    $existing_archive = Join-Path $existing_cache $archive_name
    if (Test-Path -LiteralPath $existing_archive -PathType Leaf) {
        New-Item -ItemType Directory -Force -Path $env:TYPORA_TERMINAL_CACHE | Out-Null
        Copy-Item -LiteralPath $existing_archive -Destination (Join-Path $env:TYPORA_TERMINAL_CACHE $archive_name)
    }
    $null = prepare_typora_node $package_root
    $success = run_cmd ('-typora_root "' + $installation + '" -non_interactive')
    assert_equal $success.code 0 ("CMD uninstall failed: " + $success.error)
    assert_equal ($success.output.Contains('Typora Code uninstalled.')) $true 'CMD did not report completion'
    assert_equal ([IO.File]::ReadAllText($window)) $original 'Original startup page was not restored'
    foreach ($name in $product_names) { assert_equal (Test-Path -LiteralPath (Join-Path $user_data "typora_code/$name")) $false "Runtime still active: $name" }
    assert_equal ([IO.File]::ReadAllText($settings)) '{"custom":"keep"}' 'Workspace settings were changed'
    assert_equal ([IO.File]::ReadAllText($reading)) 'reading position 37' 'Reading data was changed'
    assert_equal ([IO.File]::ReadAllText($document, [Text.Encoding]::UTF8)) '# 中文文档保持原字节' 'Document was changed'
    assert_equal ([IO.File]::ReadAllText((Join-Path $user_data 'themes/cpp_github-consolas.css'))) 'original theme' 'Theme was not restored'
    assert_equal ([IO.File]::ReadAllText($profile)) (profile_text $false 'later preference') 'Native preference restore lost later preferences'
    assert_equal (Test-Path -LiteralPath $manifest_path) $true 'Original backup was deleted'
    assert_equal ([IO.File]::ReadAllText((Join-Path $other_installation 'resources/window.html'))) $installed 'Another installation was changed'
    $passed = $true
    Write-Host "Windows uninstall: $script:checks assertions passed (isolated CMD and PowerShell restore)."
} finally {
    $env:APPDATA = $previous_appdata
    $env:TYPORA_TERMINAL_CACHE = $previous_cache
    if ($passed) {
        $resolved_root = [IO.Path]::GetFullPath($test_root)
        $temporary_root = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if (-not $resolved_root.StartsWith($temporary_root, [StringComparison]::OrdinalIgnoreCase) -or
            (Split-Path -Leaf $resolved_root) -notmatch '^typora-uninstall-[a-f0-9]{32}$') { throw 'Unexpected fixture cleanup path.' }
        Remove-Item -LiteralPath $resolved_root -Recurse -Force
    } else { Write-Host "Failed fixtures preserved at: $test_root" }
}
