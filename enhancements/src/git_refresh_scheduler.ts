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

/** 每个仓库控制器只持有一个调度器；保存合并，停留时半小时兜底，隐藏后停止定时。 */
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
      // 首次展示复用已经开始的读取，不在它完成后再排一笔相同请求。
      this.initial_due = !this.options.busy() && !this.running;
    }
    this.schedule();
  }

  invalidate(): void {
    if (this.disposed) return;
    this.dirty = {at: this.clock.now(), during_read: this.running || this.options.busy()};
    this.schedule();
  }

  /** 聚焦或弹层关闭只唤醒已经到期/有改动的读取，不把窗口事件当作刷新命令。 */
  resume(): void { if (!this.disposed) this.schedule(); }

  /** 控制器每次读取的 finally 调用，包括用户命令和失败；读取中到达的保存继续保留。 */
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
    // 错误由仓库控制器报告；调度器仍记录失败尝试，避免立刻重试形成刷新循环。
    void (async () => {
      try { await this.options.refresh(); }
      catch { /* 失败不改变自动刷新间隔，也不产生未处理的 Promise。 */ }
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
