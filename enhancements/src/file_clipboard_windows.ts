import type {file_clipboard_snapshot,file_clipboard_adapter} from "./workspace_file_clipboard";

// 固定程序经stdin接收JSON；路径不拼入PowerShell或C#代码。
const WINDOWS_CLIPBOARD_SCRIPT=String.raw`
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
public class file_clipboard_state { public string[] paths; public string version; public bool move_requested; }
public class file_clipboard_native {
 [DllImport("user32.dll",SetLastError=true)] static extern bool OpenClipboard(IntPtr owner);
 [DllImport("user32.dll")] static extern bool CloseClipboard();
 [DllImport("user32.dll",SetLastError=true)] static extern bool EmptyClipboard();
 [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
 [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint format);
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetClipboardData(uint format,IntPtr memory);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern uint RegisterClipboardFormat(string name);
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern uint DragQueryFile(IntPtr drop,uint index,StringBuilder text,uint length);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr GlobalAlloc(uint flags,UIntPtr size);
 [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr memory);
 [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr memory);
 [DllImport("kernel32.dll")] static extern IntPtr GlobalFree(IntPtr memory);
 [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr memory);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateWindowEx(uint ex,string name,string title,uint style,int x,int y,int w,int h,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr parameter);
 [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr window);
 static void open(IntPtr owner) { for(int i=0;i<20;i++){if(OpenClipboard(owner))return;Thread.Sleep(25);}throw new Exception("Clipboard is busy; please retry."); }
 static IntPtr allocate(byte[] bytes){var handle=GlobalAlloc(0x42,(UIntPtr)bytes.Length);if(handle==IntPtr.Zero)throw new Exception("Clipboard allocation failed.");var address=GlobalLock(handle);if(address==IntPtr.Zero){GlobalFree(handle);throw new Exception("Clipboard lock failed.");}try{Marshal.Copy(bytes,0,address,bytes.Length);}finally{GlobalUnlock(handle);}return handle;}
 static file_clipboard_state read_locked(){
  var drop=GetClipboardData(15);var count=drop==IntPtr.Zero?0:DragQueryFile(drop,0xffffffff,null,0);
  var paths=new string[count];for(uint i=0;i<count;i++){uint length=DragQueryFile(drop,i,null,0);if(length==0)throw new Exception("Invalid clipboard path.");var text=new StringBuilder((int)length+1);DragQueryFile(drop,i,text,length+1);paths[i]=text.ToString();}
  var effect=GetClipboardData(RegisterClipboardFormat("Preferred DropEffect"));bool moving=false;
  if(effect!=IntPtr.Zero&&GlobalSize(effect).ToUInt64()>=4){var address=GlobalLock(effect);if(address!=IntPtr.Zero)try{moving=(Marshal.ReadInt32(address)&2)!=0;}finally{GlobalUnlock(effect);}}
  return new file_clipboard_state{paths=paths,version=GetClipboardSequenceNumber().ToString(),move_requested=moving};
 }
 public static file_clipboard_state read(){open(IntPtr.Zero);try{return read_locked();}finally{CloseClipboard();}}
 public static bool clear(string expected){open(IntPtr.Zero);try{if(GetClipboardSequenceNumber().ToString()!=expected)return false;if(!EmptyClipboard())throw new Exception("Clipboard clear failed.");return true;}finally{CloseClipboard();}}
 public static file_clipboard_state write(string[] paths){
  if(paths==null||paths.Length==0||paths.Length>512)throw new Exception("Invalid clipboard file count.");
  foreach(var path in paths)if(String.IsNullOrEmpty(path)||path.Length>32767||path.IndexOf('\0')>=0)throw new Exception("Invalid clipboard path.");
  var names=Encoding.Unicode.GetBytes(String.Join("\0",paths)+"\0\0");var bytes=new byte[20+names.Length];Array.Copy(BitConverter.GetBytes(20),bytes,4);Array.Copy(BitConverter.GetBytes(1),0,bytes,16,4);Array.Copy(names,0,bytes,20,names.Length);
  IntPtr files=IntPtr.Zero,effect=IntPtr.Zero,window=IntPtr.Zero;bool opened=false;
  try{
   files=allocate(bytes);effect=allocate(BitConverter.GetBytes(1));window=CreateWindowEx(0,"STATIC","",0,0,0,0,0,new IntPtr(-3),IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);if(window==IntPtr.Zero)throw new Exception("Clipboard owner creation failed.");
   open(window);opened=true;if(!EmptyClipboard())throw new Exception("Clipboard write failed.");
   if(SetClipboardData(15,files)==IntPtr.Zero)throw new Exception("Clipboard file list write failed.");files=IntPtr.Zero;
   if(SetClipboardData(RegisterClipboardFormat("Preferred DropEffect"),effect)==IntPtr.Zero)throw new Exception("Clipboard copy effect write failed.");effect=IntPtr.Zero;
   // 必须持锁取得本次写入版本；释放后重读会误认其他应用复制的同路径新内容。
   return read_locked();
  }finally{if(opened)CloseClipboard();if(window!=IntPtr.Zero)DestroyWindow(window);if(files!=IntPtr.Zero)GlobalFree(files);if(effect!=IntPtr.Zero)GlobalFree(effect);}
 }
}
'@
try {
 $request=[Console]::In.ReadToEnd() | ConvertFrom-Json
 switch($request.action){
  'read' {$value=[file_clipboard_native]::read()}
  'write' {$value=[file_clipboard_native]::write([string[]]$request.paths)}
  'clear' {$value=[file_clipboard_native]::clear([string]$request.version)}
  default {throw 'Invalid clipboard action.'}
 }
 @{value=$value}|ConvertTo-Json -Depth 5 -Compress
} catch { @{error=$_.Exception.Message}|ConvertTo-Json -Compress;exit 1 }
`;

export function create_windows_file_clipboard(reqnode:(name:string)=>any):file_clipboard_adapter {
  const process_api=reqnode("process"),path_api=reqnode("path"),child_process=reqnode("child_process"),buffer=reqnode("buffer").Buffer;
  const program=path_api.join(process_api.env.SystemRoot||process_api.env.WINDIR||"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
  const args=["-NoProfile","-NonInteractive","-STA","-EncodedCommand",buffer.from(WINDOWS_CLIPBOARD_SCRIPT,"utf16le").toString("base64")];
  const children=new Set<any>();let disposed=false;
  const invoke=<T>(request:unknown)=>new Promise<T>((resolve,reject)=>{
    if(disposed){reject(new Error("文件剪贴板已关闭。"));return;}
    const child=child_process.execFile(program,args,{windowsHide:true,shell:false,timeout:6000,maxBuffer:Infinity,encoding:"utf8"},(error:Error|null,stdout:string)=>{
      children.delete(child);if(disposed){reject(new Error("文件剪贴板已关闭。"));return;}
      try{const result=JSON.parse(stdout);if(result.error)throw new Error(result.error);if(error)throw error;resolve(result.value);}catch(problem){reject(new Error("系统文件剪贴板操作失败："+String(problem instanceof Error?problem.message:problem)));}
    });children.add(child);child.stdin.on("error",()=>{});child.stdin.end(JSON.stringify(request),"utf8");
  });
  return {read:()=>invoke<file_clipboard_snapshot>({action:"read"}),write:paths=>invoke<file_clipboard_snapshot>({action:"write",paths}),clear:version=>invoke<boolean>({action:"clear",version}),dispose(){disposed=true;for(const child of children)child.kill();children.clear();}};
}
