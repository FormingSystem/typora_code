import {git_graph_text as text} from "./git_graph_i18n";

export type pull_request_provider = {name: string; template_url: string};
export type pull_request_config = {
  provider: string; host: string; source_remote: string; destination_remote: string;
  source_owner: string; source_repository: string; destination_owner: string;
  destination_repository: string; destination_project: string; destination_branch: string;
};
export const pull_request_defaults: pull_request_config = {
  provider: "", host: "", source_remote: "", destination_remote: "", source_owner: "", source_repository: "",
  destination_owner: "", destination_repository: "", destination_project: "", destination_branch: "main",
};

/** SSH/HTTPS remote 只用于推导网页位置；URL 不携带 Git 凭据。 */
export function pull_request_remote(remote: string) {
  const address = /^[^/@\s]+@[^/:\s]+:/u.test(remote) ? remote.replace(/^[^@]+@([^:]+):/u, "https://$1/") : remote;
  const url = parse_url(address);
  if (!["http:", "https:", "ssh:"].includes(url.protocol)) throw new Error(text("pr.error.remote_protocol"));
  const parts = url.pathname.replace(/^\/|\/$/gu, "").replace(/\.git$/u, "").split("/").map(decode_segment);
  if (parts.length < 2 || parts.some(part => !part || part === "." || part === "..")) throw new Error(text("pr.error.remote_repository"));
  return {host: `${url.protocol === "ssh:" ? "https:" : url.protocol}//${url.hostname}${url.protocol !== "ssh:" && url.port ? ":"+url.port : ""}`,
    owner: parts.slice(0,-1).join("/"), repository: parts.at(-1)!,
    provider: url.hostname === "bitbucket.org" ? "Bitbucket" : /gitlab/iu.test(url.hostname) ? "GitLab" : "GitHub"};
}

export function validate_pull_request_providers(value: pull_request_provider[]): void {
  const names = new Set(["GitHub", "GitLab", "Bitbucket"]);
  for (const item of value) {
    if (!item || typeof item.name !== "string" || !item.name.trim() || names.has(item.name)
      || typeof item.template_url !== "string" || !/^(?:https?:\/\/|\$1\/)/u.test(item.template_url)
      || /\$(?![1-8])/u.test(item.template_url)) throw new Error(text("pr.error.provider_template"));
    names.add(item.name);
  }
}

/** 同一配置表达跨fork、自建服务、目标非remote仓库及GitLab目标项目。 */
export function create_pull_request_url(config: pull_request_config, branch: string, providers: pull_request_provider[]): string {
  if (!branch || !config.destination_branch) throw new Error(text("pr.error.branches_required"));
  const host = parse_url(config.host);
  if (!["https:", "http:"].includes(host.protocol) || host.username || host.password || host.search || host.hash) throw new Error(text("pr.error.host_invalid"));
  const root = config.host.replace(/\/+$/u, "");
  const owner = (value: string) => value.split("/").map(encodeURIComponent).join("/");
  const fields = [root,owner(config.source_owner),encodeURIComponent(config.source_repository),encodeURIComponent(branch),
    owner(config.destination_owner),encodeURIComponent(config.destination_repository),encodeURIComponent(config.destination_project),encodeURIComponent(config.destination_branch)];
  if ([config.source_owner,config.source_repository,config.destination_owner,config.destination_repository].some(value=>!value.trim())) throw new Error(text("pr.error.repositories_required"));
  let result: string;
  if (config.provider === "GitHub") result = `${root}/${fields[4]}/${fields[5]}/compare/${fields[7]}...${fields[1]}:${fields[3]}?expand=1`;
  else if (config.provider === "GitLab") {
    const url = parse_url(`${root}/${fields[1]}/${fields[2]}/-/merge_requests/new`);
    url.searchParams.set("merge_request[source_branch]",branch); url.searchParams.set("merge_request[target_branch]",config.destination_branch);
    if(config.destination_project)url.searchParams.set("merge_request[target_project_id]",config.destination_project);
    result=url.href;
  } else if (config.provider === "Bitbucket") {
    const url = parse_url(`${root}/${fields[1]}/${fields[2]}/pull-requests/new`);
    url.searchParams.set("source",`${config.source_owner}/${config.source_repository}::${branch}`);
    url.searchParams.set("dest",`${config.destination_owner}/${config.destination_repository}::${config.destination_branch}`);result=url.href;
  } else {
    const provider = providers.find(item=>item.name===config.provider);
    if(!provider)throw new Error(text("pr.error.provider_unavailable"));
    result=provider.template_url.replace(/\$([1-8])/gu,(_,index)=>fields[Number(index)-1]);
  }
  const url=parse_url(result);
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error(text("pr.error.url_invalid"));
  return url.href;
}

function parse_url(value:string):URL{try{return new URL(value);}catch{throw new Error(text("pr.error.address_invalid"));}}
function decode_segment(value:string):string{try{return decodeURIComponent(value);}catch{throw new Error(text("pr.error.address_invalid"));}}
