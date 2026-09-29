import {workspace_text} from "./workspace_i18n";
import {workspace_button,workspace_dialog,workspace_element as el} from './workspace_widgets';
import {acquire_workspace_style} from './workspace_styles';
import {create_workspace_lifetime} from './workspace_lifetime';
import tour_css from './workspace_onboarding.css';

const steps = [
 {title:workspace_text("onboarding_view_welcome_to_typora_code"),target:'',text:workspace_text("onboarding_view_take_a_few_minutes_to_get_familiar_with_the_toolbars_the_doc")},
 {title:workspace_text("onboarding_view_top_bar_native_menus_and_file_navigation"),target:'.workspace-titlebar-left',text:workspace_text("onboarding_view_menus_such_as_file_edit_paragraph_format_are_retained_for_ty")},
 {title:workspace_text("onboarding_view_active_bar_and_resource_explorer"),target:'.typ-ribbon',text:workspace_text("onboarding_view_left_icon_switch_to_explorer_search_outline_git_etc_tools_al")},
 {title:workspace_text("onboarding_view_preview_tab_and_persistent_tab"),target:'.typ-workspace-tab-header',text:workspace_text("onboarding_view_clicking_a_file_in_explorer_replaces_the_current_unedited_pr"),demo:'tabs'},
 {title:workspace_text("onboarding_view_document_content_code_block_and_content_zoom"),target:'content, .typ-workspace',text:workspace_text("onboarding_view_edit_markdown_normally_code_blocks_have_a_copy_entry_long_co"),demo:'zoom'},
 {title:workspace_text("onboarding_view_search_preview_first_then_open"),target:'[data-id="core.search"], .typ-ribbon',text:workspace_text("onboarding_view_ctrl_shift_f_search_workspace_clicking_the_result_previews_i")},
 {title:workspace_text("onboarding_view_git_see_changes_and_sources"),target:'[data-id="linux_note:source_control"], .typ-ribbon',text:workspace_text("onboarding_view_source_code_management_displays_workspace_staging_area_and_c")},
 {title:workspace_text("onboarding_view_terminal_run_commands_inside_project"),target:'.workspace-titlebar-menu',text:workspace_text("onboarding_view_open_the_bottom_panel_alt_shift_by_clicking_terminal_new_ter")},
 {title:workspace_text("onboarding_view_settings_themes_and_keyboard_shortcuts"),target:'.workspace-preferences-trigger, .typ-ribbon',text:workspace_text("onboarding_view_lower_left_gear_or_ctrl_open_the_unified_settings_the_theme")},
 {title:workspace_text("onboarding_view_ready_you_can_return_anytime"),target:'.workspace-titlebar-menu',text:workspace_text("onboarding_view_the_help_operation_guide_can_be_revisited_to_review_this_tut")}
];

