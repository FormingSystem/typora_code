// 使用安装器校验的独立 Node 运行时。ConPTY 的排空线程不能在 Renderer 中创建。
const pty_module = require('./node-pty/lib');
let terminal; let closing = false; let pending_bytes = 0;
const send = message => { if (process.connected) process.send(message); };
const close = () => {
  if (closing) return;
  closing = true;
  if (terminal) try { terminal.kill(); } catch { /* 子进程可能已经退出。 */ }
  setTimeout(() => process.exit(0), 1200).unref();
};
process.on('disconnect', close);
process.on('SIGTERM', close);
process.on('message', message => {
  if (!message || closing) return;
  try {
    if (message.type === 'start' && !terminal) {
      terminal = pty_module.spawn(message.executable, message.args, message.options);
      terminal.onData(data => { pending_bytes += data.length; if (pending_bytes > 262144) terminal.pause(); send({ type: 'data', data }); });
      terminal.onExit(event => { send({ type: 'exit', exit_code: event.exitCode }); terminal = undefined; close(); });
      send({ type: 'ready', pid: terminal.pid });
    } else if (message.type === 'input' && typeof message.data === 'string' && message.data.length <= 1024 * 1024) terminal?.write(message.data);
    else if (message.type === 'resize' && Number.isInteger(message.cols) && Number.isInteger(message.rows) && message.cols > 0 && message.cols <= 2000 && message.rows > 0 && message.rows <= 1000) terminal?.resize(message.cols, message.rows);
    else if (message.type === 'ack' && Number.isInteger(message.length) && message.length >= 0) { pending_bytes = Math.max(0, pending_bytes - message.length); if (pending_bytes < 65536) terminal?.resume(); }
    else if (message.type === 'close') close();
  } catch (error) { send({ type: 'error', message: String(error) }); close(); }
});
