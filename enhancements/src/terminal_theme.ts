import {workspace_surface_background,observe_workspace_theme} from "./workspace_theme";
import type { ITheme } from "@xterm/xterm";

/** 从正文实际颜色取主题，不依赖主题文件名或操作系统深浅色设置。 */
export function terminal_theme(theme_document:Document=document): ITheme {
  const body = getComputedStyle(theme_document.body);
  const rgb = workspace_surface_background(theme_document.body);
  const palette=theme_document.documentElement.hasAttribute('data-workspace-colors')?getComputedStyle(theme_document.documentElement):undefined;
  const palette_background=palette?.getPropertyValue('--workspace-ui-chrome').trim();
  const background = palette_background || `rgb(${rgb.join(", ")})`;
  const dark = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 < 128;
  const foreground = palette?.getPropertyValue('--workspace-ui-foreground').trim() || body.color || (dark ? "#d4d4d4" : "#333333");
  const theme:ITheme={background, foreground, cursor: palette?.getPropertyValue("--vscode-terminalCursor-foreground").trim() || foreground, cursorAccent: palette?.getPropertyValue("--vscode-terminalCursor-background").trim() || background,
    selectionBackground: palette?.getPropertyValue("--vscode-terminal-selectionBackground").trim() || (dark ? "#264f78" : "#add6ff"), selectionInactiveBackground: dark ? "#3a3d41" : "#d3d3d3",
    black: dark ? "#000000" : "#000000",
    red: dark ? "#cd3131" : "#cd3131",
    green: dark ? "#0DBC79" : "#107C10",
    yellow: dark ? "#e5e510" : "#949800",
    blue: dark ? "#2472c8" : "#0451a5",
    magenta: dark ? "#bc3fbc" : "#bc05bc",
    cyan: dark ? "#11a8cd" : "#0598bc",
    white: dark ? "#e5e5e5" : "#555555",
    brightBlack: dark ? "#666666" : "#666666",
    brightRed: dark ? "#f14c4c" : "#f14c4c",
    brightGreen: dark ? "#23d18b" : "#14CE14",
    brightYellow: dark ? "#f5f543" : "#b5ba00",
    brightBlue: dark ? "#3b8eea" : "#3b8eea",
    brightMagenta: dark ? "#d670d6" : "#d670d6",
    brightCyan: dark ? "#29b8db" : "#29b8db",
    brightWhite: dark ? "#e5e5e5" : "#a5a5a5"};
  for(const key of Object.keys(theme) as (keyof ITheme)[]){const value=palette?.getPropertyValue('--workspace-terminal-'+key.replace(/[A-Z]/gu,part=>'-'+part.toLowerCase())).trim();if(value)theme[key]=value;}
  return theme;
}

export function observe_terminal_theme(apply: (theme: ITheme) => void): () => void {
  let previous = "";
  return observe_workspace_theme(()=>{const theme=terminal_theme(),key=JSON.stringify(theme);if(key!==previous){previous=key;apply(theme);}});
}
