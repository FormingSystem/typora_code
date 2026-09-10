// 宿主核心测试替身仅提供第三方契约；生产插件、Monaco、TextMate 与生命周期编排不替换。
window.fixture_errors=[];
const original_console_error=console.error;console.error=(...args)=>{fixture_errors.push(args.map(arg=>arg?.stack||String(arg)).join(" "));original_console_error(...args);};
window.addEventListener('error',event=>fixture_errors.push(String(event.error||event.message)));
window.addEventListener('unhandledrejection',event=>fixture_errors.push(String(event.reason)));
const native_add=EventTarget.prototype.addEventListener,native_remove=EventTarget.prototype.removeEventListener;
const tracked=[];
EventTarget.prototype.addEventListener=function(type,callback,options){
 const capture=typeof options==='boolean'?options:Boolean(options?.capture);
 if((this===document||this===window)&&callback&&!tracked.some(item=>item.target===this&&item.type===type&&item.callback===callback&&item.capture===capture)){
  const item={target:this,type,callback,capture,stack:new Error().stack};tracked.push(item);
  if(options?.signal)native_add.call(options.signal,'abort',()=>{const index=tracked.indexOf(item);if(index>=0)tracked.splice(index,1);},{once:true});
 }
 return native_add.call(this,type,callback,options);
};
EventTarget.prototype.removeEventListener=function(type,callback,options){const capture=typeof options==='boolean'?options:Boolean(options?.capture);const index=tracked.findIndex(item=>item.target===this&&item.type===type&&item.callback===callback&&item.capture===capture);if(index>=0)tracked.splice(index,1);return native_remove.call(this,type,callback,options);};
window.fixture_listener_count=()=>tracked.length;
window.fixture_listener_snapshot=()=>tracked.map(item=>({target:item.target===window?'window':'document',type:item.type,callback:item.callback.name,stack:item.stack}));
window.fixture_commands=new Map();window.fixture_factories=new Map();window.fixture_ribbon=new Map();window.fixture_registration_counts=new Map();
const subscriptions=new Map();
const on=(event,callback)=>{if(!subscriptions.has(event))subscriptions.set(event,new Set());subscriptions.get(event).add(callback);return()=>subscriptions.get(event).delete(callback);};
const emit=(event,value)=>{for(const callback of subscriptions.get(event)||[])callback(value);};
window.fixture_subscription_count=()=>[...subscriptions.values()].reduce((total,set)=>total+set.size,0);
const register=(map,id,value)=>{fixture_registration_counts.set(id,(fixture_registration_counts.get(id)||0)+1);map.set(id,value);return()=>{map.delete(id);fixture_registration_counts.set(id,fixture_registration_counts.get(id)-1);};};
const add_button=options=>{const button=document.createElement('div');button.className='typ-ribbon-item';button.dataset.id=options.id;button.onclick=options.onclick;if(options.icon instanceof Node)button.append(options.icon);document.querySelector('.typ-ribbon .group.'+(options.group||'top')).append(button);fixture_ribbon.set(options.id,button);return()=>{button.remove();fixture_ribbon.delete(options.id);};};
class workspace_view{constructor(leaf){this.leaf=leaf;this.containerEl=document.createElement('div');}onOpen(){}onClose(){}getState(){return {}}setState(){}isEditor(){return true}}
class sidebar_panel{addRibbonButton(options){this.ribbonButton=options;this.remove_ribbon=add_button(options);}show(){document.querySelector('#sidebar-content').append(this.containerEl);this.onshow?.();}hide(){this.onhide?.();this.containerEl.remove();}}
window.fixture_root_element=document.querySelector('.typ-workspace-root');fixture_root_element.remove();
const native_content=fixture_root_element.querySelector('content');
window.fixture_leaves=[];
const parent={containerEl:fixture_root_element.querySelector(".typ-workspace-tabs"),children:fixture_leaves,on,
 appendChild(leaf){fixture_leaves.push(leaf);leaf.parent=this;this.containerEl.querySelector('.typ-workspace-tab-content').append(leaf.view.containerEl);const tab=document.createElement('div');tab.className='typ-tab';tab.dataset.id=leaf.state.path;const label=document.createElement('span');label.className='typ-file-basename';label.textContent=require('path').basename(leaf.state.path);tab.append(label);tab.onclick=()=>{fixture_core.app.workspace.activeLeaf=this.toggleTab(leaf.state.path);};this.containerEl.querySelector('.typ-tabs').append(tab);this.toggleTab(leaf.state.path);},
 toggleTab(file){const leaf=fixture_leaves.find(leaf=>leaf.parent===this&&leaf.state.path===file);if(!leaf)return;for(const candidate of fixture_leaves)candidate.containerEl.classList.toggle("mod-active",candidate===leaf);for(const candidate of fixture_leaves)candidate.view.containerEl.style.display=candidate===leaf?(candidate===fixture_leaves[0]?'block':'flex'):'none';for(const tab of this.containerEl.querySelectorAll('.typ-tab'))tab.classList.toggle('active',tab.dataset.id===file);this.activeLeaf=leaf;leaf.view.onOpen?.();return leaf;},
 removeTab(file){const index=fixture_leaves.findIndex(leaf=>leaf.parent===this&&leaf.state.path===file);if(index<0)return;const [leaf]=fixture_leaves.splice(index,1);leaf.view.onClose?.();leaf.view.containerEl.remove();for(const tab of this.containerEl.querySelectorAll(".typ-tab"))if(tab.dataset.id===file)tab.remove();if(fixture_core.app.workspace.activeLeaf===leaf)fixture_core.app.workspace.activeLeaf=this.toggleTab(fixture_leaves[0]?.state.path);}}
