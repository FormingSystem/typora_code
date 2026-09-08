export type reading_location = {
  file_path: string;
  scroll_top: number;
  scroll_left: number;
  cursor: Record<string, unknown> | null;
  view_id?: number;
  position?: import("./reading_positions").reading_position;
};

function same_location(left: reading_location, right: reading_location): boolean {
  return left.file_path === right.file_path && left.view_id === right.view_id && Math.abs(left.scroll_top - right.scroll_top) < 2
    && Math.abs(left.scroll_left - right.scroll_left) < 2
    && JSON.stringify(left.cursor) === JSON.stringify(right.cursor);
}

/** 历史只保存窗口内的阅读位置；恢复成功后才移动索引，取消打开不会丢掉原记录。 */
export function create_reading_history(maximum_entries = 100) {
  let entries: reading_location[] = [];
  let index = -1;
  let navigating = false;
  return {
    is_navigating: () => navigating,
    can_travel: (direction: -1 | 1) => !navigating && index + direction >= 0 && index + direction < entries.length,
    remap_paths(map: (path: string) => string | undefined) {
      for (const entry of entries) entry.file_path = map(entry.file_path) ?? entry.file_path;
    },
    record_jump(from: reading_location, to: reading_location) {
      if (navigating || same_location(from, to)) return;
      if (index < 0) { entries = [from]; index = 0; }
      else if (entries[index].file_path === from.file_path && entries[index].view_id === from.view_id) entries[index] = from;
      else { entries = entries.slice(0, index + 1); entries.push(from); index += 1; }
      entries = entries.slice(0, index + 1);
      entries.push(to);
      if (entries.length > maximum_entries) entries.splice(0, entries.length - maximum_entries);
      index = entries.length - 1;
    },
    async travel(direction: -1 | 1, current: reading_location,
      restore: (location: reading_location) => Promise<boolean>): Promise<boolean> {
      const target_index = index + direction;
      if (navigating || target_index < 0 || target_index >= entries.length) return false;
      navigating = true;
      try {
        if (!await restore(entries[target_index])) return false;
        if (entries[index]?.file_path === current.file_path && entries[index]?.view_id === current.view_id) entries[index] = current;
        index = target_index;
        return true;
      } finally {
        navigating = false;
      }
    },
  };
}
