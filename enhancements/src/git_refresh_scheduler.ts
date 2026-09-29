type git_refresh_options = {
  refresh(): Promise<void>;
  busy(): boolean;
  allowed(): boolean;
  last_refresh(): number;
  last_started(): number;
};
type git_refresh_clock = {
  now(): number;
  set_timeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clear_timeout(timer: ReturnType<typeof setTimeout>): void;
};
const default_clock: git_refresh_clock = {
  now: () => Date.now(),
  set_timeout: (callback, delay) => setTimeout(callback, delay),
  clear_timeout: timer => clearTimeout(timer),
};
const REFRESH_INTERVAL = 30 * 60 * 1000;
const SAVE_DELAY = 1000;
const REFRESH_COOLDOWN = 5000;
const BLOCKED_RETRY = 1000;

/** Each repository controller holds only one scheduler; save merges, if idle for half an hour, fallback, and hide to stop the timer. */
export class git_refresh_scheduler {
  private visible = false;
  private opened = false;
  private initial_due = false;
  private running = false;
  private disposed = false;
  private last_attempt = 0;
  private own_started = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private dirty?: {at: number; during_read: boolean};

  constructor(private options: git_refresh_options, private clock: git_refresh_clock = default_clock) {}

  set_visible(visible: boolean): void {
    if (this.disposed) return;
    this.visible = visible;
    if (visible && !this.opened) {
      this.opened = true;
      // On first display, reuse already started reads; do not schedule another identical request once it is completed.
      this.initial_due = !this.options.busy() && !this.running;
    }
    this.schedule();
  }

  invalidate(): void {
    if (this.disposed) return;
    this.dirty = {at: this.clock.now(), during_read: this.running || this.options.busy()};
    this.schedule();
  }

  /** Focus or layer close only awaken already expired/modified reads, do not treat window events as refresh commands. */
  resume(): void { if (!this.disposed) this.schedule(); }

  /** The finally call of the controller for each read, including user commands and failures; reads in progress continue to retain saves. */
  settled(): void {
    if (this.disposed) return;
    this.last_attempt = this.clock.now();
    this.initial_due = false;
    const started = Math.max(this.own_started, this.options.last_started());
    if (this.dirty && (this.dirty.at < started || this.dirty.at === started && !this.dirty.during_read)) this.dirty = undefined;
    this.schedule();
  }

  private clear_timer(): void {
    if (this.timer !== undefined) this.clock.clear_timeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.clear_timer();
    if (this.disposed || !this.visible) return;
    const now = this.clock.now();
    const completed = Math.max(this.last_attempt, this.options.last_refresh());
    const due = this.initial_due ? now : this.dirty
      ? Math.max(this.dirty.at + SAVE_DELAY, completed + REFRESH_COOLDOWN)
      : completed + REFRESH_INTERVAL;
    if (due > now) {
      this.timer = this.clock.set_timeout(() => this.schedule(), due - now);
      return;
    }
    if (this.running || this.options.busy() || !this.options.allowed()) {
      this.timer = this.clock.set_timeout(() => this.schedule(), BLOCKED_RETRY);
      return;
    }
    this.running = true;
    this.initial_due = false;
    this.own_started = now;
    this.dirty = undefined;
    // Errors are reported by the repository controller; the scheduler still records failed attempts to avoid immediate retries forming a refresh loop.
    void (async () => {
      try { await this.options.refresh(); }
      catch { /* Failure does not change the automatic refresh interval, nor does it generate unhandled Promise. */ }
      finally {
        this.running = false;
        this.settled();
      }
    })();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear_timer();
    this.dirty = undefined;
  }
}
