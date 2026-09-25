[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
function assert_equal($actual, $expected, [string]$message) { if ($actual -cne $expected) { throw "$message (actual: $actual; expected: $expected)" } }
function assert_rejected([scriptblock]$operation, [string]$message) { $rejected=$false; try { & $operation | Out-Null } catch { $rejected=$true }; if (-not $rejected) { throw $message } }
function write_fixture([string]$path, [string]$value) { New-Item -ItemType Directory -Force -Path (Split-Path -Parent $path) | Out-Null; [IO.File]::WriteAllText($path,$value,[Text.UTF8Encoding]::new($false)) }
function write_profile_fixture([string]$path, [object]$data) { write_fixture $path ([BitConverter]::ToString([Text.Encoding]::UTF8.GetBytes(($data | ConvertTo-Json -Depth 100 -Compress))).Replace('-', '').ToLowerInvariant()) }
function read_profile_fixture([string]$path) { $hex=[IO.File]::ReadAllText($path,[Text.Encoding]::UTF8); $bytes=New-Object byte[] ($hex.Length/2); for ($index=0; $index -lt $bytes.Length; $index++) { $bytes[$index]=[Convert]::ToByte($hex.Substring($index*2,2),16) }; return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json) }
$test_root = Join-Path ([IO.Path]::GetTempPath()) ('typora-direct-install-' + [guid]::NewGuid().ToString('N'))
$source_root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tools_copy = Join-Path $test_root 'portable checkout'
New-Item -ItemType Directory -Force -Path $tools_copy | Out-Null
foreach ($relative in @('install_windows.ps1','check_windows.ps1','restore_windows.ps1','uninstall_windows.ps1','cpp_github-consolas.css','cpp_github-consolas_light.css','cpp_github-consolas_dark.css','scripts','enhancements/scripts','enhancements/dist','enhancements/runtime_head.html','enhancements/bundle_markers.txt','enhancements/node_runtime.json')) {
    $destination=Join-Path $tools_copy $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path $source_root $relative) -Destination $destination -Recurse
}
$fake_root = Join-Path $test_root 'installation with spaces'
$window = Join-Path $fake_root 'resources/window.html'
write_fixture (Join-Path $fake_root 'Typora.exe') 'fixture'
$original = '<html><head><title>fixture</title></head><body>fixture<script src="typora://app/userData/plugins/loader.js" type="module"></script></body></html>'
write_fixture $window $original
$previous_appdata=$env:APPDATA
try {
    $env:APPDATA=Join-Path $test_root 'user data'
    $user_data=Join-Path $env:APPDATA 'Typora'
    $installer=Join-Path $tools_copy 'install_windows.ps1'
    $restore=Join-Path $tools_copy 'restore_windows.ps1'
    $checker=Join-Path $tools_copy 'check_windows.ps1'
    . (Join-Path $tools_copy 'scripts/lib/typora_workspace.ps1')
    $plugin_settings=Join-Path $user_data 'plugins/settings/plugins.json'
    write_fixture $plugin_settings '{"forming_system.linux_note_enhancements":true,"other.plugin":false,"nested":{"中文":[1,2,3]}}'
    $old_settings=Join-Path $user_data 'plugins/settings/core.json'
    write_fixture $old_settings '{"version":2,"settings":{"displayLang":"zh-cn","internalPlugin.enabledPlugins":["a"],"githubProxy":"private","downloader":{},"fontSize":14,"ribbonState":{"core.settings":true,"core.outline":false}}}'
    foreach ($asset in get_typora_migration_assets) { write_fixture (Join-Path $user_data ('plugins/' + $asset.relative_path)) ('old:'+$asset.relative_path) }
    $state=Join-Path $user_data 'Local Storage/leveldb/reading.log'
    write_fixture $state 'reading positions and Graph reviews'
    $retired=Join-Path $user_data 'typora_code/appearance_bootstrap.js'
    write_fixture $retired 'old appearance startup'
    $retired_grammars=@{}
    foreach ($name in @('assets/source_symbols/tree-sitter-c.wasm','assets/source_symbols/tree-sitter-cpp.wasm','assets/source_symbols/LICENSE_c','assets/source_symbols/LICENSE_cpp')) {
        $retired_grammars[$name]=[byte[]](@(0,97,115,109,0,255) + [Text.Encoding]::UTF8.GetBytes($name))
        $target=Join-Path $user_data ('typora_code/'+$name)
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        [IO.File]::WriteAllBytes($target,$retired_grammars[$name])
    }
    $unmanaged=Join-Path $user_data 'typora_code/assets/source_symbols/user-note.txt'
    write_fixture $unmanaged 'unmanaged content'
    $profile=Join-Path $user_data 'profile.data'
    write_profile_fixture $profile @{framelessWindow=$false;nested=@{text='中文';items=@(1,$false)};later=1}
    $backup=Join-Path $test_root 'first backup'
    $install_output=@(& $installer -typora_root $fake_root -backup_root $backup -non_interactive)
    assert_equal $install_output.Count 0 'Installation logs contaminated the success output stream'
    & $checker -typora_root $fake_root -non_interactive
    assert_equal (read_profile_fixture $profile).framelessWindow $true 'Native window preference was not installed'
    $profile_data=read_profile_fixture $profile; $profile_data.later=2; write_profile_fixture $profile $profile_data
    assert_equal (Test-Path -LiteralPath $retired) $false 'Retired bootstrap file remains'
    assert_equal ([IO.File]::ReadAllText((Join-Path $backup 'product/appearance_bootstrap.js'))) 'old appearance startup' 'Retired bootstrap not backed up'
    foreach ($name in $retired_grammars.Keys) {
        assert_equal (Test-Path -LiteralPath (Join-Path $user_data ('typora_code/'+$name))) $false ('Retired grammar/license remains: '+$name)
        assert_equal ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $backup ('product/'+$name))))) ([Convert]::ToBase64String($retired_grammars[$name])) ('Retired asset backup differs: '+$name)
    }
    assert_equal ([IO.File]::ReadAllText($unmanaged)) 'unmanaged content' 'Unrelated asset changed'
    $installed=[IO.File]::ReadAllText($window)
    assert_equal ([regex]::Matches($installed,'typora-code:begin').Count) 1 'Duplicate head'
    assert_equal ($installed.Contains('appearance_bootstrap.js')) $false 'Retired appearance bootstrap remains'
    assert_equal ([regex]::Matches($installed,'data-typora-code-style').Count) 2 'Styles not preloaded'
    foreach ($asset in get_typora_migration_assets) { assert_equal (Test-Path -LiteralPath (Join-Path $user_data ('plugins/'+$asset.relative_path))) $false 'Old runtime remains' }
    $settings=[IO.File]::ReadAllText($plugin_settings)|ConvertFrom-Json
    assert_equal ($null -eq $settings.PSObject.Properties['forming_system.linux_note_enhancements']) $true 'Old registration remains'
    assert_equal $settings.'other.plugin' $false 'Other settings changed'
    $new_settings=Join-Path $user_data 'typora_code/settings/workspace.json'
    $migrated=[IO.File]::ReadAllText($new_settings)|ConvertFrom-Json
    assert_equal $migrated.version 1 'Wrong settings schema'
    assert_equal $migrated.settings.displayLang 'zh-cn' 'Language lost'
    assert_equal $migrated.settings.fontSize 14 'Preference lost'
    assert_equal ($null -eq $migrated.settings.PSObject.Properties['githubProxy']) $true 'Marketplace setting remains'
    assert_equal ($null -eq $migrated.settings.ribbonState.PSObject.Properties['core.settings']) $true 'Plugin settings ribbon remains'
    write_fixture $new_settings '{"version":1,"settings":{"displayLang":"en","custom":"later"}}'
    & $installer -typora_root $fake_root -backup_root (Join-Path $test_root 'repeat backup') -non_interactive
    assert_equal ([IO.File]::ReadAllText($window)) $installed 'Repeat install changed head'
    assert_equal ([IO.File]::ReadAllText($new_settings)) '{"version":1,"settings":{"displayLang":"en","custom":"later"}}' 'Repeat install overwrote new settings'
    $changed_host=$installed.Replace('<title>fixture</title>','<title>updated host</title>')
    write_fixture $window $changed_host
    $attempts_before=@(Get-ChildItem -LiteralPath $backup -Directory).Count
    assert_rejected { & $restore -backup_root $backup } 'Changed host accepted by restore'
    assert_equal ([IO.File]::ReadAllText($window)) $changed_host 'Host rejection changed startup page'
    assert_equal (@(Get-ChildItem -LiteralPath $backup -Directory).Count) $attempts_before 'Host rejection created restore attempt'
    write_fixture $window $installed
    $product=Join-Path $user_data 'typora_code/workbench.js'
    [IO.File]::AppendAllText($product,'corrupted')
    assert_rejected { & $checker -typora_root $fake_root -non_interactive } 'Corrupted asset accepted'
    Copy-Item -LiteralPath (Join-Path $tools_copy 'enhancements/dist/workbench.js') -Destination $product -Force
    # 恢复源摘要错误和越界路径必须在任何目标写入之前拒绝。
    $saved_window=Join-Path $backup 'window.html'
    [IO.File]::AppendAllText($saved_window,'corrupted')
    assert_rejected { & $restore -backup_root $backup } 'Corrupted backup accepted'
    assert_equal ([IO.File]::ReadAllText($window)) $installed 'Rejected restore changed window'
    write_fixture $saved_window $original
    $manifest_path=Join-Path $backup 'manifest.json'
    $manifest_bytes=[IO.File]::ReadAllText($manifest_path)
    $manifest=$manifest_bytes|ConvertFrom-Json
    $manifest.product[0].relative_path='../outside.txt'
    write_fixture $manifest_path ($manifest|ConvertTo-Json -Depth 100)
    assert_rejected { & $restore -backup_root $backup } 'Traversal backup accepted'
    write_fixture $manifest_path $manifest_bytes
    $settings | Add-Member -NotePropertyName 'later.plugin' -NotePropertyValue $true
    write_fixture $plugin_settings ($settings|ConvertTo-Json -Depth 100)
    assert_rejected { & $installer -typora_root $fake_root -backup_root (Join-Path $test_root 'conflict') -non_interactive } 'Other active plugin accepted'
    assert_equal (Test-Path -LiteralPath (Join-Path $test_root 'conflict')) $false 'Conflict caused mutation'
    $global:typora_test_restore_failed=$false
    $global:typora_test_restore_window=$window
    function global:Copy-Item {
        [CmdletBinding()]param([string]$LiteralPath,[string]$Destination,[switch]$Force,[switch]$Recurse)
        if (-not $global:typora_test_restore_failed -and $Destination -eq $global:typora_test_restore_window) { $global:typora_test_restore_failed=$true; throw 'Injected restore failure' }
        Microsoft.PowerShell.Management\Copy-Item @PSBoundParameters
    }
    try { assert_rejected { & $restore -backup_root $backup } 'Restore fault was ignored' }
    finally { Remove-Item Function:\Copy-Item }
    assert_equal $global:typora_test_restore_failed $true 'Fault did not reach restore'
    assert_equal (read_profile_fixture $profile).framelessWindow $true 'Restore rollback lost installed native preference'
    assert_equal ([IO.File]::ReadAllText($window)) $installed 'Restore rollback changed window'
    assert_equal (Test-Path -LiteralPath $product -PathType Leaf) $true 'Restore rollback lost product bundle'
    assert_equal (Test-Path -LiteralPath (Join-Path $user_data 'plugins/loader.js')) $false 'Restore rollback activated old loader'
    foreach ($name in $retired_grammars.Keys) { assert_equal (Test-Path -LiteralPath (Join-Path $user_data ('typora_code/'+$name))) $false ('Restore rollback reactivated retired asset: '+$name) }
    & $restore -backup_root $backup
    assert_equal ([IO.File]::ReadAllText($window)) $original 'Window restore failed'
    assert_equal (read_profile_fixture $profile).framelessWindow $false 'Original native preference was not restored'
    assert_equal (read_profile_fixture $profile).later 2 'Restore overwrote later native settings'
    assert_equal ([IO.File]::ReadAllText($retired)) 'old appearance startup' 'Retired bootstrap was not restored'
    foreach ($name in $retired_grammars.Keys) { assert_equal ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $user_data ('typora_code/'+$name))))) ([Convert]::ToBase64String($retired_grammars[$name])) ('Retired asset was not restored: '+$name) }
    foreach ($asset in get_typora_migration_assets) { assert_equal ([IO.File]::ReadAllText((Join-Path $user_data ('plugins/'+$asset.relative_path)))) ('old:'+$asset.relative_path) 'Old asset restore failed' }
    assert_equal ([IO.File]::ReadAllText($new_settings)) '{"version":1,"settings":{"displayLang":"en","custom":"later"}}' 'Restore removed new business data'
    assert_equal ([IO.File]::ReadAllText($state)) 'reading positions and Graph reviews' 'Business data changed'
    $settings=[IO.File]::ReadAllText($plugin_settings)|ConvertFrom-Json
    assert_equal $settings.'later.plugin' $true 'Restore discarded later plugin settings'
    assert_equal $settings.'forming_system.linux_note_enhancements' $true 'Old key not restored'
    $settings.'later.plugin'=$false
    write_fixture $plugin_settings ($settings|ConvertTo-Json -Depth 100)
    # 仅拦截一次实际 Copy-Item，故障发生在若干发布文件已复制后。
    $global:typora_test_copy_failed=$false
    $global:typora_test_copy_target=$product
    function global:Copy-Item {
        [CmdletBinding()]param([string]$LiteralPath,[string]$Destination,[switch]$Force,[switch]$Recurse)
        if (-not $global:typora_test_copy_failed -and $Destination -eq $global:typora_test_copy_target) { $global:typora_test_copy_failed=$true; throw 'Injected copy failure' }
        Microsoft.PowerShell.Management\Copy-Item @PSBoundParameters
    }
    try { assert_rejected { & $installer -typora_root $fake_root -backup_root (Join-Path $test_root 'failed transaction') -non_interactive } 'Copy fault was ignored' }
    finally { Remove-Item Function:\Copy-Item }
    assert_equal $global:typora_test_copy_failed $true 'Fault did not reach install'
    assert_equal ([IO.File]::ReadAllText($window)) $original 'Install rollback changed window'
    assert_equal (Test-Path -LiteralPath $product) $false 'Failed install left product entry'
    assert_equal ([IO.File]::ReadAllText((Join-Path $user_data 'plugins/loader.js'))) 'old:loader.js' 'Rollback lost old loader'
    foreach ($name in $retired_grammars.Keys) { assert_equal ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $user_data ('typora_code/'+$name))))) ([Convert]::ToBase64String($retired_grammars[$name])) ('Install rollback lost retired asset: '+$name) }
    # 未知配置编码必须在创建备份前拒绝，且不改原字节。
    $profile_before=[IO.File]::ReadAllText($profile)
    write_fixture $profile 'unknown-encoding'
    assert_rejected { & $installer -typora_root $fake_root -backup_root (Join-Path $test_root 'invalid profile') -non_interactive } 'Malformed profile accepted'
    assert_equal ([IO.File]::ReadAllText($profile)) 'unknown-encoding' 'Malformed profile changed'
    assert_equal (Test-Path -LiteralPath (Join-Path $test_root 'invalid profile')) $false 'Malformed profile created backup'
    write_fixture $profile $profile_before
    # 配置字段已改写后再失败，必须回滚到原来的 false。
    $global:typora_test_manifest_failed=$false
    function global:ConvertTo-Json {
        [CmdletBinding()]param([Parameter(ValueFromPipeline=$true)]$InputObject,[int]$Depth=2,[switch]$Compress)
        process {
            if ($InputObject -is [System.Collections.IDictionary] -and $InputObject.Contains('schema_version')) {
                $global:typora_test_manifest_failed=$true
                throw 'Injected final manifest failure'
            }
            Microsoft.PowerShell.Utility\ConvertTo-Json @PSBoundParameters
        }
    }
    try { assert_rejected { & $installer -typora_root $fake_root -backup_root (Join-Path $test_root 'late profile rollback') -non_interactive } 'Final manifest failure ignored' }
    finally { Remove-Item Function:\ConvertTo-Json }
    assert_equal $global:typora_test_manifest_failed $true 'Fault did not reach final manifest'
    assert_equal (read_profile_fixture $profile).framelessWindow $false 'Late install rollback lost original window preference'
    assert_equal (read_profile_fixture $profile).later 2 'Late rollback removed later preferences'
    assert_equal ([IO.File]::ReadAllText($window)) $original 'Late rollback changed window'
    foreach ($name in $retired_grammars.Keys) { assert_equal ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $user_data ('typora_code/'+$name))))) ([Convert]::ToBase64String($retired_grammars[$name])) ('Late rollback lost already removed retired asset: '+$name) }
    assert_equal ([IO.File]::ReadAllText($unmanaged)) 'unmanaged content' 'Rollback changed unrelated asset'
    # 缺省 profile 必须创建最小窗口偏好；恢复只移除本字段，保留后续用户数据。
    Remove-Item -LiteralPath $profile
    $absent_backup=Join-Path $test_root 'absent profile'
    & $installer -typora_root $fake_root -backup_root $absent_backup -non_interactive
    foreach ($name in $retired_grammars.Keys) { assert_equal (Test-Path -LiteralPath (Join-Path $user_data ('typora_code/'+$name))) $false ('Reinstall retained retired asset: '+$name) }
    $stale_grammar=Join-Path $user_data 'typora_code/assets/source_symbols/tree-sitter-c.wasm'
    [IO.File]::WriteAllBytes($stale_grammar,$retired_grammars['assets/source_symbols/tree-sitter-c.wasm'])
    assert_rejected { & $checker -typora_root $fake_root -non_interactive } 'Checker accepted retired grammar'
    Remove-Item -LiteralPath $stale_grammar
    assert_equal (read_profile_fixture $profile).framelessWindow $true 'Absent profile did not enable single-row window'
    $absent_manifest=[IO.File]::ReadAllText((Join-Path $absent_backup 'manifest.json'))|ConvertFrom-Json
    assert_equal $absent_manifest.native_profile[0].existed $false 'Absent profile backup lost absence'
    write_profile_fixture $profile @{framelessWindow=$true;created_later=@{text='保留'}}
    & $restore -backup_root $absent_backup
    $restored_profile=read_profile_fixture $profile
    assert_equal ($null -eq $restored_profile.PSObject.Properties['framelessWindow']) $true 'Restore did not remove previously absent preference'
    assert_equal $restored_profile.created_later.text '保留' 'Restore removed later preferences'
    foreach ($name in $retired_grammars.Keys) { assert_equal ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $user_data ('typora_code/'+$name))))) ([Convert]::ToBase64String($retired_grammars[$name])) ('Final restore lost retired asset: '+$name) }
    assert_equal ([IO.File]::ReadAllText($unmanaged)) 'unmanaged content' 'Final restore changed unrelated asset'
    # 模拟官方升级把启动页还原：标准安装必须以新宿主为基底，保留新版内核和扩展数据。
    $upgrade_root=Join-Path $test_root 'upgraded installation'
    $upgrade_window=Join-Path $upgrade_root 'resources/window.html'
    $upgrade_kernel=Join-Path $upgrade_root 'resources/app.asar'
    write_fixture (Join-Path $upgrade_root 'Typora.exe') 'new host fixture'
    $new_host='<html><head><title>new official host</title><script src="new-host.js"></script></head><body>new native editor</body></html>'
    write_fixture $upgrade_window $new_host
    write_fixture $upgrade_kernel 'new official kernel bytes'
    $community_state=Join-Path $user_data 'typora_code/community/plugins.json'
    $community_program=Join-Path $user_data 'typora_code/community/packages/example/fixture/main.js'
    $community_settings=Join-Path $user_data 'typora_code/settings/data/example.json'
    write_fixture $community_state '{"schema":1,"plugins":{"example":{"enabled":false,"revision":"fixture"}}}'
    write_fixture $community_program 'user installed plugin'
    write_fixture $community_settings '{"message":"保留设置"}'
    $upgrade_backup=Join-Path $test_root 'upgraded host backup'
    & $installer -typora_root $upgrade_root -backup_root $upgrade_backup -non_interactive
    & $checker -typora_root $upgrade_root -non_interactive
    $upgrade_installed=[IO.File]::ReadAllText($upgrade_window)
    assert_equal ([regex]::Matches($upgrade_installed,'typora-code:begin').Count) 1 'Upgrade reinstallation duplicated entry'
    assert_equal ($upgrade_installed.Contains('new-host.js')) $true 'Upgrade reinstallation lost new native scripts'
    assert_equal ([IO.File]::ReadAllText((Join-Path $upgrade_backup 'window.html'))) $new_host 'Upgrade backup must contain new host'
    assert_equal ([IO.File]::ReadAllText($upgrade_kernel)) 'new official kernel bytes' 'Upgrade replaced kernel'
    assert_equal ([IO.File]::ReadAllText($community_state)) '{"schema":1,"plugins":{"example":{"enabled":false,"revision":"fixture"}}}' 'Upgrade changed community state'
    assert_equal ([IO.File]::ReadAllText($community_program)) 'user installed plugin' 'Upgrade changed community package'
    assert_equal ([IO.File]::ReadAllText($community_settings)) '{"message":"保留设置"}' 'Upgrade changed plugin settings'
    & $restore -backup_root $upgrade_backup
    assert_equal ([IO.File]::ReadAllText($upgrade_window)) $new_host 'Upgrade restore must retain new host'
    Write-Host 'PASS: official-page replacement simulation, standard reinstall, new kernel/scripts and community data preserved; restore returns to new host.'
    # 重复更新不写未变化的宿主入口；受保护/只读入口不应迫使资源更新提权。
    & $installer -typora_root $fake_root -backup_root (Join-Path $test_root 'prepare protected host') -non_interactive
    $unchanged_host=(Get-FileHash -LiteralPath $window).Hash
    [IO.File]::SetAttributes($window,[IO.FileAttributes]::ReadOnly)
    try { & $installer -typora_root $fake_root -backup_root (Join-Path $test_root 'unchanged protected host') -non_interactive }
    finally { [IO.File]::SetAttributes($window,[IO.FileAttributes]::Normal) }
    assert_equal (Get-FileHash -LiteralPath $window).Hash $unchanged_host 'Identical protected startup page changed'
    Write-Host 'PASS: unchanged readonly host entry permits ordinary resource update without elevation.'
    # 源发布损坏在创建备份或覆盖用户文件前拒绝。
    [IO.File]::AppendAllText((Join-Path $tools_copy 'enhancements/dist/workspace.css'),'corrupted')
    assert_rejected { & $installer -typora_root $fake_root -backup_root (Join-Path $test_root 'invalid release') -non_interactive } 'Corrupt release accepted'
    assert_equal (Test-Path -LiteralPath (Join-Path $test_root 'invalid release')) $false 'Corrupt release mutated backup'
    Write-Host 'PASS: independent head, repeat install, hashes, migration, settings preservation, conflict, constrained restore and transaction rollback.'
    Write-Host 'PASS: four retired C/C++ assets backed up, removed, checked, restored and rolled back byte-for-byte; unrelated files preserved.'
    $install_logs=@(Get-ChildItem -LiteralPath (Join-Path $user_data 'logs/installation') -Filter '*.log')
    if ($install_logs.Count -lt 5) { throw 'Missing separate installation logs' }
    $success_logs=0; $rollback_logs=0; $preflight_logs=0
    foreach ($log_file in $install_logs) {
        $log_text=[IO.File]::ReadAllText($log_file.FullName,[Text.UTF8Encoding]::new($false,$true))
        if ($log_text -match '\[SUCCESS\]') {
            $success_logs++
            $last_position=-1
            foreach ($step_number in 1..6) {
                $position=$log_text.IndexOf("[STEP $step_number/6]")
                if ($position -le $last_position) { throw 'Installation stage sequence is incomplete' }
                $last_position=$position
            }
            if ($log_text -match '\[ERROR\]' -or $log_text -notmatch 'Backup:' -or $log_text -notmatch 'Log:') { throw 'Invalid success summary' }
        } else {
            if ($log_text -notmatch '\[ERROR\]') { throw 'Failure log lost the error' }
            if ($log_text -match '已回滚本次安装') { $rollback_logs++ }
            if ($log_text -match '尚未写入目标文件') { $preflight_logs++ }
        }
    }
    if ($success_logs -lt 3 -or $rollback_logs -lt 2 -or $preflight_logs -lt 1) { throw 'Missing success, rollback or preflight log coverage' }
    Write-Host 'PASS: ordered stages, UTF-8 per-run logs, clean output streams and truthful rollback/preflight outcomes'
    # 仅独立包中替换权限/UAC端口；子进程仍执行真实安装事务，检验互斥交接及原用户路径。
    Copy-Item -LiteralPath (Join-Path $source_root 'enhancements/dist/workspace.css') -Destination (Join-Path $tools_copy 'enhancements/dist/workspace.css') -Force
    $permission_file=Join-Path $tools_copy 'scripts/lib/typora_install_permissions.ps1'
    $permission_source=[IO.File]::ReadAllText($permission_file,[Text.Encoding]::UTF8)
    $permission_fixture=@'

