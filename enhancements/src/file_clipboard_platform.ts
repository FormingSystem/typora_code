import {workspace_text} from "./workspace_i18n";
import type {file_clipboard_adapter,file_clipboard_snapshot} from "./workspace_file_clipboard";
import {create_windows_file_clipboard} from "./file_clipboard_windows";

/** The platform layer does not own the cut intent, and also does not modify the file. */
export function create_platform_file_clipboard(reqnode:(name:string)=>any):file_clipboard_adapter {
  const platform=reqnode("process").platform;
  if(platform==="win32")return create_windows_file_clipboard(reqnode);
  const clipboard=reqnode("electron").clipboard,buffer=reqnode("buffer").Buffer,url=reqnode("url"),crypto=reqnode("crypto");
  const version=(format:string,raw:string)=>crypto.createHash("sha256").update(format+"\0"+raw).digest("hex");
  const read=():file_clipboard_snapshot=>{
    if(platform!=="linux")throw new Error(workspace_text("file_clipboard_platform_the_system_file_clipboard_is_not_available_on_the_current_pl"));
    const formats=clipboard.availableFormats(),format=formats.includes("x-special/gnome-copied-files")?"x-special/gnome-copied-files":"text/uri-list";
    const raw=clipboard.readBuffer(format).toString("utf8"),lines=raw.split(/\r?\n/u),moving=format!=="text/uri-list"&&lines.shift()==="cut";
    const paths=lines.filter((line:string)=>line&&!line.startsWith("#")).map((line:string)=>{const parsed=new URL(line);if(parsed.protocol!=="file:"||parsed.hostname&&parsed.hostname!=="localhost")throw new Error(workspace_text("file_clipboard_platform_the_clipboard_contains_non_local_file_addresses"));return url.fileURLToPath(parsed);});
    return {paths,move_requested:moving,version:version(format,raw)};
  };
  return {read:async()=>read(),write:async(paths:string[])=>{
    if(platform!=="linux")throw new Error(workspace_text("file_clipboard_platform_the_system_file_clipboard_is_not_available_on_the_current_pl"));
    const raw="# typora-code:"+crypto.randomUUID()+"\r\n"+paths.map((path:string)=>url.pathToFileURL(path).href).join("\r\n")+"\r\n";
    clipboard.writeBuffer("text/uri-list",buffer.from(raw,"utf8"));
    // Only claim the unique content generated this time; after writing, re-reading may already be a new copy of other applications.
    return {paths:[...paths],move_requested:false,version:version("text/uri-list",raw)};
  },clear:async()=>{
    // The Electron does not provide atomic comparison clearance; retain system content, and the cut intent is invalid by the upper layer.
    return false;
  },dispose(){}};
}
