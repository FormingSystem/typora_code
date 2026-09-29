import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Normal installation directly uses these locked and verified runtime files; no user is required to install Node or compiler.
const source = 'node_modules/node-pty';
const version = JSON.parse(fs.readFileSync(source + '/package.json', 'utf8')).version;
if (version !== '1.1.0') throw new Error('Update the terminal runtime version and deployment contract together.');
const target = 'dist/terminal_runtime';
const files = ['LICENSE', 'package.json'];
const walk = directory => {
  for (const entry of fs.readdirSync(path.join(source, directory), { withFileTypes: true })) {
    const relative = directory + '/' + entry.name;
    if (entry.isDirectory()) walk(relative);
    else if (relative.endsWith('.js') && !relative.endsWith('.test.js')) files.push(relative);
  }
};
walk('lib');
for (const arch of ['x64', 'arm64']) for (const name of ['conpty.node', 'conpty_console_list.node']) files.push(`prebuilds/win32-${arch}/${name}`);
// Complement with the node-pty locked package; cannot silently return the old ConPTY of the system in the Windows 10.
for (const arch of ['x64', 'arm64']) for (const name of ['conpty.dll', 'OpenConsole.exe']) files.push(`prebuilds/win32-${arch}/conpty/${name}`);
const records = [];
for (const relative of files.sort()) {
  const data = fs.readFileSync(path.join(source, relative)); const name = version + '/node-pty/' + relative;
  fs.mkdirSync(path.dirname(path.join(target, name)), { recursive: true }); fs.writeFileSync(path.join(target, name), data);
  records.push(createHash('sha256').update(data).digest('hex') + '  ' + name);
}
const broker = Buffer.from(fs.readFileSync('src/terminal_broker.cjs', 'utf8').replaceAll('\r\n', '\n'));
fs.writeFileSync(target + '/' + version + '/terminal_broker.cjs', broker);
records.push(createHash('sha256').update(broker).digest('hex') + '  ' + version + '/terminal_broker.cjs');
fs.writeFileSync(target + '/SHA256SUMS', records.join('\n') + '\n');
fs.writeFileSync(target + '/.gitattributes', '* -text\n');
console.log(`Prepared ${files.length} node-pty ${version} Windows runtime assets.`);
