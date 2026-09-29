import {workspace_text} from "./workspace_i18n";
import {prepare_ssh_terminal_auth} from './remote_ssh_auth_context';
import node_release from "../node_runtime.json";
import {start_terminal_pty,type terminal_pty} from "./terminal_pty_client";
import {resolve_terminal_launch,type terminal_settings_store,type terminal_profile_config} from "./terminal_settings";
import type {graph_host} from "./git_graph_host";

/** Only manage the process and its lifecycle. Hiding, moving, and splitting views do not have the authority to terminate processes. */
export class terminal_session {
  state:"starting"|"running"|"exited"|"error"="exited";
  status="";launch_pending=false;pid=0;title:string;icon="terminal";color="";group:string;root:string;
  private ssh_auth?:{dispose:()=>void};
  private pty?:terminal_pty;private startup?:AbortController;private generation=0;private disposed=false;
  private cols=80;private rows=24;private launch_root:string;
  constructor(readonly id:string,root:string,public profile:terminal_profile_config,private host:graph_host,private settings:terminal_settings_store,
    private output:(data:string,done:()=>void)=>void,private changed:()=>void,private explicit_cwd=false,private resolve_cwd?:()=>Promise<string>,private is_current=()=>true,readonly launch_profile?:terminal_profile_config){
    this.title=profile.title;this.root=root;this.launch_root=root;this.icon=profile.icon||"terminal";this.color=profile.color||"";this.group=id;
  }
  async start(){
    if(this.disposed||!this.is_current())return;this.stop();const generation=++this.generation;const startup=new AbortController();this.startup=startup;
    this.state="starting";this.launch_pending=true;this.status=workspace_text("terminal_session_preparing_terminal_working_directory");this.changed();
    let received_output=false;
    const current=()=>!this.disposed&&generation===this.generation&&this.is_current();
    const runtime=window as unknown as{reqnode(name:string):any;_options:{userDataPath:string}};
    try{
      if(this.host.process_api.platform!=="win32")throw new Error(workspace_text("terminal_session_integrated_terminal_runtime_package_currently_supports_windo"));
      if(Number(runtime.reqnode("os").release().split(".")[2])<18309)throw new Error(workspace_text("terminal_session_integrated_terminal_requires_windows_10_1903_or_newer_versio"));
      // Put the preparation into the subsequent task, allowing already mounted panels to have a chance to complete the first frame, without waiting for Shell probe.
      await new Promise<void>(resolve=>setTimeout(resolve,0));if(!current())return;
      if(this.resolve_cwd){const root=await this.resolve_cwd();if(!current())return;this.launch_root=root;this.resolve_cwd=undefined;}
      this.status=workspace_text("terminal_session_detecting_available_shell");this.changed();
      if(!this.launch_profile)await this.settings.ready();if(!current())return;
      const profile=this.launch_profile||this.settings.select_profile(this.profile.id);
      if(this.title===this.profile.title)this.title=profile.title;
      if(!this.profile.executable){this.icon=profile.icon||"terminal";this.color=profile.color||"";}
      this.profile=profile;this.status=workspace_text("terminal_session_starting")+profile.title+workspace_text("terminal_session_process");this.changed();
      const launch=resolve_terminal_launch(this.settings.get(),profile,this.launch_root,this.host.process_api,this.host.path_api,this.explicit_cwd,Boolean(this.launch_profile));
      if(!this.host.path_api.isAbsolute(launch.cwd)||!this.host.fs.statSync(launch.cwd).isDirectory())throw new Error(workspace_text("terminal_session_terminal_working_directory_does_not_exist"));
      if(profile.remote){const auth=await prepare_ssh_terminal_auth(profile.remote.target,profile.remote.port||0,current);if(!current()){auth.dispose();return;}this.ssh_auth=auth;Object.assign(launch.env,auth.env);}
      this.root=launch.cwd;
      const base=this.host.path_api.join(runtime._options.userDataPath,"linux_note_enhancements","terminal_runtime");
      const start_cols=this.cols,start_rows=this.rows;
      const pty=await start_terminal_pty({signal:startup.signal,child_process:runtime.reqnode("child_process"),process_api:this.host.process_api,
        broker:this.host.path_api.join(base,"1.1.0","terminal_broker.cjs"),executable:this.host.path_api.join(base,"node",node_release.version,"node.exe")},
        {executable:launch.executable,args:launch.args,options:{name:"xterm-256color",cols:start_cols,rows:start_rows,cwd:launch.cwd,env:launch.env,useConpty:true,useConptyDll:true}}, {
          data:data=>{if(!current())return;if(data.length){received_output=true;if(this.state==="running"&&this.launch_pending){this.launch_pending=false;this.status="";this.changed();}}this.output(data,()=>{if(generation===this.generation)this.pty?.acknowledge(data.length);});},
          exit:code=>{if(generation!==this.generation||this.disposed)return;this.ssh_auth?.dispose();this.ssh_auth=undefined;this.pty=undefined;this.pid=0;this.state="exited";this.launch_pending=false;this.status=workspace_text("terminal_session_shell_has_exited", {value_0: String(code)});this.changed();},
          error:message=>{if(generation!==this.generation||this.disposed)return;this.ssh_auth?.dispose();this.ssh_auth=undefined;this.state="error";this.launch_pending=false;this.status=message;this.changed();},
        });
      if(!current()||this.state!=="starting"){pty.kill();return;}
      this.pty=pty;if(this.cols!==start_cols||this.rows!==start_rows)pty.resize(this.cols,this.rows);this.pid=pty.pid;this.state="running";this.launch_pending=!received_output;this.status=received_output?"":profile.title+workspace_text("terminal_session_process_has_started_waiting_for_first_output_shell_initializ");this.changed();
    }catch(error){if(this.disposed||generation!==this.generation)return;this.ssh_auth?.dispose();this.ssh_auth=undefined;this.state="error";this.launch_pending=false;this.status=String(error instanceof Error?error.message:error);this.changed();}
    finally{if(this.startup===startup)this.startup=undefined;}
  }
  write(data:string){this.pty?.write(data);}
  resize(cols:number,rows:number){if(cols===this.cols&&rows===this.rows)return;this.cols=cols;this.rows=rows;this.pty?.resize(cols,rows);}
  stop(){this.generation++;this.ssh_auth?.dispose();this.ssh_auth=undefined;this.startup?.abort();this.startup=undefined;const pty=this.pty;this.pty=undefined;pty?.kill();this.pid=0;this.state="exited";this.launch_pending=false;this.status=workspace_text("terminal_session_shell_has_terminated");}
  dispose(){if(this.disposed)return;this.disposed=true;this.stop();}
}
