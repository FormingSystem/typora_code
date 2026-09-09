import type {graph_leaf} from "./git_graph_host";

/** 同一路径可在不同编辑组出现，始终从该leaf所属组取得标签。 */
export function workspace_leaf_tab(leaf:graph_leaf):HTMLElement|undefined{
  if(leaf.parent?.tabHeader)return leaf.parent.tabHeader.getTabById(leaf.state.path);
  const group=leaf.parent?.containerEl||leaf.containerEl.closest(".typ-workspace-tabs");
  return [...(group||document).querySelectorAll<HTMLElement>(".typ-tab[data-id]")].find(tab=>tab.dataset.id===leaf.state.path);
}
