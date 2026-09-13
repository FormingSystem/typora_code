import type {git_graph_panel} from "./git_graph_panel";
import {plan_git_action, select_discard_scope, type action_plan} from "./git_graph_actions";
import {git_graph_text as text} from "./git_graph_i18n";
import {git_icon} from "./git_icons";
import {workspace_dialog, workspace_element as el, workspace_button as button} from "./workspace_widgets";

/** 确认仅展示已准备的精确范围；仓库写入和刷新仍归 panel / actions 所有。 */
export class git_discard_confirmation {
  private dialog?: ReturnType<typeof workspace_dialog>;
  private choices: HTMLButtonElement[] = [];
  private epoch = 0;
  constructor(private panel: git_graph_panel) {}

  close(restore_focus = true): void { this.dialog?.close(restore_focus); }
  update_state(): void {
    for (const choice of this.choices) choice.disabled = this.panel.pending || this.panel.writing || this.panel.disposed;
  }
  open(paths: string[], _kind: string, _target: string): void {
    this.close();
    const panel = this.panel, state = panel.state;
    if (!state || panel.disposed || panel.pending || panel.writing) return;
    const epoch = ++this.epoch, root = panel.root, writer = panel.writer;
    const reader = panel.host.runner(panel.settings), selected_paths = [...paths];
    let timer = 0, consumed = false;
    const dialog = workspace_dialog(text("discard.title"), text("discard.cancel"), () => {
      clearTimeout(timer); reader.dispose();
      if (this.epoch === epoch) { this.epoch++; this.dialog = undefined; this.choices = []; }
    });
    this.dialog = dialog;
    dialog.root.setAttribute("data-linux-note-git-discard", "ready");
    dialog.root.dataset.gitDiscardState = "loading";
    dialog.root.classList.add("git-discard-confirmation");
    const cancel = dialog.footer.querySelector<HTMLButtonElement>("button")!;
    cancel.setAttribute("data-git-discard-cancel", "");
    const message = el("div", "git-discard-message");
    const paragraphs = el("div", "git-discard-paragraphs");
    paragraphs.setAttribute("role", "status");
    paragraphs.append(el("p", "", text("discard.loading")));
    message.append(git_icon("warning"), paragraphs); dialog.content.append(message);
    const available = () => !consumed && this.epoch === epoch && dialog.root.isConnected && !panel.disposed && panel.root === root && panel.writer === writer;
    const confirm = (prepared: action_plan, scope: "tracked" | "all") => {
      if (!available() || panel.pending || panel.writing) return;
      const selected = select_discard_scope(prepared, scope);
      consumed = true; dialog.close();
      void panel.execute_prepared_action(selected, writer).then(output => panel.report(output), error => panel.report(error));
    };
    const add_choice = (label: string, prepared: action_plan, scope: "tracked" | "all") => {
      const choice = button(label, () => confirm(prepared, scope));
      choice.dataset.gitDiscardScope = scope; this.choices.push(choice); dialog.footer.insertBefore(choice, cancel);
    };
    const prepare = async () => {
      try {
        const prepared = await plan_git_action(reader.run, "discard_changes", {
          root, target: selected_paths[0] || "", paths: selected_paths, hash: state.head, operation: state.operation,
        }, {include_untracked: true});
        if (!available()) return;
        const discard = prepared.discard!, tracked = discard.restore_paths, untracked = discard.untracked_paths;
        const total = tracked.length + untracked.length, mixed = tracked.length > 0 && untracked.length > 0;
        const restoring = tracked.length > 0 && discard.deleted_paths.length === tracked.length;
        paragraphs.replaceChildren();
        if (untracked.length) {
          paragraphs.append(el("p", "", untracked.length === 1 ? text("discard.untracked_one", {name: panel.host.path_api.basename(untracked[0])}) : text("discard.untracked_many", {count: untracked.length})), el("p", "", text("discard.recycle")));
        }
        if (tracked.length) {
          paragraphs.append(el("p", "", tracked.length === 1
            ? text(restoring ? "discard.restore_one" : "discard.tracked_one", {name: panel.host.path_api.basename(tracked[0])})
            : text(restoring ? "discard.restore_many" : "discard.tracked_many", {count: tracked.length})));
          if (!restoring) paragraphs.append(el("p", "", text("discard.irreversible")));
        }
        if (total === 1) paragraphs.append(el("p", "git-discard-path", tracked[0] || untracked[0]));
        else {
          const details = el("details", "git-discard-files"), summary = el("summary", "", text("discard.files", {count: total}));
          details.append(summary);
          details.addEventListener("toggle", () => {
            if (!details.open || details.childElementCount > 1) return;
            for (const [title, files] of [[text("discard.tracked_group"), tracked], [text("discard.untracked_group"), untracked]] as const) {
              if (!files.length) continue;
              const list = el("ul"); for (const path of files) list.append(el("li", "", path));
              details.append(el("p", "", title), list);
            }
          });
          paragraphs.append(details);
        }
        if (mixed) {
          add_choice(text("discard.tracked_button", {count: tracked.length}), prepared, "tracked");
          add_choice(text("discard.all_button", {count: total}), prepared, "all");
        } else if (tracked.length) add_choice(text(restoring ? total === 1 ? "discard.restore_button" : "discard.restore_all_button" : total === 1 ? "discard.file_button" : "discard.all_button", {count: total}), prepared, "all");
        else add_choice(text("discard.recycle_button"), prepared, "all");
        dialog.root.dataset.gitDiscardState = "ready"; this.update_state();
      } catch (error) {
        if (!available()) return;
        dialog.root.dataset.gitDiscardState = "error";
        paragraphs.replaceChildren(el("p", "", String(error instanceof Error ? error.message : error)));
      }
    };
    // 共享对话框先将焦点交给唯一的取消按钮；晚到的计划只增加选项，不重置焦点。
    cancel.focus({preventScroll: true});
    timer = window.setTimeout(() => void prepare(), 0);
  }
}
