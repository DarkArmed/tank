export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const MAX_TICKS_PER_FRAME = 5;
const FLOAT_EPSILON = 1e-9;

export class FixedStepLoop {
  private previousTime: number | null = null;
  private accumulator = 0;

  advance(now: number, paused: boolean, tick: () => void): number {
    if (this.previousTime === null) {
      this.previousTime = now;
      return 0;
    }
    const elapsed = Math.max(0, now - this.previousTime);
    this.previousTime = now;
    if (paused) {
      this.accumulator = 0;
      return 0;
    }

    this.accumulator += elapsed;
    const available = Math.floor(this.accumulator / TICK_MS + FLOAT_EPSILON);
    const count = Math.min(available, MAX_TICKS_PER_FRAME);
    for (let index = 0; index < count; index += 1) tick();
    if (available > MAX_TICKS_PER_FRAME) {
      this.accumulator = Math.max(0, this.accumulator - available * TICK_MS);
    } else {
      this.accumulator -= count * TICK_MS;
    }
    return count;
  }

  reset(now?: number): void {
    this.previousTime = now ?? null;
    this.accumulator = 0;
  }
}
