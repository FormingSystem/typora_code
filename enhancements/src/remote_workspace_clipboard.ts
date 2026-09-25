import {create_platform_file_clipboard} from './file_clipboard_platform';
import {remote_files_for} from './remote_workspace_files';
import type {file_clipboard_adapter,file_clipboard_snapshot} from './workspace_file_clipboard';

/** 远程文件不伪装成Windows本地文件列表；工作台共享显式资源格式。 */
export function create_resource_file_clipboard(reqnode:(name:string)=>any):file_clipboard_adapter{
  const native=create_platform_file_clipboard(reqnode),clipboard=reqnode('electron').clipboard,buffer=reqnode('buffer').Buffer;
  const format='application/x-typora-code-remote-files';
  return{
    async read(){
      if(!clipboard.availableFormats().includes(format))return native.read();
      const raw=clipboard.readBuffer(format);
      const value=JSON.parse(raw.toString('utf8')) as file_clipboard_snapshot;
      if(!Array.isArray(value.paths)||value.paths.some(path=>typeof path!=='string'||!remote_files_for(path)))throw Error('请先连接这些文件所属的SSH主机。');
      return value;
    },
    async write(paths){
      if(!paths.some(path=>remote_files_for(path)))return native.write(paths);
      if(paths.some(path=>!remote_files_for(path)))throw Error('请分别复制本地和远程文件。');
      const snapshot={paths:[...paths],version:crypto.randomUUID(),move_requested:false};clipboard.writeBuffer(format,buffer.from(JSON.stringify(snapshot),'utf8'));return snapshot;
    },
    async clear(version){if(clipboard.availableFormats().includes(format))return false;return native.clear(version);},
    dispose(){native.dispose();}
  };
}
