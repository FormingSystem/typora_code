$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../../scripts/lib/typora_shell_integration.ps1')
$artifact_manager=Join-Path $PSScriptRoot 'manage_test_artifacts.py'
$artifact_root=(& python -X utf8 $artifact_manager create --pid $PID | Select-Object -Last 1)
if($LASTEXITCODE -ne 0){throw 'Cannot allocate test artifacts.'}
$base=Join-Path $artifact_root 'work'
$test_key='Software\TyporaCodeTests\'+[Guid]::NewGuid().ToString('N')
$registry=[Microsoft.Win32.Registry]::CurrentUser
$successful=$false
function assert_true($value,$message){if(!$value){throw $message}}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class shell_argument_parser {
 [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CommandLineToArgvW(string command, out int count);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
 public static string[] Parse(string command) {
  int count; IntPtr arguments=CommandLineToArgvW(command,out count);
  if(arguments==IntPtr.Zero)throw new InvalidOperationException("Cannot parse command");
  try {var result=new string[count];for(int i=0;i<count;i++)result[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(arguments,i*IntPtr.Size));return result;}
  finally {LocalFree(arguments);}
 }
}
'@
try {
 $host_root=Join-Path $base 'Typora 测试 & space';[IO.Directory]::CreateDirectory($host_root)|Out-Null;[IO.File]::WriteAllText((Join-Path $host_root 'Typora.exe'),'fixture')
 $user_data=Join-Path $base 'profile';$classes=$test_key+'\Classes';$environment=$test_key+'\Environment'
 $env_key=$registry.CreateSubKey($environment);$env_key.SetValue('Path','%USERPROFILE%\Existing;C:\Unrelated',[Microsoft.Win32.RegistryValueKind]::ExpandString);$env_key.Dispose()
 $parameters=@{typora_root=$host_root;user_data=$user_data;registry=$registry;classes_key=$classes;environment_key=$environment}
 for($i=0;$i -lt 20;$i++) {set_typora_shell_integration @parameters -add_path $true -file_menu $true -folder_menu $true}
 $state=get_typora_shell_state $user_data
 assert_true ($state.path_owned -and $state.menus.Count -eq 3) 'All selected integrations must be owned.'
 $env_key=$registry.OpenSubKey($environment);$actual=$env_key.GetValue('Path',$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);$env_key.Dispose()
 assert_true ($actual -ceq ('%USERPROFILE%\Existing;C:\Unrelated;'+$host_root)) 'Repeated installation must preserve literal PATH and avoid duplicates.'
 assert_true ($state.menus[0].command -ceq ('"'+(Join-Path $host_root 'Typora.exe')+'" "%1"')) 'Context command must quote the executable and selected path.'
 # Exercise the public keep-options dispatch with real isolated registry writes; the already-covered asset installer is a no-op here.
 foreach($menu in $state.menus){$menu.command=$menu.command.Replace(' --new','').Replace('\."','"');set_typora_shell_menu $registry $menu.key $menu}
 [IO.File]::WriteAllText((Join-Path $user_data 'typora_code_shell.json'),($state|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 $public_root=Join-Path $base 'public installer';[IO.Directory]::CreateDirectory((Join-Path $public_root 'scripts'))|Out-Null
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../../install_windows.ps1') -Destination $public_root
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../../scripts/lib') -Destination (Join-Path $public_root 'scripts') -Recurse
 $adapter=Join-Path $public_root 'scripts/lib/typora_shell_integration.ps1'
 $adapter_text=[IO.File]::ReadAllText($adapter,[Text.Encoding]::UTF8).Replace("'Software\Classes'",("'"+$classes+"'")).Replace("'Environment'",("'"+$environment+"'"))
 [IO.File]::WriteAllText($adapter,$adapter_text,[Text.UTF8Encoding]::new($true))
 [IO.File]::WriteAllText((Join-Path $public_root 'scripts/install_workspace_windows.ps1'),'param($typora_root,$backup_root,[switch]$non_interactive,[switch]$include_theme,$user_data,[switch]$allow_elevation)',[Text.UTF8Encoding]::new($false))
 [IO.Directory]::CreateDirectory((Join-Path $host_root 'resources'))|Out-Null
 [IO.File]::WriteAllText((Join-Path $host_root 'resources/window.html'),'fixture')
 & (Join-Path $public_root 'install_windows.ps1') -typora_root $host_root -user_data $user_data -non_interactive
 $state=get_typora_shell_state $user_data
 assert_true ($state.add_path -and $state.file_menu -and $state.folder_menu -and !$state.modern_menu) 'Default update must preserve integration options.'
 foreach($menu in $state.menus | Where-Object {$_.key -match '\\Directory\\'}){
  foreach($target in @($host_root,($host_root+'\'),[IO.Path]::GetPathRoot($host_root),'\\server\share\')){
   $arguments=[shell_argument_parser]::Parse($menu.command.Replace('%1',$target).Replace('%V',$target))
   assert_true ($arguments.Count -eq 3 -and $arguments[1] -ceq '--new') 'Directory commands must override global reopen for this invocation and pass exactly one path.'
   assert_true ($arguments[2].IndexOf('"') -lt 0) 'Directory trailing backslashes must not escape the closing quote.'
   assert_true ([IO.Path]::GetFullPath($arguments[2]).TrimEnd('\') -ceq [IO.Path]::GetFullPath($target).TrimEnd('\')) 'Directory commands must retain the exact target after normalization.'
  }
 }
 set_typora_shell_integration @parameters -remove
 $env_key=$registry.OpenSubKey($environment);$actual=$env_key.GetValue('Path',$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);$env_key.Dispose()
 assert_true ($actual -ceq '%USERPROFILE%\Existing;C:\Unrelated') 'Uninstall must retain unrelated PATH.'
 assert_true ($null -eq (get_typora_shell_menu $registry ($classes+'\*\shell\TyporaCode'))) 'Owned menu must be removed.'
 $env_key=$registry.OpenSubKey($environment,$true);$env_key.SetValue('Path',$host_root);$env_key.Dispose()
 set_typora_shell_integration @parameters -add_path $true -file_menu $true -folder_menu $false
 assert_true (!(get_typora_shell_state $user_data).path_owned) 'A pre-existing PATH entry is not owned.'
 $menu_key=$classes+'\*\shell\TyporaCode';$modified=get_typora_shell_menu $registry $menu_key;$modified.command='external modification';set_typora_shell_menu $registry $menu_key $modified
 set_typora_shell_integration @parameters -remove
 assert_true ((get_typora_shell_menu $registry $menu_key).command -ceq 'external modification') 'Uninstall must preserve externally modified menus.'
 $env_key=$registry.OpenSubKey($environment);assert_true ($env_key.GetValue('Path') -ceq $host_root) 'Pre-existing PATH must survive uninstall.';$env_key.Dispose()
 $failed=$false;try {set_typora_shell_integration @parameters -add_path $false -file_menu $true -folder_menu $true}catch{$failed=$true}
 assert_true $failed 'Conflicting foreign menu must reject installation.'
 $registry.DeleteSubKeyTree($menu_key,$false)
 set_typora_shell_integration @parameters -add_path $false -file_menu $false -folder_menu $false
 $receipt=Join-Path $user_data 'typora_code_shell.json';$before=[IO.File]::ReadAllText($receipt)
 $held=[IO.File]::Open($receipt,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try {
  $failed=$false;try{set_typora_shell_integration @parameters -add_path $true -file_menu $true -folder_menu $true}catch{$failed=$true}
  assert_true $failed 'Receipt publication failure must reject the transaction.'
  assert_true ($null -eq (get_typora_shell_menu $registry $menu_key)) 'Receipt failure rolls menus back.'
  assert_true ([IO.File]::ReadAllText($receipt) -ceq $before) 'Receipt failure preserves previous state.'
 }finally{$held.Dispose()}
 set_typora_shell_integration @parameters -add_path $false -file_menu $false -folder_menu $true
 assert_true ((get_typora_shell_state $user_data).menus.Count -eq 2) 'Folder-only selection owns both directory commands.'
 set_typora_shell_integration @parameters -remove
 $successful=$true;Write-Output 'PASS: 20 repeated installs, independent options, quoted paths, owned uninstall and external preservation.'
} finally {
 if($test_key -notmatch '^Software\\TyporaCodeTests\\[a-f0-9]{32}$'){throw 'Unexpected test registry root.'}
 $registry.DeleteSubKeyTree($test_key,$false)
 & python -X utf8 $artifact_manager finish $artifact_root --status $(if($successful){'pass'}else{'fail'})
}
