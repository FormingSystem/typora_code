/** 差异正文是来源身份的唯一所有者；列表行只投影，不从展示标题反解析。 */
export type git_diff_source={root:string;from:string;to:string;file:string;old_path?:string};
export const git_diff_source_key=(source:git_diff_source|undefined)=>source?JSON.stringify([source.root,source.from,source.to,source.file,source.old_path||'']):'';
export function sync_git_source_rows(root:HTMLElement,source:git_diff_source|undefined){
  const key=git_diff_source_key(source);
  for(const row of root.querySelectorAll<HTMLElement>('[data-git-source]')){
    const selected=!!key&&row.dataset.gitSource===key;
    row.classList.toggle('selected',selected);row.dataset.gitSourceSelected=String(selected);
    if(selected)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');
  }
}
export function bind_git_source_row(row:HTMLElement,source:git_diff_source,active:git_diff_source|undefined){
  row.dataset.gitSource=git_diff_source_key(source);
  const selected=row.dataset.gitSource===git_diff_source_key(active);
  row.classList.toggle('selected',selected);row.dataset.gitSourceSelected=String(selected);
  if(selected)row.setAttribute('aria-current','true');
}
