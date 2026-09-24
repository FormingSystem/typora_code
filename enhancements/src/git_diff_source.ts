import {apply_workspace_row_selection,workspace_selection_owner,type workspace_list_selection} from './workspace_list_selection';
/** 差异正文拥有来源身份，列表选择由共享UI模型管理，不能从展示标题反解析。 */
export type git_diff_source={root:string;from:string;to:string;file:string;old_path?:string};
export const git_diff_source_key=(source:git_diff_source|undefined)=>source?JSON.stringify([source.root,source.from,source.to,source.file,source.old_path||'']):'';
export function sync_git_source_rows(root:HTMLElement,source:git_diff_source|undefined){
  const key=git_diff_source_key(source);
  for(const row of root.querySelectorAll<HTMLElement>('[data-git-source]')){
    const selected=!!key&&row.dataset.gitSource===key;
    const owner=workspace_selection_owner(row);
    if(owner){owner.project_external(key);owner.paint(row);}else apply_workspace_row_selection(row,selected);
    if(selected)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');
  }
}
export function bind_git_source_row(row:HTMLElement,source:git_diff_source,active:git_diff_source|undefined,owner?:workspace_list_selection){
  row.dataset.gitSource=git_diff_source_key(source);
  const selected=row.dataset.gitSource===git_diff_source_key(active);
  if(owner){owner.project_external(git_diff_source_key(active));owner.bind(row,row.dataset.gitSource);}else apply_workspace_row_selection(row,selected);
  if(selected)row.setAttribute('aria-current','true');
}
