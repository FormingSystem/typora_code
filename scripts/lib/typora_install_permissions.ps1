. (Join-Path $PSScriptRoot 'typora_locale.ps1')
# Permissions are only managed by the installation entry; probes do not truncate files, and system authorization is only requested once after explicit rejection.
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
                    throw [IO.IOException]::new((get_typora_text -key 'the_file_is_read_only_check_and_clear_the_read_only_attribute_be' -values @{value_0=$target}))
                }
                $stream = [IO.File]::Open($target, [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
                $stream.Dispose(); $stream = $null
            } elseif ([IO.Directory]::Exists($target)) {
                throw [IO.IOException]::new((get_typora_text -key 'an_installation_target_expected_to_be_a_file_is_a_directory' -values @{value_0=$target}))
            }
            $directory = [IO.Path]::GetDirectoryName($target)
            while ($directory -and -not [IO.Directory]::Exists($directory)) { $directory = [IO.Path]::GetDirectoryName($directory) }
            if (-not $directory) { throw [IO.DirectoryNotFoundException]::new((get_typora_text -key 'cannot_find_the_installation_target_s_parent_directory' -values @{value_0=$target})) }
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
            else { throw [IO.IOException]::new(((get_typora_text -key 'installation_write_preflight_failed_file_locks_read_only_attribu') -f $target, $reason.Message), $reason) }
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
    # User paths are only used as JSON data; numeric and alphabetic characters in encoding will not become PowerShell syntax.
    $command = @'
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$request=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__PAYLOAD__'))|ConvertFrom-Json
$env:TYPORA_TERMINAL_CACHE=$request.cache_root
$arguments=@{typora_root=$request.typora_root;user_data=$request.user_data;backup_root=$request.backup_root;include_theme=[bool]$request.include_theme;non_interactive=$true;elevation_attempted=$true;managed_backup=[bool]$request.managed_backup}
$result=@{status='failed';message='Installation child process did not complete';exit_code=1}
try { & $request.installer @arguments; $result=@{status='success';message='Authorized installation transaction completed';exit_code=0} }
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
                throw [OperationCanceledException]::new((get_typora_text -key 'typora_install_cancelled_windows_administrator_authorization_was'))
            }
            throw [InvalidOperationException]::new(((get_typora_text -key 'cannot_start_windows_administrator_authorization') + $reason.Message), $reason)
        }
        try {
            $result = [IO.File]::ReadAllText($receipt, [Text.Encoding]::UTF8) | ConvertFrom-Json
            if ($process.ExitCode -ne 0 -or $null -eq $result -or $result.status -ne 'success') {
                $detail = if ($null -ne $result) { $result.message } else { (get_typora_text -key 'no_completion_receipt_was_received_check_the_installation_logs_i') }
                throw (get_typora_text -key 'administrator_installation_did_not_complete_exit_code' -values @{value_0=$($process.ExitCode);value_1=$detail})
            }
        } finally { if ($process -is [Diagnostics.Process]) { $process.Dispose() } }
    } finally { [IO.File]::Delete($receipt) }
}