function test_typora_administrator { return $false }
function get_typora_write_denials { param($paths); if (-not $elevation_attempted) { $paths[0] } }
function start_typora_elevated_install {
    param($encoded_command)
    $shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
    return Start-Process -FilePath $shell -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded_command) -WindowStyle Hidden -Wait -PassThru
}
'@
    [IO.File]::WriteAllText($permission_file,$permission_source+$permission_fixture,[Text.UTF8Encoding]::new($true))
    $permission_backup=Join-Path $fake_root 'backup/original user'
    $before_permission=(Get-FileHash -LiteralPath $window).Hash
    assert_rejected { & $installer -typora_root $fake_root -backup_root $permission_backup -non_interactive } 'Unattended installation requested UAC'
    assert_equal (Test-Path -LiteralPath $permission_backup) $false 'Unattended denial created backup'
    assert_equal (Get-FileHash -LiteralPath $window).Hash $before_permission 'Unattended denial changed host'
    & $installer -typora_root $fake_root -backup_root $permission_backup -user_data $user_data -non_interactive -allow_elevation
    & $checker -typora_root $fake_root -non_interactive
    $permission_manifest=[IO.File]::ReadAllText((Join-Path $permission_backup 'manifest.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
    assert_equal $permission_manifest.user_data $user_data 'Elevated child changed user identity'
    [IO.File]::AppendAllText($permission_file,"`nfunction start_typora_elevated_install { param(`$encoded_command); throw [ComponentModel.Win32Exception]::new(1223) }",[Text.Encoding]::UTF8)
    $cancel_backup=Join-Path $fake_root 'backup/cancelled'
    $before_cancel=(Get-FileHash -LiteralPath $window).Hash
    $cancel_message=''
    try { & $installer -typora_root $fake_root -backup_root $cancel_backup -user_data $user_data -non_interactive -allow_elevation } catch { $cancel_message=$_.Exception.Message }
    assert_equal ($cancel_message.Contains('[TYPORA_INSTALL_CANCELLED]')) $true 'UAC cancellation not identified'
    assert_equal (Test-Path -LiteralPath $cancel_backup) $false 'Cancelled authorization created backup'
    assert_equal (Get-FileHash -LiteralPath $window).Hash $before_cancel 'Cancelled authorization changed host'
    Write-Host 'PASS: ordinary-privilege UAC port simulation, real child transaction, lock handoff, explicit identity, host backup, unattended refusal and cancellation without target writes; real UAC not exercised.'
    # 同一正式候选通过公开入口完成安装、两种卸载和重装，独立于上面的故障注入。
    Copy-Item -LiteralPath (Join-Path $source_root 'scripts/lib/typora_install_permissions.ps1') -Destination $permission_file -Force
    $env:APPDATA=Join-Path $test_root 'lifecycle user'
    $cycle_root=Join-Path $test_root 'lifecycle host'
    $cycle_window=Join-Path $cycle_root 'resources/window.html'
    $cycle_native='<html><head><title>lifecycle</title></head><body>native</body></html>'
    write_fixture (Join-Path $cycle_root 'Typora.exe') 'fixture'
    write_fixture $cycle_window $cycle_native
    $cycle_document=Join-Path $test_root 'lifecycle document.md'
    $cycle_settings=Join-Path $env:APPDATA 'Typora/typora_code/settings/workspace.json'
    write_fixture $cycle_document '# 用户文档保持'
    write_fixture $cycle_settings '{"user_setting":"保留"}'
    $cycle_storage=Join-Path $env:APPDATA 'Typora/Local Storage/leveldb/presentation.log'
    write_fixture $cycle_storage '{"schema":2026092403,"word_wrap":false}'
    $storage_hash=(Get-FileHash -LiteralPath $cycle_storage).Hash
    $document_hash=(Get-FileHash -LiteralPath $cycle_document).Hash
    $settings_hash=(Get-FileHash -LiteralPath $cycle_settings).Hash
    $cycle_backup=Join-Path $test_root 'lifecycle original backup'
    $uninstaller=Join-Path $tools_copy 'uninstall_windows.ps1'
    & $installer -typora_root $cycle_root -backup_root $cycle_backup -non_interactive
    & $checker -typora_root $cycle_root -non_interactive
    & $uninstaller -typora_root $cycle_root -backup_root $cycle_backup -non_interactive
    assert_equal ([IO.File]::ReadAllText($cycle_window)) $cycle_native 'Restore uninstall did not restore native startup'
    assert_equal (Test-Path -LiteralPath (Join-Path $env:APPDATA 'Typora/typora_code/workbench.js')) $false 'Restore uninstall left managed bundle'
    & $installer -typora_root $cycle_root -backup_root (Join-Path $test_root 'lifecycle reinstall backup') -non_interactive
    & $checker -typora_root $cycle_root -non_interactive
    # 安装前备份均在自定义位置，默认扫描没有兼容备份，必须走detach。
    & $uninstaller -typora_root $cycle_root -non_interactive
    assert_equal (([IO.File]::ReadAllText($cycle_window)).Contains('typora-code:begin')) $false 'Detach left startup entry'
    assert_equal (Test-Path -LiteralPath (Join-Path $env:APPDATA 'Typora/typora_code/workbench.js')) $true 'Detach removed reusable assets'
    & $installer -typora_root $cycle_root -backup_root (Join-Path $test_root 'lifecycle final backup') -non_interactive
    & $checker -typora_root $cycle_root -non_interactive
    assert_equal (Get-FileHash -LiteralPath $cycle_document).Hash $document_hash 'Lifecycle changed document'
    assert_equal (Get-FileHash -LiteralPath $cycle_settings).Hash $settings_hash 'Lifecycle changed workspace settings'
    assert_equal (Get-FileHash -LiteralPath $cycle_storage).Hash $storage_hash 'Lifecycle changed local storage configuration contract'
    assert_equal (Test-Path -LiteralPath (Join-Path $cycle_backup 'manifest.json')) $true 'Lifecycle removed original backup'
    Write-Host 'PASS: candidate install/check/restore-uninstall/reinstall/check/detach-uninstall/reinstall/check; document, settings and backup preserved.'
    Write-Host "Fixtures: $test_root"
} catch { Write-Host $_.ScriptStackTrace; throw } finally { $env:APPDATA=$previous_appdata }