const native_leaf={state:{path:require('path').join(fixture_root,'native.md')},parent,containerEl:native_content};native_leaf.view=new workspace_view(native_leaf);native_leaf.view.containerEl=native_content;fixture_leaves.push(native_leaf);
const sidebar={isShown:false,panels:[],activePanel:undefined,addPanel(panel){this.panels.push(panel);return()=>this.removePanel(panel);},removePanel(panel){panel.hide?.();panel.remove_ribbon?.();this.panels=this.panels.filter(item=>item!==panel);},switch(type){const next=this.panels.find(item=>item instanceof type);if(this.activePanel===next){this.toggle();return;}this.activePanel?.hide?.();this.activePanel=next;this.show();},show(){this.isShown=true;document.querySelector("#typora-sidebar").classList.add("open");this.activePanel?.show();},hide(){this.isShown=false;document.querySelector("#typora-sidebar").classList.remove("open");this.activePanel?.hide();},toggle(){this.isShown?this.hide():this.show();}};
class native_file_panel extends sidebar_panel {}
class native_outline_panel extends sidebar_panel {
 show(){File.editor.library.switch('outline');this.containerEl.style.display='block';}
 hide(){document.querySelector('#typora-sidebar').classList.remove('active-tab-outline');this.containerEl.style.display='none';}
}
for(const [id,type] of [['core.file-explorer',native_file_panel],['core.outline',native_outline_panel]]){
 const panel=new type();panel.ribbonButton={id};panel.containerEl=id==='core.outline'?document.querySelector('#outline-content'):document.createElement('div');
 if(id==='core.outline')panel.containerEl.style.display='none';
 sidebar.panels.push(panel);document.querySelector('.typ-ribbon-item[data-id="'+id+'"]').onclick=()=>sidebar.switch(type);
}

