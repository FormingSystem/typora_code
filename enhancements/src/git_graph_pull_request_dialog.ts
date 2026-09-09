import type { git_graph_panel } from "./git_graph_panel";
import { create_pull_request_url, pull_request_remote, type pull_request_config } from "./git_graph_pull_request";
import { pull_request_url } from "./git_graph_repository";
import { workspace_dialog, workspace_element as el, workspace_button as button, workspace_option as option } from "./workspace_widgets";
import { git_graph_text as text } from "./git_graph_i18n";

export function show_pull_request_dialog(panel: git_graph_panel, branch: string, configure = false): void {
  const remotes = panel.state?.remotes || [];
  const config = structuredClone(panel.settings.pr_config);
  const form = (title: string) => workspace_dialog(title,text("common.close"));
  const row = (container: HTMLElement, name: string, input: HTMLElement) => {
    const label=el("label","git-pr-field",name);input.setAttribute("aria-label",name);label.append(input);container.append(label);
  };
  const complete = () => {
    if(panel.disposed)return;
    const dialog=form(text("graph.pull_request_title"));
    const source=el("input");source.value=branch; const target=el("input");target.value=config.destination_branch;
    row(dialog.content,text("pr.source_branch"),source);row(dialog.content,text("pr.target_branch"),target);
    dialog.content.append(el("p","",`${config.provider}: ${config.source_owner}/${config.source_repository} → ${config.destination_owner}/${config.destination_repository}`));
    const error=el("p");dialog.content.append(error);
    dialog.footer.prepend(button(text("pr.configure"),()=>{dialog.close();step_one();}),button(text("graph.open_form"),()=>{
      try{
        const selected={...config,destination_branch:target.value};
        const remote=remotes.find(item=>item.name===config.source_remote)?.fetch||"";
        const url=panel.settings.pr_url ? pull_request_url(remote,source.value,target.value,panel.settings.pr_url) : create_pull_request_url(selected,source.value,panel.settings.pr_providers);
        void panel.host.open_url(url).catch(problem=>{if(dialog.root.isConnected)error.textContent=String(problem);});
      }catch(problem){error.textContent=String(problem);}
    }));
  };
  const step_two = (candidate: pull_request_config) => {
    const dialog=form(text("pr.configure_second"));
    const fields: [keyof pull_request_config, Parameters<typeof text>[0]][] = [["host","pr.host"],["source_owner","pr.source_owner"],["source_repository","pr.source_repository"],["destination_owner","pr.target_owner"],["destination_repository","pr.target_repository"],["destination_project","pr.target_project"],["destination_branch","pr.target_branch"]];
    const inputs=new Map<keyof pull_request_config,HTMLInputElement>();
    for(const [key,label]of fields){const input=el("input");input.value=candidate[key];inputs.set(key,input);row(dialog.content,text(label),input);}
    const error=el("p");dialog.content.append(error);
    dialog.footer.prepend(button(text("pr.back"),()=>{dialog.close();step_one();}),button(text("pr.save"),()=>{
      try{
        for(const [key,input]of inputs)candidate[key]=input.value.trim();
        create_pull_request_url(candidate,branch||"HEAD",panel.settings.pr_providers);
        Object.assign(config,candidate);panel.settings.pr_config=structuredClone(config);panel.persist_settings();dialog.close();complete();
      }catch(problem){error.textContent=String(problem);}
    }));
  };
  const step_one = () => {
    const dialog=form(text("pr.configure_first"));
    const source=el("select"),destination=el("select"),provider=el("select");
    for(const name of ["GitHub","GitLab","Bitbucket",...panel.settings.pr_providers.map(item=>item.name)].sort())provider.append(option(name,name));
    for(const remote of remotes){source.append(option(remote.name,remote.name));destination.append(option(remote.name,remote.name));}
    destination.append(option("",text("pr.no_remote")));
    source.value=config.source_remote||remotes.find(item=>item.name==="origin")?.name||remotes[0]?.name||"";
    destination.value=config.provider?config.destination_remote:remotes.find(item=>item.name==="upstream")?.name||source.value;
    try{provider.value=config.provider||pull_request_remote(remotes.find(item=>item.name===source.value)?.fetch||"").provider;}catch{provider.value=config.provider||"GitHub";}
    row(dialog.content,text("pr.provider"),provider);row(dialog.content,text("pr.source_remote"),source);row(dialog.content,text("pr.target_remote"),destination);
    const error=el("p");dialog.content.append(error);
    dialog.footer.prepend(button(text("pr.next"),()=>{
      try{
        const from=pull_request_remote(remotes.find(item=>item.name===source.value)?.fetch||"");
        const to=destination.value?pull_request_remote(remotes.find(item=>item.name===destination.value)?.fetch||""):undefined;
        const changed=source.value!==config.source_remote||destination.value!==config.destination_remote||provider.value!==config.provider;
        const candidate={...config,provider:provider.value,source_remote:source.value,destination_remote:destination.value,
          host:changed?from.host:config.host,source_owner:changed?from.owner:config.source_owner,source_repository:changed?from.repository:config.source_repository,
          destination_owner:changed?(to?.owner||config.destination_owner):config.destination_owner,destination_repository:changed?(to?.repository||config.destination_repository):config.destination_repository,
          destination_branch:config.destination_branch||panel.settings.pr_base};
        dialog.close();step_two(candidate);
      }catch(problem){error.textContent=String(problem);}
    }));
  };
  if(configure||!config.provider||!config.host)step_one();else complete();
}
