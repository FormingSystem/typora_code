[CmdletBinding()]
param([string]$typora_root='', [string]$backup_root='', [switch]$non_interactive, [switch]$include_theme, [string]$user_data='', [switch]$allow_elevation, [switch]$elevation_attempted)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$tools_root = Split-Path -Parent $PSScriptRoot
. (Join-Path $tools_root 'scripts/lib/typora_environment.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_workspace.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_terminal.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_install_log.ps1')
. (Join-Path $tools_root 'scripts/lib/typora_install_permissions.ps1')
$user_data = [IO.Path]::GetFullPath($(if($user_data){$user_data}else{get_typora_windows_user_data}))
$install_log = new_typora_install_log $user_data
$install_mutex=$null
$owns_mutex=$false
$rollback_state = 'not_required'
try {
start_typora_install_step $install_log 1 '检查安装环境'
$typora_root = resolve_typora_windows_root -typora_root $typora_root -non_interactive:$non_interactive
# 手工安装与后台更新共享互斥，避免备份和回滚交错；进程退出自动释放。
$hash_provider=[Security.Cryptography.SHA256]::Create()
try {$lock_key=[BitConverter]::ToString($hash_provider.ComputeHash([Text.Encoding]::UTF8.GetBytes($user_data.ToLowerInvariant()))).Replace('-','')} finally {$hash_provider.Dispose()}
$install_mutex=[Threading.Mutex]::new($false,('Local\TyporaCodeInstall_'+$lock_key))
try {$owns_mutex=$install_mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$owns_mutex=$true}
if(!$owns_mutex){throw 'Another Typora Code installation is running. Retry after it finishes.'}
write_typora_install_log $install_log INFO ('安装位置：' + $typora_root)
write_typora_install_log $install_log INFO ('用户数据：' + $user_data)
start_typora_install_step $install_log 2 '校验安装包'
$source = Join-Path $tools_root 'enhancements/dist'
$assets = @(assert_typora_release $tools_root)
assert_typora_migration_available $user_data
$migrated_settings = get_typora_migrated_settings $user_data
$head = [IO.File]::ReadAllText((Join-Path $tools_root 'enhancements/runtime_head.html'), [Text.Encoding]::UTF8)
$window = resolve_typora_asset_path $typora_root 'resources/window.html'
$window_before = [IO.File]::ReadAllText($window, [Text.Encoding]::UTF8)
$window_source = get_typora_window_source $window_before $head
$window_changed = $window_source -cne $window_before
$window_written = $false
assert_typora_window_source $window_source $head
$terminal_source = Join-Path $source 'terminal_runtime'
$terminal_assets = @(get_typora_terminal_assets $terminal_source)
assert_typora_workspace_assets $terminal_source $terminal_assets
$theme_source = Join-Path $tools_root 'cpp_github-consolas.css'
if ($include_theme -and -not (Test-Path -LiteralPath $theme_source -PathType Leaf)) { throw 'Theme source is missing.' }
if (-not $backup_root) { $backup_root = Join-Path $user_data ('backups/typora_code_configuration/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N')) }
$backup_root = [IO.Path]::GetFullPath($backup_root)
$manifest_path = resolve_typora_asset_path $backup_root 'manifest.json'
if (Test-Path -LiteralPath $backup_root) { throw 'Use a new, empty backup destination for each transaction.' }
write_typora_install_log $install_log INFO ('已校验 {0} 项工作台资源、{1} 项终端资源。' -f $assets.Count, $terminal_assets.Count)
start_typora_install_step $install_log 3 '准备终端运行时'
$node_stage = prepare_typora_node $tools_root -report { param($message) write_typora_install_log $install_log INFO $message }
$profile_node = Join-Path $node_stage.root ($node_stage.assets | Where-Object { $_.relative_path.EndsWith('/node.exe') } | Select-Object -First 1).relative_path
$profile_path = resolve_typora_asset_path $user_data 'profile.data'
$profile_before = invoke_typora_native_profile $profile_node $tools_root snapshot $profile_path
$profile_changed = $false
$assets += [pscustomobject]@{relative_path='SHA256SUMS';sha256=(Get-FileHash -LiteralPath (Join-Path $source 'SHA256SUMS') -Algorithm SHA256).Hash}
$retired_assets = @(get_typora_retired_product_assets)
$groups = @(
    [pscustomobject]@{name='product';root=(Join-Path $user_data 'typora_code');assets=@($assets + $retired_assets)},
    [pscustomobject]@{name='migration';root=(Join-Path $user_data 'plugins');assets=@(get_typora_migration_assets)},
    [pscustomobject]@{name='terminal';root=(Join-Path $user_data 'linux_note_enhancements/terminal_runtime');assets=@($terminal_assets + $node_stage.assets)},
    [pscustomobject]@{name='settings';root=(Join-Path $user_data 'plugins/settings');assets=@([pscustomobject]@{relative_path='plugins.json'})},
    [pscustomobject]@{name='theme';root=(Join-Path $user_data 'themes');assets=$(if ($include_theme) { @([pscustomobject]@{relative_path='cpp_github-consolas.css'}) } else { @() })},
    [pscustomobject]@{name='native_profile';root=$user_data;assets=@([pscustomobject]@{relative_path='profile.data'})}
)
foreach ($group in $groups) {
    foreach ($asset in $group.assets) {
        $target = resolve_typora_asset_path $group.root $asset.relative_path
        if (Test-Path -LiteralPath $target -PathType Container) { throw "Managed file target is a directory: $target" }
    }
}
# 下载及摘要校验仍在当前账户完成；备份和所有托管写入之前决定是否需要系统授权。
$write_targets = @($manifest_path)
if ($window_changed) { $write_targets += $window }
if ($null -ne $migrated_settings) { $write_targets += Join-Path $user_data 'typora_code/settings/workspace.json' }
foreach ($group in $groups) {
    foreach ($asset in $group.assets) {
        $target = resolve_typora_asset_path $group.root $asset.relative_path
        $exists = Test-Path -LiteralPath $target -PathType Leaf
        # 与install_typora_workspace相同的摘要规则；已加载且不变的Node/native模块不需要写打开。
        if ($group.name -in @('product','terminal') -and $null -ne $asset.PSObject.Properties['sha256']) {
            if ($exists -and (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $asset.sha256) { continue }
        } elseif ($group.name -in @('product','migration') -and -not $exists) { continue }
        $write_targets += $target
    }
}
$denied_paths = @(get_typora_write_denials $write_targets)
$permission_action = get_typora_permission_action $denied_paths (test_typora_administrator) ([bool]$elevation_attempted) (-not $non_interactive) ([bool]$allow_elevation)
if ($permission_action -ne 'continue') {
    write_typora_install_log $install_log WARN ('当前账户不能写入以下安装目标：' + ($denied_paths -join '; '))
    if ($window_changed) { write_typora_install_log $install_log INFO '工作台需要修改Typora安装目录的resources/window.html；受保护的安装目录需要Windows管理员授权。移动备份不能免除该权限。' }
    else { write_typora_install_log $install_log INFO '宿主入口未变化，本次无须写入安装目录；受限的是上述配置/资源或备份位置，请核对所选用户目录。下载本身不要求管理员权限。' }
    write_typora_install_log $install_log INFO ('仍使用原用户目录：' + $user_data + '；备份：' + $backup_root)
    if ($permission_action -eq 'blocked') { throw '管理员或已授权进程仍无写权限；请检查上述路径的ACL和安全软件策略。安装器不会重复请求授权或修改目录权限。' }
    if ($permission_action -eq 'unattended') { throw '无人值守安装未授权显示UAC。请用普通交互入口重试，或显式传入-allow_elevation以允许Windows系统授权；安装目标未修改。' }
    write_typora_install_log $install_log INFO '即将请求Windows管理员授权；取消则停止安装，保留原版本。授权子进程沿用同一安装事务，完成后自动返回。'
    $install_mutex.ReleaseMutex(); $owns_mutex = $false
    $install_mutex.Dispose(); $install_mutex = $null
    $cache_root = Split-Path -Parent $node_stage.root
    $rollback_state = 'delegated'
    invoke_typora_elevated_install ([pscustomobject]@{installer=(Join-Path $tools_root 'scripts/install_workspace_windows.ps1');typora_root=$typora_root;user_data=$user_data;backup_root=$backup_root;cache_root=$cache_root;include_theme=[bool]$include_theme})
    write_typora_install_log $install_log SUCCESS ('已授权安装完成。Backup: ' + $backup_root)
    write_typora_install_log $install_log INFO '保存文档后正常重启Typora加载新版；安装子进程日志位于原用户数据目录的logs/installation。'
    return
}
start_typora_install_step $install_log 4 '备份现有配置'
write_typora_install_log $install_log INFO ('Backup: ' + $backup_root)
New-Item -ItemType Directory -Path $backup_root | Out-Null
Copy-Item -LiteralPath $window -Destination (Join-Path $backup_root 'window.html')
$manifest = [ordered]@{schema_version=4;installed_at=(Get-Date).ToString('o');typora_root=$typora_root;user_data=$user_data;window_sha256=(Get-FileHash -LiteralPath (Join-Path $backup_root 'window.html') -Algorithm SHA256).Hash.ToLowerInvariant()}
foreach ($group in $groups) {
    $records = @(backup_typora_workspace $group.root (Join-Path $backup_root $group.name) $group.assets)
    $group | Add-Member -NotePropertyName records -NotePropertyValue $records
    $manifest[$group.name] = $records
}
$settings_target = Join-Path $user_data 'typora_code/settings/workspace.json'
$created_settings = $false
try {
    start_typora_install_step $install_log 5 '安装工作台'
    install_typora_workspace $node_stage.root $groups[2].root $node_stage.assets
    install_typora_workspace $terminal_source $groups[2].root $terminal_assets
    install_typora_workspace $source $groups[0].root $assets
    foreach ($asset in $retired_assets) {
        $retired = resolve_typora_asset_path $groups[0].root $asset.relative_path
        if (Test-Path -LiteralPath $retired -PathType Leaf) { Remove-Item -LiteralPath $retired }
    }
    foreach ($asset in $groups[1].assets) {
        $target = resolve_typora_asset_path $groups[1].root $asset.relative_path
        if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target }
    }
    update_typora_plugin_settings (Join-Path $groups[3].root 'plugins.json') (Join-Path $backup_root 'settings/plugins.json') remove
    if ($null -ne $migrated_settings -and -not (Test-Path -LiteralPath $settings_target)) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $settings_target) | Out-Null
        [IO.File]::WriteAllText($settings_target, $migrated_settings, [Text.UTF8Encoding]::new($false))
        $created_settings = $true
    }
    if ($include_theme) { New-Item -ItemType Directory -Force -Path $groups[4].root | Out-Null; Copy-Item -LiteralPath $theme_source -Destination (resolve_typora_asset_path $groups[4].root 'cpp_github-consolas.css') -Force }
    if ($window_changed) {
        # 写入开始即登记，部分写入失败也必须走原备份回滚。
        $window_written = $true
        [IO.File]::WriteAllText($window, $window_source, [Text.UTF8Encoding]::new($false))
    }
    start_typora_install_step $install_log 6 '验证安装结果'
    assert_typora_window_source ([IO.File]::ReadAllText($window, [Text.Encoding]::UTF8)) $head
    assert_typora_workspace_assets $groups[0].root $assets
    $profile_result = invoke_typora_native_profile $profile_node $tools_root install $profile_path $profile_before.sha256
    $profile_changed = $profile_result.changed
    [IO.File]::WriteAllText($manifest_path, ($manifest | ConvertTo-Json -Depth 100), [Text.UTF8Encoding]::new($false))
} catch {
    $failure = $_
    $rollback_state = 'running'
    write_typora_install_log $install_log WARN ('安装未完成，正在恢复安装前状态。原因：' + $failure.Exception.Message)
    try {
    foreach ($group in $groups) { if ($group.name -ne 'native_profile') { restore_typora_workspace $group.root (Join-Path $backup_root $group.name) $group.records '' } }
    if ($profile_changed) { $current_profile = invoke_typora_native_profile $profile_node $tools_root snapshot $profile_path; $null = invoke_typora_native_profile $profile_node $tools_root restore $profile_path $current_profile.sha256 (Join-Path $backup_root 'native_profile/profile.data') }
    if ($created_settings -and (Test-Path -LiteralPath $settings_target -PathType Leaf)) { Move-Item -LiteralPath $settings_target -Destination ($settings_target + '.disabled.' + [guid]::NewGuid().ToString('N')) }
    if ($window_written) { Copy-Item -LiteralPath (Join-Path $backup_root 'window.html') -Destination $window -Force }
    $rollback_state = 'completed'
    write_typora_install_log $install_log OK '已回滚本次安装，备份已保留。'
    } catch {
        $rollback_state = 'failed'
        write_typora_install_log $install_log ERROR ('自动回滚未完成：' + $_.Exception.Message)
        write_typora_install_log $install_log INFO ('请保留备份和日志用于恢复。Backup: ' + $backup_root)
    }
    throw $failure
}
complete_typora_install_step $install_log
write_typora_install_log $install_log SUCCESS ('安装完成，总用时 {0:N1} 秒。' -f $install_log.clock.Elapsed.TotalSeconds)
write_typora_install_log $install_log INFO ('Backup: ' + $backup_root)
if ($install_log.path) { write_typora_install_log $install_log INFO ('Log: ' + $install_log.path) }
write_typora_install_log $install_log INFO '保存文档后正常重启 Typora，即可加载本次安装。'
if ($include_theme) { write_typora_install_log $install_log INFO '在“主题”菜单选择 cpp github consolas；已有偏好设置保留。' }
} catch {
    write_typora_install_log $install_log ERROR ('{0}失败：{1}' -f $install_log.step, $_.Exception.Message)
    if ($rollback_state -eq 'not_required') { write_typora_install_log $install_log INFO '安装尚未写入目标文件，无须回滚。' }
    if ($install_log.path) { write_typora_install_log $install_log INFO ('Log: ' + $install_log.path) }
    throw
} finally {
    if($owns_mutex){$install_mutex.ReleaseMutex()}
    if($null -ne $install_mutex){$install_mutex.Dispose()}
}
