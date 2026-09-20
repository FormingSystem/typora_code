# 权限只由安装入口管理；探针不截断文件，系统授权仅在明确拒绝后申请一次。
function test_typora_administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    try { return ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
    finally { $identity.Dispose() }
}

function get_typora_write_denials {
    param([string[]]$paths)
    $checked_directories = @{}
    foreach ($target in ($paths | Sort-Object -Unique)) {
        $target = [IO.Path]::GetFullPath($target)
        $stream = $null
        $probe = $null
        try {
            if ([IO.File]::Exists($target)) {
                if (([IO.File]::GetAttributes($target) -band [IO.FileAttributes]::ReadOnly) -ne 0) {
                    throw [IO.IOException]::new("文件为只读，请核对并取消只读属性后重试；不会通过提权绕过：$target")
                }
                $stream = [IO.File]::Open($target, [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
                $stream.Dispose(); $stream = $null
            } elseif ([IO.Directory]::Exists($target)) {
                throw [IO.IOException]::new("应为文件的安装目标是目录：$target")
            }
            $directory = [IO.Path]::GetDirectoryName($target)
            while ($directory -and -not [IO.Directory]::Exists($directory)) { $directory = [IO.Path]::GetDirectoryName($directory) }
            if (-not $directory) { throw [IO.DirectoryNotFoundException]::new("找不到安装目标的父目录：$target") }
            if (-not $checked_directories.ContainsKey($directory)) {
                $probe = Join-Path $directory ('.typora-code-write-probe-' + [guid]::NewGuid().ToString('N'))
                $stream = [IO.FileStream]::new($probe, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None, 1, [IO.FileOptions]::DeleteOnClose)
                $stream.Dispose(); $stream = $null
                $probe = $null
                $checked_directories[$directory] = $true
            }
        } catch {
            $reason = $_.Exception
            while ($reason.InnerException) { $reason = $reason.InnerException }
            if ($reason -is [UnauthorizedAccessException] -or $reason -is [Security.SecurityException]) { $target }
            else { throw [IO.IOException]::new(('安装写入预检失败（占用、只读或磁盘错误不会触发管理员授权）：{0}；{1}' -f $target, $reason.Message), $reason) }
        } finally {
            if ($null -ne $stream) { $stream.Dispose() }
            if ($probe -and [IO.File]::Exists($probe)) { [IO.File]::Delete($probe) }
        }
    }
}

function get_typora_permission_action {
    param([string[]]$denied_paths, [bool]$administrator, [bool]$attempted, [bool]$interactive, [bool]$allow_elevation)
    if (-not $denied_paths.Count) { return 'continue' }
    if ($administrator -or $attempted) { return 'blocked' }
    if ($interactive -or $allow_elevation) { return 'request' }
    return 'unattended'
}

function new_typora_elevation_command {
    param([object]$request)
    $payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($request | ConvertTo-Json -Depth 8 -Compress)))
    # 用户路径只作为JSON数据；编码中的字母数字不会变为PowerShell语法。
    $command = @'
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$request=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__PAYLOAD__'))|ConvertFrom-Json
$env:TYPORA_TERMINAL_CACHE=$request.cache_root
$arguments=@{typora_root=$request.typora_root;user_data=$request.user_data;backup_root=$request.backup_root;include_theme=[bool]$request.include_theme;non_interactive=$true;elevation_attempted=$true}
$result=@{status='failed';message='安装子进程未完成';exit_code=1}
try { & $request.installer @arguments; $result=@{status='success';message='已授权的安装事务完成';exit_code=0} }
catch { $result.message=$_.Exception.Message }
try { [IO.File]::WriteAllText($request.receipt,($result|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false)) }
catch { exit 1 }
exit $result.exit_code
'@
    return [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command.Replace('__PAYLOAD__', $payload)))
}

function start_typora_elevated_install {
    param([string]$encoded_command)
    $shell = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
    return Start-Process -FilePath $shell -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded_command) -Verb RunAs -WindowStyle Hidden -Wait -PassThru
}

function invoke_typora_elevated_install {
    param([object]$request)
    $receipt = Join-Path ([IO.Path]::GetTempPath()) ('typora-install-result-' + [guid]::NewGuid().ToString('N') + '.json')
    $stream = [IO.File]::Open($receipt, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    $stream.Dispose()
    $request | Add-Member -NotePropertyName receipt -NotePropertyValue $receipt
    try {
        try { $process = start_typora_elevated_install (new_typora_elevation_command $request) }
        catch {
            $reason = $_.Exception
            while ($reason.InnerException) { $reason = $reason.InnerException }
            if ($reason -is [ComponentModel.Win32Exception] -and $reason.NativeErrorCode -eq 1223) {
                throw [OperationCanceledException]::new('[TYPORA_INSTALL_CANCELLED] 已取消Windows管理员授权，安装目标未修改。')
            }
            throw [InvalidOperationException]::new(('无法启动Windows管理员授权：' + $reason.Message), $reason)
        }
        try {
            $result = [IO.File]::ReadAllText($receipt, [Text.Encoding]::UTF8) | ConvertFrom-Json
            if ($process.ExitCode -ne 0 -or $null -eq $result -or $result.status -ne 'success') {
                $detail = if ($null -ne $result) { $result.message } else { '未收到完成记录，请检查用户数据目录下的安装日志。' }
                throw "管理员安装未完成（退出码 $($process.ExitCode)）：$detail"
            }
        } finally { if ($process -is [Diagnostics.Process]) { $process.Dispose() } }
    } finally { [IO.File]::Delete($receipt) }
}
