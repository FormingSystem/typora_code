import {workspace_text} from "./workspace_i18n";
import worker_source from "linux_note_search_worker";
import type {search_query_options, search_match_reply,search_path_match} from "./workspace_search_matcher";

export type search_match_worker = {postMessage(value: unknown): void; addEventListener(type: "message" | "error", listener: (event: any) => void): void; removeEventListener(type: "message" | "error", listener: (event: any) => void): void; terminate(): void};
export type search_matcher_factory = () => search_match_worker;
export class search_match_failure extends Error {
  constructor(public reason: "cancelled" | "failed", message: string) { super(message); }
}

function browser_matcher(): search_match_worker {
  if (typeof Worker === "undefined" || !worker_source) throw new Error(workspace_text("search_worker_client_this_environment_has_no_isolatable_search_worker_please_chec"));
  const url = URL.createObjectURL(new Blob([worker_source], {type: "text/javascript"})); let worker: Worker;
  try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); throw error; }
  return {postMessage: value => worker.postMessage(value), addEventListener: (type, listener) => worker.addEventListener(type, listener), removeEventListener: (type, listener) => worker.removeEventListener(type, listener), terminate: () => { worker.terminate(); URL.revokeObjectURL(url); }};
}

/** A single search round reuses one Worker; cancel directly terminates Worker, without waiting for RegExp.exec return. */
export function create_search_matcher(factory: search_matcher_factory = browser_matcher) {
  let worker: search_match_worker | undefined; let request_serial = 0;
  const dispose = () => { worker?.terminate(); worker = undefined; };
  const start = () => { worker ||= factory(); };
  const request = <T>(payload:object, signal?: AbortSignal): Promise<T> => {
    if (signal?.aborted) return Promise.reject(new search_match_failure("cancelled", workspace_text("search_worker_client_search_canceled")));
    start(); const active = worker!; const request_id = ++request_serial;
    return new Promise((resolve, reject) => {
      const cleanup = () => { signal?.removeEventListener("abort", abort); active.removeEventListener("message", message); active.removeEventListener("error", error); };
      const fail = (reason: "cancelled" | "failed", text: string) => { cleanup(); dispose(); reject(new search_match_failure(reason, text)); };
      const abort = () => fail("cancelled", workspace_text("search_worker_client_search_canceled"));
      const error = (event: {message?: string}) => fail("failed", workspace_text("search_worker_client_search_worker_failed") + (event.message || workspace_text("search_worker_client_unable_to_complete_matching")));
      const message = (event: MessageEvent<T & {request_id: number; error?: string}>) => {
        if (event.data.request_id !== request_id) return;
        if (event.data.error) { fail("failed", event.data.error); return; }
        cleanup(); resolve(event.data);
      };
      active.addEventListener("message", message); active.addEventListener("error", error); signal?.addEventListener("abort", abort, {once: true});
      try { active.postMessage({request_id,...payload}); }
      catch (caught) { fail("failed", workspace_text("search_worker_client_unable_to_start_isolated_matching") + String(caught)); }
    });
  };
  const match=(text:string,options:search_query_options,signal?:AbortSignal)=>request<search_match_reply>({text,options},signal).then(({matches})=>({matches}));
  const match_paths=(paths:string[],options:search_query_options,signal?:AbortSignal)=>request<{path_matches:search_path_match[]}>({paths,options},signal).then(reply=>reply.path_matches);
  return {start, match, match_paths, dispose};
}
