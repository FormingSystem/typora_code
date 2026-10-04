[CmdletBinding()]
param([string]$typora_root='', [switch]$validate_only)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
Add-Type -AssemblyName PresentationFramework, System.Windows.Forms
. (Join-Path $PSScriptRoot 'scripts/lib/typora_environment.ps1')
. (Join-Path $PSScriptRoot 'scripts/lib/typora_shell_integration.ps1')
. (Join-Path $PSScriptRoot 'scripts/lib/typora_locale.ps1')
$zh = (get_typora_locale) -eq 'zh_cn'
$messages = if ($zh) {@{
    title='Typora Code 安装'; introduction='安装或维护 Typora 工作台增强'; host='Typora 安装位置'; browse='浏览…'; path='加入当前用户 PATH（新终端中可使用 typora 命令）'; files='文件右键菜单：使用 Typora Code 打开'; folders='文件夹及目录空白处右键菜单：使用 Typora Code 打开'; install='安装 / 更新'; check='检查安装'; uninstall='卸载增强'; close='关闭'; ready='选择已安装的 Typora。可选系统集成仅作用于当前用户。'; busy='操作进行中，请等待事务完成。'; success='操作完成。安装后请保存文档并手动重启全部 Typora 窗口。'; failure='操作失败。请查看下方日志；备份和个人文档会保留。'; confirm='卸载仅移除增强及它添加的系统集成，保留文档和设置。请先保存并退出全部 Typora 窗口。继续？'; select='选择包含 Typora.exe 的安装文件夹'; log='操作日志'
}} else {@{
    title='Typora Code Setup'; introduction='Install or maintain the Typora workbench'; host='Typora installation'; browse='Browse…'; path='Add to user PATH (typora command in new terminals)'; files='File context menu: Open with Typora Code'; folders='Folder and background context menus: Open with Typora Code'; install='Install / Update'; check='Check installation'; uninstall='Uninstall'; close='Close'; ready='Select an installed Typora. Optional integration applies to the current user.'; busy='Operation in progress. Please wait for the transaction to finish.'; success='Operation completed. After installation, save and restart all Typora windows manually.'; failure='Operation failed. Review the log below; backups and personal documents are preserved.'; confirm='Remove the enhancement and its system integration, keeping documents and settings? Save and exit all Typora windows first.'; select='Select the installation folder containing Typora.exe'; log='Operation log'
}}
[xml]$markup=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Width="720" Height="650" MinWidth="560" MinHeight="500" WindowStartupLocation="CenterScreen">
 <Grid Margin="20"><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
  <TextBlock x:Name="introduction" FontSize="20" TextWrapping="Wrap" Margin="0,0,0,16"/>
  <Grid Grid.Row="1"><Grid.ColumnDefinitions><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions><Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions><Label x:Name="host_label"/><TextBox x:Name="host_path" Grid.Row="1" Padding="5"/><Button x:Name="browse" Grid.Row="1" Grid.Column="1" Margin="8,0,0,0" Padding="12,5"/></Grid>
  <StackPanel Grid.Row="2" Margin="0,16"><CheckBox x:Name="add_path" Margin="0,4"/><CheckBox x:Name="file_menu" Margin="0,4"/><CheckBox x:Name="folder_menu" Margin="0,4"/></StackPanel>
  <StackPanel Grid.Row="3"><TextBlock x:Name="status" TextWrapping="Wrap" Margin="0,0,0,8"/><ProgressBar x:Name="progress" Height="4" Visibility="Collapsed"/></StackPanel>
  <TextBox x:Name="log" Grid.Row="4" Margin="0,10" IsReadOnly="True" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled" FontFamily="Consolas" Padding="8"/>
  <WrapPanel Grid.Row="5" HorizontalAlignment="Right"><Button x:Name="install" Margin="0,0,8,4" Padding="12,7" IsDefault="True"/><Button x:Name="check" Margin="0,0,8,4" Padding="12,7"/><Button x:Name="uninstall" Margin="0,0,8,4" Padding="12,7"/><Button x:Name="close" Margin="0,0,0,4" Padding="12,7" IsCancel="True"/></WrapPanel>
 </Grid>
