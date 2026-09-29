export type reading_location = {
  file_path: string;
  scroll_top: number;
  scroll_left: number;
  cursor: Record<string, unknown> | null;
  view_id?: number;
  kind?: "source" | "git";
  line?: number;
  editor_state?: unknown;
  position?: import("./reading_positions").reading_position;
};

function same_location(left: reading_location, right: reading_location): boolean {
  return left.file_path === right.file_path && left.kind === right.kind && left.view_id === right.view_id && Math.abs(left.scroll_top - right.scroll_top) < 2
    && Math.abs(left.scroll_left - right.scroll_left) < 2
    && JSON.stringify(left.cursor) === JSON.stringify(right.cursor);
}

/** History only saves the reading position within the window; after recovery is successful, the index is moved, and closing without saving does not lose the original record. */
export function create_reading_history(maximum_entries = 50) {
  let entries: reading_location[] = [];
  let index = -1;
  let navigating = false;
  let revision = 0;
  return {
    clear(){revision++;entries=[];index=-1;navigating=false;},
    is_navigating: () => navigating,
    is_current_editor: (current: reading_location) => entries[index]?.file_path === current.file_path
      && entries[index]?.kind === current.kind && entries[index]?.view_id === current.view_id,
    // Whether it can accept the next direction depends only on the logical stack boundary; the serialization of recovery is owned by the navigation entry.
    can_travel: (direction: -1 | 1, pending_offset = 0) => index + pending_offset + direction >= 0 && index + pending_offset + direction < entries.length,
    remap_paths(map: (path: string) => string | undefined) {
      for (const entry of entries) entry.file_path = map(entry.file_path) ?? entry.file_path;
    },
    // The toolbar/window blur only updates the current position, and cannot treat the lost document selection as a new jump.
    checkpoint(current: reading_location) {
      if (navigating) return false;
      const previous = entries[index];
      if (!previous || previous.file_path !== current.file_path || previous.kind !== current.kind || previous.view_id !== current.view_id) return false;
      entries[index] = {...current, cursor: current.cursor ?? previous.cursor};
      return true;
    },
    record_selection(current: reading_location, explicit = false) {
      if (navigating) return;
      const previous = entries[index];
      if (!previous) { entries = [current]; index = 0; return; }
      const same_editor = previous.file_path === current.file_path && previous.kind === current.kind && previous.view_id === current.view_id;
      const same_line = current.line != null && previous.line === current.line;
      const nearby = current.line != null && previous.line != null
        ? Math.abs(current.line - previous.line) < 10
        : previous.cursor?.id === current.cursor?.id && previous.cursor?.startId === current.cursor?.startId;
      // VS Code shouldReplaceStackEntry: Resource items without specific selections are completed by the first valid selection.
      if (same_editor && (previous.cursor === null || (!explicit && current.cursor === null) || same_location(previous, current) || same_line || (!explicit && nearby))) entries[index] = {...current, cursor: current.cursor ?? previous.cursor};
      else {
        entries = entries.slice(0, index + 1); entries.push(current);
        if (entries.length > maximum_entries) entries.shift();
        index = entries.length - 1;
      }
    },
    record_jump(from: reading_location, to: reading_location) {
      if (navigating || same_location(from, to)) return;
      if (index < 0) { entries = [from]; index = 0; }
      else if (entries[index].file_path === from.file_path && entries[index].kind === from.kind && entries[index].view_id === from.view_id) entries[index] = {...from, cursor: from.cursor ?? entries[index].cursor};
      else { entries = entries.slice(0, index + 1); entries.push(from); index += 1; }
      entries = entries.slice(0, index + 1);
      entries.push(to);
      if (entries.length > maximum_entries) entries.splice(0, entries.length - maximum_entries);
      index = entries.length - 1;
    },
    async travel(direction: -1 | 1, current: reading_location | null,
      restore: (location: reading_location) => Promise<boolean | reading_location>): Promise<boolean> {
      const target_index = index + direction;
      if (navigating || target_index < 0 || target_index >= entries.length) return false;
      navigating = true;
      const current_revision = revision;
      try {
        const target = {...entries[target_index]};
        const restored = await restore(target);
        if (!restored || current_revision !== revision) return false;
        // Closing only destroys the view. After the recovery end delivers the real identity, all the original view positions are re-bound together, and other split views are unaffected.
        if (typeof restored !== "boolean" && (restored.file_path !== target.file_path || restored.kind !== target.kind)) return false;
        if (current && entries[index]?.file_path === current.file_path && entries[index]?.kind === current.kind && entries[index]?.view_id === current.view_id) entries[index] = {...current, cursor: current.cursor ?? entries[index].cursor};
        if (typeof restored !== "boolean") {
          for (const entry of entries) {
            if (entry.file_path === target.file_path && entry.kind === target.kind && entry.view_id === target.view_id) entry.view_id = restored.view_id;
          }
          entries[target_index] = {...restored, cursor: restored.cursor ?? target.cursor};
        }
        index = target_index;
        return true;
      } finally {
        if(current_revision === revision)navigating = false;
      }
    },
  };
}
