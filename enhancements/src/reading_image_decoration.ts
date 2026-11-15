import type {read_reading_image_settings} from './reading_image_settings';

/** Decorations never participate in the image content box or serialized markup. */
export function reading_image_decoration(settings:ReturnType<typeof read_reading_image_settings>,dark:boolean){
  const color=(dark?settings.border_color_dark:settings.border_color_light)||`var(--theme-muted,var(--text-color,${dark?'#9d9d9d':'#3b3b3b'}))`;
  const width=settings.border?settings.border_width:0;
  const shadows:Record<string,string>={soft:`0 2px 8px rgb(0 0 0 / ${dark?.4:.16})`,medium:`0 4px 12px rgb(0 0 0 / ${dark?.5:.2})`,strong:`0 8px 24px rgb(0 0 0 / ${dark?.65:.28})`};
  return `--reading-image-decoration-width:${width}px;${settings.border?`outline:${width}px solid ${color};outline-offset:-${width}px;`:''}${shadows[settings.shadow]?`box-shadow:${shadows[settings.shadow]};`:''}`;
}
