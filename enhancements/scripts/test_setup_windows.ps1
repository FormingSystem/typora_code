[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$artifact_manager=Join-Path $PSScriptRoot 'manage_test_artifacts.py'
$artifact_root=(& python -X utf8 $artifact_manager create --pid $PID | Select-Object -Last 1)
if($LASTEXITCODE -ne 0){throw 'Test artifact allocation failed.'}
$repository=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$previous_appdata=$env:APPDATA
$passed=$false
function assert_true($value,$message){if(!$value){throw $message}}
try {
 $env:APPDATA=Join-Path $artifact_root 'work/appdata'
 $fixture_root=Join-Path $artifact_root 'work/Typora UI & space'
 [IO.Directory]::CreateDirectory((Join-Path $fixture_root 'resources'))|Out-Null
 [IO.File]::WriteAllText((Join-Path $fixture_root 'Typora.exe'),'fixture')
 [IO.File]::WriteAllText((Join-Path $fixture_root 'resources/window.html'),'<html><head><title>fixture</title></head><body>fixture</body></html>')
 foreach($culture in @('zh-CN','en-US')){
  [Threading.Thread]::CurrentThread.CurrentUICulture=[Globalization.CultureInfo]::GetCultureInfo($culture)
  . (Join-Path $repository 'setup_windows.ps1') -typora_root $fixture_root -validate_only
  foreach($width in @(720,560)){
   $content=$window.Content;$content.Background=$window.Background
   $content.Measure([Windows.Size]::new($width-40,560))
   $content.Arrange([Windows.Rect]::new(0,0,$width-40,560))
   $content.UpdateLayout()
   assert_true ($controls.install.IsDefault -and $controls.close.IsCancel) 'Default and Escape keyboard actions.'
   foreach($name in @('install','check','uninstall','close','add_path','file_menu','folder_menu')){
    $item=$controls[$name];assert_true ($item.ActualWidth -gt 0 -and $item.ActualHeight -gt 0) ('Visible control '+$name)
   }
   $bitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new($width,600,96,96,[Windows.Media.PixelFormats]::Pbgra32)
   $bitmap.Render($content);$encoder=[Windows.Media.Imaging.PngBitmapEncoder]::new();$encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
   $stream=[IO.File]::Create((Join-Path $artifact_root ($culture+'-'+$width+'.png')))
   try{$encoder.Save($stream)}finally{$stream.Dispose()}
  }
  $timer.Stop()
 }
 # Exercise the real WPF polling path while a real redirected child is still alive.
 $live_samples=@()
 $pump={ [Windows.Forms.Application]::DoEvents();$window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background);Start-Sleep -Milliseconds 25 }
 $wait_live={param($test,$label)
  $deadline=[DateTime]::UtcNow.AddSeconds(20)
  while(!(& $test)){if([DateTime]::UtcNow -gt $deadline){throw ('Live log timeout: '+$label)};& $pump}
 }
 $gate=Join-Path $artifact_root 'work/live gate'
 $child_file=Join-Path $artifact_root 'work/live writer.ps1'
 $child_source=@'
param([string]$gate)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
function wait_gate($name){$deadline=[DateTime]::UtcNow.AddSeconds(20);while(!(Test-Path -LiteralPath ($gate+$name))){if([DateTime]::UtcNow -gt $deadline){throw 'Gate timeout'};Start-Sleep -Milliseconds 30}}
Write-Host 'phase_one 中文日志'
[Console]::Error.WriteLine('stderr_one 错误流')
wait_gate '.next'
Write-Host 'phase_two 继续安装'
wait_gate '.finish'
[Console]::Out.Write('stdout_tail 最后一行')
[Console]::Error.Write('stderr_tail 最后错误')
exit 7
'@
 [IO.File]::WriteAllText($child_file,$child_source,[Text.UTF8Encoding]::new($true))
 $script:setup_stdout=Join-Path $artifact_root 'work/live.out.log';$script:setup_stderr=Join-Path $artifact_root 'work/live.err.log'
 $script:setup_log_cache=@{stdout='';stderr=''};$controls.log.Clear()
 $live_clock=[Diagnostics.Stopwatch]::StartNew()
 $script:setup_process=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-NonInteractive','-File',('"'+$child_file+'"'),'-gate',('"'+$gate+'"')) -WindowStyle Hidden -RedirectStandardOutput $script:setup_stdout -RedirectStandardError $script:setup_stderr -PassThru
 $live_child=$script:setup_process;$null=$live_child.Handle
 $controls.install.IsEnabled=$false;$controls.close.IsEnabled=$false;$controls.progress.Visibility='Visible';$controls.progress.IsIndeterminate=$true;$timer.Start()
 try {
  & $wait_live {$controls.log.Text.Contains('phase_one') -and $controls.log.Text.Contains('stderr_one')} 'first stdout/stderr before exit'
  assert_true (!$live_child.HasExited -and $controls.progress.IsIndeterminate -and !$controls.install.IsEnabled) 'Live text appears while operation remains active.'
  $live_samples+=@{stage='first';ms=$live_clock.ElapsedMilliseconds;before_exit=!$live_child.HasExited;text=$controls.log.Text}
  $saved_stdout=$script:setup_stdout;$saved_text=$controls.log.Text;$script:setup_stdout=$gate+'.missing';& $update_log
  assert_true ($controls.log.Text -ceq $saved_text) 'Temporary unreadable stream preserves displayed text.'
  $script:setup_stdout=$saved_stdout
  for($i=0;$i -lt 20;$i++){assert_true ((& $read_log $saved_stdout).Contains('phase_one')) 'Shared read while child owns writer.'}
  [IO.File]::WriteAllText(($gate+'.next'),'go')
  & $wait_live {$controls.log.Text.Contains('phase_two')} 'second phase before exit'
  assert_true (!$live_child.HasExited) 'Second output phase is visible before completion.'
  $live_samples+=@{stage='second';ms=$live_clock.ElapsedMilliseconds;before_exit=!$live_child.HasExited;text=$controls.log.Text}
  [IO.File]::WriteAllText(($gate+'.finish'),'go')
  & $wait_live {$null -eq $script:setup_process} 'final drain'
  assert_true ($controls.status.Text -eq $messages.failure) 'Nonzero child exit remains failure.'
  assert_true ($controls.log.Text.Contains('stdout_tail 最后一行') -and $controls.log.Text.Contains('stderr_tail 最后错误')) 'Final UTF-8 output without newline is retained.'
  assert_true ($controls.install.IsEnabled -and $controls.close.IsEnabled -and !$controls.progress.IsIndeterminate -and $controls.progress.Visibility -eq 'Collapsed') 'Failed completion restores controls and stops progress.'
  $live_samples+=@{stage='complete';ms=$live_clock.ElapsedMilliseconds;text=$controls.log.Text}
  $live_samples|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $artifact_root 'live_log.json') -Encoding UTF8
 } finally {
  [IO.File]::WriteAllText(($gate+'.next'),'go');[IO.File]::WriteAllText(($gate+'.finish'),'go')
  if($script:setup_process){$script:setup_process.WaitForExit();$script:setup_process.Dispose();$script:setup_process=$null};$timer.Stop()
 }
 $run_ui={param($operation)
  $controls[$operation].RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.Button]::ClickEvent))
  $deadline=[DateTime]::UtcNow.AddMinutes(3);$live_texts=[Collections.Generic.HashSet[string]]::new()
  while($script:setup_process -and [DateTime]::UtcNow -lt $deadline){
   [Windows.Forms.Application]::DoEvents()
   $window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background)
   if($script:setup_process -and !$script:setup_process.HasExited -and $controls.log.Text){$null=$live_texts.Add($controls.log.Text)}
   Start-Sleep -Milliseconds 50
  }
  assert_true (!$script:setup_process) ('UI operation timeout: '+$operation)
  if($operation -eq 'install'){assert_true ($live_texts.Count -ge 2) 'Public installation displays changing logs before exit.'}
  Write-Output ('Live '+$operation+' snapshots: '+$live_texts.Count)
  assert_true ($controls.status.Text -eq $messages.success) ($operation+' status='+$controls.status.Text+' expected='+$messages.success+': '+$controls.log.Text)
 }
 & $run_ui 'install'
 & $run_ui 'check'
 # Confirmed fixture uninstall uses the same public child wrapper and WPF reader.
 $request=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((@{typora_root=$fixture_root;non_interactive=$true}|ConvertTo-Json -Compress)))
 $wrapper=Join-Path $repository 'scripts/setup_operation_windows.ps1'
 $script:setup_stdout=Join-Path $artifact_root 'work/uninstall.out.log';$script:setup_stderr=Join-Path $artifact_root 'work/uninstall.err.log'
 $script:setup_log_cache=@{stdout='';stderr=''};$controls.log.Clear()
 $script:setup_process=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-NonInteractive','-OutputFormat','Text','-ExecutionPolicy','Bypass','-File',('"'+$wrapper+'"'),'-operation','uninstall','-parameters_base64',$request) -WindowStyle Hidden -RedirectStandardOutput $script:setup_stdout -RedirectStandardError $script:setup_stderr -PassThru
 $null=$script:setup_process.Handle;$timer.Start();$uninstall_live=$false
 $deadline=[DateTime]::UtcNow.AddMinutes(3)
 while($script:setup_process -and [DateTime]::UtcNow -lt $deadline){& $pump;if($script:setup_process -and !$script:setup_process.HasExited -and $controls.log.Text){$uninstall_live=$true}}
 assert_true (!$script:setup_process -and $controls.status.Text -eq $messages.success -and $uninstall_live) 'Public uninstall output is displayed before exit.'
 & $run_ui 'install'
 & $run_ui 'check'
 assert_true ($controls.host_path.IsEnabled -and $controls.close.IsEnabled -and $controls.progress.Visibility -eq 'Collapsed') 'Completion restores controls.'
 $passed=$true
 Write-Output ('PASS: live redirected UTF-8 output, final failure drain, 20 shared reads, bilingual WPF layouts, public GUI install/check/uninstall/reinstall/check; evidence '+$artifact_root)
} finally {
 $env:APPDATA=$previous_appdata
 & python -X utf8 $artifact_manager finish $artifact_root --status $(if($passed){'pass'}else{'fail'})
}
