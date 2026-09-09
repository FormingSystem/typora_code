import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const typora_root = path.resolve("..");
const bundle_markers = fs.readFileSync(path.join(typora_root, 'enhancements/bundle_markers.txt'), 'utf8')
  .split(/\r?\n/u).map((marker) => marker.trim()).filter(Boolean);
const bundle_source = fs.readFileSync(path.join(typora_root, 'enhancements/dist/typora_enhancements.js'), 'utf8');
for (const marker of ['bind_code_toggle_events', 'bind_reading_navigation', 'initialize_workspace', 'create_reading_workspace',
  'linux-note-reading-position:v1:', 'data-linux-note-reading-positions', 'bind_file_path_actions', 'data-linux-note-copy-path',
  'bind_git_graph', 'data-linux-note-git-graph', 'linux_note:git_graph', 'data-linux-note-git-graph-actions', 'plan_git_action', 'linux-note-git-graph:v2:', 'git-graph-dialog-shade', 'data-linux-note-source-control', 'data-linux-note-monaco-diff', 'linux_note:source_control',
  'data-linux-note-git-commit-shortcut', 'data-linux-note-scm-history', 'append_git_ignore', '#outline-btn-wrapper', 'data-linux-note-reading-minimap', 'bind_reading_minimap', 'data-linux-note-git-status', 'data-linux-note-git-sync', 'data-linux-note-git-discard', 'trashItem']) {
  if (!bundle_markers.includes(marker)) throw new Error(`required deployment capability is missing: ${marker}`);
}
for (const marker of bundle_markers) {
  if (!bundle_source.includes(marker)) throw new Error(`prebuilt bundle is missing: ${marker}`);
}
for(const marker of ['data-git-icon','bind_workspace_browser','data-linux-note-workspace-files','data-linux-note-workspace-search','data-linux-note-workspace-explorer','install_workspace_activity','data-linux-note-terminal-theme','data-linux-note-workspace-outline','bind_workspace_selection_search','data-linux-note-lookup-preview','linux-note-search-selection','workspace-search-preview-section','linux-note:lookup:preview-scale:v1','install_workspace_sidebar_sash','data-linux-note-source-editing','install_workspace_footer','bind_workspace_editor_status','linux-note-editor-status','install_workspace_titlebar','workspace-titlebar-menu','create_workspace_titlebar_definitions','create_workspace_titlebar_menu','bind_workspace_tab_actions','install_workspace_ui_appearance','install_workspace_chrome','data-linux-note-workspace-chrome','linux-note-document-margin','install_workspace_shortcuts','linux_note:close_all_workspace_tabs']) {
  if(!bundle_markers.includes(marker))throw new Error(`required workspace deployment capability is missing: ${marker}`);
}
const codicon_root = 'vendor/codicons';
const codicon_checksums = new Map();
for(const line of fs.readFileSync(`${codicon_root}/SHA256SUMS`,'utf8').trim().split(/\r?\n/u)) {
  const match=/^([a-f\d]{64})  ([a-zA-Z0-9_./-]+)$/u.exec(line);
  if(!match||match[2].includes('..')||codicon_checksums.has(match[2])||createHash('sha256').update(fs.readFileSync(`${codicon_root}/${match[2]}`)).digest('hex')!==match[1])throw new Error('Codicons asset hash mismatch');
  codicon_checksums.set(match[2], match[1]);
}
const codicon_manifest = JSON.parse(fs.readFileSync(`${codicon_root}/source_manifest.json`, 'utf8'));
const codicon_icons = JSON.parse(fs.readFileSync(`${codicon_root}/icons.json`, 'utf8'));
if (codicon_manifest.repository_url !== 'https://github.com/microsoft/vscode-codicons' || !/^[a-f\d]{40}$/u.test(codicon_manifest.revision)) throw new Error('Codicons source identity is invalid');
if (Object.keys(codicon_icons).sort().join('\n') !== Object.keys(codicon_manifest.icons).sort().join('\n')) throw new Error('Codicons icon indexes differ');
for (const [icon_name, source] of Object.entries(codicon_manifest.icons)) {
  if (!/^icons\/[a-z0-9_]+\.svg$/u.test(source.file) || !/^src\/icons\/[a-z0-9-]+\.svg$/u.test(source.source_path) || !/^[a-f\d]{40}$/u.test(source.git_blob_sha1) || !/^[a-f\d]{64}$/u.test(source.sha256)) throw new Error(`Codicons source entry is invalid: ${icon_name}`);
  const icon_source = fs.readFileSync(`${codicon_root}/${source.file}`, 'utf8');
  const digest = createHash('sha256').update(icon_source).digest('hex');
  if (digest !== source.sha256 || codicon_checksums.get(source.file) !== digest || codicon_icons[icon_name] !== icon_source.trim()) throw new Error(`Codicons manifest differs from packaged icon: ${icon_name}`);
}
for (const source of codicon_manifest.licenses) {
  if (!/^[A-Z_]+$/u.test(source.file) || !/^[a-f\d]{40}$/u.test(source.git_blob_sha1) || !/^[a-f\d]{64}$/u.test(source.sha256)) throw new Error(`Codicons license entry is invalid: ${source.file}`);
  const digest = createHash('sha256').update(fs.readFileSync(`${codicon_root}/${source.file}`)).digest('hex');
  if (digest !== source.sha256 || codicon_checksums.get(source.file) !== digest) throw new Error(`Codicons manifest differs from packaged license: ${source.file}`);
}
if(!bundle_source.includes('Microsoft VS Code Codicons')||!bundle_source.includes('https://creativecommons.org/licenses/by/4.0/'))throw new Error('Codicons attribution is missing from the installed bundle');
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

if (!bundle_source.includes('Monaco Editor 0.56.0 (MIT)')) throw new Error('Monaco license is missing');
if (!bundle_source.includes('_VSCODE_NLS_LANGUAGE')) throw new Error('Monaco Chinese UI is missing');
