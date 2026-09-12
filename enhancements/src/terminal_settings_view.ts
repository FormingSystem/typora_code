import {type workspace_dialog,workspace_element as el,workspace_button as button,workspace_option as option} from "./workspace_widgets";
import {terminal_defaults,type terminal_settings_store,type terminal_settings} from "./terminal_settings";

export function show_terminal_settings(store:terminal_settings_store,dialog:ReturnType<typeof workspace_dialog>){
  const form=el("div","terminal-settings-form"),filter=el("input");filter.placeholder="搜索终端设置";filter.setAttribute("aria-label","搜索终端设置");
  const current=store.get(),inputs=new Map<keyof terminal_settings,HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>();
  const row=(key:keyof terminal_settings,label:string,control:HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement,help="")=>{control.dataset.setting=key;control.setAttribute("aria-label",label);const label_node=el("label","terminal-setting",label);label_node.append(control);if(help)label_node.append(el("small","",help));form.append(label_node);inputs.set(key,control);};
  const profile=el("select"),detection_status=el("small");detection_status.setAttribute("role","status");
  const fill_profiles=(selected:string)=>{profile.replaceChildren(option("","自动选择"));const profiles=store.profiles();for(const item of profiles)profile.append(option(item.id,item.title));
    if(selected&&!profiles.some(item=>item.id===selected))profile.append(option(selected,selected+"（当前不可用）"));profile.value=selected;detection_status.textContent=store.warnings().join(" ");};
  fill_profiles(current.profile);row("profile","默认配置",profile);
  const detect=button("重新检测终端",()=>{detect.disabled=true;
    void store.refresh().then(()=>{if(dialog.root.isConnected)fill_profiles(profile.value);}).catch(failure=>{if(dialog.root.isConnected)error.textContent=String(failure instanceof Error?failure.message:failure);})
      .finally(()=>{if(dialog.root.isConnected)detect.disabled=false;});});profile.parentElement?.append(detect,detection_status);
  for(const[key,label,min,max,step]of [["font_size","字体大小",6,100,1],["line_height","行高倍数",1,3,0.1],["letter_spacing","字符间距",-5,10,0.1],["cursor_width","光标宽度",1,10,1],["scrollback","滚动缓冲行数",0,100000,1],["scroll_sensitivity","滚轮速度",0.1,20,0.1],["fast_scroll_sensitivity","Alt 滚轮倍速",1,20,1],["minimum_contrast","最小对比度",1,21,0.5],["tab_stop_width","制表符宽度",1,32,1]]as const){const input=el("input");input.type="number";input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(current[key]);row(key,label,input);}
  for(const[key,label,values]of [
    ["location","默认终端位置",[["panel","底部面板"],["editor","编辑器标签"]]],
    ["font_weight","字重",[["normal","正常"],["bold","粗体"]]],
    ["cursor_style","光标样式",[["block","方块"],["bar","竖线"],["underline","下划线"]]],
    ["tabs_location","会话列表位置",[["right","右侧"],["left","左侧"]]],
    ["tabs_hide","自动隐藏会话列表",[["single_terminal","只有一个终端时"],["single_group","只有一个组时"],["never","从不"]]],
    ["right_click","右键操作",[["menu","显示菜单"],["copy_paste","有选区复制，否则粘贴"],["paste","粘贴"]]],
    ["split_cwd","拆分后的工作目录",[["initial","继承初始目录"],["workspace","当前工作区目录"]]],
  ]as const){const control=el("select");for(const[value,title]of values)control.append(option(value,title));control.value=current[key];row(key,label,control);}
  for(const[key,label]of [["cursor_blink","光标闪烁"],["smooth_scrolling","平滑滚动"],["copy_on_selection","选中即复制"],["confirm_multiline","粘贴多行前确认"]]as const){const control=el("input");control.type="checkbox";control.checked=current[key];row(key,label,control);}
  for(const[key,label]of [["font_family","字体系列"],["cwd","默认工作目录"]]as const){const control=el("input");control.value=current[key];row(key,label,control,key==="cwd"?"留空使用当前工作区；相对路径以工作区根目录为起点。支持 ${workspaceFolder} 与 ${env:变量名}。":"");}
  for(const[key,label,help]of [["env","环境变量（JSON）","字符串设置变量，null 删除变量；更改在新建或重启后生效。"],["profiles","自定义 Shell 配置（JSON）","每项包含 id、title、executable、args，可附 cwd、env、icon、color。相同 id 覆盖自动检测配置。"]]as const){const control=el("textarea");control.rows=key==="profiles"?10:4;control.value=JSON.stringify(current[key],null,2);control.spellcheck=false;row(key,label,control,help);}
  const example=el("details","terminal-profile-example"),summary=el("summary","","配置示例");example.append(summary,el("pre","",JSON.stringify({id:"project_shell",title:"项目 Shell",executable:"${env:SystemRoot}/System32/WindowsPowerShell/v1.0/powershell.exe",args:["-NoLogo"],cwd:"${workspaceFolder}",env:{PROJECT_MODE:"dev"},icon:"terminal",color:"#007ACC"},null,2)));
  const error=el("p","terminal-settings-error");error.setAttribute("role","alert");dialog.content.append(filter,form,example,error);
  filter.oninput=()=>{for(const label of form.children)if(label instanceof HTMLElement)label.hidden=!label.textContent?.toLowerCase().includes(filter.value.toLowerCase());};
  dialog.footer.prepend(button("应用",()=>{try{const result:any={...current};for(const[key,input]of inputs)result[key]=input instanceof HTMLTextAreaElement?JSON.parse(input.value):input instanceof HTMLInputElement&&input.type==="checkbox"?input.checked:input instanceof HTMLInputElement&&input.type==="number"?Number(input.value):input.value;store.update(result);dialog.close();}catch(failure){error.textContent=String(failure instanceof Error?failure.message:failure);}}),button("恢复默认设置",()=>{try{store.update(terminal_defaults);dialog.close();}catch(failure){error.textContent=String(failure);}}));
  return dialog;
}
