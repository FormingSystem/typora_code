/** Fix two small files to record the recent installation; the lock only covers the synchronization display/write, not the user reading time. */
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
   // If the lock is empty and the program crashes before writing the owner, wait for 30 seconds before recycling; new locks cannot take over.
   if(!Number.isSafeInteger(owner?.pid)||owner.pid<=0){
    const stamp=fs.statSync(lock_path).mtimeMs;
    if(Date.now()-stamp<30000)return false;
    if(read_json(lock_path)||fs.statSync(lock_path).mtimeMs!==stamp)return false;
    fs.unlinkSync(lock_path);return claim(show);
   }
   try{process.kill(owner.pid,0);return false;}catch(probe){if(probe.code!=='ESRCH')return false;}
   // Only delete the lock that is still read just now, to avoid deleting the owner who has already been replaced.
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
