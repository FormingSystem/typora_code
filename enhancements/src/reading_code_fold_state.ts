type fold_owner = string | object;
type fold_entry = {element: HTMLElement; owner: fold_owner; read_text: () => string};
type fold_record = fold_entry & {key: string; index: number; expanded?: boolean; restoring: boolean};

// Keep compact identities, never copies of document text or detached editors.
function fingerprint(text: string): string {
  let first = 2166136261, second = 5381;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${text.length}:${first >>> 0}:${second >>> 0}`;
}

/** Window/workspace reading choices outlive native DOM reconstruction. */
export function create_reading_code_fold_state() {
  const saved = new Map<fold_owner, Map<string, boolean>>();
  const records = new Map<HTMLElement, fold_record>();
  const checkpoint = () => {
    const occurrences = new Map<fold_owner, Map<string, number>>();
    const updates: Array<{record: fold_record; key: string}> = [];
    for (const record of [...records.values()].sort((left, right) => left.index - right.index)) {
      let counts = occurrences.get(record.owner);
      if (!counts) occurrences.set(record.owner, counts = new Map());
      let signature: string;
      try { signature = fingerprint(record.read_text()); } catch { continue; }
      const occurrence = counts.get(signature) ?? 0;
      counts.set(signature, occurrence + 1);
      updates.push({record, key: `${signature}:${occurrence}`});
    }
    // Remove old keys first so edited duplicate blocks cannot erase each other.
    for (const {record} of updates) if (record.expanded !== undefined) saved.get(record.owner)?.delete(record.key);
    for (const {record, key} of updates) {
      record.key = key;
      if (record.expanded === undefined) continue;
      let choices = saved.get(record.owner);
      if (!choices) saved.set(record.owner, choices = new Map());
      choices.set(key, record.expanded);
    }
  };
  const reconcile = (entries: fold_entry[]) => {
    const next = new Map(entries.map(entry => [entry.element, entry]));
    if ([...records.values()].some(record => next.get(record.element)?.owner !== record.owner)) checkpoint();
    for (const [element, record] of records) if (next.get(element)?.owner !== record.owner) records.delete(element);
    const occurrences = new Map<fold_owner, Map<string, number>>();
    entries.forEach((entry, index) => {
      const existing = records.get(entry.element);
      let counts = occurrences.get(entry.owner);
      if (!counts) occurrences.set(entry.owner, counts = new Map());
      const signature = existing ? existing.key.slice(0, existing.key.lastIndexOf(':')) : fingerprint(entry.read_text());
      const occurrence = counts.get(signature) ?? 0;
      counts.set(signature, occurrence + 1);
      const key = `${signature}:${occurrence}`;
      if (existing) { existing.index = index; existing.read_text = entry.read_text; return; }
      records.set(entry.element, {...entry, index, key, expanded: saved.get(entry.owner)?.get(key), restoring: true});
    });
  };
  return {
    reconcile,
    checkpoint,
    expanded: (element: HTMLElement) => records.get(element)?.expanded,
    take_restore(element: HTMLElement) {
      const record = records.get(element);
      if (!record?.restoring) return undefined;
      record.restoring = false;
      return record.expanded ?? false;
    },
    remember(element: HTMLElement, expanded: boolean) {
      const record = records.get(element);
      if (!record) return;
      record.expanded = expanded;
      checkpoint();
    },
    clear() { records.clear(); saved.clear(); },
  };
}
