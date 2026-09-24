/** 树/列表共享选择模型。业务身份、打开与展开留在领域，选择不由展开状态推断。 */
const owners = new WeakMap<HTMLElement, workspace_list_selection>();

export function apply_workspace_row_selection(row: HTMLElement, selected: boolean, focused = false): void {
  row.dataset.workspaceSelected = String(selected);
  row.dataset.workspaceFocused = String(focused);
  row.setAttribute('aria-selected', String(selected));
  row.classList.toggle('is-selected', selected);
  if (row.dataset.gitSource !== undefined) {
    row.dataset.gitSourceSelected = String(selected);
    row.classList.toggle('selected', selected);
  }
}

export function workspace_selection_owner(row: HTMLElement): workspace_list_selection | undefined {
  const root = row.closest<HTMLElement>('[data-workspace-list]');
  return root ? owners.get(root) : undefined;
}

export class workspace_list_selection {
  readonly keys = new Set<string>();
  focused_key = '';
  private external_key: string | undefined;
  private focus = (event: FocusEvent) => {
    const row = (event.target as HTMLElement)?.closest<HTMLElement>('[data-workspace-row-key]');
    if (row && workspace_selection_owner(row) === this) {
      this.focused_key = row.dataset.workspaceRowKey!;
      this.refresh();
    }
  };
  constructor(readonly root: HTMLElement) {
    root.dataset.workspaceList = '';
    owners.set(root, this);
    root.addEventListener('focusin', this.focus);
  }
  select(keys: Iterable<string>, focus?: string): void {
    const next = [...keys]; this.keys.clear();
    for (const key of next) if (key) this.keys.add(key);
    this.focused_key = focus ?? next[0] ?? '';
    this.refresh();
  }
  /** 活动内容变化可投影选择；同一内容的后台刷新不能覆盖用户的新选择。 */
  project_external(key: string, force = false): void {
    if (!force && key === this.external_key) return;
    this.external_key = key; this.select(key ? [key] : []);
  }
  bind(row: HTMLElement, key: string): void {
    row.dataset.workspaceRowKey = key;
    row.dataset.workspaceInteraction = 'row';
    this.paint(row);
  }
  paint(row: HTMLElement): void {
    const key = row.dataset.workspaceRowKey!;
    apply_workspace_row_selection(row, this.keys.has(key), key === this.focused_key);
  }
  refresh(): void {
    for (const row of this.root.querySelectorAll<HTMLElement>('[data-workspace-row-key]')) {
      if (workspace_selection_owner(row) === this) this.paint(row);
    }
  }
  reset(): void { this.external_key = undefined; this.select([]); }
  dispose(): void {
    this.root.removeEventListener('focusin', this.focus);
    owners.delete(this.root); delete this.root.dataset.workspaceList; this.keys.clear();
  }
}
