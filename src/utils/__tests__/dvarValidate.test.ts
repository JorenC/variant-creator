import { describe, it, expect } from "vitest";
import { validateDvarSemantics } from "../dvarValidate";
import type { DvarOutput } from "../dvarSchema";

function baseDvar(): DvarOutput {
  return {
    schemaVersion: 1,
    id: "test",
    name: "Test",
    description: "d",
    author: "a",
    victoryConditions: [{ type: "supply-center-majority", supplyCenters: 2 }],
    phaseProgression: {
      seasons: ["Spring", "Fall"],
      transitions: [
        { from: { season: "Spring", type: "Movement" }, to: { season: "Fall", type: "Movement", yearDelta: 0 } },
        { from: { season: "Fall", type: "Movement" }, to: { season: "Spring", type: "Movement", yearDelta: 1 } },
      ],
    },
    nations: [{ id: "fra", name: "France", color: "#FF0000" }],
    provinces: [
      {
        id: "par", name: "Paris", type: "land", supplyCenter: true, homeNation: "fra",
        adjacencies: [{ to: "bur", pass: "army" }],
      },
      {
        id: "bur", name: "Burgundy", type: "land", supplyCenter: false,
        adjacencies: [{ to: "par", pass: "army" }],
      },
    ],
    namedCoasts: [],
    initialState: {
      phase: { season: "Spring", year: 1901, type: "Movement" },
      units: [{ nation: "fra", type: "Army", location: "par" }],
      supplyCenters: [{ nation: "fra", province: "par" }],
    },
  };
}

describe("validateDvarSemantics", () => {
  it("accepts a consistent variant", () => {
    expect(validateDvarSemantics(baseDvar())).toEqual([]);
  });

  it("rejects one-way adjacencies", () => {
    const dvar = baseDvar();
    dvar.provinces[1].adjacencies = [];
    const errors = validateDvarSemantics(dvar);
    expect(errors.some(e => e.includes("one-way"))).toBe(true);
  });

  it("rejects adjacency pass mismatches", () => {
    const dvar = baseDvar();
    dvar.provinces[1].adjacencies = [{ to: "par", pass: "both" }];
    const errors = validateDvarSemantics(dvar);
    expect(errors.some(e => e.includes("disagrees on pass type"))).toBe(true);
  });

  it("rejects adjacencies to unknown locations", () => {
    const dvar = baseDvar();
    dvar.provinces[0].adjacencies.push({ to: "ghost", pass: "army" });
    const errors = validateDvarSemantics(dvar);
    expect(errors.some(e => e.includes("unknown province or coast"))).toBe(true);
  });

  it("rejects unknown nation references in units, SCs and homeNation", () => {
    const dvar = baseDvar();
    dvar.initialState.units[0].nation = "ghost";
    dvar.initialState.supplyCenters[0].nation = "ghost";
    dvar.provinces[0].homeNation = "ghost";
    const errors = validateDvarSemantics(dvar);
    expect(errors.filter(e => e.includes("ghost")).length).toBeGreaterThanOrEqual(3);
  });

  it("rejects units at unknown locations", () => {
    const dvar = baseDvar();
    dvar.initialState.units[0].location = "atlantis";
    const errors = validateDvarSemantics(dvar);
    expect(errors.some(e => e.includes("unknown location"))).toBe(true);
  });

  it("accepts Neutral as a dominance-rule nation but rejects unknown ones", () => {
    const dvar = baseDvar();
    dvar.dominanceRules = [
      { province: "bur", nation: "Neutral", dependencies: [{ province: "par", nation: "Empty" }] },
    ];
    expect(validateDvarSemantics(dvar)).toEqual([]);

    dvar.dominanceRules = [
      { province: "bur", nation: "neutral", dependencies: [] },
    ];
    const errors = validateDvarSemantics(dvar);
    expect(errors.some(e => e.includes('"neutral"'))).toBe(true);
  });

  it("rejects named coasts with unknown parents", () => {
    const dvar = baseDvar();
    dvar.namedCoasts = [{ id: "spa/nc", name: "NC", parentProvince: "spa", adjacencies: [] }];
    const errors = validateDvarSemantics(dvar);
    expect(errors.some(e => e.includes('parent province "spa"'))).toBe(true);
  });

  it("rejects two unconditional transitions from the same phase", () => {
    const dvar = baseDvar();
    dvar.phaseProgression.transitions.push({
      from: { season: "Spring", type: "Movement" },
      to: { season: "Fall", type: "Retreat", yearDelta: 0 },
    });
    const errors = validateDvarSemantics(dvar);
    expect(errors.some(e => e.includes("Two phase transitions"))).toBe(true);
  });

  it("rejects an opening season missing from the seasons list", () => {
    const dvar = baseDvar();
    dvar.initialState.phase.season = "Winter";
    const errors = validateDvarSemantics(dvar);
    expect(errors.some(e => e.includes('"Winter"'))).toBe(true);
  });

  it("rejects duplicate province and nation ids", () => {
    const dvar = baseDvar();
    dvar.provinces.push({ ...dvar.provinces[0] });
    dvar.nations.push({ ...dvar.nations[0] });
    const errors = validateDvarSemantics(dvar);
    expect(errors.some(e => e.includes('Duplicate province id "par"'))).toBe(true);
    expect(errors.some(e => e.includes('Duplicate nation id "fra"'))).toBe(true);
  });
});
