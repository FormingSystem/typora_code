export type workspace_locale = "zh-cn" | "en";
export type workspace_language_preference = "auto" | workspace_locale;

/** The initialized core owns the window language until the next normal restart. */
export function resolve_workspace_locale(language?: string): workspace_locale {
  const runtime = globalThis as any;
  const core = runtime[Symbol.for("typora-code:workspace")];
  const environment = runtime[Symbol.for("typora-code:workspace:env")];
  const candidates = [
    language, core?.app?.i18n?.locale, environment?.userLang,
    runtime._options?.displayLang, runtime._options?.userLang,
    runtime._options?.appLocale, runtime._options?.locale,
    runtime.File?.option?.displayLang, runtime.File?.option?.userLang,
    runtime.File?.option?.locale, runtime.document?.documentElement?.lang,
    runtime.document?.body?.lang, ...(runtime.navigator?.languages || []),
    runtime.navigator?.language,
  ];
  const selected = candidates.find(value => typeof value === "string" && value.trim() && value !== "auto") || "en";
  return /^zh(?:-|_|$)/iu.test(selected.trim()) ? "zh-cn" : "en";
}

export function workspace_language_tag(locale = resolve_workspace_locale()): "zh-CN" | "en-US" {
  return locale === "zh-cn" ? "zh-CN" : "en-US";
}

export function read_workspace_language_preference(settings?: {get(key: string): unknown}): workspace_language_preference {
  const value = settings?.get("displayLang");
  return value === "en" || value === "zh-cn" ? value : "auto";
}

/** Persist through the existing settings transaction; do not switch live editors. */
export function save_workspace_language_preference(settings: {set_and_save(key: string, value: unknown): void}, value: unknown): void {
  if (value !== "auto" && value !== "en" && value !== "zh-cn") throw new Error("Unsupported display language.");
  settings.set_and_save("displayLang", value === "auto" ? undefined : value);
}
