/** 标签移交的新窗只接收指定文档，不能同时按目录恢复全部编辑器。 */
export const TRANSFER_WINDOW_ANCHOR_PREFIX = "#typora-code-window-";
export const TRANSFER_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export function window_transfer_token(initial_file: string | undefined, anchor: string): string {
  if (initial_file || !anchor.startsWith(TRANSFER_WINDOW_ANCHOR_PREFIX)) return "";
  const token = anchor.slice(TRANSFER_WINDOW_ANCHOR_PREFIX.length);
  return TRANSFER_TOKEN_PATTERN.test(token) ? token : "";
}
