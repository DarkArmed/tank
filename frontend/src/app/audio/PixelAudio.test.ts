import { describe, expect, it } from "vitest";
import { soundForEvent } from "./PixelAudio";

describe("soundForEvent", () => {
  it("maps every simulation event family to an original synth cue", () => {
    expect(soundForEvent({ type: "shot", team: "player", tankId: 1 })).toBe("shot");
    expect(soundForEvent({ type: "impact", target: "terrain" })).toBe("impact");
    expect(soundForEvent({ type: "explosion", target: "enemy" })).toBe("explosion");
    expect(soundForEvent({ type: "itemPicked", playerId: 1, item: "star" })).toBe("item");
    expect(soundForEvent({ type: "stageClear", stage: 1 })).toBe("clear");
    expect(soundForEvent({ type: "gameOver" })).toBe("gameOver");
    expect(soundForEvent({ type: "completed" })).toBe("complete");
  });
});
