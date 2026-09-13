import { file_key } from "./workspace_file_uri";

export type reading_position = {
  scroll_top: number;
  scroll_left: number;
  block?: { tag: string; text: string; index: number; offset: number };
};

const POSITION_PREFIX = "linux-note-reading-position:v1:";

/** 每个文件单独存储，多个 Typora 窗口不会互相覆盖整张位置表；不复制文档或保存临时 cid。 */
export function create_position_store(storage: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">,
  maximum_entries = 500) {
  const read_entry = (key: string) => {
    try {
      const entry = JSON.parse(storage.getItem(key) ?? "null");
      const position = entry?.position;
      if (!Number.isFinite(entry?.updated_at) || !Number.isFinite(position?.scroll_top)
          || !Number.isFinite(position?.scroll_left) || position.scroll_top < 0 || position.scroll_left < 0) return null;
      if (position.block && (typeof position.block.text !== "string" || typeof position.block.tag !== "string"
          || !Number.isInteger(position.block.index) || !Number.isFinite(position.block.offset))) delete position.block;
      return entry as { updated_at: number; position: reading_position };
    } catch { return null; }
  };
  return {
    remap_paths(map: (path: string) => string | undefined): void {
      const updates: {old_key: string; new_key: string; value: string}[] = [];
      try {
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index); if (!key?.startsWith(POSITION_PREFIX)) continue;
          const target = map(decodeURIComponent(key.slice(POSITION_PREFIX.length)));
          const value = storage.getItem(key);
          if (target && value && read_entry(key)) updates.push({old_key: key, new_key: POSITION_PREFIX + encodeURIComponent(file_key(target)), value});
        }
        for (const update of updates) { storage.setItem(update.new_key, update.value); if (update.old_key !== update.new_key) storage.removeItem(update.old_key); }
      } catch (error) { console.warn("[linux-note reading positions] cannot rename position", error); }
    },
    get(path: string): reading_position | null {
      return read_entry(POSITION_PREFIX + encodeURIComponent(file_key(path)))?.position ?? null;
    },
    set(path: string, position: reading_position): void {
      if (!path || path.startsWith("typ://")) return;
      try {
        const key = POSITION_PREFIX + encodeURIComponent(file_key(path));
        storage.setItem(key, JSON.stringify({ updated_at: Date.now(), position }));
        const entries: { key: string; updated_at: number }[] = [];
        for (let index = 0; index < storage.length; index += 1) {
          const candidate = storage.key(index);
          if (candidate?.startsWith(POSITION_PREFIX)) entries.push({ key: candidate, updated_at: read_entry(candidate)?.updated_at ?? 0 });
        }
        entries.sort((left, right) => left.key === key ? -1 : right.key === key ? 1 : right.updated_at - left.updated_at);
        for (const entry of entries.slice(maximum_entries)) storage.removeItem(entry.key);
      } catch (error) {
        // 存储禁用或配额不足时，窗口内导航仍可用。
        console.warn("[linux-note reading positions] cannot persist position", error);
      }
    },
  };
}

function blocks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children).filter((node): node is HTMLElement => node instanceof HTMLElement
    && node.getBoundingClientRect().height > 0 && !node.matches("script, style, button"));
}

function block_text(block: HTMLElement): string {
  // 仅保存短定位指纹，正文始终来自原 Markdown 文件。
  return (block.textContent ?? "").trim().slice(0, 160);
}

export function capture_position(scroller: HTMLElement, root: HTMLElement): reading_position {
  const position: reading_position = { scroll_top: scroller.scrollTop, scroll_left: scroller.scrollLeft };
  const children = blocks(root);
  const top = scroller.getBoundingClientRect().top;
  let index = children.findIndex((block) => block.getBoundingClientRect().bottom > top + 16);
  if (index < 0) index = children.length - 1;
  const block = children[index];
  if (block) position.block = { tag: block.tagName, text: block_text(block), index, offset: block.getBoundingClientRect().top - top };
  return position;
}

export function position_block(root: HTMLElement, position: reading_position): HTMLElement | undefined {
  const saved = position.block;
  if (!saved) return;
  const children = blocks(root);
  const matches = (block: HTMLElement) => block.tagName === saved.tag && block_text(block) === saved.text;
  if (children[saved.index] && matches(children[saved.index])) return children[saved.index];
  return children.find(matches);
}

export function apply_position(scroller: HTMLElement, root: HTMLElement, position: reading_position): void {
  const block = position_block(root, position);
  scroller.scrollTop = block && position.block
    ? scroller.scrollTop + block.getBoundingClientRect().top - scroller.getBoundingClientRect().top - position.block.offset
    : position.scroll_top;
  scroller.scrollLeft = position.scroll_left;
}
