import {observe_workspace_theme,workspace_theme_mode} from "./workspace_theme";
import {workspace_leaf_tab} from "./workspace_leaf_tab";
import {source_file_path} from "./workspace_file_uri";
import theme_data from "../vendor/vscode_seti/icon_theme.json";
import file_icon_css from "./workspace_file_icons.css";
import {acquire_workspace_style} from "./workspace_styles";
import {detect_file_language} from "./file_language";
type associations={file?:string;fileNames?:Record<string,string>;fileExtensions?:Record<string,string>;languageIds?:Record<string,string>};
const theme=theme_data as unknown as associations & {light:associations;iconDefinitions:Record<string,{fontCharacter:string;fontColor?:string}>};
let theme_users=0;let release_theme:(()=>void)|undefined;let previous_theme:string|null=null;
export function acquire_workspace_file_icons(){
  const style=acquire_workspace_style("typora-code-style:workspace_file_icons",file_icon_css);let removed=false;
  if(theme_users++===0){previous_theme=document.documentElement.getAttribute("data-workspace-file-icon-theme");release_theme=observe_workspace_theme(()=>{const mode=workspace_theme_mode();if(document.documentElement.getAttribute("data-workspace-file-icon-theme")!==mode)document.documentElement.setAttribute("data-workspace-file-icon-theme",mode);});}
  return{remove(){if(removed)return;removed=true;style.remove();if(--theme_users===0){release_theme?.();release_theme=undefined;if(previous_theme===null)document.documentElement.removeAttribute("data-workspace-file-icon-theme");else document.documentElement.setAttribute("data-workspace-file-icon-theme",previous_theme);}}};
}
function definition(file_path:string,light:boolean):string{
  const variant=light?theme.light:{};const parts=file_path.replace(/\\/g,"/").toLowerCase().split("/");const name=parts.at(-1)||"";
  const names={...theme.fileNames,...variant.fileNames},extensions={...theme.fileExtensions,...variant.fileExtensions},languages={...theme.languageIds,...variant.languageIds};
  const parent=parts.at(-2);if(parent&&names[parent+"/"+name])return names[parent+"/"+name];if(names[name])return names[name];
  const suffixes=name.split(".");for(let index=1;index<suffixes.length;index++){const suffix=suffixes.slice(index).join(".");if(parent&&extensions[parent+"/"+suffix])return extensions[parent+"/"+suffix];if(extensions[suffix])return extensions[suffix];}
  const language=detect_file_language(file_path);return languages[language]||(language==="jsonc"?languages.json:undefined)||variant.file||theme.file!;
}
/** 使用固定 Seti 原始字形与文件关联；与产品控件图标分开。 */
export function workspace_file_icon(file_path:string):HTMLElement{
  const node=document.createElement("span"),dark_id=definition(file_path,false),light_id=definition(file_path,true);const dark=theme.iconDefinitions[dark_id],light=theme.iconDefinitions[light_id];
  node.className="workspace-file-theme-icon";node.dataset.vscodeFileIcon=dark_id;node.dataset.vscodeFileIconLight=light_id;node.dataset.fileIconPath=file_path;node.setAttribute("aria-hidden","true");
  node.textContent=String.fromCodePoint(Number.parseInt(dark.fontCharacter.replace(/\\/g,""),16));node.style.setProperty("--workspace-file-icon-light",light.fontColor||"currentColor");node.style.setProperty("--workspace-file-icon-dark",dark.fontColor||"currentColor");return node;
}

/** 仅文件标签适配；虚拟 Graph、终端及第三方视图保持原图标；Git 文件差异由 host 以真实 data.file 调用同一字形接口。 */
export function bind_workspace_file_tab_icons(core:import("./git_graph_host").graph_core){
  const style=acquire_workspace_file_icons();
  const originals=new Map<HTMLElement,{class_name:string;nodes:Node[]}>();let disposed=false;
  const refresh=()=>{if(disposed)return;const live_slots=new Set<HTMLElement>();core.app.workspace.eachLeaves(leaf=>{
    const view_type=(leaf as unknown as {viewType?:string}).viewType;
    if(view_type&&view_type!=="core.markdown"&&view_type!=="linux_note.source_file")return;
    const uri=String(leaf.state.path||"");
    const file_path=source_file_path(uri)||(!uri.startsWith("typ://")?uri:"");
    if(!file_path)return;
    const tab=workspace_leaf_tab(leaf),slot=tab?.querySelector<HTMLElement>(".typ-file-icon");if(!slot)return;live_slots.add(slot);
    if(!originals.has(slot))originals.set(slot,{class_name:slot.className,nodes:[...slot.childNodes]});
    if(slot.className!=="typ-file-icon workspace-file-theme-slot")slot.className="typ-file-icon workspace-file-theme-slot";
    if(slot.firstElementChild?.getAttribute("data-file-icon-path")!==file_path)slot.replaceChildren(workspace_file_icon(file_path));
  });for(const[node,old]of originals)if(!live_slots.has(node)){node.className=old.class_name;node.replaceChildren(...old.nodes);originals.delete(node);}};
  const observer=new MutationObserver(refresh);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","data-id"]});refresh();
  const release=core.app.workspace.on("active-leaf:change",refresh);
  return{dispose(){if(disposed)return;disposed=true;observer.disconnect();release?.();for(const[node,old]of originals){node.className=old.class_name;node.replaceChildren(...old.nodes);}originals.clear();style.remove();}};
}
