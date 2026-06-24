import { describe, it, expect } from "vitest";
import { computeMismatches, applyIdRemapping, collectPreFillWarnings } from "../dvarReconcile";
import type { DvarJson } from "@/types/dvar";

describe("computeMismatches", () => {
  it("classifies IDs present in only one of dVAR / dSVG", () => {
    const dvar: DvarJson = {
      provinces: [
        { id: "fra", name: "France", type: "land", supplyCenter: true, adjacencies: [] },
        { id: "old", name: "Old", type: "land", supplyCenter: false, adjacencies: [] },
      ],
      namedCoasts: [
        { id: "spa/sc", name: "Spain SC", parentProvince: "spa", adjacencies: [] },
      ],
    };
    const dsvg = { provinceIds: ["fra", "ger"], namedCoastIds: ["spa/nc"] };

    const result = computeMismatches(dvar, dsvg);

    expect(result.missingProvinces).toEqual(["old"]);
    expect(result.newProvinces).toEqual(["ger"]);
    expect(result.missingCoasts).toEqual(["spa/sc"]);
    expect(result.newCoasts).toEqual(["spa/nc"]);
  });

  it("reports no mismatches when IDs match exactly", () => {
    const dvar: DvarJson = {
      provinces: [{ id: "fra", name: "France", type: "land", supplyCenter: true, adjacencies: [] }],
    };
    const dsvg = { provinceIds: ["fra"], namedCoastIds: [] };

    const result = computeMismatches(dvar, dsvg);

    expect(result.missingProvinces).toEqual([]);
    expect(result.newProvinces).toEqual([]);
    expect(result.missingCoasts).toEqual([]);
    expect(result.newCoasts).toEqual([]);
  });
});

describe("applyIdRemapping", () => {
  it("renames a province and updates references to it", () => {
    const dvar: DvarJson = {
      provinces: [
        { id: "old", name: "Old", type: "land", supplyCenter: true, adjacencies: [{ to: "ger", pass: "army" }] },
        { id: "ger", name: "Germany", type: "land", supplyCenter: true, adjacencies: [{ to: "old", pass: "army" }] },
      ],
      initialState: {
        supplyCenters: [{ nation: "F", province: "old" }],
        units: [{ nation: "F", type: "Army", location: "old" }],
      },
      dominanceRules: [
        { province: "old", nation: "F", dependencies: [{ province: "ger", nation: "G" }] },
      ],
      victoryConditions: [{ type: "province-control", provinces: ["old", "ger"] }],
    };

    const result = applyIdRemapping(dvar, { old: "new" }, {});

    expect(result.provinces?.map(p => p.id)).toEqual(["new", "ger"]);
    expect(result.provinces?.find(p => p.id === "ger")?.adjacencies[0].to).toBe("new");
    expect(result.initialState?.supplyCenters?.[0].province).toBe("new");
    expect(result.initialState?.units?.[0].location).toBe("new");
    expect(result.dominanceRules?.[0].province).toBe("new");
    const vc = result.victoryConditions?.[0];
    expect(vc?.type === "province-control" && vc.provinces).toEqual(["new", "ger"]);
  });

  it("drops a province (and references to it) when mapped to null", () => {
    const dvar: DvarJson = {
      provinces: [
        { id: "gone", name: "Gone", type: "land", supplyCenter: false, adjacencies: [] },
        { id: "ger", name: "Germany", type: "land", supplyCenter: true, adjacencies: [{ to: "gone", pass: "army" }] },
      ],
      initialState: {
        units: [{ nation: "F", type: "Army", location: "gone" }],
      },
    };

    const result = applyIdRemapping(dvar, { gone: null }, {});

    expect(result.provinces?.map(p => p.id)).toEqual(["ger"]);
    expect(result.provinces?.find(p => p.id === "ger")?.adjacencies).toEqual([]);
    expect(result.initialState?.units).toEqual([]);
  });

  it("remaps a named coast via the coast map (location with a slash)", () => {
    const dvar: DvarJson = {
      namedCoasts: [
        { id: "spa/sc", name: "Spain SC", parentProvince: "spa", adjacencies: [] },
      ],
      provinces: [
        { id: "spa", name: "Spain", type: "coastal", supplyCenter: true, adjacencies: [] },
      ],
      initialState: {
        units: [{ nation: "F", type: "Fleet", location: "spa/sc" }],
      },
    };

    const result = applyIdRemapping(dvar, {}, { "spa/sc": "spa/nc" });

    expect(result.namedCoasts?.[0].id).toBe("spa/nc");
    expect(result.initialState?.units?.[0].location).toBe("spa/nc");
  });
});

