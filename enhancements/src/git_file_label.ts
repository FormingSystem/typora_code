import {workspace_element as el} from "./workspace_widgets";
import {workspace_file_icon} from "./workspace_file_icons";

/** 名称和目录共用末端裁切区；操作出现时不分别压缩两段文字。 */
export function git_file_label(file_path: string, show_directory: boolean, name_class = "git-scm-file-name"): HTMLElement {
  const parts = file_path.split("/");
  const label = el("span", "git-scm-file-label");
  const text = el("span", "git-scm-file-text");
  text.append(el("span", name_class, parts.at(-1)!));
  const directory = parts.slice(0, -1).join("/");
  if (show_directory && directory) text.append(el("span", "git-scm-file-directory", directory));
  label.append(workspace_file_icon(file_path), text);
  return label;
}
