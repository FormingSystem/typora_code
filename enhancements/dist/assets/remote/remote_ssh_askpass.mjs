// OpenSSH supplies the prompt as an argument; Node's script entry does not run until asynchronous module preloading completes.
import net from 'node:net';
await new Promise(() => {
  const socket = net.connect({ host: '127.0.0.1', port: Number(process.env.TYPORA_SSH_AUTH_PORT) });
  let text = '';
  const finish = () => process.exit(1);
  socket.setTimeout(120000, finish);
  socket.on('error', finish);
  socket.on('connect', () => socket.write(JSON.stringify({ token: process.env.TYPORA_SSH_AUTH_TOKEN, prompt: process.argv[1] || 'SSH认证' }) + '\n'));
  socket.on('data', chunk => {
    text += chunk;
    if (text.length > 65536) return finish();
    if (!text.includes('\n')) return;
    try {
      const message = JSON.parse(text);
      if (typeof message.answer !== 'string') return finish();
      process.stdout.write(message.answer + '\n', () => process.exit(0));
    } catch { finish(); }
  });
});