describe("collectPreFillWarnings", () => {
  it("returns no warnings for a clean dvar", () => {
    const dvar: DvarJson = {
      provinces: [
        { id: "lon", name: "London", type: "coastal", supplyCenter: true, adjacencies: [] },
      ],
      initialState: {
        supplyCenters: [{ nation: "England", province: "lon" }],
        units: [{ nation: "England", type: "Fleet", location: "lon" }],
      },
      adjudicationModifiers: ["allow-builds-in-non-home-centers"],
    };

    expect(collectPreFillWarnings(dvar)).toEqual([]);
  });

  it("returns no warnings when there are no units or modifiers", () => {
    const dvar: DvarJson = {};

    expect(collectPreFillWarnings(dvar)).toEqual([]);
  });

  it("warns when two units compete for the same home-nation SC province", () => {
    const dvar: DvarJson = {
      initialState: {
        supplyCenters: [{ nation: "England", province: "lon" }],
        units: [
          { nation: "England", type: "Army", location: "lon" },
          { nation: "England", type: "Fleet", location: "lon" },
        ],
      },
    };

    const warnings = collectPreFillWarnings(dvar);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/lon/);
    expect(warnings[0]).toMatch(/2/);
    expect(warnings[0]).toMatch(/1 dropped/);
  });

  it("warns once per province, counting all duplicates", () => {
    const dvar: DvarJson = {
      initialState: {
        supplyCenters: [{ nation: "France", province: "par" }],
        units: [
          { nation: "France", type: "Army", location: "par" },
          { nation: "France", type: "Army", location: "par" },
          { nation: "France", type: "Army", location: "par" },
        ],
      },
    };

    const warnings = collectPreFillWarnings(dvar);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/par/);
    expect(warnings[0]).toMatch(/3/);
    expect(warnings[0]).toMatch(/2 dropped/);
  });

  it("does not warn for a unit whose nation differs from the SC nation (goes to extraUnits, not dropped)", () => {
    const dvar: DvarJson = {
      initialState: {
        supplyCenters: [{ nation: "England", province: "lon" }],
        units: [
          { nation: "England", type: "Fleet", location: "lon" },
          { nation: "France", type: "Army", location: "lon" },
        ],
      },
    };

    expect(collectPreFillWarnings(dvar)).toEqual([]);
  });

  it("does not warn for a unit at a non-SC province (goes to extraUnits, not dropped)", () => {
    const dvar: DvarJson = {
      initialState: {
        supplyCenters: [{ nation: "England", province: "lon" }],
        units: [
          { nation: "England", type: "Fleet", location: "lon" },
          { nation: "England", type: "Army", location: "yor" },
        ],
      },
    };

    expect(collectPreFillWarnings(dvar)).toEqual([]);
  });

  it("warns about duplicate home-nation units on a coast location (slash notation)", () => {
    const dvar: DvarJson = {
      initialState: {
        supplyCenters: [{ nation: "Russia", province: "stp" }],
        units: [
          { nation: "Russia", type: "Fleet", location: "stp/nc" },
          { nation: "Russia", type: "Fleet", location: "stp/sc" },
        ],
      },
    };

    const warnings = collectPreFillWarnings(dvar);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/stp/);
  });

  it("warns for an unknown adjudication modifier", () => {
    const dvar: DvarJson = {
      adjudicationModifiers: ["ScLevelPayoffs"],
    };

    const warnings = collectPreFillWarnings(dvar);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/ScLevelPayoffs/);
  });

  it("does not warn for the neutral-nations-auto-build modifier (round-trips via the export step's Neutrals rebuild toggle)", () => {
    const dvar: DvarJson = {
      adjudicationModifiers: ["neutral-nations-auto-build"],
    };

    expect(collectPreFillWarnings(dvar)).toEqual([]);
  });

  it("warns for each unknown modifier independently", () => {
    const dvar: DvarJson = {
      adjudicationModifiers: ["ScLevelPayoffs", "ChaosDiplomacy", "allow-builds-in-non-home-centers"],
    };

    const warnings = collectPreFillWarnings(dvar);
    expect(warnings).toHaveLength(2);
    expect(warnings.some(w => w.includes("ScLevelPayoffs"))).toBe(true);
    expect(warnings.some(w => w.includes("ChaosDiplomacy"))).toBe(true);
  });

  it("combines unit and modifier warnings in the same result", () => {
    const dvar: DvarJson = {
      initialState: {
        supplyCenters: [{ nation: "England", province: "lon" }],
        units: [
          { nation: "England", type: "Army", location: "lon" },
          { nation: "England", type: "Fleet", location: "lon" },
        ],
      },
      adjudicationModifiers: ["UnknownRule"],
    };

    const warnings = collectPreFillWarnings(dvar);
    expect(warnings).toHaveLength(2);
    expect(warnings.some(w => w.includes("lon"))).toBe(true);
    expect(warnings.some(w => w.includes("UnknownRule"))).toBe(true);
  });
});
