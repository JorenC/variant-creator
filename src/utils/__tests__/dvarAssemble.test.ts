import { describe, it, expect } from "vitest";
import {
  toSlug,
  buildInitialProvinces,
  buildInitialDominanceRules,
  assembleDvar,
  orderTransitionsIntoChain,
  reconcileHomeNationsWithProvinces,
  NEUTRAL_REBUILD_MODIFIER,
  BUILD_ANYWHERE_MODIFIER,
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

  it("emits the neutral-rebuild modifier when present, alongside other modifiers", () => {
    const input = baseInput();
    input.adjudicationModifiersData = [BUILD_ANYWHERE_MODIFIER, NEUTRAL_REBUILD_MODIFIER];
    const out = assembleDvar(input) as Record<string, unknown>;
    expect(out.adjudicationModifiers).toEqual([BUILD_ANYWHERE_MODIFIER, NEUTRAL_REBUILD_MODIFIER]);
    expect(NEUTRAL_REBUILD_MODIFIER).toBe("neutral-nations-auto-build");
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

    it("includes extra units whose nation is neutral, owned by the neutral power", () => {
      const input = baseInput();
      input.provincesData.provinces.push({ id: "bur", name: "Burgundy", type: "land", supplyCenter: false, namedCoasts: [] });
      input.extraUnits = [{ id: "1", province: "bur", nation: "neutral", unit: "army", coast: null }];
      const out = assembleDvar(input) as Record<string, unknown>;
      const { units } = out.initialState as { units: Array<{ location: string; nation: string }> };
      expect(units).toContainEqual({ nation: "neutral", type: "Army", location: "bur" });
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

  it("excludes empty owners but keeps neutral owners in units and supply centers", () => {
    const input = baseInput();
    input.homeNationsData = {
      par: { nation: "neutral", startingUnit: "army", startingCoast: null },
      bre: { nation: "", startingUnit: "fleet", startingCoast: null },
    };
    const out = assembleDvar(input) as Record<string, unknown>;
    const initialState = out.initialState as Record<string, unknown>;
    expect(initialState.units).toEqual([{ nation: "neutral", type: "Army", location: "par" }]);
    expect(initialState.supplyCenters).toEqual([{ nation: "neutral", province: "par" }]);
  });
});

describe("assembleDvar – neutral (non_playable) nation", () => {
  const neutralNation = (out: Record<string, unknown>) =>
    (out.nations as Array<{ id: string; name: string; color: string; non_playable?: boolean }>)
      .find(n => n.id === "neutral");

  it("appends a grey non_playable neutral nation when a neutral SC has a unit", () => {
    const input = baseInput();
    input.homeNationsData = {
      par: { nation: "neutral", startingUnit: "army", startingCoast: null },
    };
    const out = assembleDvar(input) as Record<string, unknown>;
    expect(neutralNation(out)).toEqual({ id: "neutral", name: "Neutral", color: "#9E9E9E", non_playable: true });
  });

  it("appends the neutral nation for a neutral SC with no unit", () => {
    const input = baseInput();
    input.homeNationsData = {
      par: { nation: "neutral", startingUnit: null, startingCoast: null },
    };
    const out = assembleDvar(input) as Record<string, unknown>;
    expect(neutralNation(out)).toBeDefined();
    const initialState = out.initialState as Record<string, unknown>;
    expect(initialState.units).toEqual([]);
    expect(initialState.supplyCenters).toEqual([{ nation: "neutral", province: "par" }]);
  });

  it("appends the neutral nation for a neutral unit with no SC", () => {
    const input = baseInput();
    input.homeNationsData = { par: { nation: "fra", startingUnit: "army", startingCoast: null } };
    input.provincesData.provinces.push({ id: "bur", name: "Burgundy", type: "land", supplyCenter: false, namedCoasts: [] });
    input.extraUnits = [{ id: "1", province: "bur", nation: "neutral", unit: "army", coast: null }];
    const out = assembleDvar(input) as Record<string, unknown>;
    expect(neutralNation(out)).toBeDefined();
  });

  it("does not append the neutral nation when nothing is assigned to neutral", () => {
    const out = assembleDvar(baseInput()) as Record<string, unknown>;
    expect(neutralNation(out)).toBeUndefined();
  });

  it("output with a neutral nation passes DvarSchema", () => {
    const input = baseInput();
    input.nations = [{ id: "fra", name: "France", color: "#ffffff" }];
    input.homeNationsData = {
      par: { nation: "neutral", startingUnit: "army", startingCoast: null },
    };
    const result = DvarSchema.safeParse(assembleDvar(input));
    if (!result.success) {
      throw new Error(
        "assembleDvar output with a neutral nation failed schema validation:\n" +
        result.error.issues.map(i => `  ${i.path.join(".")}: ${i.message}`).join("\n")
      );
    }
    expect(result.data.nations.find(n => n.id === "neutral")?.non_playable).toBe(true);
  });
});

describe("assembleDvar – dominance neutral references the neutral power", () => {
  it('exports the "neutral" sentinel as the neutral nation id, and "empty" as "Empty"', () => {
    const input = baseInput();
    input.dominanceRulesData = {
      bur: { enabled: true, provinceOccupier: "neutral", conditions: { par: "neutral", bre: "empty" } },
    };
    const out = assembleDvar(input) as { dominanceRules?: Array<{ nation: string; dependencies: Array<{ province: string; nation: string }> }> };
    expect(out.dominanceRules![0].nation).toBe("neutral");
    const deps = Object.fromEntries(out.dominanceRules![0].dependencies.map(d => [d.province, d.nation]));
    expect(deps.par).toBe("neutral");
    expect(deps.bre).toBe("Empty");
  });

  it("synthesizes the neutral nation when only a dominance rule references it", () => {
    const input = baseInput();
    input.dominanceRulesData = {
      bur: { enabled: true, provinceOccupier: "neutral", conditions: {} },
    };
    const out = assembleDvar(input) as Record<string, unknown>;
    const neutral = (out.nations as Array<{ id: string; non_playable?: boolean }>).find(n => n.id === "neutral");
    expect(neutral?.non_playable).toBe(true);
  });
});

describe("assembleDvar – neutral name", () => {
  it("uses the provided neutralName for the synthesized power", () => {
    const input = baseInput();
    input.homeNationsData = { par: { nation: "neutral", startingUnit: "army", startingCoast: null } };
    input.neutralName = "Bandits";
    const out = assembleDvar(input) as Record<string, unknown>;
    const neutral = (out.nations as Array<{ id: string; name: string }>).find(n => n.id === "neutral");
    expect(neutral?.name).toBe("Bandits");
  });

  it("falls back to \"Neutral\" when neutralName is blank", () => {
    const input = baseInput();
    input.homeNationsData = { par: { nation: "neutral", startingUnit: "army", startingCoast: null } };
    input.neutralName = "   ";
    const out = assembleDvar(input) as Record<string, unknown>;
    const neutral = (out.nations as Array<{ id: string; name: string }>).find(n => n.id === "neutral");
    expect(neutral?.name).toBe("Neutral");
  });
});

describe("orderTransitionsIntoChain", () => {
  const t = (fs: string, ft: string, ts: string, tt: string, delta = 0) => ({
    from: { season: fs, type: ft },
    to: { season: ts, type: tt, yearDelta: delta },
  });

  it("reorders shuffled transitions into their from→to chain", () => {
    const shuffled = [
      t("Fall", "Movement", "Fall", "Adjustment"),
      t("Spring", "Movement", "Fall", "Movement"),
      t("Fall", "Adjustment", "Spring", "Movement", 1),
    ];
    const ordered = orderTransitionsIntoChain(shuffled, { season: "Spring", type: "Movement" });
    expect(ordered.map(x => `${x.from.season} ${x.from.type}`)).toEqual([
      "Spring Movement",
      "Fall Movement",
      "Fall Adjustment",
    ]);
  });

  it("leaves transitions untouched when any carry a condition", () => {
    const transitions = [
      { ...t("Fall", "Adjustment", "Spring", "Movement", 1), condition: { yearMod: 10 } },
      t("Spring", "Movement", "Fall", "Adjustment"),
    ];
    expect(orderTransitionsIntoChain(transitions)).toBe(transitions);
  });

  it("leaves transitions untouched when the chain is broken", () => {
    const transitions = [
      t("Spring", "Movement", "Fall", "Movement"),
      t("Winter", "Adjustment", "Spring", "Movement", 1),
    ];
    expect(orderTransitionsIntoChain(transitions)).toBe(transitions);
  });
});

describe("reconcileHomeNationsWithProvinces", () => {
  const provinces = [
    { id: "par", name: "Paris", type: "land" as const, supplyCenter: true, namedCoasts: [] },
    { id: "bre", name: "Brest", type: "coastal" as const, supplyCenter: true, namedCoasts: [] },
    { id: "mao", name: "Mid-Atlantic", type: "sea" as const, supplyCenter: false, namedCoasts: [] },
  ];

  it("clears units that no longer match the province terrain", () => {
    const { homeNations } = reconcileHomeNationsWithProvinces(
      { par: { nation: "fra", startingUnit: "fleet", startingCoast: null } },
      null,
      provinces
    );
    expect(homeNations.par).toEqual({ nation: "fra", startingUnit: null, startingCoast: null });
  });

  it("drops entries for de-flagged SCs and adds blanks for new ones", () => {
    const { homeNations } = reconcileHomeNationsWithProvinces(
      { mao: { nation: "fra", startingUnit: "fleet", startingCoast: null } },
      null,
      provinces
    );
    expect(homeNations.mao).toBeUndefined();
    expect(homeNations.par).toEqual({ nation: "", startingUnit: null, startingCoast: null });
    expect(homeNations.bre).toEqual({ nation: "", startingUnit: null, startingCoast: null });
  });

  it("clears stale coasts and invalid extra units", () => {
    const spa = { id: "spa", name: "Spain", type: "land" as const, supplyCenter: true, namedCoasts: [{ id: "spa/nc", name: "NC" }] };
    const { homeNations, extraUnits } = reconcileHomeNationsWithProvinces(
      { spa: { nation: "fra", startingUnit: "fleet", startingCoast: "spa/sc" } },
      [{ id: "x", province: "mao", nation: "fra", unit: "army", coast: null }],
      [...provinces, spa]
    );
    // fleet is invalid on the (land) multi-coast parent and the coast no longer exists
    expect(homeNations.spa).toEqual({ nation: "fra", startingUnit: null, startingCoast: null });
    expect(extraUnits![0].unit).toBeNull();
  });
});
