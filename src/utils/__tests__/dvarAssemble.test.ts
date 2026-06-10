import { describe, it, expect } from "vitest";
import {
  toSlug,
  buildInitialProvinces,
  buildInitialDominanceRules,
  assembleDvar,
} from "../dvarAssemble";
import { DvarSchema } from "../dvarSchema";
import type { AssembleDvarInput } from "@/types/dvar";

describe("toSlug", () => {
  it("lowercases, hyphenates, and trims", () => {
    expect(toSlug("Classical Europe")).toBe("classical-europe");
    expect(toSlug("  Hundred Years' War!  ")).toBe("hundred-years-war");
    expect(toSlug("already-slug")).toBe("already-slug");
  });
});

describe("buildInitialProvinces", () => {
  it("sorts provinces, names them after their IDs, and groups named coasts under parents", () => {
    const result = buildInitialProvinces({
      provinceIds: ["ger", "spa", "fra"],
      namedCoastIds: ["spa/nc", "spa/sc"],
    });

    expect(result.map(p => p.id)).toEqual(["fra", "ger", "spa"]);
    expect(result.every(p => p.name === p.id)).toBe(true);
    expect(result.every(p => (p.type as string) === "")).toBe(true);
    const spa = result.find(p => p.id === "spa");
    expect(spa?.namedCoasts.map(c => c.id)).toEqual(["spa/nc", "spa/sc"]);
  });
});

describe("buildInitialDominanceRules", () => {
  it("creates a (disabled) entry per non-SC province listing bordering SCs as conditions", () => {
    const adjacencies = {
      gas: [{ to: "spa", pass: "army" as const }, { to: "mar", pass: "army" as const }],
    };
    const provinces = [
      { id: "gas", supplyCenter: false },
      { id: "spa", supplyCenter: true },
      { id: "mar", supplyCenter: true },
    ];

    const result = buildInitialDominanceRules(adjacencies, provinces);

    expect(Object.keys(result)).toEqual(["gas"]); // SC provinces excluded
    expect(result.gas.enabled).toBe(false);
    expect(result.gas.provinceOccupier).toBe("empty");
    expect(Object.keys(result.gas.conditions).sort()).toEqual(["mar", "spa"]);
  });
});

function baseInput(): AssembleDvarInput {
  return {
    basicInfo: { id: "test", name: "Test", description: "d", author: "a", startYear: 1901, rules: "" },
    nations: [{ id: "fra", name: "France", color: "#fff" }],
    provincesData: {
      provinces: [
        { id: "par", name: "Paris", type: "land", supplyCenter: true, namedCoasts: [] },
      ],
    },
    homeNationsData: {
      par: { nation: "fra", startingUnit: "army", startingCoast: null },
    },
    extraUnits: [],
    adjacenciesData: { par: [{ to: "bur", pass: "army" }] },
    dominanceRulesData: {},
    phaseProgressionData: [
      { season: "Spring", type: "Movement", yearDelta: 0 },
      { season: "Fall", type: "Adjustment", yearDelta: 1 },
    ],
    victoryConditionsData: [{ type: "supply-center-majority", supplyCenters: 18 }],
    adjudicationModifiersData: [],
  };
}

