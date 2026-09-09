import {workspace_leaf_tab} from "./workspace_leaf_tab";
import type {workspace_file_host} from "./workspace_files";
import type {graph_leaf} from "./git_graph_host";
import {source_file_path} from "./workspace_file_uri";
import {create_workspace_lifetime} from "./workspace_lifetime";
import {git_icon_button} from "./git_icons";

/** 显示核心真实leaf，不再保存一份独立的“打开文件”状态。 */
export function bind_workspace_open_editors(files:workspace_file_host,container:HTMLElement){
  const lifetime=create_workspace_lifetime();
  const workspace=files.core.app.workspace;
  let frame=0;
  const observers=new Map<Element,MutationObserver>();
  const render=()=>{
    frame=0;if(lifetime.disposed)return;
    const leaves:graph_leaf[]=[];workspace.eachLeaves(leaf=>leaves.push(leaf));
    leaves.sort((left,right)=>{const a=workspace_leaf_tab(left),b=workspace_leaf_tab(right);return !a||!b?0:a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1;});
    const groups=[...new Set(leaves.map(leaf=>leaf.parent))];
    const native_tabs=[...document.querySelectorAll<HTMLElement>(".typ-tab[data-id]")];
    for(const [target,observer]of observers)if(!target.isConnected){observer.disconnect();observers.delete(target);}
    for(const tab of native_tabs)if(!observers.has(tab)){const observer=new MutationObserver(schedule);observer.observe(tab,{subtree:true,childList:true,attributes:true,characterData:true,attributeFilter:["class"]});observers.set(tab,observer);}
    const nodes:HTMLElement[]=[];
    for(const group of groups){
      if(groups.length>1){const heading=document.createElement("div");heading.className="workspace-open-editor-group";heading.textContent=`组 ${groups.indexOf(group)+1}`;nodes.push(heading);}
      for(const leaf of leaves.filter(item=>item.parent===group)){
        const path=source_file_path(leaf.state.path,files.path_api)||leaf.state.path;
        const native_tab=workspace_leaf_tab(leaf);
        const name=native_tab?.querySelector(".typ-file-basename")?.textContent||files.path_api.basename(path);
        const row=document.createElement("div");row.className="workspace-open-editor-row";row.classList.toggle("is-active",workspace.activeLeaf===leaf);row.classList.toggle("is-preview",Boolean(leaf.state.workspace_preview));
        const open=document.createElement("button");open.type="button";open.className="workspace-open-editor-name";open.textContent=name;open.title=path;open.setAttribute("aria-current",String(workspace.activeLeaf===leaf));
        const activate=()=>{workspace.activeLeaf=leaf.parent.toggleTab(leaf.state.path);};
        open.onclick=activate;open.ondblclick=()=>{activate();files.keep_open(leaf);render();};
        const close=git_icon_button("close","关闭编辑器",()=>{leaf.parent.removeTab?.(leaf.state.path);schedule();},"workspace-open-editor-close");
        close.dataset.dirty=String(Boolean(native_tab?.querySelector(".workspace-file-dirty,.typ-tab-dirty")));
        row.append(close,open);nodes.push(row);
      }
    }
    container.replaceChildren(...nodes);
  };
  function schedule(){if(!frame&&!lifetime.disposed)frame=requestAnimationFrame(render);}
  for(const event of ["active-leaf:change","file:open"])lifetime.add(workspace.on(event,schedule));
  // 核心Workspace没有file:closed事件；观察真实标签增删，覆盖关闭非活动标签和拖组。
  const layout_observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element&&(node.matches(".typ-tab,.typ-workspace-tabs")||node.querySelector(".typ-tab,.typ-workspace-tabs")))))schedule();});
  layout_observer.observe(document.body,{childList:true,subtree:true});lifetime.add(()=>layout_observer.disconnect());
  lifetime.listen(document,"dblclick",schedule,true);
  lifetime.add(()=>{if(frame)cancelAnimationFrame(frame);for(const observer of observers.values())observer.disconnect();observers.clear();container.replaceChildren();});
  render();return{refresh:schedule,dispose:lifetime.dispose};
}
