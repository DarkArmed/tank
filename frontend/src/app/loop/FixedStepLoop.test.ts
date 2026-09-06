import { describe, expect, it } from "vitest";
import { FixedStepLoop, MAX_TICKS_PER_FRAME, TICK_MS } from "./FixedStepLoop";

describe("FixedStepLoop", () => {
  it("produces the same ticks across different display frame rates", () => {
    const run = (frameMs: number, frameCount: number): number => {
      const loop = new FixedStepLoop();
      let ticks = 0;
      loop.advance(0, false, () => { ticks += 1; });
      for (let frame = 1; frame <= frameCount; frame += 1) {
        loop.advance(frame * frameMs, false, () => { ticks += 1; });
      }
      return ticks;
    };
    expect(run(TICK_MS, 60)).toBe(60);
    expect(run(TICK_MS / 2, 120)).toBe(60);
  });

  it("caps catch-up work and drops excess elapsed time", () => {
    const loop = new FixedStepLoop();
    let ticks = 0;
    loop.advance(0, false, () => { ticks += 1; });
    expect(loop.advance(1000, false, () => { ticks += 1; })).toBe(MAX_TICKS_PER_FRAME);
    expect(ticks).toBe(MAX_TICKS_PER_FRAME);
    expect(loop.advance(1000 + TICK_MS, false, () => { ticks += 1; })).toBe(1);
  });

  it("does not accumulate time while paused", () => {
    const loop = new FixedStepLoop();
    let ticks = 0;
    loop.advance(0, false, () => { ticks += 1; });
    loop.advance(500, true, () => { ticks += 1; });
    loop.advance(500 + TICK_MS, false, () => { ticks += 1; });
    expect(ticks).toBe(1);
  });
});
