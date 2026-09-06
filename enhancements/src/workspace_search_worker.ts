import {collect_search_matches, type search_query_options} from "./workspace_search_matcher";

// 仅处理单文件纯文本；磁盘、忽略规则与替换权限始终留在宿主。
const scope = globalThis as unknown as {onmessage: (event: MessageEvent<{request_id: number; text: string; options: search_query_options; max_results: number}>) => void; postMessage(value: unknown): void};
scope.onmessage = event => {
  const {request_id, text, options, max_results} = event.data;
  try { scope.postMessage({request_id, ...collect_search_matches(text, options, max_results)}); }
  catch (error) { scope.postMessage({request_id, error: String(error instanceof Error ? error.message : error)}); }
};
