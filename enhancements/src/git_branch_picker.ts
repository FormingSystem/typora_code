import type {git_graph_panel} from "./git_graph_panel";
import {read_checkout_refs,prepare_checkout,type checkout_ref,type checkout_request} from "./git_branch_checkout";
import {git_graph_text as text,git_graph_language_tag} from "./git_graph_i18n";
import {git_icon,type git_icon_name} from "./git_icons";
import {workspace_element as el,workspace_button as button} from "./workspace_widgets";
import {capture_workspace_focus,register_workspace_dismissal} from "./workspace_focus";
import {acquire_workspace_style} from "./workspace_styles";
import {acquire_workspace_interaction} from "./workspace_interaction";
import base_css from "./git_scm_ref_picker.css";
import css from "./git_branch_picker.css";
type choice={id:string;label:string;icon:git_icon_name;ref?:checkout_ref;group?:string};
let active_picker:git_branch_picker|undefined,sequence=0;
const age=(date:number)=>{const seconds=Math.max(0,(Date.now()/1000)-date),units:[Intl.RelativeTimeFormatUnit,number][]=[["year",31536000],["month",2592000],["day",86400],["hour",3600],["minute",60]];const [unit,size]=units.find(([,size])=>seconds>=size)||["second",1];return new Intl.RelativeTimeFormat(git_graph_language_tag(),{numeric:"auto"}).format(-Math.floor(seconds/size),unit);};
/** 检出单选独立于历史引用多选；写入继续由panel管理。 */
export class git_branch_picker {
  private dismiss?:(restore:boolean)=>void;
  private available?:()=>boolean;
  constructor(private panel:git_graph_panel){}
  close(restore=true):void{this.dismiss?.(restore);}
  update_state():void{if(this.available&&!this.available())this.close(false);}
  open():void{
    active_picker?.close();
    const panel=this.panel,state=panel.state,root_path=panel.root,runner=panel.runner,writer=panel.writer,epoch=panel.repository_epoch;
    if(!state||state.root!==root_path||panel.pending||panel.writing||panel.disposed)return;
    panel.ref_picker.close();
    const previous=capture_workspace_focus(),root=el("div","git-scm-ref-picker git-branch-picker"),header=el("div","git-scm-ref-header"),wrap=el("div","git-scm-ref-input"),input=el("input","git-scm-ref-filter"),list=el("div","git-scm-ref-list"),status=el("div","git-branch-status");
    const uid=++sequence;root.dataset.gitBranchPicker="ready";root.setAttribute("role","dialog");root.setAttribute("aria-label",text("checkout.placeholder"));
    input.autocomplete="off";input.setAttribute("role","combobox");input.setAttribute("aria-expanded","true");input.setAttribute("aria-autocomplete","list");list.id="git-branch-list-"+uid;list.setAttribute("role","listbox");input.setAttribute("aria-controls",list.id);status.setAttribute("role","status");
    wrap.append(input);header.append(wrap);root.append(header,list,status);document.body.append(root);
    const style=acquire_workspace_style("typora-code-style:git-scm-ref-picker",base_css),own_style=acquire_workspace_style("typora-code-style:git-branch-picker",css),interaction=acquire_workspace_interaction(root);
    let refs:checkout_ref[]=[],visible:choice[]=[],selected="",closed=false,loading=true,validating=false,mode:"checkout"|"from"|"detached"|"name"="checkout",source:checkout_ref|undefined;
    const valid=()=>!closed&&!panel.disposed&&!panel.pending&&!panel.writing&&panel.root===root_path&&panel.runner===runner&&panel.writer===writer&&panel.repository_epoch===epoch&&panel.state===state;
    const close=(restore:boolean)=>{if(closed)return;closed=true;const owned=dismissal.owns_focus();dismissal.dispose();root.remove();interaction.remove();style.remove();own_style.remove();this.dismiss=undefined;this.available=undefined;if(active_picker===this)active_picker=undefined;if(restore&&owned)previous.restore();};
    const dismissal=register_workspace_dismissal(()=>[root],reason=>close(reason==="escape"),{inside:()=>[root],window_blur:true});
    this.dismiss=close;this.available=valid;active_picker=this;
    const mark=(id:string)=>{selected=id;for(const row of list.querySelectorAll<HTMLElement>("[data-checkout-id]")){const on=row.dataset.checkoutId===id;row.classList.toggle("is-active",on);row.setAttribute("aria-selected",String(on));if(on){input.setAttribute("aria-activedescendant",row.id);row.scrollIntoView({block:"nearest"});}}if(!id)input.removeAttribute("aria-activedescendant");};
    const execute=(request:checkout_request)=>{if(!valid())return close(false);close(true);void panel.prepare_and_execute_action(current=>prepare_checkout(current.run,root_path,request),writer,"branch_checkout").then(message=>{if(!panel.disposed&&panel.root===root_path&&panel.writer===writer)panel.report(message);}).catch(error=>{if(!panel.disposed&&panel.root===root_path&&panel.writer===writer)panel.report(error);});};
    const name_step=(ref?:checkout_ref)=>{source=ref;mode="name";render();input.select();};
    const accept=async(item?:choice)=>{
      if(!valid())return close(false);if(loading||validating)return;
      if(mode==="name"){
        const branch=input.value.trim();if(!branch)return;
        validating=true;input.disabled=true;
        try{await runner.run(root_path,["check-ref-format","--branch",branch]);if(!valid())return close(false);if(refs.some(ref=>ref.name==="refs/heads/"+branch))throw Error(text("checkout.exists",{branch}));execute({branch,ref:source,head:state.head});}
        catch(error){if(valid())status.textContent=String(error);}
        finally{validating=false;if(!closed){input.disabled=false;input.focus();}}return;
      }
      if(!item)return;
      if(item.id==="create")return name_step();
      if(item.id==="from"||item.id==="detached"){mode=item.id;input.value="";selected="";render();return;}
      if(mode==="from"){input.value="";return name_step(item.ref);}
      execute({ref:item.ref,detached:mode==="detached",head:state.head});
    };
    const render=()=>{
      if(!valid())return close(false);
      input.placeholder=text(mode==="name"?"checkout.name":mode==="from"?"checkout.from":mode==="detached"?"checkout.detached":"checkout.placeholder");input.setAttribute("aria-label",input.placeholder);
      root.dataset.checkoutMode=mode;list.replaceChildren();visible=[];status.textContent=loading?text("checkout.loading"):"";
      if(mode==="name"){input.removeAttribute("aria-activedescendant");status.textContent=input.placeholder;return;}
      if(loading)return;
      const query=input.value.trim().toLocaleLowerCase();
      const actions:choice[]=mode==="checkout"?[{id:"create",label:text("checkout.create"),icon:"add"},{id:"from",label:text("checkout.create_from"),icon:"add"},{id:"detached",label:text("checkout.detach"),icon:"debug-disconnect"}]:[];
      const choices:choice[]=[];
      for(const kind of ["local","remote","tag"] as const){if(mode==="detached"&&kind==="tag")continue;const group=refs.filter(ref=>ref.kind===kind&&ref.label.toLocaleLowerCase().includes(query));for(const [index,ref]of group.entries())choices.push({id:ref.name,label:ref.label,icon:kind==="local"?"git-branch":kind==="remote"?"cloud":"tag",ref,group:index===0?text(kind==="local"?"ref_picker.local":kind==="remote"?"ref_picker.remote":"ref_picker.tags"):undefined});}
      visible=query?[...choices,...actions]:[...actions,...choices];
      for(const item of visible){
        const row=button("",()=>void accept(item),"git-scm-ref-item git-branch-item");row.dataset.checkoutId=item.id;row.dataset.workspaceInteraction="row";row.id="git-branch-"+uid+"-"+list.children.length;row.tabIndex=-1;row.setAttribute("role","option");
        const first=el("span","git-branch-line"),label=el("span","git-scm-ref-label",item.label);first.append(git_icon(item.icon),label);
        if(item.ref){const ref=item.ref;const counts=ref.track?/ahead|behind/u.test(ref.track)?`${/behind (\d+)/u.exec(ref.track)?.[1]||0}↓ ${/ahead (\d+)/u.exec(ref.track)?.[1]||0}↑` : "": "";first.append(el("span","git-scm-ref-description",[counts,ref.date?age(ref.date):ref.hash.slice(0,7)].filter(Boolean).join(" · ")));if(item.group){row.classList.add("is-group-start");first.append(el("span","git-branch-group",item.group));}const detail=el("span","git-branch-detail",[ref.author,ref.hash.slice(0,7),ref.subject].filter(Boolean).join(" · "));row.append(first,detail);row.classList.add("has-detail");row.title=ref.name+"\n"+detail.textContent;}
        else row.append(first);
        row.onmousedown=event=>event.preventDefault();row.onmousemove=()=>mark(item.id);list.append(row);
      }
      if(!choices.length)status.textContent=text("checkout.empty");if(!visible.some(item=>item.id===selected))selected=visible[0]?.id||"";mark(selected);
    };
    input.oninput=()=>{selected="";render();};
    root.onkeydown=event=>{if(event.isComposing||event.keyCode===229)return;if(["ArrowDown","ArrowUp"].includes(event.key)){event.preventDefault();event.stopPropagation();const index=visible.findIndex(item=>item.id===selected);mark(visible[Math.max(0,Math.min(visible.length-1,index+(event.key==="ArrowDown"?1:-1)))]?.id||"");}else if(event.key==="Enter"){event.preventDefault();event.stopPropagation();if(!event.repeat)void accept(visible.find(item=>item.id===selected));}else if(event.key==="Tab"){event.preventDefault();input.focus();}};
    render();input.focus({preventScroll:true});
    void read_checkout_refs(runner.run,root_path).then(result=>{if(!valid())return close(false);refs=result;loading=false;render();}).catch(error=>{if(valid()){loading=false;status.textContent=String(error);}});
  }
}
