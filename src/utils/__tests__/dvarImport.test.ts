import { describe, it, expect } from "vitest";
import { sanitizeDvarImport } from "../dvarImport";

describe("sanitizeDvarImport", () => {
  it("returns null for non-object input", () => {
    expect(sanitizeDvarImport(null)).toBeNull();
    expect(sanitizeDvarImport("a string")).toBeNull();
    expect(sanitizeDvarImport([1, 2, 3])).toBeNull();
  });

  it("fills defaults for a province missing adjacencies instead of crashing later", () => {
    const result = sanitizeDvarImport({
      provinces: [{ id: "par", name: "Paris", type: "land", supplyCenter: true }],
    });
    expect(result).not.toBeNull();
    expect(result!.dvar.provinces).toEqual([
      { id: "par", name: "Paris", type: "land", supplyCenter: true, adjacencies: [] },
    ]);
    expect(result!.dropped).toEqual([]);
  });

  it("drops malformed entries and reports them", () => {
    const result = sanitizeDvarImport({
      nations: [{ id: "fra", name: "France", color: "#FF0000" }, { name: "no id" }],
      provinces: [{ id: "par", adjacencies: [{ to: "bur", pass: "army" }, { pass: "army" }] }],
      initialState: {
        units: [{ nation: "fra", type: "Army", location: "par" }, { nation: "fra" }],
      },
    })!;
    expect(result.dvar.nations).toHaveLength(1);
    expect(result.dvar.provinces![0].adjacencies).toEqual([{ to: "bur", pass: "army" }]);
    expect(result.dvar.initialState!.units).toHaveLength(1);
    expect(result.dropped.length).toBe(3);
  });

  it("preserves transition conditions so pre-fill warnings can report them", () => {
    const result = sanitizeDvarImport({
      phaseProgression: {
        seasons: ["Spring"],
        transitions: [
          {
            from: { season: "Spring", type: "Movement" },
            to: { season: "Spring", type: "Movement", yearDelta: 5 },
            condition: { yearMod: 10, yearModValue: 5 },
          },
        ],
      },
    })!;
    expect(result.dvar.phaseProgression!.transitions![0].condition).toEqual({
      yearMod: 10,
      yearModValue: 5,
    });
  });

  it("keeps well-formed victory conditions and drops unrecognized ones", () => {
    const result = sanitizeDvarImport({
      victoryConditions: [
        { type: "supply-center-majority", supplyCenters: 18 },
        { type: "province-control", provinces: ["par", 42, "mos"] },
        { type: "mystery-mode" },
      ],
    })!;
    expect(result.dvar.victoryConditions).toEqual([
      { type: "supply-center-majority", supplyCenters: 18 },
      { type: "province-control", provinces: ["par", "mos"] },
    ]);
    expect(result.dropped.some(d => d.includes("mystery-mode"))).toBe(true);
  });
});
