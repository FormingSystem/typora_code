export type git_operation_state = Readonly<{busy:boolean;running:boolean;enabled:boolean;kind:string;label:string;revision:number}>;

/** 仓库控制器的真实活动；令牌保证被替代的异步任务不能结束新操作。 */
export class git_operation_progress {
  private activities = new Map<symbol,{kind:string;label:string;waiting:boolean}>();
  private listeners = new Set<(state:git_operation_state)=>void>();
  private revision = 0;
  private enabled = true;
  private disposed = false;
  get state():git_operation_state {
    const values=[...this.activities.values()],running=values.filter(value=>!value.waiting);
    // 命令引起的刷新仍属于该命令，底栏旋转一直持续到刷新收尾。
    const active=running.filter(value=>value.kind!=="refresh").at(-1)||running.at(-1)||values.at(-1);
    return {busy:values.length>0,running:values.some(value=>!value.waiting),enabled:this.enabled,kind:active?.kind||"",label:active?.label||"",revision:this.revision};
  }
  private emit():void {this.revision++;const state=this.state;for(const listener of this.listeners)listener(state);}
  begin(kind:string,label:string){
    const token=Symbol(kind),activity={kind,label,waiting:false};
    if(!this.disposed){this.activities.set(token,activity);this.emit();}
    return {
      phase:(label:string,waiting=false)=>{if(this.activities.has(token)){activity.label=label;activity.waiting=waiting;this.emit();}},
      finish:()=>{if(this.activities.delete(token))this.emit();},
    };
  }
  configure(enabled:boolean):void {if(this.enabled!==enabled){this.enabled=enabled;this.emit();}}
  subscribe(listener:(state:git_operation_state)=>void):()=>void {if(this.disposed)return()=>{};this.listeners.add(listener);listener(this.state);return()=>{this.listeners.delete(listener);};}
  reset():void {this.activities.clear();this.emit();}
  dispose():void {if(this.disposed)return;this.disposed=true;this.reset();this.listeners.clear();}
}
