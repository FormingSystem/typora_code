import {workspace_surface_background,observe_workspace_theme} from "./workspace_theme";
import type { ITheme } from "@xterm/xterm";

/** 从正文实际颜色取主题，不依赖主题文件名或操作系统深浅色设置。 */
export function terminal_theme(): ITheme {
  const body = getComputedStyle(document.body);
  const rgb = workspace_surface_background(document.body);
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
  let previous = "";
  return observe_workspace_theme(()=>{const theme=terminal_theme(),key=JSON.stringify(theme);if(key!==previous){previous=key;apply(theme);}});
}
