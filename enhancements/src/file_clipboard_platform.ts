import type {file_clipboard_adapter,file_clipboard_snapshot} from "./workspace_file_clipboard";
import {create_windows_file_clipboard} from "./file_clipboard_windows";

/** 平台层不拥有剪切意图，也不修改文件。 */
export function create_platform_file_clipboard(reqnode:(name:string)=>any):file_clipboard_adapter {
  const platform=reqnode("process").platform;
  if(platform==="win32")return create_windows_file_clipboard(reqnode);
  const clipboard=reqnode("electron").clipboard,buffer=reqnode("buffer").Buffer,url=reqnode("url"),crypto=reqnode("crypto");
  const version=(format:string,raw:string)=>crypto.createHash("sha256").update(format+"\0"+raw).digest("hex");
  const read=():file_clipboard_snapshot=>{
    if(platform!=="linux")throw new Error("当前平台尚未提供系统文件剪贴板。");
    const formats=clipboard.availableFormats(),format=formats.includes("x-special/gnome-copied-files")?"x-special/gnome-copied-files":"text/uri-list";
    const raw=clipboard.readBuffer(format).toString("utf8"),lines=raw.split(/\r?\n/u),moving=format!=="text/uri-list"&&lines.shift()==="cut";
    const paths=lines.filter((line:string)=>line&&!line.startsWith("#")).map((line:string)=>{const parsed=new URL(line);if(parsed.protocol!=="file:"||parsed.hostname&&parsed.hostname!=="localhost")throw new Error("剪贴板包含非本地文件地址。");return url.fileURLToPath(parsed);});
    return {paths,move_requested:moving,version:version(format,raw)};
  };
  return {read:async()=>read(),write:async(paths:string[])=>{
    if(platform!=="linux")throw new Error("当前平台尚未提供系统文件剪贴板。");
    const raw="# typora-code:"+crypto.randomUUID()+"\r\n"+paths.map((path:string)=>url.pathToFileURL(path).href).join("\r\n")+"\r\n";
    clipboard.writeBuffer("text/uri-list",buffer.from(raw,"utf8"));
    // 只认领本次生成的唯一内容；写入后重读可能已是其他应用的新复制。
    return {paths:[...paths],move_requested:false,version:version("text/uri-list",raw)};
  },clear:async()=>{
    // Electron 不提供原子比较清除；保留系统内容，剪切意图由上层失效。
    return false;
  },dispose(){}};
}
