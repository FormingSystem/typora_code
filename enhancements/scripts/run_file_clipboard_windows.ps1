param([string]$NodePath=(Get-Command node -ErrorAction Stop).Source)
$ErrorActionPreference='Stop'
# 独立窗口站拥有独立剪贴板；只新建桌面不能隔离用户剪贴板。
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class clipboard_test_station {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct startup_info {public int cb;public string reserved,desktop,title;public int x,y,xsize,ysize,xcount,ycount,fill,flags;public short show,reserved2;public IntPtr reserved_ptr,input,output,error;}
 [StructLayout(LayoutKind.Sequential)] public struct process_information {public IntPtr process,thread;public uint pid,tid;}
 [DllImport("user32.dll")] public static extern IntPtr GetProcessWindowStation();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder value,uint length,out uint needed);
 public static string name(IntPtr handle){var value=new StringBuilder(1024);uint needed;if(!GetUserObjectInformation(handle,2,value,2048,out needed))throw new Exception("Window station name unavailable");return value.ToString();}
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateWindowStation(string name,uint flags,uint access,IntPtr security);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool SetProcessWindowStation(IntPtr station);
 [DllImport("user32.dll")] public static extern bool CloseWindowStation(IntPtr station);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateDesktop(string name,IntPtr device,IntPtr mode,uint flags,uint access,IntPtr security);
 [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr desktop);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool CreateProcess(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string cwd,ref startup_info startup,out process_information info);
 [DllImport("kernel32.dll")] public static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll")] public static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
 [DllImport("kernel32.dll")] public static extern bool TerminateProcess(IntPtr handle,uint code);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@
$test_station_name='typora_code_clipboard_'+[Guid]::NewGuid().ToString('N')
$test_root=Join-Path (Split-Path $PSScriptRoot -Parent) '..\.cache'
$test_case=Join-Path $test_root $test_station_name
New-Item -ItemType Directory -Path $test_case | Out-Null
$test_case=(Resolve-Path -LiteralPath $test_case).Path
$test_script=Join-Path $PSScriptRoot 'test_file_clipboard_windows.mjs'
$original_station=[clipboard_test_station]::GetProcessWindowStation()
$private_station=[clipboard_test_station]::CreateWindowStation($test_station_name,1,0x37f,[IntPtr]::Zero)
if($private_station -eq [IntPtr]::Zero){throw ('Cannot create isolated window station; run this test in an elevated PowerShell. Win32: '+[Runtime.InteropServices.Marshal]::GetLastWin32Error())}
# 命名窗口站需要管理员权限；CWF_CREATE_ONLY 禁止接管已有窗口站。
$test_station_name=[clipboard_test_station]::name($private_station)
if($test_station_name -eq [clipboard_test_station]::name($original_station) -or $test_station_name -eq 'WinSta0'){[void][clipboard_test_station]::CloseWindowStation($private_station);throw 'Clipboard isolation failed.'}
$private_desktop=[IntPtr]::Zero
$test_info=New-Object clipboard_test_station+process_information
try {
 if(-not [clipboard_test_station]::SetProcessWindowStation($private_station)){throw 'Cannot select isolated window station.'}
 try {$private_desktop=[clipboard_test_station]::CreateDesktop('default',[IntPtr]::Zero,[IntPtr]::Zero,0,0x1ff,[IntPtr]::Zero)}
 finally {if(-not [clipboard_test_station]::SetProcessWindowStation($original_station)){throw 'Cannot restore test launcher window station.'}}
 if($private_desktop -eq [IntPtr]::Zero){throw 'Cannot create isolated desktop.'}
 $test_startup=New-Object clipboard_test_station+startup_info
 $test_startup.cb=[Runtime.InteropServices.Marshal]::SizeOf($test_startup)
 $test_startup.desktop=$test_station_name+'\default'
 $test_command=[Text.StringBuilder]::new('"'+$NodePath+'" "'+$test_script+'" "'+$test_case+'" "'+$test_station_name+'"')
 if(-not [clipboard_test_station]::CreateProcess($NodePath,$test_command,[IntPtr]::Zero,[IntPtr]::Zero,$false,0x08000000,[IntPtr]::Zero,(Split-Path $PSScriptRoot -Parent),[ref]$test_startup,[ref]$test_info)){throw ('Isolated test launch failed: '+[Runtime.InteropServices.Marshal]::GetLastWin32Error())}
 if([clipboard_test_station]::WaitForSingleObject($test_info.process,120000) -ne 0){[void][clipboard_test_station]::TerminateProcess($test_info.process,1);throw 'Isolated clipboard test timed out.'}
 $test_exit=[uint32]0;[void][clipboard_test_station]::GetExitCodeProcess($test_info.process,[ref]$test_exit)
 Get-Content -LiteralPath (Join-Path $test_case 'result.json') -Raw -Encoding UTF8
 if($test_exit -ne 0){throw ('Clipboard test failed; evidence: '+$test_case)}
} finally {
 [void][clipboard_test_station]::SetProcessWindowStation($original_station)
 if($test_info.thread -ne [IntPtr]::Zero){[void][clipboard_test_station]::CloseHandle($test_info.thread)}
 if($test_info.process -ne [IntPtr]::Zero){[void][clipboard_test_station]::CloseHandle($test_info.process)}
 if($private_desktop -ne [IntPtr]::Zero){[void][clipboard_test_station]::CloseDesktop($private_desktop)}
 [void][clipboard_test_station]::CloseWindowStation($private_station)
}
