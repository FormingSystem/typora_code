import worker_source from "linux_note_search_worker";
import type {search_query_options, search_match_reply,search_path_match} from "./workspace_search_matcher";

export type search_match_worker = {postMessage(value: unknown): void; addEventListener(type: "message" | "error", listener: (event: any) => void): void; removeEventListener(type: "message" | "error", listener: (event: any) => void): void; terminate(): void};
export type search_matcher_factory = () => search_match_worker;
export class search_match_failure extends Error {
  constructor(public reason: "cancelled" | "timeout" | "failed", message: string) { super(message); }
}

function browser_matcher(): search_match_worker {
  if (typeof Worker === "undefined" || !worker_source) throw new Error("此环境没有可隔离运行的搜索 Worker，请检查工作台搜索资源是否完整。");
  const url = URL.createObjectURL(new Blob([worker_source], {type: "text/javascript"})); let worker: Worker;
  try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); throw error; }
  return {postMessage: value => worker.postMessage(value), addEventListener: (type, listener) => worker.addEventListener(type, listener), removeEventListener: (type, listener) => worker.removeEventListener(type, listener), terminate: () => { worker.terminate(); URL.revokeObjectURL(url); }};
}

/** 单轮搜索复用一个 Worker；超时与取消直接终止 Worker，不等待 RegExp.exec 返回。 */
export function create_search_matcher(factory: search_matcher_factory = browser_matcher) {
  let worker: search_match_worker | undefined; let request_serial = 0;
  const dispose = () => { worker?.terminate(); worker = undefined; };
  const start = () => { worker ||= factory(); };
  const request = <T>(payload:object, signal?: AbortSignal): Promise<T> => {
    if (signal?.aborted) return Promise.reject(new search_match_failure("cancelled", "搜索已取消。"));
    start(); const active = worker!; const request_id = ++request_serial;
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); active.removeEventListener("message", message); active.removeEventListener("error", error); };
      const fail = (reason: "cancelled" | "timeout" | "failed", text: string) => { cleanup(); dispose(); reject(new search_match_failure(reason, text)); };
      const abort = () => fail("cancelled", "搜索已取消。");
      const error = (event: {message?: string}) => fail("failed", "搜索 Worker 失败：" + (event.message || "无法完成匹配"));
      const message = (event: MessageEvent<T & {request_id: number; error?: string}>) => {
        if (event.data.request_id !== request_id) return;
        if (event.data.error) { fail("failed", event.data.error); return; }
        cleanup(); resolve(event.data);
      };
      const timer = setTimeout(() => fail("timeout", "文本匹配超过 2 秒，已终止该文件的匹配。请简化表达式或缩小范围。"), 2000);
      active.addEventListener("message", message); active.addEventListener("error", error); signal?.addEventListener("abort", abort, {once: true});
      try { active.postMessage({request_id,...payload}); }
      catch (caught) { fail("failed", "无法启动隔离匹配：" + String(caught)); }
    });
  };
  const match=(text:string,options:search_query_options,max_results:number,signal?:AbortSignal)=>request<search_match_reply>({text,options,max_results},signal).then(({matches,limit_reached})=>({matches,limit_reached}));
  const match_paths=(paths:string[],options:search_query_options,signal?:AbortSignal)=>request<{path_matches:search_path_match[]}>({paths,options},signal).then(reply=>reply.path_matches);
  return {start, match, match_paths, dispose};
}
