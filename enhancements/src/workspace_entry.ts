import { start_typora_code } from "./workspace_startup";
import { acquire_workspace_style } from "./workspace_styles";
import entry_css from "./workspace_entry.css";

const entry_key = Symbol.for("typora-code:startup");
const runtime = window as unknown as Record<symbol, Promise<void>>;
if (!runtime[entry_key]) {
  runtime[entry_key] = start_typora_code();
  void runtime[entry_key].catch((error: unknown) => {
    acquire_workspace_style("typora-code-style:workspace_entry", entry_css);
    console.error("[Typora Code startup]", error);
    document.documentElement.dataset.typoraCodeStartup = "error";
    const message = document.createElement("div");
    message.setAttribute("role", "alert");
    message.className = "typora-code-startup-error";
    message.textContent = "Typora Code 启动失败：" + String(error instanceof Error ? error.message : error);
    document.body.append(message);
  });
}
