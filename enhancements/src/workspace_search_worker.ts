import {collect_search_matches, collect_path_matches, type search_query_options} from "./workspace_search_matcher";

// Only process single-file pure text; disk, ignore rules, and replacement permissions remain in the host.
const scope = globalThis as unknown as {onmessage: (event: MessageEvent<{request_id: number; text: string; paths?:string[]; options: search_query_options}>) => void; postMessage(value: unknown): void};
scope.onmessage = event => {
  const {request_id, text, paths, options} = event.data;
  try { scope.postMessage({request_id, ...(paths?{path_matches:collect_path_matches(paths,options)}:collect_search_matches(text, options))}); }
  catch (error) { scope.postMessage({request_id, error: String(error instanceof Error ? error.message : error)}); }
};
