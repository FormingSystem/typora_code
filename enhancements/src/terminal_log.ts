/** A disk transcript independent of the terminal display buffer. */
const active_paths = new Set<string>();
export class terminal_log {
  target = "";
  error = "";
  private queue: Promise<void> = Promise.resolve();
  private folder = "";
  private source = "";
  private disposed = false;
  private control = "text";
  private surrogate = "";
  constructor(private fs: any, private path: any, private base: string, private report: (error: unknown) => void) {}
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
  private async prepare() {
    if (this.source) return;
    await this.fs.promises.mkdir(this.base, {recursive: true});
    this.folder = await this.fs.promises.mkdtemp(this.path.join(this.base, "session-"));
    this.source = this.path.join(this.folder, "output.log");
    await this.fs.promises.writeFile(this.source, "", "utf8");
  }
  private text(data: string) {
    data = this.surrogate + data; this.surrogate = "";
    if (/[\uD800-\uDBFF]$/.test(data)) { this.surrogate = data.slice(-1); data = data.slice(0,-1); }
    let output = "";
    for (const char of data) {
      if (this.control === "text") {
        if (char === "\x1b") this.control = "escape";
        else if (char >= " " || char === "\r" || char === "\n" || char === "\t") output += char;
      } else if (this.control === "escape") {
        this.control = char === "[" ? "csi" : ["]", "P", "^", "_", "X"].includes(char) ? "string" : /[ -/]/.test(char) ? "intermediate" : "text";
      } else if (this.control === "csi") {
        if (char >= "@" && char <= "~") this.control = "text";
      } else if (this.control === "intermediate") {
        if (char >= "0" && char <= "~") this.control = "text";
      } else if (this.control === "string") {
        if (char === "\x07") this.control = "text";
        else if (char === "\x1b") this.control = "string_escape";
      } else this.control = char === "\\" ? "text" : "string";
    }
    return output;
  }
  append(data: string): Promise<void> {
    if (this.disposed || this.error) return Promise.resolve();
    const text = this.text(data);
    return this.enqueue(async () => {
      if (this.error) return;
      try {
        await this.prepare();
        await this.fs.promises.appendFile(this.source, text, "utf8");
      } catch (error) {
        this.error = String(error); this.report(error); return;
      }
      if (this.target) {
        try { await this.fs.promises.appendFile(this.target, text, "utf8"); }
        catch (error) { this.release(); this.report(error); }
      }
    });
  }
  private key(file: string) { return this.path.resolve(file).toLowerCase(); }
  private release() { if (this.target) active_paths.delete(this.key(this.target)); this.target = ""; }
  save(file: string, continuous = false): Promise<void> {
    if (this.disposed) return Promise.reject(Error("Terminal closed"));
    return this.enqueue(async () => {
      if (this.error) throw Error(this.error);
      if (!this.path.isAbsolute(file)) throw Error("Absolute log path required");
      await this.prepare();
      const key = this.key(file);
      if (key === this.key(this.source) || active_paths.has(key)) throw Error("Log file is already in use");
      active_paths.add(key);
      try {
        await this.fs.promises.copyFile(this.source, file);
        if (continuous) { this.release(); this.target = file; }
      } finally { if (!continuous || this.target !== file) active_paths.delete(key); }
    });
  }
  stop() { return this.enqueue(async () => { this.release(); }); }
  dispose() {
    if (this.disposed) return this.queue;
    this.disposed = true;
    return this.enqueue(async () => {
      this.release();
      if (this.source) await this.fs.promises.unlink(this.source);
      if (this.folder) await this.fs.promises.rmdir(this.folder);
    }).catch(error => this.report(error));
  }
}
