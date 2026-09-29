/** Input method candidate buttons do not participate in the workbench shortcut commands; compatible browsers only report 229 events. */
export function is_composing_key(event:KeyboardEvent):boolean{
  return event.isComposing||event.keyCode===229;
}

/** Bottom terminal retains the central active document, determine ownership based on the actual input target. */
export function is_terminal_input(event:Event):boolean{
  const target=event.composedPath().find(node=>node instanceof Element)||event.target;
  return target instanceof Element&&!!target.closest(".linux-note-terminal")&&!target.closest(".linux-note-source-file");
}

/** Workbench conflict key moves to Alt; AltGr, combination input, and mixed modifier keys still belong to the input owner. */
export function workspace_alt_modifier(event:KeyboardEvent):boolean{
  return event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.getModifierState("AltGraph")&&!is_composing_key(event);
}
