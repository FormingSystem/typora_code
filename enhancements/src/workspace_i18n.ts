import {resolve_workspace_locale, type workspace_locale} from "./workspace_locale";
import messages from "./workspace_messages.json";

export type workspace_message_key = keyof typeof messages;
export type workspace_message_values = Record<string, string | number>;

/** Translate only an explicitly selected product message; never inspect user text. */
export function workspace_text(key: workspace_message_key, values: workspace_message_values = {}, locale = resolve_workspace_locale()): string {
  const message = messages[key];
  const template = (locale === "zh-cn" ? message?.zh_cn : message?.en) ?? message?.en ?? key;
  return template.replace(/\{([a-z][a-z0-9_]*)\}/giu, (match, name: string) => Object.hasOwn(values, name) ? String(values[name]) : match);
}

export function workspace_dictionary(locale: workspace_locale): Readonly<Record<workspace_message_key, string>> {
  return Object.fromEntries(Object.entries(messages).map(([key, message]) => [key, locale === "zh-cn" ? message.zh_cn : message.en])) as Record<workspace_message_key, string>;
}
