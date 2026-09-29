import type { git_run } from "./git_graph_data";
import { git_graph_text as text } from "./git_graph_i18n";
import {remote_files_for} from './remote_workspace_files';
import {create_text_document,save_text_document_as} from './workspace_text_document';

type ignore_modules = { fs: any; path_api: any };
export type ignore_result = { rule: string; changed: boolean };

/** The root directory anchors and escapes Git wildcard characters; one rule only matches the current relative file path. */
export function exact_ignore_rule(file: string): string {
  if (!file || /[\0\r\n]/u.test(file) || /^(?:[a-z]:|\/)/iu.test(file)
      || file.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) throw new Error(text("ignore.invalid_rule"));
  return "/" + file.replace(/[\\*?\[\]#! ]/gu, character => "\\" + character);
}

/** Only append the root .gitignore, without modifying the index; existing files are not truncated, and no symbolic links are written without permission. */
export async function append_git_ignore(modules: ignore_modules, run: git_run, root: string, file: string): Promise<ignore_result> {
  const { fs, path_api } = modules;
  const rule = exact_ignore_rule(file);
  if(remote_files_for(root)){
    const real_root=await fs.promises.realpath(root),target=path_api.resolve(real_root,file),resolved=await fs.promises.realpath(target),relative=path_api.relative(real_root,resolved);
    if(!relative||relative==='..'||relative.startsWith('..'+path_api.sep)||path_api.isAbsolute(relative))throw Error(text('ignore.outside_repository'));
    const target_stat=await fs.promises.lstat(target);if(!target_stat.isFile()||target_stat.isSymbolicLink())throw Error(text('ignore.ordinary_untracked_only'));
    const ignore_path=path_api.join(real_root,'.gitignore'),document=create_text_document(modules,ignore_path);let value:any;
    try{const stat=await fs.promises.lstat(ignore_path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error(text('ignore.ordinary_gitignore_required'));value=await document.load();}catch(error){if((error as any).code!=='ENOENT')throw error;}
    const content=value?.text||'';if(content.split(/\r?\n/u).includes(rule))return{rule,changed:false};const newline=content.match(/\r?\n/u)?.[0]||'\n',next=content+(content&&!content.endsWith('\n')?newline:'')+rule+newline;
    if(value)await document.save(next);else await save_text_document_as(modules,ignore_path,next,{text:'',encoding:'utf-8',bom:false,eol:'LF'} as any);
    return{rule,changed:true};
  }
  // The backslash and colon in Windows have path semantics, which cannot be interpreted as Linux file names.
  if (path_api.sep === "\\" && /[\\:]/u.test(file)) throw new Error(text("ignore.invalid_path"));
  const real_root = fs.realpathSync(root);
  const file_path = path_api.resolve(real_root, file);
  const inside_root = (value: string) => {
    const relative = path_api.relative(real_root, value);
    return relative && relative !== ".." && !relative.startsWith(".." + path_api.sep) && !path_api.isAbsolute(relative);
  };
  if (!inside_root(file_path) || !inside_root(fs.realpathSync(file_path))) throw new Error(text("ignore.outside_repository"));
  const file_stat = fs.lstatSync(file_path);
  if (!file_stat.isFile() || file_stat.isSymbolicLink()) throw new Error(text("ignore.ordinary_untracked_only"));
  await run(root, ["check-ignore", "--no-index", "--quiet", "--", file]).then(() => true, error => { if (error.code === 1) return false; throw error; });
  const ignore_path = path_api.join(real_root, ".gitignore");
  const ordinary_file = (stat: any) => {
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw new Error(text("ignore.ordinary_gitignore_required"));
  };
  let descriptor: number | undefined;
  try {
    let exists = true;
    try { ordinary_file(fs.lstatSync(ignore_path)); } catch (error) { if ((error as { code?: string }).code === "ENOENT") exists = false; else throw error; }
    // Exclusive creation prevents overwriting new files; existing files are opened in append mode, and O_NOFOLLOW blocks symbolic link following on supported platforms.
    try { descriptor = fs.openSync(ignore_path, exists ? fs.constants.O_RDWR | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW || 0) : "ax+"); }
    catch (error) { if ((error as { code?: string }).code === "EEXIST") throw new Error(text("ignore.created_concurrently")); throw error; }
    const opened_stat = fs.fstatSync(descriptor); ordinary_file(opened_stat);
    const current_stat = fs.lstatSync(ignore_path); ordinary_file(current_stat);
    if (opened_stat.dev !== current_stat.dev || opened_stat.ino !== current_stat.ino) throw new Error(text("ignore.replaced_concurrently"));
    const existing = fs.readFileSync(descriptor);
    let content: string;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(existing); }
    catch { throw new Error(text("ignore.invalid_utf8")); }
    if (content.includes("\0")) throw new Error(text("ignore.invalid_content"));
    if (content.split(/\r?\n/u).includes(rule)) return { rule, changed: false };
    const newline = content.match(/\r?\n/u)?.[0] || "\n";
    const addition = (content && !content.endsWith("\n") ? newline : "") + rule + newline;
    fs.writeFileSync(descriptor, addition, "utf8"); fs.fsyncSync(descriptor);
    return { rule, changed: true };
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}
