[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"

function assert_equal($actual, $expected, [string]$message) {
    if ($actual -ne $expected) { throw "$message (actual: $actual; expected: $expected)" }
}
function assert_rejected([scriptblock]$operation, [string]$message) {
    $rejected = $false
    try { & $operation | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw $message }
}

# 所有写入都在新建临时目录；显式传入假安装位置并隔离 APPDATA。
$test_root = Join-Path ([System.IO.Path]::GetTempPath()) ("typora-install-test-" + [guid]::NewGuid().ToString('N'))
$tools_source = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tools_copy = Join-Path $test_root "portable checkout\tools\typora"
New-Item -ItemType Directory -Force -Path $tools_copy | Out-Null
foreach ($relative_path in @("configure_windows.ps1", "check_configuration_windows.ps1", "restore_configuration_windows.ps1", "cpp_github-consolas.css", "scripts", "enhancements\scripts", "enhancements\dist", "enhancements\vendor", "enhancements\bundle_markers.txt")) {
    $destination = Join-Path $tools_copy $relative_path
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path $tools_source $relative_path) -Destination $destination -Recurse
}
$fake_root = Join-Path $test_root "installation with spaces"
New-Item -ItemType Directory -Force -Path (Join-Path $fake_root "resources") | Out-Null
$window_path = Join-Path $fake_root "resources\window.html"
[System.IO.File]::WriteAllText((Join-Path $fake_root "Typora.exe"), "fixture")
[System.IO.File]::WriteAllText($window_path, "<html><body>fixture</body></html>")
$window_original = [System.IO.File]::ReadAllText($window_path)
$previous_appdata = $env:APPDATA
try {
    $env:APPDATA = Join-Path $test_root "user data"
    $user_data = Join-Path $env:APPDATA "Typora"
    $reading_store = Join-Path $user_data "Local Storage\leveldb\reading-position-fixture.log"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $reading_store) | Out-Null
    [System.IO.File]::WriteAllText($reading_store, "existing reading positions")
    $old_core = Join-Path $user_data "plugins\2.10.15\core.js"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $old_core) | Out-Null
    [System.IO.File]::WriteAllText($old_core, "previous core")
    & (Join-Path $tools_copy "configure_windows.ps1") -typora_root $fake_root -non_interactive
    & (Join-Path $tools_copy "check_configuration_windows.ps1") -typora_root $fake_root -non_interactive
    $installed_theme = Join-Path $user_data "themes\cpp_github-consolas.css"
    [System.IO.File]::AppendAllText($installed_theme, "/* stale theme fixture */")
    assert_rejected { & (Join-Path $tools_copy "check_configuration_windows.ps1") -typora_root $fake_root -non_interactive } "Stale theme passed installed checks"
    Copy-Item -LiteralPath (Join-Path $tools_copy "cpp_github-consolas.css") -Destination $installed_theme -Force
    $unified_backup = @(Get-ChildItem -LiteralPath (Join-Path $user_data "backups\linux_note_typora_configuration") -Directory)[0].FullName
    $installer = Join-Path $tools_copy "enhancements\scripts\install_windows.ps1"
    & $installer -typora_root $fake_root -backup_root (Join-Path $test_root "repeat backup") -non_interactive
    assert_equal ([regex]::Matches([System.IO.File]::ReadAllText($window_path), 'data-linux-note-enhancements="true"').Count) 1 "Repeated installation duplicated the entry"
    assert_equal ([System.IO.File]::ReadAllText($reading_store)) "existing reading positions" "Installation changed reading positions"
    [System.IO.File]::AppendAllText($old_core, "corrupted")
    assert_rejected { & (Join-Path $tools_copy "check_configuration_windows.ps1") -typora_root $fake_root -non_interactive } "Asset corruption passed installed checks"
    & (Join-Path $tools_copy "restore_configuration_windows.ps1") -backup_root $unified_backup
    assert_equal ([System.IO.File]::ReadAllText($window_path)) $window_original "Entry restore failed"
    assert_equal ([System.IO.File]::ReadAllText($old_core)) "previous core" "Existing core was not restored"
    assert_equal ([System.IO.File]::ReadAllText($reading_store)) "existing reading positions" "Restore changed reading positions"
    assert_equal (Test-Path -LiteralPath (Join-Path $user_data "plugins\2.10.15\core.css")) $false "New assets remain active after restore"

    # 制造提交清单写入失败，检查已复制文件能回滚。
    $failed_backup = Join-Path $test_root "failed transaction"
    New-Item -ItemType Directory -Force -Path (Join-Path $failed_backup "manifest.json") | Out-Null
    assert_rejected { & $installer -typora_root $fake_root -backup_root $failed_backup -non_interactive } "Failed manifest write was not rejected"
    assert_equal ([System.IO.File]::ReadAllText($window_path)) $window_original "Rollback changed entry"
    assert_equal ([System.IO.File]::ReadAllText($old_core)) "previous core" "Rollback changed existing core"

    $source_core = Join-Path $tools_copy "enhancements\vendor\typora_workspace\2.10.15\core.js"
    [System.IO.File]::AppendAllText($source_core, "corrupted")
    $rejected_backup = Join-Path $test_root "rejected before mutation"
    assert_rejected { & $installer -typora_root $fake_root -backup_root $rejected_backup -non_interactive } "Corrupt release was installed"
    assert_equal (Test-Path -LiteralPath $rejected_backup) $false "Invalid assets triggered mutations"
    assert_equal ([System.IO.File]::ReadAllText($old_core)) "previous core" "Source validation changed installed core"
    Write-Host "PASS: portable install, repeat install, hash checks, restore, rollback and preflight rejection."
    Write-Host "Fixtures: $test_root"
} finally {
    $env:APPDATA = $previous_appdata
}
