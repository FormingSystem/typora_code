'use strict';
const net=require('node:net'),crypto=require('node:crypto'),path=require('node:path');
/** 每个SSH进程拥有独立随机认证令牌；密码仅在ASKPASS短连接中返回。 */
async function create_ssh_auth({asset_root,node_path,authenticate,is_current=()=>true}){
 const token=crypto.randomBytes(32).toString('hex'),sockets=new Set();let disposed=false;
 const server=net.createServer(socket=>{
  if(disposed||sockets.size>=4){socket.destroy();return;}sockets.add(socket);let input='',requested=false;
  socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setTimeout(120000,()=>socket.destroy());
  socket.on('data',chunk=>{input+=chunk;if(input.length>65536)return socket.destroy();if(requested||!input.includes('\n'))return;requested=true;
   void(async()=>{try{const message=JSON.parse(input);if(message.token!==token||disposed||!is_current())return socket.destroy();const answer=await authenticate(String(message.prompt),()=>disposed||!is_current());if(disposed||!is_current()||typeof answer!=='string')return socket.destroy();socket.end(JSON.stringify({answer})+'\n');}catch{socket.destroy();}})();
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return{env:{SSH_ASKPASS:node_path,SSH_ASKPASS_REQUIRE:'force',DISPLAY:'typora-code:0',NODE_OPTIONS:'--import '+JSON.stringify(require('node:url').pathToFileURL(path.join(asset_root,'remote_ssh_askpass.mjs')).href),TYPORA_SSH_AUTH_PORT:String(server.address().port),TYPORA_SSH_AUTH_TOKEN:token},dispose(){disposed=true;server.close();for(const socket of sockets)socket.destroy();sockets.clear();}};
}
module.exports={create_ssh_auth};
