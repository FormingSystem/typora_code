/** 与 VS Code diffEditor 配置同义，用户级设置由所有比较编辑器共享。 */
export type git_diff_preferences = {render_side_by_side: boolean; inline_when_narrow: boolean; ignore_trim_whitespace: boolean; hide_unchanged: boolean; show_moves: boolean};
export const git_diff_defaults: Readonly<git_diff_preferences> = Object.freeze({render_side_by_side:true,inline_when_narrow:true,ignore_trim_whitespace:true,hide_unchanged:false,show_moves:false});
const key="typora-code:diff-editor-settings", event_name="typora-code:diff-editor-settings-changed";
export function read_git_diff_preferences():git_diff_preferences {
  const result={...git_diff_defaults};
  try { const value=JSON.parse(localStorage.getItem(key)||"{}");for(const name of Object.keys(result) as (keyof git_diff_preferences)[])if(typeof value?.[name]==="boolean")result[name]=value[name]; } catch { /* 无效配置恢复已核对的默认值。 */ }
  return result;
}
export function update_git_diff_preferences(change:Partial<git_diff_preferences>):void {
  const value=read_git_diff_preferences();for(const name of Object.keys(value) as (keyof git_diff_preferences)[])if(typeof change[name]==="boolean")value[name]=change[name]!;
  localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new Event(event_name));
}
export function watch_git_diff_preferences(apply:(value:git_diff_preferences)=>void):()=>void {
  const refresh=()=>apply(read_git_diff_preferences()),storage=(event:StorageEvent)=>{if(event.key===key||event.key===null)refresh();};
  window.addEventListener(event_name,refresh);window.addEventListener("storage",storage);
  return ()=>{window.removeEventListener(event_name,refresh);window.removeEventListener("storage",storage);};
}
