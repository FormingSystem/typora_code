import node_release from "../node_runtime.json";
import {start_terminal_pty,type terminal_pty} from "./terminal_pty_client";
import {resolve_terminal_launch,type terminal_settings_store,type terminal_profile_config} from "./terminal_settings";
import type {graph_host} from "./git_graph_host";

/** 只管理进程及其生命周期。隐藏、搬移和拆分视图不拥有终止进程的权限。 */
export class terminal_session {
  state:"starting"|"running"|"exited"|"error"="exited";
  status="";pid=0;title:string;icon="terminal";color="";group:string;root:string;
  private pty?:terminal_pty;private startup?:AbortController;private generation=0;private disposed=false;
  private cols=80;private rows=24;private launch_root:string;
  constructor(readonly id:string,root:string,readonly profile:terminal_profile_config,private host:graph_host,private settings:terminal_settings_store,
    private output:(data:string,done:()=>void)=>void,private changed:()=>void,private explicit_cwd=false){
    this.title=profile.title;this.root=root;this.launch_root=root;this.icon=profile.icon||"terminal";this.color=profile.color||"";this.group=id;
  }
  async start(){
    if(this.disposed)return;this.stop();const generation=++this.generation;const startup=new AbortController();this.startup=startup;
    this.state="starting";this.status="正在启动 "+this.profile.title+"…";this.changed();
    const runtime=window as unknown as{reqnode(name:string):any;_options:{userDataPath:string}};
    try{
      if(this.host.process_api.platform!=="win32")throw new Error("集成终端运行包当前支持 Windows x64/ARM64。");
      if(Number(runtime.reqnode("os").release().split(".")[2])<18309)throw new Error("集成终端需要 Windows 10 1903 或更新版本的 ConPTY。");
      // 每次启动从固定的工作区基点解析；相对 cwd 不能在重启时反复追加。
      const profile=this.settings.profiles().find(item=>item.id===this.profile.id)||this.profile;
      const launch=resolve_terminal_launch(this.settings.get(),profile,this.launch_root,this.host.process_api,this.host.path_api,this.explicit_cwd);
      if(!this.host.path_api.isAbsolute(launch.cwd)||!this.host.fs.statSync(launch.cwd).isDirectory())throw new Error("终端工作目录不存在。");
      this.root=launch.cwd;
      const base=this.host.path_api.join(runtime._options.userDataPath,"linux_note_enhancements","terminal_runtime");
      const pty=await start_terminal_pty({signal:startup.signal,child_process:runtime.reqnode("child_process"),process_api:this.host.process_api,
        broker:this.host.path_api.join(base,"1.1.0","terminal_broker.cjs"),executable:this.host.path_api.join(base,"node",node_release.version,"node.exe")},
        {executable:launch.executable,args:launch.args,options:{name:"xterm-256color",cols:this.cols,rows:this.rows,cwd:launch.cwd,env:launch.env,useConpty:true,useConptyDll:false}}, {
          data:data=>{if(!this.disposed&&generation===this.generation)this.output(data,()=>{if(generation===this.generation)this.pty?.acknowledge(data.length);});},
          exit:code=>{if(generation!==this.generation||this.disposed)return;this.pty=undefined;this.pid=0;this.state="exited";this.status=`Shell 已退出（${code}）`;this.changed();},
          error:message=>{if(generation!==this.generation||this.disposed)return;this.state="error";this.status=message;this.changed();},
        });
      if(this.disposed||generation!==this.generation||this.state!=="starting"){pty.kill();return;}
      this.pty=pty;this.pid=pty.pid;this.state="running";this.status="";this.changed();
    }catch(error){if(this.disposed||generation!==this.generation)return;this.state="error";this.status=String(error instanceof Error?error.message:error);this.changed();}
    finally{if(this.startup===startup)this.startup=undefined;}
  }
  write(data:string){this.pty?.write(data);}
  resize(cols:number,rows:number){this.cols=cols;this.rows=rows;this.pty?.resize(cols,rows);}
  stop(){this.generation++;this.startup?.abort();this.startup=undefined;const pty=this.pty;this.pty=undefined;pty?.kill();this.pid=0;this.state="exited";this.status="Shell 已终止";}
  dispose(){if(this.disposed)return;this.disposed=true;this.stop();}
}
