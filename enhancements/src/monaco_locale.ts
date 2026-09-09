import "monaco-editor/nls/lang/zh-cn";
import { resolve_git_graph_locale } from "./git_graph_i18n";

// Monaco reads these globals while its modules are evaluated. Load the bundled Chinese
// messages first, then restore the built-in English fallback for non-Chinese Typora UI.
const nls_runtime = globalThis as typeof globalThis & {
  _VSCODE_NLS_LANGUAGE?: string;
  _VSCODE_NLS_MESSAGES?: string[];
};
if (resolve_git_graph_locale() === "en") {
  delete nls_runtime._VSCODE_NLS_MESSAGES;
  nls_runtime._VSCODE_NLS_LANGUAGE = "en";
}
