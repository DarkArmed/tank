import stage1 from "../sim/maps/stage-1.json";
import stage2 from "../sim/maps/stage-2.json";
import stage3 from "../sim/maps/stage-3.json";
import type { StageMap } from "../sim";

export * from "../sim";

export const STAGE_MAPS = [stage1, stage2, stage3] as unknown as readonly StageMap[];
