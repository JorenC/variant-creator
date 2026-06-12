import { describe, it, expect } from "vitest";
import { calculatePathDataBounds } from "../pathBounds";

describe("calculatePathDataBounds", () => {
  it("computes bounds of straight-line paths", () => {
    expect(calculatePathDataBounds("M 10 10 L 30 10 L 30 25 Z")).toEqual({
      x: 10, y: 10, width: 20, height: 15,
    });
  });

  it("handles relative commands", () => {
    expect(calculatePathDataBounds("m 10 10 l 10 0 l 0 10 z")).toEqual({
      x: 10, y: 10, width: 10, height: 10,
    });
  });

  it("handles H and V commands", () => {
    expect(calculatePathDataBounds("M 0 0 H 20 V 5")).toEqual({
      x: 0, y: 0, width: 20, height: 5,
    });
  });

  // Inkscape serializes sodipodi circles as M + two arcs; sampling only the
  // command endpoints collapses such a path to its horizontal diameter.
  it("computes exact bounds of a circle drawn with two arcs", () => {
    const bounds = calculatePathDataBounds("M 60 50 A 10 10 0 1 0 40 50 A 10 10 0 1 0 60 50 Z");
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeCloseTo(40, 6);
    expect(bounds!.y).toBeCloseTo(40, 6);
    expect(bounds!.width).toBeCloseTo(20, 6);
    expect(bounds!.height).toBeCloseTo(20, 6);
  });

  it("includes cubic bezier extremes beyond the endpoints", () => {
    // Symmetric cubic bulging downward to y = -7.5 at t = 0.5
    const bounds = calculatePathDataBounds("M 0 0 C 0 -10 10 -10 10 0");
    expect(bounds!.y).toBeCloseTo(-7.5, 6);
    expect(bounds!.height).toBeCloseTo(7.5, 6);
  });

  it("includes quadratic bezier extremes beyond the endpoints", () => {
    // Peak at t = 0.5: y = 0.25*0 + 0.5*(-10) + 0.25*0 = -5
    const bounds = calculatePathDataBounds("M 0 0 Q 5 -10 10 0");
    expect(bounds!.y).toBeCloseTo(-5, 6);
  });

  it("parses compact number syntax (implicit minus separators)", () => {
    expect(calculatePathDataBounds("M10-20L30-40")).toEqual({
      x: 10, y: -40, width: 20, height: 20,
    });
  });

  it("covers all subpaths of compound path data", () => {
    const bounds = calculatePathDataBounds("M 0 0 L 10 0 L 10 10 Z M 90 90 L 100 90 L 100 100 Z");
    expect(bounds).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("returns null for empty path data", () => {
    expect(calculatePathDataBounds("")).toBeNull();
  });
});
