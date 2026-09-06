import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const typora_root = path.resolve("..");
const bundle_markers = fs.readFileSync(path.join(typora_root, 'enhancements/bundle_markers.txt'), 'utf8')
  .split(/\r?\n/u).map((marker) => marker.trim()).filter(Boolean);
const bundle_source = fs.readFileSync(path.join(typora_root, 'enhancements/dist/typora_enhancements.js'), 'utf8');
for (const marker of ['bind_code_toggle_events', 'bind_reading_navigation', 'initialize_workspace', 'create_reading_workspace',
  'linux-note-reading-position:v1:', 'data-linux-note-reading-positions', 'bind_file_path_actions', 'data-linux-note-copy-path',
  'bind_git_graph', 'data-linux-note-git-graph', 'linux_note:git_graph', 'data-linux-note-git-graph-actions', 'plan_git_action', 'linux-note-git-graph:v2:', 'git-graph-dialog-shade']) {
  if (!bundle_markers.includes(marker)) throw new Error(`required deployment capability is missing: ${marker}`);
}
for (const marker of bundle_markers) {
  if (!bundle_source.includes(marker)) throw new Error(`prebuilt bundle is missing: ${marker}`);
}
for (const line of fs.readFileSync('vendor/gemoji/SHA256SUMS', 'utf8').trim().split(/\r?\n/u)) {
  const match = /^([a-f\d]{64})  (emoji\.json|LICENSE)$/u.exec(line);
  if (!match || createHash('sha256').update(fs.readFileSync('vendor/gemoji/' + match[2])).digest('hex') !== match[1]) throw new Error('Gemoji release hash mismatch');
}
if (!bundle_source.includes('Copyright (c) 2019 GitHub, Inc.')) throw new Error('Gemoji license is missing from installed bundle');
const deployment_files = [
  "configure_windows.cmd",
  "configure_windows.ps1",
  "check_configuration_windows.ps1",
  "restore_configuration_windows.ps1",
  "configure.sh",
  "check_configuration.sh",
  "restore_configuration.sh",
  "scripts/lib/typora_environment.ps1",
  "scripts/lib/typora_terminal.ps1",
  "scripts/lib/typora_environment.sh",
  "scripts/lib/typora_workspace.ps1",
  "scripts/lib/typora_workspace.sh",
  "enhancements/scripts/install_windows.ps1",
  "enhancements/scripts/restore_windows.ps1",
];

const sources = new Map(deployment_files.map((relative_path) => {
  const file_path = path.join(typora_root, relative_path);
  if (!fs.existsSync(file_path)) throw new Error(`deployment file is missing: ${relative_path}`);
  return [relative_path, fs.readFileSync(file_path, "utf8")];
}));

const forbidden_install_locations = [
  /[a-z]:\\program files(?: \(x86\))?\\typora/iu,
  /[a-z]:\\users\\[^\s"']+\\.*typora/iu,
  /[a-z]:\\typora(?:\\|["'])/iu,
  /\/usr\/share\/typora(?:\/|["'])/u,
  /\/opt\/typora(?:\/|["'])/u,
];
for (const [relative_path, source] of sources) {
  for (const forbidden_pattern of forbidden_install_locations) {
    if (forbidden_pattern.test(source)) {
      throw new Error(`hard-coded Typora installation path in ${relative_path}: ${forbidden_pattern}`);
    }
  }
}

const powershell_environment = sources.get("scripts/lib/typora_environment.ps1");
for (const marker of ["TYPORA_ROOT", "Get-Process Typora", "Registry::", "Read-Host", "^/mnt/", "^/([A-Za-z])"]) {
  if (!powershell_environment.includes(marker)) throw new Error(`PowerShell discovery marker is missing: ${marker}`);
}

const bash_environment = sources.get("scripts/lib/typora_environment.sh");
for (const marker of ["UCRT64", "Linux", "cygpath", "TYPORA_ROOT", "/dev/tty", "typora_root_from_candidate"]) {
  if (!bash_environment.includes(marker)) throw new Error(`Bash discovery marker is missing: ${marker}`);
}

for (const file of ['configure_windows.ps1', 'check_configuration_windows.ps1', 'enhancements/scripts/install_windows.ps1']) {
  if (!sources.get(file).includes('assert_typora_bundle') || !sources.get(file).includes('bundle_markers.txt')) {
    throw new Error(`shared bundle validation is missing from ${file}`);
  }
}
for (const file of ['configure.sh', 'check_configuration.sh']) {
  if (!sources.get(file).includes('typora_validate_bundle') || !sources.get(file).includes('bundle_markers.txt')) {
    throw new Error(`shared bundle validation is missing from ${file}`);
  }
}

const vendor_root = path.join(typora_root, 'enhancements/vendor/typora_workspace');
const asset_lines = fs.readFileSync(path.join(vendor_root, 'SHA256SUMS'), 'utf8').trim().split(/\r?\n/u);
const bootstrap_source = fs.readFileSync(path.join(typora_root, 'enhancements/src/workspace_bootstrap.ts'), 'utf8');
const bootstrap_version = /const WORKSPACE_VERSION = "([0-9.]+)"/u.exec(bootstrap_source)?.[1];
const bundled_version = /WORKSPACE_VERSION = "([0-9.]+)"/u.exec(bundle_source)?.[1];
if (!bootstrap_version || bundled_version !== bootstrap_version) {
  throw new Error('workspace source and prebuilt core versions differ; rebuild the bundle');
}
for (const line of asset_lines) {
  const match = /^([a-f0-9]{64})  ([0-9.]+\/(?:locales\/)?[a-zA-Z0-9._-]+)$/u.exec(line);
  if (!match || match[2].includes('..')) throw new Error(`invalid workspace asset entry: ${line}`);
  if (match[2].split('/')[0] !== bootstrap_version) throw new Error(`workspace core version differs from its assets: ${match[2]}`);
  const digest = createHash('sha256').update(fs.readFileSync(path.join(vendor_root, match[2]))).digest('hex');
  if (digest !== match[1]) throw new Error(`workspace asset hash mismatch: ${match[2]}`);
}
console.log(`validated ${deployment_files.length} portable deployment files and ${asset_lines.length} workspace ${bootstrap_version} assets`);

for (const line of fs.readFileSync('dist/terminal_runtime/SHA256SUMS','utf8').trim().split(/\r?\n/u)) {
  const match = /^([a-f0-9]{64})  ([0-9.]+\/(?:node-pty\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9._-]+|terminal_broker.cjs))$/u.exec(line);
  if (!match || match[2].includes('..') || createHash('sha256').update(fs.readFileSync('dist/terminal_runtime/'+match[2])).digest('hex') !== match[1]) throw new Error('Terminal asset hash mismatch');
}
for (const marker of ['data-linux-note-terminal','linux_note:terminal','linux-note-workspace-sash']) if (!bundle_markers.includes(marker)) throw new Error('Terminal deployment marker missing');
const node_release = JSON.parse(fs.readFileSync('node_runtime.json','utf8'));
if (!bundle_source.includes(node_release.version) || !bundle_source.includes('Copyright (c) 2017-2019, The xterm.js authors')) throw new Error('Terminal runtime version or license is missing');
