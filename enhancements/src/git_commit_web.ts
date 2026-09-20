import type {git_remote_target} from "./git_remote_data";

export type commit_web_target = {remote:string;provider:string;repository_url:string;url:string;push:boolean};
const providers:Record<string,{name:string;route:string;nested?:boolean;web_host?:string}>={
  "github.com":{name:"GitHub",route:"commit"},
  "gitee.com":{name:"Gitee",route:"commit"},
  "gitlab.com":{name:"GitLab",route:"-/commit",nested:true},
  "bitbucket.org":{name:"Bitbucket",route:"commits"},
  "ssh.bitbucket.org":{name:"Bitbucket",route:"commits",web_host:"bitbucket.org"},
};
/** 纯本地识别；未知主机不猜平台，SSH端口、凭据和查询参数不传给浏览器。 */
export function commit_web_url(remote:string,hash:string):Omit<commit_web_target,"remote"|"push">|undefined{
  if(!/^[a-f\d]{40}(?:[a-f\d]{24})?$/iu.test(hash)||!remote||/[\x00-\x20\x7f\\?#]/u.test(remote))return;
  const scp=/^(?:[^@/:]+@)?([^/:]+):(.+)$/u.exec(remote);
  const input=!remote.includes("://")&&scp?"ssh://"+scp[1]+"/"+scp[2]:remote;
  if(!/^(?:https?|ssh):\/\//iu.test(input))return;
  // URL会消除点段，必须在解析前拒绝，不能将恶意仓库路径规整成另一仓库。
  const raw_path=input.replace(/^[^:]+:\/\/[^/]+\/?/u,"");
  let segments:string[];
  try{segments=raw_path.replace(/\/$/u,"").split("/").map(part=>decodeURIComponent(part));}catch{return;}
  if(segments.some(part=>!part||part==="."||part===".."||/[\x00-\x1f\x7f/\\]/u.test(part)))return;
  try{
    const parsed=new URL(input),provider=Object.hasOwn(providers,parsed.hostname.toLowerCase())?providers[parsed.hostname.toLowerCase()]:undefined;
    if(!provider||(!provider.nested&&segments.length!==2)||segments.length<2)return;
    if(provider.web_host&&parsed.protocol!=="ssh:")return;
    if(parsed.protocol!=="ssh:"&&parsed.port)return;
    segments[segments.length-1]=segments.at(-1)!.replace(/\.git$/iu,"");
    if(!segments.at(-1)||segments.at(-1)==="."||segments.at(-1)==="..")return;
    const repository_url="https://"+(provider.web_host||parsed.hostname)+"/"+segments.map(encodeURIComponent).join("/");
    return {provider:provider.name,repository_url,url:repository_url+"/"+provider.route+"/"+hash};
  }catch{return;}
}
export function commit_web_targets(remotes:git_remote_target[],hash:string,tracking=""):commit_web_target[]{
  const seen=new Set<string>(),result:commit_web_target[]=[];
  const priority=(name:string)=>name===tracking?0:name==="origin"?1:2;
  for(const remote of [...remotes].sort((a,b)=>priority(a.name)-priority(b.name)||a.name.localeCompare(b.name))){
    const push=!remote.fetch;
    for(const url of (remote.fetch||remote.push).split(/\r?\n/u)){
      const target=commit_web_url(url,hash);if(!target||seen.has(target.url))continue;
      seen.add(target.url);result.push({...target,remote:remote.name,push});
    }
  }
  return result;
}