describe("assembleDvar", () => {
  it("assembles core variant metadata, provinces, units and supply centers", () => {
    const out = assembleDvar(baseInput()) as Record<string, unknown>;

    expect(out.id).toBe("test");
    expect(out.schemaVersion).toBe(1);
    const provinces = out.provinces as Array<Record<string, unknown>>;
    expect(provinces[0].homeNation).toBe("fra");
    expect(provinces[0].adjacencies).toEqual([{ to: "bur", pass: "army" }]);
    const initialState = out.initialState as Record<string, unknown>;
    expect(initialState.units).toEqual([{ nation: "fra", type: "Army", location: "par" }]);
    expect(initialState.supplyCenters).toEqual([{ nation: "fra", province: "par" }]);
  });

  it("wraps phase transitions back to the first phase and increments the year", () => {
    const out = assembleDvar(baseInput()) as Record<string, unknown>;
    const pp = out.phaseProgression as { seasons: string[]; transitions: Array<Record<string, unknown>> };

    expect(pp.seasons).toEqual(["Spring", "Fall"]);
    expect(pp.transitions).toHaveLength(2);
    // last transition loops back to the first phase
    expect(pp.transitions[1].to).toEqual({ season: "Spring", type: "Movement", yearDelta: 1 });
  });

  it("omits optional fields when empty and includes them when present", () => {
    const withoutOptionals = assembleDvar(baseInput()) as Record<string, unknown>;
    expect(withoutOptionals.rules).toBeUndefined();
    expect(withoutOptionals.adjudicationModifiers).toBeUndefined();
    expect(withoutOptionals.dominanceRules).toBeUndefined();

    const input = baseInput();
    input.basicInfo.rules = "Be nice";
    input.adjudicationModifiersData = ["allow-builds-in-non-home-centers"];
    input.dominanceRulesData = {
      gas: { enabled: true, provinceOccupier: "fra", conditions: { spa: "empty" } },
    };
    const withOptionals = assembleDvar(input) as Record<string, unknown>;
    expect(withOptionals.rules).toBe("Be nice");
    expect(withOptionals.adjudicationModifiers).toEqual(["allow-builds-in-non-home-centers"]);
    expect((withOptionals.dominanceRules as unknown[]).length).toBe(1);
  });

  it("output passes DvarSchema — regression guard for canonical schema compliance", () => {
    // A complete input covering all optional fields: named coasts, rules,
    // dominance rules, adjudication modifiers, timed-resolution victory condition.
    const input: AssembleDvarInput = {
      basicInfo: { id: "test-variant", name: "Test Variant", description: "A test.", author: "Tester", startYear: 1901, rules: "Some rules." },
      nations: [
        { id: "fra", name: "France", color: "#80DEEA" },
        { id: "eng", name: "England", color: "#2196F3" },
      ],
      provincesData: {
        provinces: [
          { id: "par", name: "Paris", type: "land", supplyCenter: true, namedCoasts: [] },
          { id: "lon", name: "London", type: "coastal", supplyCenter: true, namedCoasts: [] },
          { id: "nth", name: "North Sea", type: "sea", supplyCenter: false, namedCoasts: [] },
          { id: "stp", name: "St. Petersburg", type: "land", supplyCenter: true, namedCoasts: [{ id: "stp/nc", name: "St. Petersburg (NC)" }, { id: "stp/sc", name: "St. Petersburg (SC)" }] },
        ],
      },
      homeNationsData: {
        par: { nation: "fra", startingUnit: "army", startingCoast: null },
        lon: { nation: "eng", startingUnit: "fleet", startingCoast: null },
        stp: { nation: "fra", startingUnit: "fleet", startingCoast: "stp/sc" },
      },
      extraUnits: [],
      adjacenciesData: {
        par: [{ to: "lon", pass: "army" }],
        lon: [{ to: "par", pass: "army" }, { to: "nth", pass: "fleet" }],
        nth: [{ to: "lon", pass: "fleet" }],
        "stp/nc": [{ to: "nth", pass: "fleet" }],
        "stp/sc": [{ to: "lon", pass: "fleet" }],
      },
      dominanceRulesData: {
        nth: { enabled: true, provinceOccupier: "fra", conditions: { par: "fra" } },
      },
      phaseProgressionData: [
        { season: "Spring", type: "Movement", yearDelta: 0 },
        { season: "Spring", type: "Retreat", yearDelta: 0 },
        { season: "Fall", type: "Movement", yearDelta: 0 },
        { season: "Fall", type: "Retreat", yearDelta: 0 },
        { season: "Fall", type: "Adjustment", yearDelta: 1 },
      ],
      victoryConditionsData: [
        { type: "supply-center-majority", supplyCenters: 18 },
        { type: "timed-resolution", year: 1920, resolution: "most-supply-centers" },
      ],
      adjudicationModifiersData: ["allow-builds-in-non-home-centers"],
    };

    const output = assembleDvar(input);
    const result = DvarSchema.safeParse(output);
    if (!result.success) {
      // Print the full error for easy debugging when this regression fires
      throw new Error(
        "assembleDvar output failed schema validation:\n" +
        result.error.issues.map(i => `  ${i.path.join(".")}: ${i.message}`).join("\n")
      );
    }
  });

  describe("startingUnit: null (N — no starting unit)", () => {
    it("omits the unit from initialState.units when startingUnit is null", () => {
      const input = baseInput();
      input.homeNationsData = {
        par: { nation: "fra", startingUnit: null, startingCoast: null },
      };
      const out = assembleDvar(input) as Record<string, unknown>;
      const initialState = out.initialState as Record<string, unknown>;
      expect(initialState.units).toEqual([]);
    });

    it("still emits the supply center in initialState.supplyCenters when startingUnit is null", () => {
      const input = baseInput();
      input.homeNationsData = {
        par: { nation: "fra", startingUnit: null, startingCoast: null },
      };
      const out = assembleDvar(input) as Record<string, unknown>;
      const initialState = out.initialState as Record<string, unknown>;
      expect(initialState.supplyCenters).toEqual([{ nation: "fra", province: "par" }]);
    });

    it("still sets homeNation on the province when startingUnit is null", () => {
      const input = baseInput();
      input.homeNationsData = {
        par: { nation: "fra", startingUnit: null, startingCoast: null },
      };
      const out = assembleDvar(input) as Record<string, unknown>;
      const provinces = out.provinces as Array<Record<string, unknown>>;
      expect(provinces[0].homeNation).toBe("fra");
    });

    it("only omits the unit-less province from units while keeping provinces with units", () => {
      const input = baseInput();
      input.provincesData = {
        provinces: [
          { id: "par", name: "Paris", type: "land", supplyCenter: true, namedCoasts: [] },
          { id: "bre", name: "Brest", type: "coastal", supplyCenter: true, namedCoasts: [] },
        ],
      };
      input.homeNationsData = {
        par: { nation: "fra", startingUnit: "army", startingCoast: null },
        bre: { nation: "fra", startingUnit: null, startingCoast: null },
      };
      const out = assembleDvar(input) as Record<string, unknown>;
      const initialState = out.initialState as Record<string, unknown>;
      expect(initialState.units).toEqual([{ nation: "fra", type: "Army", location: "par" }]);
      expect(initialState.supplyCenters).toEqual([
        { nation: "fra", province: "par" },
        { nation: "fra", province: "bre" },
      ]);
    });
  });

  describe("extraUnits", () => {
    it("appends an extra army on a non-SC province to initialState.units", () => {
      const input = baseInput();
      input.provincesData.provinces.push({ id: "bur", name: "Burgundy", type: "land", supplyCenter: false, namedCoasts: [] });
      input.extraUnits = [{ id: "1", province: "bur", nation: "fra", unit: "army", coast: null }];
      const out = assembleDvar(input) as Record<string, unknown>;
      const { units } = out.initialState as { units: unknown[]; supplyCenters: unknown[] };
      expect(units).toContainEqual({ nation: "fra", type: "Army", location: "bur" });
    });

    it("appends an extra fleet with a coast using the coast ID as location", () => {
      const input = baseInput();
      input.provincesData.provinces.push({
        id: "spa", name: "Spain", type: "coastal", supplyCenter: false,
        namedCoasts: [{ id: "spa/nc", name: "Spain (NC)" }, { id: "spa/sc", name: "Spain (SC)" }],
      });
      input.extraUnits = [{ id: "1", province: "spa", nation: "fra", unit: "fleet", coast: "spa/nc" }];
      const out = assembleDvar(input) as Record<string, unknown>;
      const { units } = out.initialState as { units: unknown[]; supplyCenters: unknown[] };
      expect(units).toContainEqual({ nation: "fra", type: "Fleet", location: "spa/nc" });
    });

    it("appends an extra fleet without a coast using the province ID as location", () => {
      const input = baseInput();
      input.provincesData.provinces.push({ id: "nth", name: "North Sea", type: "sea", supplyCenter: false, namedCoasts: [] });
      input.extraUnits = [{ id: "1", province: "nth", nation: "fra", unit: "fleet", coast: null }];
      const out = assembleDvar(input) as Record<string, unknown>;
      const { units } = out.initialState as { units: unknown[]; supplyCenters: unknown[] };
      expect(units).toContainEqual({ nation: "fra", type: "Fleet", location: "nth" });
    });

    it("does NOT add the extra unit's province to initialState.supplyCenters", () => {
      const input = baseInput();
      input.provincesData.provinces.push({ id: "bur", name: "Burgundy", type: "land", supplyCenter: false, namedCoasts: [] });
      input.extraUnits = [{ id: "1", province: "bur", nation: "fra", unit: "army", coast: null }];
      const out = assembleDvar(input) as Record<string, unknown>;
      const { supplyCenters } = out.initialState as { units: unknown[]; supplyCenters: Array<{ province: string }> };
      expect(supplyCenters.map(sc => sc.province)).not.toContain("bur");
    });

    it("does NOT set homeNation on the province for an extra unit", () => {
      const input = baseInput();
      input.provincesData.provinces.push({ id: "bur", name: "Burgundy", type: "land", supplyCenter: false, namedCoasts: [] });
      input.extraUnits = [{ id: "1", province: "bur", nation: "fra", unit: "army", coast: null }];
      const out = assembleDvar(input) as Record<string, unknown>;
      const provinces = out.provinces as Array<Record<string, unknown>>;
      const bur = provinces.find(p => p.id === "bur");
      expect(bur?.homeNation).toBeUndefined();
    });

    it("places an extra unit on an SC owned by another nation without touching that SC's supply center entry", () => {
      const input = baseInput();
      // par is fra's home SC with an army; eng places an extra unit there too (edge case)
      input.nations.push({ id: "eng", name: "England", color: "#00f" });
      input.extraUnits = [{ id: "1", province: "par", nation: "eng", unit: "army", coast: null }];
      const out = assembleDvar(input) as Record<string, unknown>;
      const { units, supplyCenters } = out.initialState as {
        units: Array<{ nation: string; type: string; location: string }>;
        supplyCenters: Array<{ nation: string; province: string }>;
      };
      expect(units).toContainEqual({ nation: "fra", type: "Army", location: "par" });
      expect(units).toContainEqual({ nation: "eng", type: "Army", location: "par" });
      // supplyCenters entry for par must still belong to fra, not eng
      expect(supplyCenters).toContainEqual({ nation: "fra", province: "par" });
      expect(supplyCenters.filter(sc => sc.province === "par")).toHaveLength(1);
    });

    it("home units and extra units both appear in initialState.units", () => {
      const input = baseInput();
      input.provincesData.provinces.push({ id: "bur", name: "Burgundy", type: "land", supplyCenter: false, namedCoasts: [] });
      input.extraUnits = [{ id: "1", province: "bur", nation: "fra", unit: "army", coast: null }];
      const out = assembleDvar(input) as Record<string, unknown>;
      const { units } = out.initialState as { units: Array<{ location: string }> };
      const locations = units.map(u => u.location);
      expect(locations).toContain("par"); // home unit
      expect(locations).toContain("bur"); // extra unit
    });

    it("excludes extra units whose nation is neutral", () => {
      const input = baseInput();
      input.provincesData.provinces.push({ id: "bur", name: "Burgundy", type: "land", supplyCenter: false, namedCoasts: [] });
      input.extraUnits = [{ id: "1", province: "bur", nation: "neutral", unit: "army", coast: null }];
      const out = assembleDvar(input) as Record<string, unknown>;
      const { units } = out.initialState as { units: Array<{ location: string }> };
      expect(units.map(u => u.location)).not.toContain("bur");
    });

    it("excludes extra units with a blank province or no unit type", () => {
      const input = baseInput();
      input.extraUnits = [
        { id: "1", province: "", nation: "fra", unit: "army", coast: null },
        { id: "2", province: "bur", nation: "fra", unit: null, coast: null },
      ];
      const out = assembleDvar(input) as Record<string, unknown>;
      const { units } = out.initialState as { units: Array<{ location: string }> };
      expect(units).toHaveLength(1); // only the home unit from baseInput
    });

    it("output with extra units passes DvarSchema", () => {
      const input = baseInput();
      input.nations = [{ id: "fra", name: "France", color: "#ffffff" }];
      input.provincesData.provinces.push({ id: "bur", name: "Burgundy", type: "land", supplyCenter: false, namedCoasts: [] });
      input.extraUnits = [{ id: "1", province: "bur", nation: "fra", unit: "army", coast: null }];
      const output = assembleDvar(input);
      const result = DvarSchema.safeParse(output);
      if (!result.success) {
        throw new Error(
          "assembleDvar output with extraUnits failed schema validation:\n" +
          result.error.issues.map(i => `  ${i.path.join(".")}: ${i.message}`).join("\n")
        );
      }
    });
  });

  it("excludes neutral / empty owners from units and supply centers", () => {
    const input = baseInput();
    input.homeNationsData = {
      par: { nation: "neutral", startingUnit: "army", startingCoast: null },
      bre: { nation: "", startingUnit: "fleet", startingCoast: null },
    };
    const out = assembleDvar(input) as Record<string, unknown>;
    const initialState = out.initialState as Record<string, unknown>;
    expect(initialState.units).toEqual([]);
    expect(initialState.supplyCenters).toEqual([]);
  });
});
