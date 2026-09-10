'use strict';
const fs = require('node:fs'), crypto = require('node:crypto');
const key = 'framelessWindow';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function read_profile(file) {
  if (!fs.existsSync(file)) return { data: {}, sha256: 'missing', exists: false };
  const bytes = fs.readFileSync(file), hex = bytes.toString('ascii');
  if (!bytes.length || bytes.length % 2 || !/^[0-9a-f]+$/.test(hex) || !Buffer.from(hex, 'ascii').equals(bytes)) throw Error('Unknown native profile encoding');
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.from(hex, 'hex'))); }
  catch { throw Error('Invalid native profile JSON'); }
  if (!data || Array.isArray(data) || typeof data !== 'object' || Object.hasOwn(data, key) && typeof data[key] !== 'boolean') throw Error('Invalid native profile object or window preference');
  return { data, sha256: digest(bytes), exists: true };
}
function update_profile(file, operation, expected, backup) {
  const current = read_profile(file);
  if (current.sha256 !== expected) throw Error('Native profile changed concurrently');
  const previous = operation === 'restore' ? read_profile(backup).data : { [key]: true };
  const data = { ...current.data };
  if (Object.hasOwn(previous, key)) data[key] = previous[key]; else delete data[key];
  if (JSON.stringify(data) === JSON.stringify(current.data)) return { changed: false, sha256: current.sha256 };
  const bytes = Buffer.from(Buffer.from(JSON.stringify(data), 'utf8').toString('hex'), 'ascii');
  const temporary = file + '.typora-code-' + crypto.randomUUID() + '.tmp';
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', current.exists ? fs.statSync(file).mode : 0o600);
    fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
    if (read_profile(file).sha256 !== expected) throw Error('Native profile changed concurrently');
    fs.renameSync(temporary, file);
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); fs.rmSync(temporary, { force: true }); }
  return { changed: true, sha256: digest(bytes) };
}
module.exports = { read_profile, update_profile };
if (require.main === module) {
  try {
    const [operation, file, expected, backup] = process.argv.slice(2);
    if (operation === 'snapshot' || operation === 'check') {
      const current = read_profile(file);
      if (operation === 'check' && current.data[key] !== true) throw Error('Single-row workspace requires framelessWindow=true');
      console.log(JSON.stringify({ exists: current.exists, sha256: current.sha256 }));
    } else if (operation === 'install' || operation === 'restore') console.log(JSON.stringify(update_profile(file, operation, expected, backup)));
    else throw Error('Unknown native profile operation');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