/** Only identify the area, not activate the panel or modify the document; all resources are released when the common dialog exits. */
export function show_workspace_onboarding(open_guide:()=>void,on_close:()=>void=()=>{}) {
 const lifetime=create_workspace_lifetime();
 const style=acquire_workspace_style('typora-code-style:workspace_onboarding',tour_css);lifetime.add(style.remove);
 const dialog=workspace_dialog(workspace_text("onboarding_operation_instructions_b658709a"),workspace_text("onboarding_view_skip_the_tutorial"),()=>{lifetime.dispose();on_close();});
 dialog.root.classList.add('workspace-onboarding');
 const panel=dialog.root.querySelector<HTMLElement>('.git-graph-dialog')!;
 const highlight=el('div','workspace-onboarding-highlight');highlight.setAttribute('aria-hidden','true');dialog.root.prepend(highlight);
 const title=el('h4'),description=el('p'),hint=el('p','workspace-onboarding-hint'),demo=el('div','workspace-onboarding-demo');
 const progress=el('span','workspace-onboarding-progress');progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 const previous=workspace_button(workspace_text("onboarding_view_previous_step"),()=>render(index-1));
 const next=workspace_button(workspace_text("onboarding_view_next_step"),()=>index===steps.length-1?dialog.close():render(index+1),'workspace-onboarding-next');
 next.dataset.workspaceInteraction='primary';
 const skip=workspace_button(workspace_text("onboarding_view_skip"),()=>dialog.close());
 const guide=workspace_button(workspace_text("onboarding_operation_instructions_and_keyboard_shortcuts"),()=>{dialog.close();open_guide();});
 dialog.content.replaceChildren(title,description,hint,demo,guide);
 const actions=el('div','workspace-onboarding-actions');actions.append(previous,next);
 dialog.footer.replaceChildren(progress,skip,actions);
 let index=0,frame=0,target:HTMLElement|undefined;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let paused=reduced.matches;
 const position=()=>{
  frame=0;if(lifetime.disposed)return;
  const selector=steps[index].target;
  const found=selector?selector.split(',').flatMap(part=>[...document.querySelectorAll<HTMLElement>(part.trim())]).find(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.left<innerWidth&&r.top<innerHeight&&getComputedStyle(node).visibility!=='hidden';}):undefined;
  if(found!==target){if(target)observer.unobserve(target);target=found;if(target)observer.observe(target);}
  const r=target?.getBoundingClientRect();
  highlight.hidden=!r;hint.hidden=!selector||Boolean(r);
  hint.textContent=workspace_text("onboarding_view_this_area_is_currently_not_displayed_after_exiting_the_tutor");
  const margin=16,rect=panel.getBoundingClientRect();let x=(innerWidth-rect.width)/2,y=(innerHeight-rect.height)/2;
  if(r){
   const left=Math.max(2,r.left),top=Math.max(2,r.top),right=Math.min(innerWidth-2,r.right),bottom=Math.min(innerHeight-2,r.bottom);
   Object.assign(highlight.style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
   if(right+margin+rect.width<=innerWidth-margin){x=right+margin;y=top;}
   else if(left-margin-rect.width>=margin){x=left-margin-rect.width;y=top;}
   else if(bottom+margin+rect.height<=innerHeight-margin){x=left;y=bottom+margin;}
   else if(top-margin-rect.height>=margin){x=left;y=top-margin-rect.height;}
  }
  panel.style.left=Math.max(margin,Math.min(x,innerWidth-rect.width-margin))+'px';
  panel.style.top=Math.max(margin,Math.min(y,innerHeight-rect.height-margin))+'px';
 };
 const schedule=()=>{if(!frame&&!lifetime.disposed)frame=requestAnimationFrame(position);};
 const observer=new ResizeObserver(schedule);observer.observe(panel);
 lifetime.add(()=>{observer.disconnect();cancelAnimationFrame(frame);});
 lifetime.listen(window,'resize',schedule);lifetime.listen(window,'scroll',schedule,true);
 const render_demo=()=>{
  demo.replaceChildren();const kind=steps[index].demo;demo.hidden=!kind;if(!kind)return;
  demo.dataset.demo=kind;demo.dataset.paused=String(paused);
  const label=el('span','',workspace_text("onboarding_view_operation_illustration_will_not_open_real_files"));
  const first=el('div','workspace-onboarding-phase workspace-onboarding-phase-first',kind==='tabs'?workspace_text("onboarding_view_click_a_preview_a"):workspace_text("onboarding_view_ctrl_scroll_wheel_content_font_size_increases"));
  const second=el('div','workspace-onboarding-phase workspace-onboarding-phase-second',kind==='tabs'?workspace_text("onboarding_view_click_b_preview_b_alt_click_a_preview_b_persistent_a"):workspace_text("onboarding_view_toolbar_remains_at_original_size_reading_position_is_preserv"));
  const toggle=workspace_button(paused?workspace_text("onboarding_view_playback_indication"):workspace_text("onboarding_view_pause_indication"),()=>{paused=!paused;render_demo();schedule();});toggle.setAttribute('aria-pressed',String(!paused));
  if(reduced.matches){toggle.textContent=workspace_text("onboarding_view_system_has_reduced_animations");toggle.disabled=true;}
  demo.append(label,first,second,toggle);
 };
 const motion_changed=()=>{paused=reduced.matches;render_demo();schedule();};
 lifetime.listen(reduced,'change',motion_changed);
 function render(next_index:number){
  index=Math.max(0,Math.min(steps.length-1,next_index));dialog.root.dataset.step=String(index);
  title.textContent=steps[index].title;description.textContent=steps[index].text;progress.textContent=`${index+1} / ${steps.length}`;
  previous.disabled=index===0;next.textContent=index===steps.length-1?workspace_text("onboarding_view_completed"):workspace_text("onboarding_view_next_step");render_demo();schedule();
 }
 render(0);
 const focus_timer=window.setTimeout(()=>{if(!lifetime.disposed)next.focus({preventScroll:true});},0);
 lifetime.add(()=>clearTimeout(focus_timer));
 return {close:dialog.close};
}
