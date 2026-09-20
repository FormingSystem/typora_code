import {commit_web_entry} from "./git_commit_web_action";
import {bind_workspace_hover} from "./workspace_hover";
import {workspace_element as el,workspace_button as button} from "./workspace_widgets";
import {git_icon} from "./git_icons";
import {read_commit_hover_detail,type commit_hover_detail} from "./git_graph_repository";
import type {git_graph_panel} from "./git_graph_panel";
import {git_graph_text as text} from "./git_graph_i18n";
import {create_workspace_hover_markdown} from "./workspace_hover_markdown";

/** SCM自己的只读提交卡片；共享浮层不理解仓库、分支或Git命令。 */
export function bind_git_commit_hover(list:HTMLElement,panel:git_graph_panel){
  const cache=new Map<string,commit_hover_detail>();
  const hover=bind_workspace_hover(list,target=>{
    const anchor=target.closest<HTMLElement>(".git-scm-history-commit");
    const state=panel.state,commit=state?.commits.find(item=>item.hash===anchor?.dataset.hash);
    if(!anchor||!state||!commit)return;
    return {anchor,layout_anchor:list,compact:true,show_pointer:true,label:text("history.hover_label"),render(tip,signal){
      tip.classList.add("git-commit-hover");tip.dataset.hash=commit.hash;
      const heading=el("div","git-commit-hover-heading"),author=el("strong","",commit.author),date=el("span","git-commit-hover-date",panel.date(commit));
      heading.append(git_icon("account"),author,date);
      const message=el("div","git-commit-hover-message");
      const render_message=(source:string)=>message.replaceChildren(create_workspace_hover_markdown(
        // VS Code Git hover逐换行分段，同时禁用正文图片；原始提交文本不改写。
        panel.emoji(source).replace(/\r\n|\r|\n/gu,"\n\n"),
        url=>{if(!signal.aborted&&panel.root===state.root)void Promise.resolve().then(()=>panel.host.open_url(url)).catch(error=>{if(!signal.aborted)panel.report(error);});}
      ));
      render_message(commit.subject);
      const stats=el("div","git-commit-hover-stats",text("history.stats_loading"));stats.setAttribute("role","status");
      const labels=el("div","git-commit-hover-refs");
      for(const ref of anchor.querySelectorAll(".git-scm-history-ref"))labels.append(ref.cloneNode(true));
      const copy=button(commit.hash.slice(0,8),()=>{},"git-commit-hover-copy");copy.dataset.workspaceInteraction="action";
      copy.prepend(git_icon("copy"));copy.title=text("graph.copy_commit_hash");copy.setAttribute("aria-label",copy.title);
      copy.onclick=()=>{void Promise.resolve().then(()=>panel.host.copy(commit.hash)).then(()=>{if(!signal.aborted){copy.textContent=text("history.copy_done");copy.prepend(git_icon("check"));}}).catch(()=>{if(!signal.aborted)copy.textContent=text("history.copy_failed");});};
      const commands=el("div","git-commit-hover-commands");commands.append(copy);
      const web=commit_web_entry(panel,commit.hash);
      if(!web.disabled){
        const open=button(web.title,()=>{if(!signal.aborted&&panel.root===state.root)web.action();},"git-commit-hover-web");
        open.prepend(git_icon("link-external"));open.dataset.workspaceInteraction="action";commands.append(open);
      }
      tip.append(heading,message,stats);if(labels.childNodes.length)tip.append(labels);tip.append(commands);
      const key=state.root+"\0"+commit.hash;
      const apply=(detail:commit_hover_detail)=>{
        if(signal.aborted||panel.root!==state.root)return;
        render_message(detail.message||commit.subject);
        stats.replaceChildren(el("span","",text("history.stats_files",{count:detail.files})),el("span","git-commit-hover-added","+"+detail.insertions),el("span","git-commit-hover-deleted","−"+detail.deletions));
      };
      const cached=cache.get(key);if(cached){apply(cached);return;}
      // 复用读取器，取消浮层只放弃本次结果，不取消共用的列表/差异读取。
      void read_commit_hover_detail(panel.runner.run,state,commit).then(detail=>{
        if(signal.aborted||panel.root!==state.root)return;
        if(cache.size>=128)cache.delete(cache.keys().next().value!);cache.set(key,detail);apply(detail);
      }).catch(()=>{if(!signal.aborted)stats.textContent=text("history.stats_unavailable");});
    }};
  },{grouped:true});
  return {hide:hover.hide,dispose(){hover.dispose();cache.clear();}};
}
