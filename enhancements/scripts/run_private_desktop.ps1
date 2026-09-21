# 在未切换的独立桌面运行专用宿主副本，只终止该副本的进程。
param([Parameter(Mandatory=$true)][string]$case_root, [int]$wait_ms=60000, [switch]$wait_for_normal_exit)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Drawing
$case_root = [IO.Path]::GetFullPath($case_root)
$evidence_root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.cache/issue_tracking/native'))
if (!$case_root.StartsWith($evidence_root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath (Join-Path $case_root 'setup.json'))) { throw 'Expected prepared private native fixture under repository evidence root' }
$probe_root = $case_root
$case_name = Split-Path -Leaf $case_root
$document_path = Join-Path $case_root 'workspace/front.md'
$exit_on_checks = !$wait_for_normal_exit
New-Item -ItemType Directory -Force -Path $case_root,(Join-Path $case_root 'appdata'),(Join-Path $case_root 'localappdata'),(Join-Path $case_root 'user_data') | Out-Null
$env:APPDATA = Join-Path $case_root 'appdata'
$env:LOCALAPPDATA = Join-Path $case_root 'localappdata'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class isolated_desktop {
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent,enum_windows callback,IntPtr data);
 [StructLayout(LayoutKind.Sequential)] public struct point { public int x,y; }
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd,ref point p);

 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd,StringBuilder text,int count);

 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [StructLayout(LayoutKind.Sequential)] public struct rect { public int left,top,right,bottom; }
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hwnd,int x,int y,int width,int height,bool repaint);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out rect bounds);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int count);
 public delegate bool enum_windows(IntPtr hwnd,IntPtr state);
 [DllImport("user32.dll")] public static extern bool EnumDesktopWindows(IntPtr desktop,enum_windows callback,IntPtr state);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr menu);
 [DllImport("user32.dll")] public static extern IntPtr GetSubMenu(IntPtr menu,int index);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetMenuString(IntPtr menu,uint index,StringBuilder text,int count,uint flags);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd,int index);

 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct startup_info { public int cb; public string reserved; public string desktop; public string title; public int x,y,xsize,ysize,xcount,ycount,fill,flags; public short show,reserved2; public IntPtr reserved_ptr,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] public struct process_information { public IntPtr process,thread; public uint pid,tid; }
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateDesktop(string name,IntPtr device,IntPtr mode,uint flags,uint access,IntPtr security);
 [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr desktop);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool CreateProcess(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string cwd,ref startup_info startup,out process_information info);
 [DllImport("kernel32.dll")] public static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll")] public static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@
