import { describe, it, expect } from "vitest";
import * as metrics from "@/utils/unitRenderMetrics";
import { octagon, arrow } from "@/utils/orderPrimitives";

/**
 * These values MIRROR diplicity-react's production renderer:
 *   packages/web/src/components/InteractiveMap/mapRenderer.ts
 *   packages/web/src/components/InteractiveMap/svgPrimitives.ts
 *   (PR johnpooch/diplicity-react#1247)
 *
 * The dVAR Creator's Unit Scaling preview draws with them so that a variant
 * author sees the same unit/arrow proportions the game will render at a given
 * `unitScaling`. If diplicity-react changes a constant, this test fails until
 * the mirror in unitRenderMetrics.ts is updated to match.
 */
describe("unitRenderMetrics — pinned to diplicity-react mapRenderer.ts", () => {
  it("unit token metrics", () => {
    expect(metrics.UNIT_RADIUS).toBe(10);
    expect(metrics.UNIT_OFFSET_RADIUS).toBe(5);
    expect(metrics.DISLODGED_OFFSET).toBe(8);
    expect(metrics.UNIT_STROKE_WIDTH).toBe(2);
    expect(metrics.UNIT_LABEL_FONT_SIZE).toBe(15);
    expect(metrics.UNIT_LABEL_BASELINE_DY).toBe(5);
  });

  it("order markup metrics", () => {
    expect(metrics.ORDER_LINE_WIDTH).toBe(3);
    expect(metrics.ORDER_ARROW_WIDTH).toBe(6);
    expect(metrics.ORDER_ARROW_LENGTH).toBe(8);
    expect(metrics.ORDER_STROKE_WIDTH).toBe(2.5);
    expect(metrics.ORDER_DASH).toEqual({ length: 4, spacing: 2 });
    expect(metrics.ORDER_SUCCESS_COLOR).toBe("rgba(0,0,0,1)");
    expect(metrics.HOLD_OCTAGON_SIZE).toBe(24);
  });

  it("adjustment / failure marker metrics", () => {
    expect(metrics.FAILED_CROSS_WIDTH).toBe(3);
    expect(metrics.FAILED_CROSS_LENGTH).toBe(16);
    expect(metrics.FAILED_CROSS_ANGLE).toBe(45);
    expect(metrics.ORDER_MARKER_WIDTH).toBe(3);
    expect(metrics.ORDER_MARKER_LENGTH).toBe(12);
    expect(metrics.ORDER_MARKER_ANGLE).toBe(90);
    expect(metrics.BUILD_CROSS_OFFSET_X).toBe(8);
    expect(metrics.BUILD_CROSS_OFFSET_Y).toBe(-8);
    expect(metrics.DISBAND_MARKER_OFFSET_X).toBe(10);
    expect(metrics.DISBAND_MARKER_OFFSET_Y).toBe(-6);
  });

  it("unitScaling field bounds match the .dvar schema", () => {
    expect(metrics.MIN_UNIT_SCALE).toBe(0.1);
    expect(metrics.MAX_UNIT_SCALE).toBe(10);
  });
});

describe("orderPrimitives — scale linearly", () => {
  it("octagon polygon grows in proportion to size", () => {
    const small = octagon({ x: 0, y: 0, size: 24, fill: "transparent", stroke: "black", strokeWidth: 3 });
    const large = octagon({ x: 0, y: 0, size: 48, fill: "transparent", stroke: "black", strokeWidth: 6 });
    const radiusOf = (svg: string): number => {
      const first = svg.match(/points="(-?[\d.]+),(-?[\d.]+)/);
      if (!first) throw new Error("no points");
      return Math.hypot(Number(first[1]), Number(first[2]));
    };
    expect(radiusOf(large) / radiusOf(small)).toBeCloseTo(2, 2);
    expect(large).toContain('stroke-width="6"');
  });

  it("arrow shaft and head scale with the size arguments", () => {
    const base = arrow({
      x1: 0, y1: 0, x2: 100, y2: 0,
      lineWidth: 3, arrowWidth: 6, arrowLength: 8, strokeWidth: 2.5,
      offset: 10, stroke: "rgba(0,0,0,1)", fill: "#123456",
    });
    const doubled = arrow({
      x1: 0, y1: 0, x2: 100, y2: 0,
      lineWidth: 6, arrowWidth: 12, arrowLength: 16, strokeWidth: 5,
      offset: 20, stroke: "rgba(0,0,0,1)", fill: "#123456",
    });
    // coloured centre line at lineWidth, black outline at lineWidth + 2*strokeWidth
    expect(base).toContain('stroke="#123456" stroke-width="3"');
    expect(base).toContain('stroke="rgba(0,0,0,1)" stroke-width="8"');
    expect(doubled).toContain('stroke="#123456" stroke-width="6"');
    expect(doubled).toContain('stroke="rgba(0,0,0,1)" stroke-width="16"');
    // arrowhead polygon tip pulls back by offset + arrowLength from x2=100
    expect(base).toContain("M 10 0 L 82 0");
    expect(doubled).toContain("M 20 0 L 64 0");
  });
});