</Window>
'@
$window=[Windows.Markup.XamlReader]::Load([Xml.XmlNodeReader]::new($markup))
$controls=@{}
foreach ($name in @('introduction','host_label','host_path','browse','add_path','file_menu','folder_menu','status','progress','log','install','check','uninstall','close')) {$controls[$name]=$window.FindName($name)}
$window.Title=$messages.title
$controls.introduction.Text=$messages.introduction
$controls.host_label.Content=$messages.host
foreach ($name in @('browse','install','check','uninstall','close')) {$controls[$name].Content=$messages[$name]}
foreach($pair in @(@('add_path','path'),@('file_menu','files'),@('folder_menu','folders'))){$label=[Windows.Controls.TextBlock]::new();$label.Text=$messages[$pair[1]];$label.TextWrapping='Wrap';$controls[$pair[0]].Content=$label}
[Windows.Automation.AutomationProperties]::SetName($controls.host_path,$messages.host)
[Windows.Automation.AutomationProperties]::SetName($controls.log,$messages.log)
$controls.status.Text=$messages.ready
try { $controls.host_path.Text=resolve_typora_windows_root -typora_root $typora_root -non_interactive } catch { $controls.host_path.Text=$typora_root }
$user_data=get_typora_windows_user_data
try {$state=get_typora_shell_state $user_data; foreach ($name in @('add_path','file_menu','folder_menu')) {$controls[$name].IsChecked=[bool]$state.$name}} catch {$controls.log.Text=$_.Exception.Message}
$script:setup_process=$null
$script:setup_stdout=''; $script:setup_stderr=''
$timer=[Windows.Threading.DispatcherTimer]::new(); $timer.Interval=[TimeSpan]::FromMilliseconds(250)
$read_log={param($file) if (!$file -or !(Test-Path -LiteralPath $file)) {return ''}; try {[IO.File]::ReadAllText($file,[Text.Encoding]::UTF8)} catch {return ''}}
$timer.Add_Tick({
    if (!$script:setup_process) {return}
    $controls.log.Text=(& $read_log $script:setup_stdout)+(& $read_log $script:setup_stderr)
    $controls.log.ScrollToEnd()
    if ($script:setup_process.HasExited) {
        $script:setup_process.WaitForExit()
        $controls.status.Text=if ($script:setup_process.ExitCode -eq 0) {$messages.success} else {$messages.failure}
        $script:setup_process.Dispose(); $script:setup_process=$null
        $controls.progress.Visibility='Collapsed'; $controls.progress.IsIndeterminate=$false
        foreach ($name in @('host_path','browse','add_path','file_menu','folder_menu','install','check','uninstall','close')) {$controls[$name].IsEnabled=$true}
        $timer.Stop()
    }
})
$start_operation={param([string]$operation)
    if ($script:setup_process) {return}
    try {
        $root=resolve_typora_windows_root -typora_root $controls.host_path.Text -non_interactive
        if ($operation -eq 'uninstall' -and [Windows.MessageBox]::Show($window,$messages.confirm,$messages.title,'YesNo','Question') -ne 'Yes') {return}
        $parameters=@{typora_root=$root}
        if ($operation -eq 'install') {$parameters.non_interactive=$true;$parameters.allow_elevation=$true;$parameters.add_path=$(if($controls.add_path.IsChecked){'on'}else{'off'});$parameters.file_menu=$(if($controls.file_menu.IsChecked){'on'}else{'off'});$parameters.folder_menu=$(if($controls.folder_menu.IsChecked){'on'}else{'off'})}
        if ($operation -eq 'uninstall') {$parameters.non_interactive=$true}
        $encoded_request=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($parameters | ConvertTo-Json -Compress)))
        $wrapper=Join-Path $PSScriptRoot 'scripts/setup_operation_windows.ps1'
        $log_root=Join-Path $user_data 'logs/setup'; [IO.Directory]::CreateDirectory($log_root)|Out-Null
        $log_id=[Guid]::NewGuid().ToString('N');$script:setup_stdout=Join-Path $log_root ($log_id+'.out.log');$script:setup_stderr=Join-Path $log_root ($log_id+'.err.log')
        $script:setup_process=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-NonInteractive','-OutputFormat','Text','-ExecutionPolicy','Bypass','-File',('"'+$wrapper+'"'),'-operation',$operation,'-parameters_base64',$encoded_request) -WindowStyle Hidden -RedirectStandardOutput $script:setup_stdout -RedirectStandardError $script:setup_stderr -PassThru
        $null=$script:setup_process.Handle
        foreach ($name in @('host_path','browse','add_path','file_menu','folder_menu','install','check','uninstall','close')) {$controls[$name].IsEnabled=$false}
        $controls.status.Text=$messages.busy;$controls.progress.Visibility='Visible';$controls.progress.IsIndeterminate=$true;$timer.Start()
    } catch {$controls.status.Text=$messages.failure;$controls.log.Text=$_.Exception.Message}
}
$controls.install.Add_Click({& $start_operation 'install'})
$controls.check.Add_Click({& $start_operation 'check'})
$controls.uninstall.Add_Click({& $start_operation 'uninstall'})
$controls.close.Add_Click({$window.Close()})
$controls.browse.Add_Click({$picker=[Windows.Forms.FolderBrowserDialog]::new();try {$picker.Description=$messages.select;$picker.SelectedPath=$controls.host_path.Text;if($picker.ShowDialog() -eq 'OK'){$controls.host_path.Text=$picker.SelectedPath}} finally {$picker.Dispose()}})
$window.Add_Closing({param($sender,$event_args) if($script:setup_process){$event_args.Cancel=$true;$controls.status.Text=$messages.busy}})
if ($validate_only) {Write-Output ('Setup UI validated: '+$controls.Count+' controls');return}
try {$null=$window.ShowDialog()} finally {$timer.Stop()}
