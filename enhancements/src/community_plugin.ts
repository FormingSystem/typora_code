import { Plugin } from "@typora-community-plugin/core";
import { activate_typora_enhancements, deactivate_typora_enhancements, assert_can_deactivate_typora_enhancements } from "./typora_enhancements";
import { workspace_dialog } from "./workspace_widgets";
import manifest from "../community_plugin/manifest.json";

export default class linux_note_enhancements_plugin extends Plugin {
  private restore_guards: (() => void)[] = [];
  onload(): void {
    // core 2.10.15 的 disablePlugin 会吞掉 onunload 异常后仍写入禁用配置。
    // 在管理器改变状态之前检查草稿和进行中的写操作，拒绝时保留整个已启用实例。
    const manager = (window as unknown as Record<symbol, {app?: {plugins?: Record<string, (...args: any[]) => any>}}>)[Symbol.for("typora-plugin-core@v2")]?.app?.plugins;
    if (manager && !this.restore_guards.length) {
      for (const name of ["disablePlugin", "unloadPlugin", "uninstallPlugin", "updatePlugin"]) {
        const original = manager[name];
        if (typeof original !== "function") continue;
        const guarded = manager[name] = function (id: string, ...args: unknown[]) {
          if (id === manifest.id) {
            try { assert_can_deactivate_typora_enhancements(); }
            catch (error) {
              workspace_dialog("暂时无法停用 Typora Code").content.textContent = String(error instanceof Error ? error.message : error);
              throw error;
            }
          }
          return original.call(this, id, ...args);
        };
        this.restore_guards.push(() => { if (manager[name] === guarded) manager[name] = original; });
      }
    }
    void activate_typora_enhancements().catch((error: unknown) => {
      console.error("[linux-note Typora plugin]", error);
    });
  }

  onunload(): void {
    deactivate_typora_enhancements();
    for (const restore of this.restore_guards.splice(0).reverse()) restore();
  }
}
