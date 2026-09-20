# 安装日志只使用信息流，不混入安装函数返回值；每次安装持有独立上下文。
function new_typora_install_log {
    param([string]$user_data, [ValidateSet('install','uninstall')][string]$operation='install')
    $log = [pscustomobject]@{path='';clock=[Diagnostics.Stopwatch]::StartNew();step_clock=$null;step='';total=6}
    $filename = $operation + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N') + '.log'
    $directories = @((Join-Path $user_data 'logs/installation'), (Join-Path ([IO.Path]::GetTempPath()) 'TyporaCode/install_logs'))
    foreach ($directory in $directories) {
        try {
            [IO.Directory]::CreateDirectory($directory) | Out-Null
            $log.path = Join-Path $directory $filename
            [IO.File]::WriteAllText($log.path, '', [Text.UTF8Encoding]::new($false))
            break
        } catch { $log.path = '' }
    }
    write_typora_install_log $log INFO $(if ($operation -eq 'install') { 'Typora Code | 安装程序' } else { 'Typora Code | uninstall' })
    if ($log.path) { write_typora_install_log $log INFO ('Log: ' + $log.path) }
    else { write_typora_install_log $log WARN '无法保存日志文件，本次过程仍会在此窗口显示。' }
    return $log
}

function write_typora_install_log {
    param([object]$log, [string]$level, [string]$message)
    $line = '[{0}] [{1}] {2}' -f (Get-Date -Format 'HH:mm:ss'), $level, $message
    $color = switch ($level) { 'ERROR' {'Red'} 'WARN' {'Yellow'} 'OK' {'Green'} 'SUCCESS' {'Green'} default {'Cyan'} }
    Write-Host $line -ForegroundColor $color
    if ($log.path) {
        try { [IO.File]::AppendAllText($log.path, $line + [Environment]::NewLine, [Text.UTF8Encoding]::new($false)) }
        catch {
            $log.path = ''
            write_typora_install_log $log WARN '日志文件无法继续写入，安装过程仍会在此窗口显示。'
        }
    }
}

function complete_typora_install_step {
    param([object]$log)
    if ($log.step) {
        write_typora_install_log $log OK ('{0}完成，用时 {1:N1} 秒。' -f $log.step, $log.step_clock.Elapsed.TotalSeconds)
        $log.step = ''
    }
}

function start_typora_install_step {
    param([object]$log, [int]$number, [string]$name)
    complete_typora_install_step $log
    $log.step = $name
    $log.step_clock = [Diagnostics.Stopwatch]::StartNew()
    write_typora_install_log $log ('STEP {0}/{1}' -f $number, $log.total) $name
}
