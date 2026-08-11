import { Server } from 'socket.io';
import { MAIN_CLOCK_TICK_MS } from '../game.rules';
import { MatchStore } from '../state/match.store';

/**
 * The single main match clock (port of the old doTimer/playPauseTime pair).
 * Emits 'update-clock' every tick; when the clock reaches zero or is stopped
 * it locks the CHP buzzers and the KD answer buttons, exactly as the old
 * server did from inside its dying interval.
 *
 * Note: the old doTimer also had `this.threeSecTimerType = "N"` — a no-op bug
 * (it wrote a property on `module.exports`, never the variable), so the KD
 * decision owner was in fact never reset by the main clock. This service
 * deliberately owns no session state, preserving that (accidental) behavior;
 * the KD decision window manages its own lifecycle in kd.handlers.
 */
export class TimerService {
  private running = false;
  private remaining = 0;
  private tickHandle?: NodeJS.Timeout;
  private delayHandle?: NodeJS.Timeout;

  constructor(
    private readonly io: Server,
    private readonly store: MatchStore,
  ) {}

  /**
   * Start (or restart) the main clock. A clock that is already running or
   * pending is silently superseded — no stop events are emitted for it.
   */
  startMainClock(seconds: number, options?: { startDelayMs?: number }): void {
    this.clearHandles();
    this.running = false;
    const delayMs = options?.startDelayMs ?? 0;
    if (delayMs > 0) {
      this.delayHandle = setTimeout(() => {
        this.delayHandle = undefined;
        this.run(seconds);
      }, delayMs);
    } else {
      this.run(seconds);
    }
  }

  /** Stop the clock, emitting the end-of-clock lockouts if one was live. */
  stopMainClock(): void {
    if (!this.running && this.delayHandle === undefined) return;
    this.finish();
  }

  /**
   * Port of playPauseTime: running clock → stash the remaining seconds into
   * MatchState.pausedTimerSeconds and stop; otherwise, if a pause is stashed,
   * resume from it and clear the stash. No-op when idle with nothing stashed.
   */
  togglePause(): void {
    if (this.running) {
      const remaining = this.remaining;
      this.store.updateMatch((match) => {
        match.pausedTimerSeconds = remaining;
      });
      this.finish();
      return;
    }
    const paused = this.store.getMatch().pausedTimerSeconds;
    if (paused !== 0) {
      this.store.updateMatch((match) => {
        match.pausedTimerSeconds = 0;
      });
      this.startMainClock(paused);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Seconds currently shown on the clock; while paused this is the stashed
   * remainder, so "is there still time" checks behave the same as the old
   * server's mainTimer during a pause.
   */
  remainingSeconds(): number {
    if (this.running) return this.remaining;
    return this.store.getMatch().pausedTimerSeconds;
  }

  private run(seconds: number): void {
    this.running = true;
    this.remaining = seconds;
    this.io.emit('update-clock', this.remaining);
    this.tickHandle = setInterval(() => this.tick(), MAIN_CLOCK_TICK_MS);
  }

  private tick(): void {
    this.remaining -= 1;
    if (this.remaining <= 0 || !this.running) {
      this.finish();
      return;
    }
    this.io.emit('update-clock', this.remaining);
  }

  private finish(): void {
    this.clearHandles();
    this.running = false;
    this.remaining = 0;
    this.io.emit('update-clock', 0);
    this.io.emit('lock-button-chp');
    this.io.emit('disable-answer-button-kd');
  }

  private clearHandles(): void {
    if (this.tickHandle !== undefined) {
      clearInterval(this.tickHandle);
      this.tickHandle = undefined;
    }
    if (this.delayHandle !== undefined) {
      clearTimeout(this.delayHandle);
      this.delayHandle = undefined;
    }
  }
}
