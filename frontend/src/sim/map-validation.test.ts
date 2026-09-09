import { describe, expect, it } from "vitest";
import { validateStageMaps } from "./map-validation";
import { makeMap, makeMaps } from "./test-fixtures";
import type { StageMap } from "./types";

describe("stage map validation", () => {
  it("accepts exactly one valid 26x26 map for each stage", () => {
    expect(() => validateStageMaps(makeMaps())).not.toThrow();
  });

  it("reports the stage and invalid field", () => {
    const invalid = { ...makeMap(2), width: 25 } as unknown as StageMap;
    expect(() => validateStageMaps([makeMap(1), invalid, makeMap(3)])).toThrow(/stage 2 dimensions/);
  });

  it("rejects malformed headquarters and blocked spawns", () => {
    const badHq = makeMap(1, [{ column: 12, row: 24, tile: "empty" }]);
    expect(() => validateStageMaps([badHq, makeMap(2), makeMap(3)])).toThrow(/stage 1 cells.*hq/);
    const blocked = makeMap(1, [{ column: 8, row: 22, tile: "brick" }]);
    expect(() => validateStageMaps([blocked, makeMap(2), makeMap(3)])).toThrow(/stage 1 spawns\.player1/);
  });

  it("rejects duplicate ids and spawn points", () => {
    expect(() => validateStageMaps([makeMap(1), makeMap(1), makeMap(3)])).toThrow(/stage 1 id.*duplicated/);
    const map = makeMap(1);
    const duplicated = { ...map, spawns: { ...map.spawns, player2: map.spawns.player1 } };
    expect(() => validateStageMaps([duplicated, makeMap(2), makeMap(3)])).toThrow(/player spawn points must be distinct/);
  });
});