[void][isolated_desktop]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$desktop_name = 'typora_code_integrity_' + [Guid]::NewGuid().ToString('N')
$desktop = [isolated_desktop]::CreateDesktop($desktop_name,[IntPtr]::Zero,[IntPtr]::Zero,0,0x01ff,[IntPtr]::Zero)
if ($desktop -eq [IntPtr]::Zero) { throw 'Private desktop creation failed' }
$exe = Join-Path $probe_root 'host\Typora.exe'
$startup = New-Object isolated_desktop+startup_info
$startup.cb = [Runtime.InteropServices.Marshal]::SizeOf($startup)
$startup.desktop = $desktop_name
$info = New-Object isolated_desktop+process_information
if (!$document_path) { $document_path=Join-Path $probe_root 'sample.md' }
$command = New-Object Text.StringBuilder
[void]$command.Append('"' + $exe + '" --no-sandbox --disable-gpu --user-data-dir="' + (Join-Path $case_root 'user_data') + '" "' + $document_path + '"')
$watch = [Diagnostics.Stopwatch]::StartNew()
try {
 if (-not [isolated_desktop]::CreateProcess($exe,$command,[IntPtr]::Zero,[IntPtr]::Zero,$false,0,[IntPtr]::Zero,(Join-Path $probe_root 'host'),[ref]$startup,[ref]$info)) { throw ('CreateProcess failed: '+[Runtime.InteropServices.Marshal]::GetLastWin32Error()) }
 [void][isolated_desktop]::WaitForSingleObject($info.process,5000)
 $resize=[isolated_desktop+enum_windows]{param($hwnd,$state)
   $owner=[uint32]0;[void][isolated_desktop]::GetWindowThreadProcessId($hwnd,[ref]$owner)
   if($owner -eq $info.pid){$title=[Text.StringBuilder]::new(1024);[void][isolated_desktop]::GetWindowText($hwnd,$title,1024);if($title.ToString().EndsWith(' - Typora')){[void][isolated_desktop]::MoveWindow($hwnd,0,0,2100,1300,$true)}}
   return $true
 };[void][isolated_desktop]::EnumDesktopWindows($desktop,$resize,[IntPtr]::Zero)
 # 几何夹具先等外部布局阶段结束，不能把运行器改窗口尺寸误判为产品回归。
 @{completed=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $case_root 'window_bounds_ready.json') -Encoding utf8
 $review_deadline=$watch.ElapsedMilliseconds+$wait_ms
 $all_windows_seen=[Collections.Generic.Dictionary[string,object]]::new()
 $inspect_all=[isolated_desktop+enum_windows]{param($hwnd,$state)
  $owner=[uint32]0;[void][isolated_desktop]::GetWindowThreadProcessId($hwnd,[ref]$owner)
  $label=[Text.StringBuilder]::new(1024);[void][isolated_desktop]::GetWindowText($hwnd,$label,1024)
  $all_windows_seen[$hwnd.ToInt64().ToString()]=@{hwnd=$hwnd.ToInt64();pid=$owner;title=$label.ToString()}
  return $true
 }
 $captured_stages=[Collections.Generic.HashSet[string]]::new()
 do {
  $request_path=Join-Path $case_root 'capture_request.json'
  if(Test-Path -LiteralPath $request_path) {
   try {$request=Get-Content -LiteralPath $request_path -Raw -Encoding utf8 | ConvertFrom-Json} catch {$request=$null}
   if($request -and $request.stage -match '^[a-z0-9_]+$' -and !$captured_stages.Contains($request.stage)) {
    $stage=$request.stage
    $capture_stage=[isolated_desktop+enum_windows]{param($hwnd,$state)
     $owner=[uint32]0;[void][isolated_desktop]::GetWindowThreadProcessId($hwnd,[ref]$owner)
     if($owner -eq $info.pid) {
      $title=[Text.StringBuilder]::new(1024);[void][isolated_desktop]::GetWindowText($hwnd,$title,1024)
      if($title.ToString().EndsWith(' - Typora')) {
       $bounds=New-Object isolated_desktop+rect;[void][isolated_desktop]::GetWindowRect($hwnd,[ref]$bounds)
       $bitmap=[Drawing.Bitmap]::new($bounds.right-$bounds.left,$bounds.bottom-$bounds.top)
       $graphics=[Drawing.Graphics]::FromImage($bitmap);$dc=$graphics.GetHdc()
       try {[void][isolated_desktop]::PrintWindow($hwnd,$dc,2)} finally {$graphics.ReleaseHdc($dc)}
       $bitmap.Save((Join-Path $case_root ('stage_'+$stage+'_'+$hwnd.ToInt64()+'.png')),[Drawing.Imaging.ImageFormat]::Png)
       $graphics.Dispose();$bitmap.Dispose()
      }
     }
     return $true
    };[void][isolated_desktop]::EnumDesktopWindows($desktop,$capture_stage,[IntPtr]::Zero)
    # renderer正读取回执时Windows可能拒绝写入；只有确认写入成功才标记阶段完成。
    try {
     @{stage=$stage}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $case_root 'capture_done.json') -Encoding utf8 -ErrorAction Stop
     [void]$captured_stages.Add($stage)
    } catch [System.IO.IOException] { Write-Output ('Retry capture acknowledgement: '+$stage) }
   }
  }
  [void][isolated_desktop]::EnumDesktopWindows($desktop,$inspect_all,[IntPtr]::Zero)
  $wait=[isolated_desktop]::WaitForSingleObject($info.process,150)
  if($exit_on_checks -and (Test-Path -LiteralPath (Join-Path $case_root 'checks.json'))) {
   try {$completed=Get-Content -LiteralPath (Join-Path $case_root 'checks.json') -Raw -Encoding utf8 | ConvertFrom-Json} catch {$completed=$null}
   if($completed -and $completed.status -in @('PASS','REPRODUCED','ERROR')) {break}
  }
 } while($wait -eq 258 -and $watch.ElapsedMilliseconds -lt $review_deadline)
 $all_windows_seen.Values | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $case_root 'all_desktop_windows.json') -Encoding utf8
 $exit_code = [uint32]0
 [void][isolated_desktop]::GetExitCodeProcess($info.process,[ref]$exit_code)
 $native_windows = [Collections.Generic.List[object]]::new()
 $callback = [isolated_desktop+enum_windows]{param($hwnd,$state)
  $window_pid=[uint32]0
  [void][isolated_desktop]::GetWindowThreadProcessId($hwnd,[ref]$window_pid)
  if ($window_pid -eq $info.pid) {
   $title=[Text.StringBuilder]::new(1024)
   [void][isolated_desktop]::GetWindowText($hwnd,$title,1024)
   $bounds=New-Object isolated_desktop+rect
   [void][isolated_desktop]::GetWindowRect($hwnd,[ref]$bounds)
   if (($bounds.right-$bounds.left) -gt 150 -and ($bounds.bottom-$bounds.top) -gt 150) {
    try {
     $automation=[System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
     $elements=$automation.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
     $accessible=@($elements | ForEach-Object { @{name=$_.Current.Name;type=$_.Current.ControlType.ProgrammaticName;accelerator=$_.Current.AcceleratorKey;access_key=$_.Current.AccessKey} })
     $accessible | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $case_root ('accessibility_'+$hwnd.ToInt64()+'.json')) -Encoding utf8
    } catch { $_ | Out-String | Set-Content -LiteralPath (Join-Path $case_root 'accessibility_error.txt') -Encoding utf8 }
    $bitmap=[Drawing.Bitmap]::new($bounds.right-$bounds.left,$bounds.bottom-$bounds.top)
    $graphics=[Drawing.Graphics]::FromImage($bitmap)
    $dc=$graphics.GetHdc()
    try { $captured=[isolated_desktop]::PrintWindow($hwnd,$dc,2) } finally { $graphics.ReleaseHdc($dc) }
    $bitmap.Save((Join-Path $case_root ('window_'+$hwnd.ToInt64()+'.png')),[Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose();$bitmap.Dispose()
   }
   $menu=[isolated_desktop]::GetMenu($hwnd)
   $menu_items=[Collections.Generic.List[object]]::new()
   for($i=0;$i -lt [isolated_desktop]::GetMenuItemCount($menu);$i++) {
    $label=[Text.StringBuilder]::new(512)
    [void][isolated_desktop]::GetMenuString($menu,$i,$label,512,0x400)
    $submenu=[isolated_desktop]::GetSubMenu($menu,$i)
    $menu_items.Add(@{label=$label.ToString();submenu_count=[isolated_desktop]::GetMenuItemCount($submenu)})
   }
   $native_windows.Add(@{title=$title.ToString();hwnd=$hwnd.ToInt64();style=[isolated_desktop]::GetWindowLong($hwnd,-16);native_menu=$menu.ToInt64();items=$menu_items.ToArray()})
  }
  return $true
 }
 [void][isolated_desktop]::EnumDesktopWindows($desktop,$callback,[IntPtr]::Zero)
 $result = @{native_windows=$native_windows.ToArray();case=$case_name;pid=$info.pid;elapsed_ms=$watch.ElapsedMilliseconds;wait_result=$wait;exit_code=$exit_code;private_desktop=$desktop_name;switched_desktop=$false;appdata=$env:APPDATA}
 $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $case_root 'result.json') -Encoding utf8
 $result | ConvertTo-Json -Depth 10
} finally {
 # Only processes with the exact private-copy executable path may be stopped.
 Get-Process Typora -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
 if ($info.thread -ne [IntPtr]::Zero) { [void][isolated_desktop]::CloseHandle($info.thread) }
 if ($info.process -ne [IntPtr]::Zero) { [void][isolated_desktop]::CloseHandle($info.process) }
 [void][isolated_desktop]::CloseDesktop($desktop)
}
