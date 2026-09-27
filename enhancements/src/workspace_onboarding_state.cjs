/** 固定两个小文件记录最近安装；锁只覆盖同步展示/写入，不覆盖用户阅读时间。 */
function create_onboarding_store({fs,path,process,root,sequence}) {
 const receipt_path=path.join(root,'installation.json'),state_root=path.join(root,'settings');
 const state_path=path.join(state_root,'onboarding_state.json'),lock_path=path.join(state_root,'onboarding.lock');
 const read_json=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/u,''));}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}};
 const receipt=read_json(receipt_path);
 const install_id=receipt?.schema===1&&receipt.sequence===sequence&&/^[a-f0-9]{32}$/u.test(receipt.install_id)?receipt.install_id:null;
 const pending=()=>Boolean(install_id&&read_json(receipt_path)?.install_id===install_id&&read_json(state_path)?.install_id!==install_id);
 const claim=show=>{
  if(!pending())return false;
  fs.mkdirSync(state_root,{recursive:true});
  let descriptor;
  try{descriptor=fs.openSync(lock_path,'wx');}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   const owner=read_json(lock_path);
   // 写入所有者前崩溃的空锁，等待30秒后再回收；新建中的锁不能抢走。
   if(!Number.isSafeInteger(owner?.pid)||owner.pid<=0){
    const stamp=fs.statSync(lock_path).mtimeMs;
    if(Date.now()-stamp<30000)return false;
    if(read_json(lock_path)||fs.statSync(lock_path).mtimeMs!==stamp)return false;
    fs.unlinkSync(lock_path);return claim(show);
   }
   try{process.kill(owner.pid,0);return false;}catch(probe){if(probe.code!=='ESRCH')return false;}
   // 只删除仍为刚才读取的锁，避免删除已经替换的所有者。
   if(read_json(lock_path)?.token!==owner.token)return false;
   fs.unlinkSync(lock_path);return claim(show);
  }
  const temporary=state_path+'.tmp';
  try{
   fs.writeFileSync(descriptor,JSON.stringify({pid:process.pid,token:process.pid+':'+Date.now()+':'+Math.random()}),'utf8');
   if(!pending())return false;
   show();
   fs.writeFileSync(temporary,JSON.stringify({schema:1,install_id})+'\n','utf8');
   fs.renameSync(temporary,state_path);
   return true;
  }finally{fs.closeSync(descriptor);fs.rmSync(temporary,{force:true});fs.unlinkSync(lock_path);}
 };
 return {pending,claim};
}
module.exports={create_onboarding_store};
