import { useService } from "src/common/service"
import {create_drop_marker,start_pointer_drag,type pointer_drag_session,type pointer_drag_state} from '../../components/pointer-drag'
import type { WorkspaceTabs } from "."
import type { WorkspaceRoot } from "../workspace-root"
import type { WorkspaceLeaf } from '../workspace-leaf'

/** 先确认对象身份再移动；拖动预览不改变当前文档、草稿或标签模型。 */
export function draggableTabs(root: WorkspaceRoot, workspace = useService('workspace')) {
  const root_el=root.containerEl,doc=root_el.ownerDocument,view=doc.defaultView!;
  const marker=create_drop_marker(doc);
  let session:pointer_drag_session|undefined;
  let scroll_frame=0;
  const clear_feedback=()=>{marker.hide();root_el.querySelectorAll('.mod-drag-over').forEach(node=>node.classList.remove('mod-drag-over'));};
  const group_at=(element:Element|null)=>{
    const group_el=element?.closest('.typ-workspace-tabs');
    return group_el&&root_el.contains(group_el)?root.findNode(node=>node.containerEl===group_el) as WorkspaceTabs|null:null;
  };
  const on_pointer_down=(event:PointerEvent)=>{
    if(event.button!==0||event.isPrimary===false)return;
    const element=event.target instanceof Element?event.target:null;
    if(element?.closest('.typ-close,button,input,textarea,select,a'))return;
    const tab=element?.closest<HTMLElement>('.typ-tab');
    const source_group=group_at(tab||null);
    if(!tab||!source_group||tab.parentElement!==source_group.tabHeader.container)return;
    // 同路径可能存在于不同编辑组，必须从命中的原组找到确切 leaf。
    const leaf=source_group.children.find(node=>(node as WorkspaceLeaf).state.path===tab.dataset.id) as WorkspaceLeaf|undefined;
    if(!leaf)return;
    session?.cancel('replaced');
    let target_group:WorkspaceTabs|undefined,target_index=0,last_state:pointer_drag_state|undefined,scroll_header:HTMLElement|undefined,blocked_drop=false;
    const source_bounds=source_group.containerEl.getBoundingClientRect();
    const resolve_target=(state:pointer_drag_state)=>{
      clear_feedback();target_group=undefined;scroll_header=undefined;blocked_drop=false;
      const group=group_at(state.target) || (state.target?.closest('content') ? root.findNode(node=>{
        if(node.type!=='tabs')return false;const box=node.containerEl.getBoundingClientRect();
        return state.client_x>=box.left&&state.client_x<=box.right&&state.client_y>=box.top&&state.client_y<=box.bottom;
      }) as WorkspaceTabs|null : null);
      if(!group||!group.containerEl.isConnected||leaf.parent!==source_group)return;
      if(group!==source_group&&group.children.some(node=>(node as WorkspaceLeaf).state.path===leaf.state.path)){blocked_drop=true;return;}
      const header=group.tabHeader.containerEl,header_box=header.getBoundingClientRect();
      const tabs=[...group.tabHeader.container.children].filter((node):node is HTMLElement=>node instanceof HTMLElement&&node!==tab);
      const within_header=state.client_y>=header_box.top&&state.client_y<=header_box.bottom;
      target_group=group;
      if(within_header){
        target_index=tabs.findIndex(node=>state.client_x<node.getBoundingClientRect().left+node.getBoundingClientRect().width/2);
        if(target_index<0)target_index=tabs.length;
        const adjacent=tabs[target_index],previous=tabs[target_index-1];
        const x=adjacent?.getBoundingClientRect().left??previous?.getBoundingClientRect().right??header_box.left;
        marker.show({left:Math.max(header_box.left,Math.min(x,header_box.right-2)),top:header_box.top,width:2,height:header_box.height});
        scroll_header=header;
      }else{
        target_index=tabs.length;
        const body=group.tabContentEl.getBoundingClientRect();
        marker.highlight({left:body.left,top:body.top,width:body.width,height:body.height});
      }
    };
    const auto_scroll=()=>{
      scroll_frame=0;if(!session?.started||!last_state)return;
      if(scroll_header){
        const box=scroll_header.getBoundingClientRect(),edge=24;
        const direction=last_state.client_x<box.left+edge?-1:last_state.client_x>box.right-edge?1:0;
        if(direction){const before=scroll_header.scrollLeft;scroll_header.scrollLeft+=direction*10;if(scroll_header.scrollLeft!==before)resolve_target(last_state);}
      }
      scroll_frame=view.requestAnimationFrame(auto_scroll);
    };
    const can_detach=(state:pointer_drag_state)=>{
      // 本产品按用户要求允许离开原组30px分离；VS Code自身默认仅在窗口外释放时创建辅助窗口。
      if(blocked_drop||state.target?.closest('.typ-ribbon,#typora-sidebar,#top-titlebar,footer,.workspace-menu,.workspace-titlebar-menu-panel'))return false;
      const dx=Math.max(source_bounds.left-state.client_x,0,state.client_x-source_bounds.right);
      const dy=Math.max(source_bounds.top-state.client_y,0,state.client_y-source_bounds.bottom);
      return Math.max(dx,dy)>=30;
    };
    session=start_pointer_drag(event,{
      source:tab,
      on_start(){scroll_frame=view.requestAnimationFrame(auto_scroll);},
      on_move(state){last_state=state;resolve_target(state);session?.set_drop_effect(target_group?'move':can_detach(state)?'detach':'none');},
      on_drop(state){
        resolve_target(state);
        if(leaf.parent!==source_group||!source_group.containerEl.isConnected)return;
        if(!target_group){
          if(can_detach(state))doc.dispatchEvent(new CustomEvent('typora-code:tab-detach',{cancelable:true,detail:{leaf,source_group,screen_x:state.screen_x,screen_y:state.screen_y}}));
          return;
        }
        if(target_group===source_group){
          const old_index=source_group.children.indexOf(leaf);if(old_index<0||old_index===target_index)return;
          source_group.children.splice(old_index,1);source_group.children.splice(target_index,0,leaf);
          const tabs=[...source_group.tabHeader.container.children].filter(node=>node!==tab);
          source_group.tabHeader.container.insertBefore(tab,tabs[target_index]||null);
          const leaves=[...source_group.tabContentEl.children].filter(node=>node!==leaf.containerEl);
          source_group.tabContentEl.insertBefore(leaf.containerEl,leaves[target_index]||null);
          root.emit('layout-changed');
        }else{
          const destination=target_group;leaf.detach();destination.insertChild(target_index,leaf);
          view.setTimeout(()=>{if(leaf.parent===destination&&destination.containerEl.isConnected)workspace.activeLeaf=leaf;});
        }
      },
      on_end(){view.cancelAnimationFrame(scroll_frame);scroll_frame=0;clear_feedback();session=undefined;}
    });
  };
  root_el.addEventListener('pointerdown',on_pointer_down);
  return ()=>{session?.cancel('dispose');view.cancelAnimationFrame(scroll_frame);marker.dispose();root_el.removeEventListener('pointerdown',on_pointer_down);};
}
