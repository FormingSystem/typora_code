import {workspace_element as el,workspace_button as button,workspace_dialog} from './workspace_widgets';
import {acquire_workspace_style} from './workspace_styles';
import css from './source_outline_settings.css';
import {discover_language_environments,resolve_python_environment} from './language_environment';
import {discover_language_server} from './language_analysis_service';
import {read_language_service_profiles,save_language_service_profiles,type language_service_profile} from './language_service_settings';
let current_dialog:ReturnType<typeof workspace_dialog>|undefined;
/** 表单仅持有草稿；JSON与下拉共享配置所有者，取消和迟到发现均不写入。 */
export function open_language_service_settings(root:string,current_root:()=>string=()=>root){
 current_dialog?.close();let closed=false,generation=0;
 const dialog=workspace_dialog('选择语言服务与环境','取消',()=>{closed=true;generation++;style.remove();if(current_dialog===dialog)current_dialog=undefined;},{focus_out:false});current_dialog=dialog;
 dialog.root.classList.add('source-outline-settings');const style=acquire_workspace_style('typora-code-source-outline-settings',css,{},dialog.root);
 const field=<T extends 'input'|'select'|'textarea'>(tag:T,name:string,title:string,hint='')=>{const label=el('label','source-outline-settings-field'),input=el(tag);input.dataset.field=name;input.setAttribute('aria-label',title);label.append(el('span','',title),input);if(hint)label.append(el('small','',hint));dialog.content.append(label);return input;};
 const language=field('select','language','语言');for(const [id,name] of Object.entries({c:'C',cpp:'C++',python:'Python',java:'Java',shell:'Bash / Shell',powershell:'PowerShell',csharp:'C#',rust:'Rust',javascript:'JavaScript',typescript:'TypeScript'}))language.append(new Option(name,id));
 const scope=field('select','scope','配置范围');scope.append(new Option('当前工作区','workspace'),new Option('所有工作区（用户）','user'));if(!root){scope.value='user';scope.options[0].disabled=true;}
 const provider=field('select','provider','分析方式');for(const [id,name] of Object.entries({default:'默认解析器',lsp:'外部语言服务（LSP）',disabled:'关闭分析，保留基础高亮'}))provider.append(new Option(name,id));
 const candidates=field('select','environment','检测到的程序','仅检测环境变量和工程常用位置，不改变系统PATH。编译器不是语言服务。');
 const command=field('input','command','语言服务程序或运行时路径','可手填绝对可执行文件路径或PATH命令；运行时还需要对应语言服务及启动参数。');command.spellcheck=false;
 const picker=el('input');picker.type='file';picker.hidden=true;picker.accept='.exe';picker.onchange=()=>{try{const file=picker.files?.[0];if(!file)return;command.value=(file as any).path||(window as any).reqnode('electron').webUtils.getPathForFile(file);provider.value='lsp';}catch(error){report(String(error));}};
 dialog.content.append(button('选择程序文件…',()=>picker.click()),picker);
 const venv=field('input','venv','Python虚拟环境目录','相对目录按当前工程解析；直接使用环境解释器，不需激活shell。');
 const use_venv=button('使用此虚拟环境',()=>{const request=++generation;void resolve_python_environment(venv.value,root).then(file=>{if(closed||request!==generation)return;command.value=file;args.value=JSON.stringify(['-m','pylsp']);provider.value='lsp';report('已选择解释器。请确认该环境已安装python-lsp-server。');}).catch(error=>{if(!closed&&request===generation)report(String(error.message||error));});});dialog.content.append(use_venv);
 const args=field('textarea','args','启动参数（JSON数组）','例如Python为["-m","pylsp"]；Java填写JDT LS启动参数，PowerShell填写EditorServices启动参数。');args.rows=3;
 const initialization=field('textarea','initialization_options','初始化选项（JSON对象）');initialization.rows=3;
 const settings=field('textarea','settings','服务设置（JSON对象）');settings.rows=3;
 const status=el('p','source-outline-settings-status');status.setAttribute('role','status');dialog.content.append(status);const report=(text:string)=>{status.textContent=text;};
 const valid=()=>{if(current_root()!==root)throw Error('工作区已切换，请关闭后重新配置。');};
 const detect=async()=>{const request=++generation;candidates.replaceChildren(new Option('正在检测…',''));try{const values=await discover_language_environments(language.value,root);if(closed||request!==generation)return;candidates.replaceChildren(new Option(values.length?'选择已检测的程序…':'未找到；可手动填写路径',''));for(const [index,item] of values.entries()){const option=new Option(`${{server:'语言服务',runtime:'运行时',compiler:'编译器/命令行工具'}[item.kind]} · ${item.source} · ${item.path}`,String(index));option.disabled=item.kind==='compiler';candidates.append(option);}candidates.onchange=()=>{const item=values[Number(candidates.value)];if(candidates.value===''||!item)return;command.value=item.path;args.value=JSON.stringify(item.args);if(language.value==='rust')settings.value=JSON.stringify({'rust-analyzer':{checkOnSave:false,cargo:{buildScripts:{enable:false}},procMacro:{enable:false}}},null,2);provider.value='lsp';report(item.kind==='server'?'已选择语言服务，保存后生效。':'已选择运行时。请确认已安装对应语言服务，并填写其启动参数。');};}catch(error){if(!closed&&request===generation)report(String(error));}};
 const load=()=>{generation++;const value=read_language_service_profiles(root,scope.value as 'user'|'workspace')[language.value]||{provider:'default'};provider.value=value.provider;command.value=value.command||'';args.value=JSON.stringify(value.args||[],null,2);initialization.value=JSON.stringify(value.initialization_options||{},null,2);settings.value=JSON.stringify(value.settings||{},null,2);venv.value='';venv.parentElement!.hidden=language.value!=='python';use_venv.hidden=language.value!=='python';report('选择程序不会立即保存；切换语言或范围会重新加载已保存的配置。');void detect();};
 language.onchange=load;scope.onchange=load;
 dialog.content.addEventListener('input',()=>{generation++;});
 for(const control of [provider,command,args,initialization,settings,venv,candidates])control.addEventListener('change',()=>{generation++;});
 const save=button('保存配置',()=>{const request=++generation;void(async()=>{try{valid();const next:language_service_profile={provider:provider.value as language_service_profile['provider']};if(next.provider==='lsp'){next.command=command.value.trim();next.args=JSON.parse(args.value);next.initialization_options=JSON.parse(initialization.value);next.settings=JSON.parse(settings.value);await discover_language_server(next.command);}if(closed||request!==generation)return;valid();save_language_service_profiles(root,scope.value as 'user'|'workspace',{...read_language_service_profiles(root,scope.value as 'user'|'workspace'),[language.value]:next});report('配置已保存，当前文件将重新分析。');}catch(error){if(!closed&&request===generation)report('保存失败：'+String((error as Error).message||error));}})();},'source-outline-settings-save');save.dataset.action='save';
 const inherit=button('恢复继承',()=>{try{valid();const values={...read_language_service_profiles(root,scope.value as 'user'|'workspace')};delete values[language.value];save_language_service_profiles(root,scope.value as 'user'|'workspace',values);load();}catch(error){report(String(error));}});inherit.dataset.action='inherit';
 dialog.footer.prepend(button('重新检测',()=>{void detect();}),inherit,save);load();return dialog;
}
