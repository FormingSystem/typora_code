import type { git_graph_panel } from "./git_graph_panel";
import { git_icon_button } from "./git_icons";
import { git_graph_text as text } from "./git_graph_i18n";
import { GRAPH_SETTINGS_KEY } from "./git_graph_settings";

/** 固定上游 Find 的工作区开关；匹配同步完成，详情异步由面板 detail_epoch 管理。 */
export class git_graph_find {
  case_sensitive = false; regex = false; open_details = false;
  matches: string[] = []; current = "";
  previous: HTMLButtonElement; next: HTMLButtonElement;
  case_button: HTMLButtonElement; regex_button: HTMLButtonElement; details_button: HTMLButtonElement;
  error = document.createElement("span");
  constructor(private panel: git_graph_panel) {
    try { const saved = JSON.parse(localStorage.getItem(GRAPH_SETTINGS_KEY + "find") || "{}");
      this.case_sensitive = saved.case_sensitive === true; this.regex = saved.regex === true; this.open_details = saved.open_details === true;
    } catch { /* 损坏的本地选项恢复上游默认false。 */ }
    const modifier = (label: string, title: string, change: () => void) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.title = title; button.setAttribute("aria-label", title);
      button.onclick = () => { change(); this.save(); this.update(true); }; return button;
    };
    this.case_button = modifier("Aa", text("graph.find_case"), () => this.case_sensitive = !this.case_sensitive);
    this.regex_button = modifier(".*", text("graph.find_regex"), () => this.regex = !this.regex);
    this.details_button = git_icon_button("diff-multiple", text("graph.find_open_details"), () => { this.open_details = !this.open_details; this.save(); this.navigate(true); });
    this.previous = git_icon_button("arrow-up", text("graph.find_previous"), () => this.move(-1));
    this.next = git_icon_button("arrow-down", text("graph.find_next"), () => this.move(1));
    this.error.className = "git-graph-find-error"; this.error.setAttribute("role", "alert");
    panel.find_position.setAttribute("role", "status"); panel.find_position.setAttribute("aria-live", "polite");
    panel.find_widget.replaceChildren(panel.search, this.case_button, this.regex_button, panel.find_position, this.previous, this.next, this.details_button, git_icon_button("close", text("graph.find_close"), () => panel.close_find()), this.error);
    panel.search.oninput = () => this.update(true);
    panel.search.onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); this.move(event.shiftKey ? -1 : 1); } };
    this.reflect();
  }
  reflect(): void {
    for (const [button, value] of [[this.case_button, this.case_sensitive], [this.regex_button, this.regex], [this.details_button, this.open_details]] as const) button.setAttribute("aria-pressed", String(value));
    this.previous.disabled = this.next.disabled = !this.matches.length;
  }
  save(): void { localStorage.setItem(GRAPH_SETTINGS_KEY + "find", JSON.stringify({case_sensitive: this.case_sensitive, regex: this.regex, open_details: this.open_details})); this.reflect(); }
  clear_highlights(): void {
    for (const mark of this.panel.list.querySelectorAll("mark.git-graph-find-match")) { const parent = mark.parentNode!; mark.replaceWith(document.createTextNode(mark.textContent || "")); parent.normalize(); }
    for (const row of this.panel.list.querySelectorAll(".git-graph-find-current")) row.classList.remove("git-graph-find-current");
  }
  close(): void { this.clear_highlights(); this.panel.search.value = ""; this.matches = []; this.current = ""; this.error.textContent = ""; this.panel.search.removeAttribute("aria-invalid"); this.panel.find_position.textContent = ""; this.reflect(); }
  update(navigate = false): void {
    const panel = this.panel; if (panel.disposed || panel.find_widget.dataset.open !== "true") return;
    this.clear_highlights(); this.matches = []; this.error.textContent = ""; panel.search.removeAttribute("aria-invalid");
    // 新输入立刻令上一查找请求的详情失效；后续选中会再取得新的详情epoch。
    if (navigate && this.open_details) panel.detail_epoch++;
    const query = panel.search.value;
    try {
      if (query && panel.state) {
        const source = this.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        const pattern = new RegExp(source, "u" + (this.case_sensitive ? "" : "i"));
        const global_pattern = new RegExp(pattern.source, pattern.flags + "g");
        const rows = new Map([...panel.list.querySelectorAll<HTMLElement>(".git-graph-row[data-hash]")].map(row => [row.dataset.hash!, row]));
        for (const commit of panel.state.commits) {
          const values = [commit.subject, ...(panel.settings.show_author ? [commit.author] : []), ...(panel.settings.show_date ? [panel.date(commit)] : []), ...(commit.stash ? [commit.stash] : []), ...panel.state.refs.filter(ref => ref.hash === commit.hash).map(ref => ref.name.replace(/^refs\/(heads|remotes|tags)\//u, ""))];
          if (panel.settings.show_hash) values.push(commit.hash.slice(0, 8));
          const full_hash_match = panel.settings.show_hash && commit.hash.search(pattern) === 0;
          if (!full_hash_match && !values.some(value => pattern.test(value))) continue;
          const row = rows.get(commit.hash); if (!row) continue;
          this.matches.push(commit.hash);
          const nodes: Text[] = []; const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) if (!(walker.currentNode.parentElement?.closest("svg"))) nodes.push(walker.currentNode as Text);
          for (const node of nodes) {
            const value = node.data; const fragment = document.createDocumentFragment(); let offset = 0;
            global_pattern.lastIndex = 0;
            for (let match; (match = global_pattern.exec(value));) {
              if (!match[0].length) throw new Error(text("graph.find_zero_length"));
              fragment.append(document.createTextNode(value.slice(offset, match.index)));
              const mark = document.createElement("mark"); mark.className = "git-graph-find-match"; mark.textContent = match[0]; fragment.append(mark); offset = match.index + match[0].length;
            }
            if (offset) { fragment.append(document.createTextNode(value.slice(offset))); node.replaceWith(fragment); }
          }
          if (full_hash_match && !pattern.test(commit.hash.slice(0, 8))) {
            const hash = row.querySelector(".git-graph-hash"); if (hash) { const mark = document.createElement("mark"); mark.className = "git-graph-find-match"; mark.textContent = hash.textContent; hash.replaceChildren(mark); }
          }
        }
      }
    } catch (error) { this.clear_highlights(); this.matches = []; this.error.textContent = error instanceof SyntaxError ? text("graph.find_invalid_regex",{detail:error.message}) : String(error instanceof Error ? error.message : error); panel.search.setAttribute("aria-invalid", "true"); }
    if (!this.matches.includes(this.current)) this.current = this.matches[0] || "";
    this.reflect(); this.navigate(navigate);
  }
  move(direction: number): void {
    if (!this.matches.length) this.update(false);
    if (!this.matches.length) return;
    this.current = this.matches[(this.matches.indexOf(this.current) + direction + this.matches.length) % this.matches.length]; this.navigate(true);
  }
  navigate(scroll: boolean): void {
    const panel = this.panel;
    for (const row of panel.list.querySelectorAll<HTMLElement>(".git-graph-row[data-hash]")) row.classList.toggle("git-graph-find-current", row.dataset.hash === this.current);
    panel.find_position.textContent = this.matches.length ? text("graph.find_position", {current: this.matches.indexOf(this.current) + 1, total: this.matches.length}) : panel.search.value ? text("graph.find_no_results") : "";
    if (!this.current) return;
    if (scroll) panel.scroll_to(this.current);
    if (this.open_details && scroll) {
      const commit = panel.state?.commits.find(commit => commit.hash === this.current); if (commit) panel.select_commit(commit);
    }
  }
}
