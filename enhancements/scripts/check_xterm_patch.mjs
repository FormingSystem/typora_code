import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const upstream_root=path.join(root,'node_modules/@xterm/xterm');
const vendor_root=path.join(root,'vendor/xterm');
const digest=source=>createHash('sha256').update(source).digest('hex');
const old_body='scrollUp(e){let i=e.params[0]||1;for(;i--;)this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollTop,1),this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollBottom,0,this._activeBuffer.getBlankLine(this._eraseAttrData()));return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0}';
const new_body=`scrollUp(e){
  // Typora Code：ConPTY全屏普通缓冲的SU保留历史，其他协议路径保持上游行为。
  const buffer=this._activeBuffer;
  if(this._optionsService.rawOptions.windowsPty.backend==='conpty'&&buffer===this._bufferService.buffers.normal&&buffer.scrollTop===0&&buffer.scrollBottom===this._bufferService.rows-1){
    const saved_row=buffer.savedY-buffer.ybase;
    let count=Math.min(e.params[0]||1,this._bufferService.rows);
    while(count--)this._bufferService.scroll(this._eraseAttrData());
    // SU不移动保存的屏幕光标；容量已满或为0时同样保留原相对行。
    buffer.savedY=buffer.ybase+saved_row;
    this._dirtyRowTracker.markRangeDirty(buffer.scrollTop,buffer.scrollBottom);
    return true;
  }
  ${old_body.slice('scrollUp(e){'.length,-1)}
}`;

export function check_xterm_patch(write=false){
 const source=fs.readFileSync(path.join(upstream_root,'lib/xterm.mjs'),'utf8');
 const metadata=JSON.parse(fs.readFileSync(path.join(vendor_root,'SOURCE.json'),'utf8'));
 const version=JSON.parse(fs.readFileSync(path.join(upstream_root,'package.json'),'utf8')).version;
 if(version!==metadata.version||digest(source)!==metadata.upstream_sha256||source.split(old_body).length!==2)throw Error('xterm依赖或SU原片段变化，请重新审查本地补丁');
 const expected=source.replace(old_body,new_body).replace(/\n\/\/# sourceMappingURL=[^\r\n]+/u,'');
 const target=path.join(vendor_root,'xterm.mjs');
 if(write)fs.writeFileSync(target,expected,'utf8');
 if(fs.readFileSync(target,'utf8')!==expected)throw Error('xterm本地补丁与锁定依赖生成结果不一致');
 const license=fs.readFileSync(path.join(upstream_root,'LICENSE'),'utf8');
 if(write)fs.writeFileSync(path.join(vendor_root,'LICENSE'),license,'utf8');
 if(fs.readFileSync(path.join(vendor_root,'LICENSE'),'utf8')!==license)throw Error('xterm MIT许可证不一致');
 return {version,upstream_sha256:digest(source),patched_sha256:digest(expected)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(check_xterm_patch(process.argv.includes('--write'))));
