/**
 * When a desk last loaded and whether a load is running: the bookkeeping behind quiet background refreshes.
 * Created once per provider (useState initialiser) and only touched in effects and event handlers, never read to
 * render, so it doesn't need to be state and isn't a ref the render could read.
 */
export class LoadTracker {
  private loadedAt = 0;
  private inFlight = false;
  constructor(private readonly staleMs: number) {}
  start() { this.inFlight = true; }
  finish(loaded: boolean) { this.inFlight = false; if (loaded) this.loadedAt = Date.now(); }
  get everLoaded() { return this.loadedAt > 0; }
  /** Loaded before, not loading now, and older than the stale window. */
  stale(now: number) { return !this.inFlight && this.loadedAt > 0 && now - this.loadedAt > this.staleMs; }
}