window.fixture_setting_values={openLinkInCurrentWin:true,useAutoSwap:true,hideExtensionInFileTab:false};window.fixture_settings={get(key){return fixture_setting_values[key];},set(key,value){fixture_setting_values[key]=value;}};
window.fixture_core={ready:Promise.resolve(),WorkspaceView:workspace_view,SidebarPanel:sidebar_panel,Notice:class{},app:{runtime_version:1,settings:undefined,
 commands:{register(command){return register(fixture_commands,command.id,command);},run(id,args){fixture_commands.get(id)?.callback(...args||[]);}},
 viewManager:{registerView(type,factory){if(window.fixture_throw_view===type)throw new Error("Injected view registration failure");return register(fixture_factories,type,factory);}},
 openFile(file){native_leaf.state.path=file;File.bundle.filePath=file;fixture_core.app.workspace.activeLeaf=parent.toggleTab(file);},workspace:{rootSplit:{containerEl:fixture_root_element,on},activeFile:native_leaf.state.path,activeLeaf:native_leaf,activeEditor:{openFile(){}},eachLeaves(callback){fixture_leaves.forEach(callback);},on,sidebar,ribbon:{addButton:add_button,activeButton(){}},
 createLeaf({type,state}){const leaf={state,parent,containerEl:document.createElement('div')};leaf.view=fixture_factories.get(type)(leaf);return leaf;}}}};
window.fixture_native_leaf=native_leaf;window.fixture_emit=emit;
let active_leaf=fixture_core.app.workspace.activeLeaf;Object.defineProperty(fixture_core.app.workspace,'activeLeaf',{get:()=>active_leaf,set:leaf=>{active_leaf=leaf;emit('active-leaf:change',leaf);}});
const second_container=document.createElement('div');second_container.className='typ-workspace-tabs';second_container.innerHTML='<div class="typ-workspace-tab-header"><div class="typ-tabs"></div></div><div class="typ-workspace-tab-content"></div>';second_container.hidden=true;fixture_root_element.append(second_container);
window.fixture_second_group={...parent,containerEl:second_container};
for(const group of [parent,fixture_second_group])group.tabHeader={getTabById:id=>[...group.containerEl.querySelectorAll('.typ-tab')].find(tab=>tab.dataset.id===id)};
const native_run=fixture_core.app.commands.run;fixture_core.app.commands.run=(id,args)=>{if(id==='core.workspace:split-right'||id==='core.workspace:split-down'){const leaf=fixture_core.app.workspace.createLeaf({type:args[0].startsWith('typ://')?args[0].slice(6).split('/')[0]:'linux_note.source_file',state:{path:args[0]}});fixture_second_group.appendChild(leaf);fixture_core.app.workspace.activeLeaf=leaf;emit('file:open',leaf);return;}return native_run(id,args);};
window[Symbol.for('typora-code:workspace')]=fixture_core;
window.reqnode=name=>{
 if(name!=="child_process")return require(name);
 return {...require(name),fork(){const child=new (require("events").EventEmitter)();child.connected=true;child.stderr=new (require("events").EventEmitter)();child.disconnect=()=>{child.connected=false;};child.send=message=>{if(message.type==="start")setTimeout(()=>{child.emit("message",{type:"ready",pid:101});child.emit("message",{type:"data",data:"Typora Code integrated terminal\r\n$ git status\r\nOn branch main\r\n"});},10);if(message.type==="close")setTimeout(()=>child.emit("exit",0),0);};return child;}};
};window._options={userDataPath:fixture_root};
window.fixture_mount_folder=fixture_root;window.File={isNode:true,isMac:false,option:{framelessWindow:true},bundle:{filePath:native_leaf.state.path},getMountFolder:()=>fixture_mount_folder,setMountFolder(folder){fixture_mount_folder=folder;emit("mounted",folder);emit("change",folder);},changeCounter:{isDocumentEdited:()=>false},editor:{library:{openFile(){},switch(tab){const element=document.querySelector('#typora-sidebar');element.classList.toggle('active-tab-outline',tab==='outline');element.classList.toggle('active-tab-files',tab==='files');},outline:{hideSearch(){},clearSearch(){},isSearchShown(){return false}}},tryOpenUrl(){},selection:{buildUndo(){return null}},sourceView:{inSourceMode:false}}};
window.ClientCommand={};window.JSBridge={putSetting(){},invoke:async()=>undefined};
window.CodeMirror={modes:{},defineMode(name,factory){this.modes[name]=factory;}};
window.fixture_original_app_open=fixture_core.app.openFile;window.fixture_original_library_open=File.editor.library.openFile;
void 0;
