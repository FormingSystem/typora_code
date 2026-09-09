export type terminal_pty = { pid: number; write(data: string): void; resize(cols: number, rows: number): void; acknowledge(length: number): void; kill(): void };
export function start_terminal_pty(runtime: { signal?: AbortSignal; child_process: any; process_api: any; broker: string; executable: string }, request: object,
  callbacks: { data(value: string): void; exit(code: number): void; error(message: string): void }): Promise<terminal_pty> {
  return new Promise((resolve, reject) => {
    if (runtime.signal?.aborted) { reject(new Error("终端启动已取消。")); return; }
    const child = runtime.child_process.fork(runtime.broker, [], {
      execPath: runtime.executable, execArgv: [], windowsHide: true, silent: true,
      env: { ...runtime.process_api.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
    });
    let ready = false; let stopped = false; let stderr = '';
    const send = (message: object) => { if (!stopped && child.connected) child.send(message, (error: Error | null) => { if (error && !stopped) callbacks.error(error.message); }); };
    const timeout = setTimeout(() => { reject(new Error('终端进程启动超时。')); proxy.kill(); }, 15000);
    const proxy: terminal_pty = { pid: 0,
      write(data) { for (let offset = 0; offset < data.length;) { let end = Math.min(data.length, offset + 65536); if (end < data.length && /[\uD800-\uDBFF]/u.test(data[end - 1])) end--; send({ type: 'input', data: data.slice(offset, end) }); offset = end; } },
      resize(cols, rows) { send({ type: 'resize', cols, rows }); },
      acknowledge(length) { send({ type: 'ack', length }); },
      kill() { if (stopped) return; clearTimeout(timeout); clear_abort(); send({ type: 'close' }); stopped = true; setTimeout(() => { if (child.connected) child.disconnect(); }, 1500); },
    };
    const on_abort = () => { if (!ready) reject(new Error("终端启动已取消。")); proxy.kill(); };
    const clear_abort = () => runtime.signal?.removeEventListener("abort", on_abort);
    runtime.signal?.addEventListener("abort", on_abort, {once:true});
    child.stderr?.on('data', (data: any) => { stderr = (stderr + String(data)).slice(-4000); });
    child.on('message', (message: any) => {
      if (stopped) return;
      if (message.type === 'ready') { ready = true; clearTimeout(timeout); clear_abort(); proxy.pid = message.pid; resolve(proxy); }
      else if (message.type === 'data') callbacks.data(message.data);
      else if (message.type === 'exit') { stopped = true; clearTimeout(timeout); callbacks.exit(message.exit_code); }
      else if (message.type === 'error') { clearTimeout(timeout); if (!ready) reject(new Error(message.message)); else callbacks.error(message.message); proxy.kill(); }
    });
    child.on('error', (error: Error) => { clear_abort(); clearTimeout(timeout); if (!ready) reject(error); else callbacks.error(error.message); stopped = true; });
    child.on('exit', (code: number) => { clear_abort(); clearTimeout(timeout); if (!ready) reject(new Error('终端宿主启动失败：' + stderr)); else if (!stopped) callbacks.exit(code); stopped = true; });
    send({ type: 'start', ...request });
  });
}
