import { describe, expect, it } from "vitest";
import { configureCanvas, FRAME_HEIGHT, FRAME_WIDTH, integerScale, resizeCanvas } from "./CanvasRenderer";

describe("CanvasRenderer sizing", () => {
  it("keeps a fixed 256x240 internal buffer and disables smoothing", () => {
    const context = { imageSmoothingEnabled: true } as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    expect(configureCanvas(canvas)).toBe(context);
    expect(canvas.width).toBe(FRAME_WIDTH);
    expect(canvas.height).toBe(FRAME_HEIGHT);
    expect(context.imageSmoothingEnabled).toBe(false);
  });

  it("uses only the largest fitting positive integer CSS scale", () => {
    expect(integerScale(1024, 960)).toBe(4);
    expect(integerScale(900, 700)).toBe(2);
    expect(integerScale(200, 200)).toBe(1);
    const canvas = { style: {} } as HTMLCanvasElement;
    expect(resizeCanvas(canvas, 800, 720)).toBe(3);
    expect(canvas.style.width).toBe("768px");
    expect(canvas.style.height).toBe("720px");
  });
});
