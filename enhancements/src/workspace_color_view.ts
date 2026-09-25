import {workspace_theme_mode} from './workspace_theme';
import {workspace_element as el,workspace_button as button} from './workspace_widgets';
import {WORKSPACE_COLOR_ROLES} from './workspace_color_catalog';
import {save_color_config,read_color_config,observe_color_config,normalize_custom_color,parse_color_config,serialize_color_config,selected_colors,duplicate_color_profile,activate_color_profile,official_code_role,type color_mode} from './workspace_color_settings';
import {export_color_file} from './workspace_color_files';
import {create_color_preview} from './workspace_color_preview';
import type {workspace_setting_field} from './workspace_settings_registry';
import {acquire_workspace_style} from './workspace_styles';
import css from './workspace_color_view.css';

export function mount_color_settings(host:HTMLElement,fields:workspace_setting_field[],status:(text:string)=>void){
 const style=acquire_workspace_style('typora-code-style:workspace_color_view',css);
 let draft=read_color_config(),id:string=document.documentElement.dataset.workspaceColors||workspace_theme_mode(),disposed=false,writing=false,revision=0,preview_revision=0,defaults:Record<string,string>={};
 id=draft.active?.[id as color_mode]||id;
 const invalid=new Set<string>(),toolbar=el('div','workspace-color-toolbar'),theme=el('select'),table=el('table','workspace-color-table'),tbody=el('tbody'),preview_area=el('div','workspace-color-previews'),primary_host=el('div'),compare_host=el('div'),compare=el('select');
 host.classList.add('workspace-color-settings');theme.setAttribute('aria-label','自定义颜色主题');compare.setAttribute('aria-label','对照配色方案');
 const note=el('p','','显示当前方案的实际颜色；色值可选中复制、粘贴或直接输入（支持透明度）。有效改动立即保存。点预览内容定位颜色项；另存为可保留多套方案。代码围栏使用内置 VS Code 配色。');
 const persist=(value:typeof draft)=>{writing=true;try{save_color_config(value);}finally{writing=false;}};
 const report=(error:unknown)=>status(error instanceof Error?error.message:String(error));
 const chosen=()=>selected_colors(draft,id);
 const options=()=>{for(const select of [theme,compare]){const previous=select===theme?id:select.value;select.replaceChildren();if(select===compare)select.append(new Option('不显示对照',''));select.append(new Option('CppGithubConsoles_Light · 明色','light'),new Option('CppGithubConsoles_Dark · 暗色','dark'));for(const profile of draft.profiles||[])select.append(new Option(profile.name,profile.id));select.value=previous;if(select===compare&&!select.value)select.value='';}};
 const locate=(key:string)=>{const row=tbody.querySelector<HTMLElement>(`[data-color-row="${key}"]`);if(!row){status('此项被设置搜索隐藏，请清空搜索后定位：'+key);return;}tbody.querySelectorAll('[data-color-selected]').forEach(node=>node.removeAttribute('data-color-selected'));row.dataset.colorSelected='true';row.scrollIntoView({block:'nearest'});row.querySelector<HTMLInputElement>('input[type=text]')?.focus({preventScroll:true});primary.highlight(key);};
 const primary=create_color_preview(primary_host,locate),secondary=create_color_preview(compare_host,locate);compare_host.hidden=true;
 const refresh_compare=async()=>{compare_host.hidden=!compare.value;if(!compare.value)return;const source=selected_colors(draft,compare.value);try{await secondary.load(source.mode,source.colors);}catch(error){if(!disposed)report(error);}};
 const refresh_preview=async()=>{const generation=++preview_revision,source=chosen();defaults={};try{const result=await primary.load(source.mode,source.colors);if(disposed||generation!==preview_revision||!result)return;defaults=result;const focused=document.activeElement as HTMLInputElement|null,active_key=focused?.dataset.colorKey,active_value=focused?.value,active_invalid=active_key&&invalid.has(active_key),start=focused?.selectionStart,end=focused?.selectionEnd;render();if(active_key){const input=tbody.querySelector<HTMLInputElement>(`[data-color-key="${active_key}"]`);if(input){input.value=active_value||'';input.focus({preventScroll:true});input.setSelectionRange(start||0,end||0);if(active_invalid){invalid.add(active_key);input.setAttribute('aria-invalid','true');input.setCustomValidity('请输入有效的十六进制色值。');}}}}catch(error){if(!disposed&&generation===preview_revision)report(error);}void refresh_compare();};
 const apply=()=>{revision++;persist(draft);primary.update(chosen().colors);if(compare.value===id)secondary.update(chosen().colors);status('配色已自动保存；预览已更新。');};
 const render=()=>{
  tbody.replaceChildren();invalid.clear();const colors=chosen().colors;
  for(const role of WORKSPACE_COLOR_ROLES.filter(role=>fields.some(field=>field.key===role.key)).sort((a,b)=>Number(b.key.startsWith('markdown_'))-Number(a.key.startsWith('markdown_')))){
   const row=el('tr'),label=el('td'),value=el('td'),actions=el('td'),input=el('input'),picker=el('input'),key=el('small','',role.key),state=el('small');row.dataset.colorRow=role.key;
   const locate_button=button(role.title,()=>primary.highlight(role.key));label.append(locate_button,key);label.title=role.variable||role.selector||'';
   input.type='text';input.spellcheck=false;input.dataset.colorKey=role.key;input.setAttribute('aria-label',role.title+' 色值');input.readOnly=official_code_role(role.key);input.placeholder=Object.keys(defaults).length?'主题未定义（可输入色值）':'正在读取主题…';
   picker.type='color';picker.setAttribute('aria-label',role.title+' 取色');picker.dataset.colorPicker=role.key;
   const fill=()=>{const color=colors[role.key]||defaults[role.key]||'';input.value=color;picker.disabled=input.readOnly;picker.style.visibility=color?'visible':'hidden';if(color)picker.value=color.slice(0,7);picker.title=color;state.textContent=input.readOnly?'VS Code 配置':colors[role.key]?'自定义':'继承主题';};fill();
   const change=(text:string)=>{try{const color=normalize_custom_color(text);input.setCustomValidity('');input.removeAttribute('aria-invalid');invalid.delete(role.key);const previous=colors[role.key];if(color)colors[role.key]=color;else delete colors[role.key];try{apply();}catch(error){if(previous)colors[role.key]=previous;else delete colors[role.key];throw error;}picker.style.visibility='visible';picker.value=(color||defaults[role.key]||'#000000').slice(0,7);state.textContent=color?'自定义':'继承主题';}catch(error){invalid.add(role.key);input.setCustomValidity(String(error));input.setAttribute('aria-invalid','true');report(error);}};
   input.oninput=()=>change(input.value);input.onblur=()=>{if(!invalid.has(role.key))fill();};picker.oninput=()=>{input.value=picker.value+(colors[role.key]?.slice(7)||'');change(input.value);};
   const copy=button('复制',async()=>{try{if(!input.value||invalid.has(role.key))throw Error('没有有效色值可复制。');const runtime=window as any;if(runtime.JSBridge?.invoke)await runtime.JSBridge.invoke('clipboard.write',JSON.stringify({text:input.value}));else await navigator.clipboard.writeText(input.value);if(!disposed)status('已复制 '+input.value);}catch(error){if(!disposed)report(error);}});copy.dataset.colorCopy=role.key;
   const restore=button('恢复默认',()=>{change('');fill();});restore.disabled=input.readOnly;
   value.append(picker,input,state);actions.append(copy,restore);row.append(label,value,actions);tbody.append(row);
  }
 };
 const inherit=button('当前方案恢复默认',()=>{try{const colors=chosen().colors,previous={...colors};for(const key of Object.keys(colors))delete colors[key];try{apply();}catch(error){Object.assign(colors,previous);throw error;}render();}catch(error){report(error);}});inherit.dataset.colorAction='inherit';
 const name=el('input');name.type='text';name.placeholder='新配色方案名称';name.setAttribute('aria-label','新配色方案名称');
 const duplicate=button('另存为新主题',()=>{try{const result=duplicate_color_profile(draft,id,name.value);persist(result.config);draft=result.config;id=result.id;name.value='';options();render();void refresh_preview();status('新主题已保存，可在顶部主题菜单应用。');}catch(error){report(error);}});duplicate.dataset.colorAction='duplicate';
 const activate=button('应用主题',async()=>{try{const runtime=window as any;if(!runtime.ClientCommand?.setTheme)throw Error('当前宿主无法切换主题。');await activate_color_profile(id,(file,label)=>runtime.ClientCommand.setTheme(file,label));status('主题已应用。');}catch(error){report(error);}});activate.dataset.colorAction='activate';
 const picker=el('input');picker.type='file';picker.accept='.json,application/json';picker.hidden=true;picker.dataset.colorImport='true';
 picker.onchange=async()=>{const file=picker.files?.[0];picker.value='';if(!file)return;const generation=++revision;try{const next=parse_color_config(await file.text());if(disposed||generation!==revision)return;persist(next);draft=next;if(!['light','dark'].includes(id)&&!draft.profiles?.some(profile=>profile.id===id))id='light';options();render();void refresh_preview();status('全部配色方案已导入并保存。');}catch(error){if(!disposed&&generation===revision)report(error);}};
 const import_button=button('导入 JSON…',()=>picker.click());import_button.dataset.colorAction='import';
 const export_button=button('导出 JSON…',async()=>{try{if(invalid.size)throw Error('请先修正标红的无效色值。');const saved=await export_color_file(serialize_color_config(draft),()=>!disposed);if(!disposed)status(saved?'颜色JSON已导出（含全部命名方案）。':'已取消导出。');}catch(error){if(!disposed)report(error);}});export_button.dataset.colorAction='export';
 theme.onchange=()=>{id=theme.value;render();void refresh_preview();};compare.onchange=()=>{void refresh_compare();};
 toolbar.append(theme,activate,inherit,import_button,export_button,picker);const profile_bar=el('div','workspace-color-toolbar');profile_bar.append(name,duplicate,compare);
 const head=el('thead'),heading=el('tr');heading.append(el('th','','颜色项目（点击定位预览）'),el('th','','实际色值 / 透明度'),el('th','','操作'));head.append(heading);table.append(head,tbody);
 preview_area.append(primary_host,compare_host);host.append(note,toolbar,profile_bar,preview_area,table);options();render();void refresh_preview();
 const unwatch=observe_color_config(()=>{if(writing||disposed)return;draft=read_color_config();if(!['light','dark'].includes(id)&&!draft.profiles?.some(profile=>profile.id===id))id='light';options();render();primary.update(chosen().colors);void refresh_compare();});
 return{update(next:workspace_setting_field[]){if(next.map(field=>field.key).join()===fields.map(field=>field.key).join())return;fields=next;render();},dispose(){if(disposed)return;disposed=true;revision++;unwatch();primary.dispose();secondary.dispose();style.remove();}};
}
