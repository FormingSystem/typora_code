import type { ITheme } from "@xterm/xterm";

/** 从正文实际颜色取主题，不依赖主题文件名或操作系统深浅色设置。 */
export function terminal_theme(): ITheme {
  const body = getComputedStyle(document.body); const root = getComputedStyle(document.documentElement);
  // CSS 的透明颜色不一定是 rgba(0,0,0,0)。让浏览器按根元素、正文顺序
  // 合成一个像素，同时处理半透明背景和 color(...) 等浏览器支持的颜色。
  const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
  const context = canvas.getContext("2d"); let rgb = [255, 255, 255];
  if (context) {
    for (const color of ["#ffffff", root.backgroundColor, body.backgroundColor]) { context.fillStyle = color; context.fillRect(0, 0, 1, 1); }
    rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
  }
  const background = `rgb(${rgb.join(", ")})`;
  const dark = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 < 128;
  const foreground = body.color || (dark ? "#d4d4d4" : "#333333");
  return {background, foreground, cursor: foreground, cursorAccent: background,
    selectionBackground: dark ? "#264f78" : "#add6ff", selectionInactiveBackground: dark ? "#3a3d41" : "#d3d3d3",
    black: dark ? "#000000" : "#24292f", red: dark ? "#cd3131" : "#a31515", green: dark ? "#0dbc79" : "#16713b", yellow: dark ? "#e5e510" : "#795e26",
    blue: dark ? "#3b8eea" : "#0451a5", magenta: dark ? "#bc3fbc" : "#af00db", cyan: dark ? "#11a8cd" : "#0070a8", white: dark ? "#e5e5e5" : "#555555",
    brightBlack: dark ? "#666666" : "#666666", brightRed: dark ? "#f14c4c" : "#c72e2e", brightGreen: dark ? "#23d18b" : "#16825d", brightYellow: dark ? "#f5f543" : "#8a6500",
    brightBlue: dark ? "#3b8eea" : "#0065b3", brightMagenta: dark ? "#d670d6" : "#a626a4", brightCyan: dark ? "#29b8db" : "#007f8b", brightWhite: dark ? "#ffffff" : "#333333"};
}

export function observe_terminal_theme(apply: (theme: ITheme) => void): () => void {
  let frame = 0; let previous = "";
  const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { const theme = terminal_theme(); const key = JSON.stringify(theme); if (key !== previous) { previous = key; apply(theme); } }); };
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, {attributes:true, attributeFilter:["class", "style", "data-theme"]});
  observer.observe(document.body, {attributes:true, attributeFilter:["class", "style"]});
  observer.observe(document.head, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:["href", "media", "disabled"]});
  document.head.addEventListener("load", update, true); window.addEventListener("focus", update); update();
  return () => { observer.disconnect(); cancelAnimationFrame(frame); document.head.removeEventListener("load", update, true); window.removeEventListener("focus", update); };
}
