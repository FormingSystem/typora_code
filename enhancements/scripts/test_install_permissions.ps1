# 使用临时文件和授权端口替身；不弹出系统授权，不修改真实安装或全局权限。
$ErrorActionPreference = 'Stop'
$tools_root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $tools_root 'scripts/lib/typora_install_permissions.ps1')
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('typora-permissions-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
$checks = [Collections.Generic.List[string]]::new()
function assert_true($condition, $message) { if (-not $condition) { throw $message }; $checks.Add($message) }
function assert_failure([scriptblock]$action, [string]$expected) {
    $message=''; try { & $action | Out-Null } catch { $message=$_.Exception.Message }
    assert_true ($message.Contains($expected)) ('rejected: ' + $expected)
}
$file = Join-Path $fixture '中文 [file].txt'
[IO.File]::WriteAllText($file,'unchanged',[Text.Encoding]::UTF8)
$before = (Get-FileHash -LiteralPath $file).Hash
assert_true (@(get_typora_write_denials @($file,(Join-Path $fixture 'new/sub/file.txt'))).Count -eq 0) 'writable targets need no elevation'
assert_true ((Get-FileHash -LiteralPath $file).Hash -eq $before) 'probe preserves original bytes'
assert_true (@(Get-ChildItem -LiteralPath $fixture -Force -Filter '.typora-code-write-probe-*').Count -eq 0) 'probes clean themselves'
[IO.File]::SetAttributes($file,[IO.FileAttributes]::ReadOnly)
try { assert_failure { get_typora_write_denials @($file) } '只读' } finally { [IO.File]::SetAttributes($file,[IO.FileAttributes]::Normal) }
$lock=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try { assert_failure { get_typora_write_denials @($file) } '占用' } finally { $lock.Dispose() }
$acl=Get-Acl -LiteralPath $file
$denied_acl=Get-Acl -LiteralPath $file
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$denied_acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::Write,[Security.AccessControl.AccessControlType]::Deny))
try {
    Set-Acl -LiteralPath $file -AclObject $denied_acl
    assert_true (@(get_typora_write_denials @($file)).Count -eq 1) 'real file ACL denial recognized'
} finally { Set-Acl -LiteralPath $file -AclObject $acl }

foreach ($rounds in @(20,100,1000)) {
    for ($index=0; $index -lt $rounds; $index++) {
        if ((get_typora_permission_action @() $false $false $true $true) -ne 'continue') { throw 'Writable branch elevated' }
        if ((get_typora_permission_action @('denied') $false $false $true $false) -ne 'request') { throw 'Interactive denial did not request' }
        if ((get_typora_permission_action @('denied') $false $false $false $true) -ne 'request') { throw 'Explicit updater authorization lost' }
        if ((get_typora_permission_action @('denied') $false $false $false $false) -ne 'unattended') { throw 'Unattended prompt' }
        if ((get_typora_permission_action @('denied') $true $false $true $true) -ne 'blocked') { throw 'Administrator retry loop' }
        if ((get_typora_permission_action @('denied') $false $true $true $true) -ne 'blocked') { throw 'Elevation retry loop' }
        $hostile = '中文 space '' " ; $(throw ''injected'') ` & [x]'
        $request=[pscustomobject]@{installer=$hostile;user_data=$hostile;typora_root=$hostile;backup_root=$hostile;cache_root=$hostile;include_theme=$true;receipt=$hostile}
        $command=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String((new_typora_elevation_command $request)))
        $payload=[regex]::Match($command,"FromBase64String\('([A-Za-z0-9+/=]+)'\)").Groups[1].Value
        $decoded=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload))|ConvertFrom-Json
        if ($decoded.user_data -cne $hostile -or $command.Contains($hostile)) { throw 'Argument encoding corruption/injection' }
    }
    $checks.Add("$rounds permission decisions and argument round trips")
}

# 实际执行编码重入内容，只有启动系统UAC的端口被替换。
$child_script=Join-Path $fixture 'installer 中文 [child].ps1'
$identity_file=Join-Path $fixture 'identity.json'
$child_source=@'
param($typora_root,$user_data,$backup_root,$include_theme,$non_interactive,$elevation_attempted)
if(!$non_interactive -or !$elevation_attempted){throw 'Flags lost'}
[IO.File]::WriteAllText((Join-Path $user_data 'identity.json'),(@{host_root=$typora_root;user_data=$user_data;backup=$backup_root;cache=$env:TYPORA_TERMINAL_CACHE;theme=[bool]$include_theme}|ConvertTo-Json),[Text.Encoding]::UTF8)
'@
[IO.File]::WriteAllText($child_script,$child_source,[Text.UTF8Encoding]::new($true))
$script:requests=0
function start_typora_elevated_install {
    param([string]$encoded_command)
    $script:requests++
    $shell=Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
    return Start-Process -FilePath $shell -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded_command) -WindowStyle Hidden -Wait -PassThru
}
function new_request { return [pscustomobject]@{installer=$child_script;typora_root=(Join-Path $fixture 'host');user_data=$fixture;backup_root=(Join-Path $fixture 'backup');cache_root=(Join-Path $fixture 'cache');include_theme=$true} }
invoke_typora_elevated_install (new_request)
$identity=[IO.File]::ReadAllText($identity_file,[Text.Encoding]::UTF8)|ConvertFrom-Json
assert_true ($identity.user_data -eq $fixture -and $identity.cache -eq (Join-Path $fixture 'cache') -and $identity.theme) 'real encoded child preserves original identity and cache'
assert_true ($script:requests -eq 1) 'single child execution'
[IO.File]::WriteAllText($child_script,"throw 'child failed before write'",[Text.Encoding]::UTF8)
assert_failure { invoke_typora_elevated_install (new_request) } 'child failed before write'
function start_typora_elevated_install { param($encoded_command); throw [ComponentModel.Win32Exception]::new(1223) }
assert_failure { invoke_typora_elevated_install (new_request) } '[TYPORA_INSTALL_CANCELLED]'
assert_true ((Get-FileHash -LiteralPath $file).Hash -eq $before) 'failure and cancellation preserve target'
function start_typora_elevated_install { param($encoded_command); return [pscustomobject]@{ExitCode=0} }
assert_failure { invoke_typora_elevated_install (new_request) } '未收到完成记录'
@{status='PASS';checks=$checks;fixture=$fixture;actual_uac=$false;engine=$PSVersionTable.PSVersion.ToString()}|ConvertTo-Json -Depth 8
