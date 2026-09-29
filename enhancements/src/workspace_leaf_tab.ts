import type {graph_leaf} from "./git_graph_host";

/** The same path can appear in different editing groups, always obtain the tab from the group belonging to leaf. */
export function workspace_leaf_tab(leaf:graph_leaf):HTMLElement|undefined{
  if(leaf.parent?.tabHeader)return leaf.parent.tabHeader.getTabById(leaf.state.path);
  const group=leaf.parent?.containerEl||leaf.containerEl.closest(".typ-workspace-tabs");
  return [...(group||document).querySelectorAll<HTMLElement>(".typ-tab[data-id]")].find(tab=>tab.dataset.id===leaf.state.path);
}
