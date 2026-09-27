export type language_environment_candidate={path:string;kind:'server'|'runtime'|'compiler';source:string;args:string[]};
const host_node=(name:string)=>(window as any).reqnode(name);
/** 只探测环境变量和工程约定位置；不运行候选，不递归扫描或改写PATH。 */
export async function discover_language_environments(language:string,root:string,node=host_node):Promise<language_environment_candidate[]>{
 const path=node('path'),process=node('process'),fs=node('fs').promises,env=process.env,windows=process.platform==='win32',suffix=windows?'.exe':'';
 const pending:language_environment_candidate[]=[],seen=new Set<string>();
 const add=(file:string,kind:language_environment_candidate['kind'],source:string,args:string[]=[])=>{if(!file||!path.isAbsolute(file))return;const absolute=path.resolve(file),key=windows?absolute.toLowerCase():absolute;if(seen.has(key))return;seen.add(key);pending.push({path:absolute,kind,source,args:path.basename(absolute).toLowerCase().replace(/\.exe$/,'')==='clangd'?['--background-index=true','--clang-tidy=false','--pch-storage=memory','--log=error','--enable-config=false']:args});};
 const python=(directory:string,source:string)=>{if(directory)add(path.join(directory,windows?'Scripts/python.exe':'bin/python'),'runtime',source,['-m','pylsp']);};
 if(language==='python'){python(env.VIRTUAL_ENV,'VIRTUAL_ENV');if(env.CONDA_PREFIX)add(path.join(env.CONDA_PREFIX,windows?'python.exe':'bin/python'),'runtime','CONDA_PREFIX',['-m','pylsp']);if(root){python(path.join(root,'.venv'),'工程 .venv');python(path.join(root,'venv'),'工程 venv');}}
 if(language==='c'||language==='cpp'){if(env.CLANGD_PATH)add(env.CLANGD_PATH,'server','CLANGD_PATH');if(env.LLVM_PATH)for(const dir of [env.LLVM_PATH,path.join(env.LLVM_PATH,'bin')])add(path.join(dir,'clangd'+suffix),'server','LLVM_PATH');}
 if(language==='java')for(const name of ['JAVA_HOME','JDK_HOME'])if(env[name])add(path.join(env[name],'bin','java'+suffix),'runtime',name);
 if(language==='rust'){const home=env.CARGO_HOME||(env.USERPROFILE||env.HOME?path.join(env.USERPROFILE||env.HOME,'.cargo'):'');if(home)for(const [name,kind] of [['rust-analyzer','server'],['rustc','compiler'],['cargo','compiler']] as const)add(path.join(home,'bin',name+suffix),kind,'Cargo环境');}
 if(language==='csharp'&&env.DOTNET_ROOT)add(path.join(env.DOTNET_ROOT,'dotnet'+suffix),'runtime','DOTNET_ROOT');
 const programs:Record<string,[string,language_environment_candidate['kind'],string[]?][]>= {
  c:[['clangd','server'],['clang','compiler'],['gcc','compiler'],['cl','compiler']],cpp:[['clangd','server'],['clang++','compiler'],['g++','compiler'],['cl','compiler']],
  python:[['pylsp','server'],['python','runtime',['-m','pylsp']],['python3','runtime',['-m','pylsp']]],
  java:[['java','runtime'],['javac','compiler']],shell:[['bash-language-server','server',['start']],['node','runtime'],['bash','compiler']],
  powershell:[['pwsh','runtime'],['powershell','runtime']],csharp:[['csharp-ls','server'],['dotnet','runtime']],rust:[['rust-analyzer','server'],['rustc','compiler'],['cargo','compiler']],
 };
 const dirs=String(env.PATH||env.Path||'').split(path.delimiter).map((dir:string)=>dir.replace(/^"|"$/g,'')).filter((dir:string)=>path.isAbsolute(dir));
 for(const dir of dirs)for(const [name,kind,args] of programs[language]||[['node','runtime']])add(path.join(dir,name+suffix),kind,'PATH',args);
 const candidates:language_environment_candidate[]=[];
 // 分批异步stat，不堵塞渲染，也不为很长的PATH同时创建无限请求。
 for(let start=0;start<pending.length;start+=16)await Promise.all(pending.slice(start,start+16).map(async candidate=>{try{if(!(await fs.stat(candidate.path)).isFile())return;if(!windows)await fs.access(candidate.path,node('fs').constants.X_OK);candidates.push(candidate);}catch{}}));
 return candidates.sort((a,b)=>pending.indexOf(a)-pending.indexOf(b));
}
export async function resolve_python_environment(directory:string,root:string,node=host_node):Promise<string>{
 const path=node('path'),process=node('process'),fs=node('fs').promises;
 if(!directory.trim()||/[\0\r\n]/.test(directory))throw Error('请输入虚拟环境目录。');
 if(!path.isAbsolute(directory)&&!root)throw Error('相对虚拟环境目录需要先打开工程。');
 const file=path.join(path.resolve(root||'',directory),process.platform==='win32'?'Scripts/python.exe':'bin/python');
 try{if((await fs.stat(file)).isFile())return file;}catch{}
 throw Error('此目录未找到Python虚拟环境解释器；请检查Scripts/python.exe或bin/python。');
}
