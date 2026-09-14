/** 输入法候选按键不参与工作台快捷命令；兼容浏览器仅报告229的事件。 */
export function is_composing_key(event:KeyboardEvent):boolean{
  return event.isComposing||event.keyCode===229;
}

/** 底部终端保留中央活动文档，按实际输入目标确定归属。 */
export function is_terminal_input(event:Event):boolean{
  const target=event.composedPath().find(node=>node instanceof Element)||event.target;
  return target instanceof Element&&!!target.closest(".linux-note-terminal")&&!target.closest(".linux-note-source-file");
}
