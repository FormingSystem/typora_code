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
 $run_ui={param($operation)
  $controls[$operation].RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.Button]::ClickEvent))
  $deadline=[DateTime]::UtcNow.AddMinutes(3)
  while($script:setup_process -and [DateTime]::UtcNow -lt $deadline){
   [Windows.Forms.Application]::DoEvents()
   $window.Dispatcher.Invoke([Action]{},[Windows.Threading.DispatcherPriority]::Background)
   Start-Sleep -Milliseconds 50
  }
  assert_true (!$script:setup_process) ('UI operation timeout: '+$operation)
  assert_true ($controls.status.Text -eq $messages.success) ($operation+' status='+$controls.status.Text+' expected='+$messages.success+': '+$controls.log.Text)
 }
 & $run_ui 'install'
 & $run_ui 'check'
 & (Join-Path $repository 'uninstall_windows.ps1') -typora_root $fixture_root -non_interactive
 & $run_ui 'install'
 & $run_ui 'check'
 assert_true ($controls.host_path.IsEnabled -and $controls.close.IsEnabled -and $controls.progress.Visibility -eq 'Collapsed') 'Completion restores controls.'
 $passed=$true
 Write-Output ('PASS: bilingual WPF layouts, public GUI install/check/uninstall/reinstall/check; evidence '+$artifact_root)
} finally {
 $env:APPDATA=$previous_appdata
 & python -X utf8 $artifact_manager finish $artifact_root --status $(if($passed){'pass'}else{'fail'})
}
