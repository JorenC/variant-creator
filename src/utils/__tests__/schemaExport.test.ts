import { describe, it, expect } from "vitest";
import { toSchemaVariant } from "../schemaExport";
import type { VariantDefinition, Province, NamedCoast } from "@/types/variant";

const BASE_POSITION = { x: 0, y: 0 };

function makeProvince(overrides: Partial<Province> & Pick<Province, "id" | "type">): Province {
  return {
    elementId: `el-${overrides.id}`,
    name: overrides.id.toUpperCase(),
    path: "M0,0 Z",
    homeNation: null,
    supplyCenter: false,
    startingUnit: null,
    adjacencies: [],
    labels: [],
    unitPosition: BASE_POSITION,
    dislodgedUnitPosition: BASE_POSITION,
    ...overrides,
  };
}

function makeCoast(overrides: Partial<NamedCoast> & Pick<NamedCoast, "id" | "parentId">): NamedCoast {
  return {
    name: overrides.id.toUpperCase(),
    path: "M0,0 Z",
    adjacencies: [],
    unitPosition: BASE_POSITION,
    dislodgedUnitPosition: BASE_POSITION,
    ...overrides,
  };
}

function makeVariant(overrides: Partial<VariantDefinition> = {}): VariantDefinition {
  return {
    name: "Test Variant",
    description: "desc",
    author: "author",
    version: "1.0.0",
    soloVictorySCCount: 18,
    startYear: 1901,
    nations: [],
    provinces: [],
    namedCoasts: [],
    decorativeElements: [],
    dimensions: { width: 1000, height: 800 },
    textElements: [],
    ...overrides,
  };
}

describe("toSchemaVariant – id generation", () => {
  it("converts variant name to kebab-case id", () => {
    const result = toSchemaVariant(makeVariant({ name: "My Great Variant" }));
    expect(result.id).toBe("my-great-variant");
  });

  it("falls back to 'my-variant' when name is empty", () => {
    const result = toSchemaVariant(makeVariant({ name: "" }));
    expect(result.id).toBe("my-variant");
  });

  it("falls back to 'my-variant' when name is only whitespace", () => {
    const result = toSchemaVariant(makeVariant({ name: "   " }));
    expect(result.id).toBe("my-variant");
  });

  it("strips special characters from name", () => {
    const result = toSchemaVariant(makeVariant({ name: "Variant! 2023" }));
    expect(result.id).toBe("variant-2023");
  });

  it("always sets schemaVersion to 1", () => {
    expect(toSchemaVariant(makeVariant()).schemaVersion).toBe(1);
  });

  it("passes through name, description, and author unchanged", () => {
    const result = toSchemaVariant(
      makeVariant({ name: "X", description: "d", author: "a" })
    );
    expect(result.name).toBe("X");
    expect(result.description).toBe("d");
    expect(result.author).toBe("a");
  });
});

describe("toSchemaVariant – victoryConditions", () => {
  it("emits supply-center-majority with soloVictorySCCount", () => {
    const result = toSchemaVariant(makeVariant({ soloVictorySCCount: 24 }));
    expect(result.victoryConditions).toEqual([
      { type: "supply-center-majority", supplyCenters: 24 },
    ]);
  });
});

describe("toSchemaVariant – nations", () => {
  it("maps nations to id/name/color tuples", () => {
    const result = toSchemaVariant(
      makeVariant({
        nations: [{ id: "france", name: "France", color: "#0000ff" }],
      })
    );
    expect(result.nations).toEqual([{ id: "france", name: "France", color: "#0000ff" }]);
  });
});

describe("toSchemaVariant – province type conversion", () => {
  it("passes land type through", () => {
    const result = toSchemaVariant(
      makeVariant({ provinces: [makeProvince({ id: "par", type: "land" })] })
    );
    expect(result.provinces[0].type).toBe("land");
  });

  it("passes sea type through", () => {
    const result = toSchemaVariant(
      makeVariant({ provinces: [makeProvince({ id: "nth", type: "sea" })] })
    );
    expect(result.provinces[0].type).toBe("sea");
  });

  it("passes coastal type through", () => {
    const result = toSchemaVariant(
      makeVariant({ provinces: [makeProvince({ id: "bre", type: "coastal" })] })
    );
    expect(result.provinces[0].type).toBe("coastal");
  });

  it("converts namedCoasts to land in schema output", () => {
    const result = toSchemaVariant(
      makeVariant({ provinces: [makeProvince({ id: "spa", type: "namedCoasts" })] })
    );
    expect(result.provinces[0].type).toBe("land");
  });

  it("preserves id, name, and supplyCenter", () => {
    const p = makeProvince({ id: "lon", type: "coastal", supplyCenter: true });
    p.name = "London";
    const result = toSchemaVariant(makeVariant({ provinces: [p] }));
    expect(result.provinces[0]).toMatchObject({ id: "lon", name: "London", supplyCenter: true });
  });

  it("includes homeNation when set", () => {
    const p = makeProvince({ id: "lon", type: "coastal", homeNation: "england" });
    const result = toSchemaVariant(makeVariant({ provinces: [p] }));
    expect(result.provinces[0].homeNation).toBe("england");
  });

  it("omits homeNation key when null", () => {
    const p = makeProvince({ id: "nth", type: "sea" });
    const result = toSchemaVariant(makeVariant({ provinces: [p] }));
    expect("homeNation" in result.provinces[0]).toBe(false);
  });
});

describe("toSchemaVariant – adjacency pass inference", () => {
  function adjacencyPass(from: Province, to: Province): "army" | "fleet" | "both" {
    const result = toSchemaVariant(
      makeVariant({ provinces: [{ ...from, adjacencies: [to.id] }, to] })
    );
    return result.provinces[0].adjacencies[0].pass;
  }

  it("land ↔ land → army", () => {
    expect(adjacencyPass(
      makeProvince({ id: "a", type: "land" }),
      makeProvince({ id: "b", type: "land" })
    )).toBe("army");
  });

  it("sea ↔ sea → fleet", () => {
    expect(adjacencyPass(
      makeProvince({ id: "a", type: "sea" }),
      makeProvince({ id: "b", type: "sea" })
    )).toBe("fleet");
  });

  it("sea ↔ land → fleet (sea side)", () => {
    expect(adjacencyPass(
      makeProvince({ id: "a", type: "sea" }),
      makeProvince({ id: "b", type: "land" })
    )).toBe("fleet");
  });

  it("land ↔ sea → fleet (land side)", () => {
    expect(adjacencyPass(
      makeProvince({ id: "a", type: "land" }),
      makeProvince({ id: "b", type: "sea" })
    )).toBe("fleet");
  });

  it("coastal ↔ coastal → both", () => {
    expect(adjacencyPass(
      makeProvince({ id: "a", type: "coastal" }),
      makeProvince({ id: "b", type: "coastal" })
    )).toBe("both");
  });

  it("coastal ↔ land → army", () => {
    expect(adjacencyPass(
      makeProvince({ id: "a", type: "coastal" }),
      makeProvince({ id: "b", type: "land" })
    )).toBe("army");
  });

  it("namedCoasts ↔ land → army (not fleet)", () => {
    expect(adjacencyPass(
      makeProvince({ id: "a", type: "namedCoasts" }),
      makeProvince({ id: "b", type: "land" })
    )).toBe("army");
  });

  it("namedCoasts ↔ sea → army (not fleet)", () => {
    expect(adjacencyPass(
      makeProvince({ id: "a", type: "namedCoasts" }),
      makeProvince({ id: "b", type: "sea" })
    )).toBe("army");
  });

  it("namedCoasts ↔ coastal → army", () => {
    expect(adjacencyPass(
      makeProvince({ id: "a", type: "namedCoasts" }),
      makeProvince({ id: "b", type: "coastal" })
    )).toBe("army");
  });

  it("land ↔ namedCoasts → army (symmetric)", () => {
    expect(adjacencyPass(
      makeProvince({ id: "a", type: "land" }),
      makeProvince({ id: "b", type: "namedCoasts" })
    )).toBe("army");
  });

  it("adjacency to coast ID containing '/' → fleet regardless of province types", () => {
    const from = makeProvince({ id: "a", type: "land", adjacencies: ["spa/nc"] });
    const result = toSchemaVariant(makeVariant({ provinces: [from] }));
    expect(result.provinces[0].adjacencies[0]).toEqual({ to: "spa/nc", pass: "fleet" });
  });

  it("adjacency to unknown province id → army (fallback)", () => {
    const from = makeProvince({ id: "a", type: "coastal", adjacencies: ["unknown"] });
    const result = toSchemaVariant(makeVariant({ provinces: [from] }));
    expect(result.provinces[0].adjacencies[0]).toEqual({ to: "unknown", pass: "army" });
  });
});

describe("toSchemaVariant – namedCoasts", () => {
  it("converts named coasts with id, name, parentProvince", () => {
    const coast = makeCoast({ id: "spa/nc", parentId: "spa", name: "Spain North Coast" });
    const result = toSchemaVariant(makeVariant({ namedCoasts: [coast] }));
    expect(result.namedCoasts[0]).toMatchObject({
      id: "spa/nc",
      name: "Spain North Coast",
      parentProvince: "spa",
    });
  });

  it("named coast adjacencies are always fleet", () => {
    const coast = makeCoast({
      id: "spa/nc",
      parentId: "spa",
      adjacencies: ["mid", "gas", "lyo"],
    });
    const result = toSchemaVariant(makeVariant({ namedCoasts: [coast] }));
    expect(result.namedCoasts[0].adjacencies).toEqual([
      { to: "mid", pass: "fleet" },
      { to: "gas", pass: "fleet" },
      { to: "lyo", pass: "fleet" },
    ]);
  });

  it("empty namedCoasts produces empty array", () => {
    const result = toSchemaVariant(makeVariant({ namedCoasts: [] }));
    expect(result.namedCoasts).toEqual([]);
  });
});

describe("toSchemaVariant – initialState", () => {
  it("startYear becomes initial phase year", () => {
    const result = toSchemaVariant(makeVariant({ startYear: 1914 }));
    expect(result.initialState.phase).toEqual({
      season: "Spring",
      year: 1914,
      type: "Movement",
    });
  });

  it("province with startingUnit and homeNation produces a unit", () => {
    const p = makeProvince({
      id: "lon",
      type: "coastal",
      homeNation: "england",
      startingUnit: { type: "Fleet" },
    });
    const result = toSchemaVariant(makeVariant({ provinces: [p] }));
    expect(result.initialState.units).toEqual([
      { nation: "england", type: "Fleet", location: "lon" },
    ]);
  });

  it("fleet with coast uses coast as location, not province id", () => {
    const p = makeProvince({
      id: "spa",
      type: "namedCoasts",
      homeNation: "spain",
      startingUnit: { type: "Fleet", coast: "spa/sc" },
    });
    const result = toSchemaVariant(makeVariant({ provinces: [p] }));
    expect(result.initialState.units[0].location).toBe("spa/sc");
  });

  it("fleet on namedCoasts without coast falls back to province id", () => {
    const p = makeProvince({
      id: "spa",
      type: "namedCoasts",
      homeNation: "spain",
      startingUnit: { type: "Fleet" },
    });
    const result = toSchemaVariant(makeVariant({ provinces: [p] }));
    expect(result.initialState.units[0].location).toBe("spa");
  });

  it("province without startingUnit produces no unit", () => {
    const p = makeProvince({ id: "par", type: "land", homeNation: "france" });
    const result = toSchemaVariant(makeVariant({ provinces: [p] }));
    expect(result.initialState.units).toHaveLength(0);
  });

  it("province without homeNation produces no unit even if startingUnit is set", () => {
    const p = makeProvince({
      id: "par",
      type: "land",
      startingUnit: { type: "Army" },
    });
    const result = toSchemaVariant(makeVariant({ provinces: [p] }));
    expect(result.initialState.units).toHaveLength(0);
  });

  it("SC with homeNation appears in supplyCenters", () => {
    const p = makeProvince({
      id: "lon",
      type: "coastal",
      homeNation: "england",
      supplyCenter: true,
    });
    const result = toSchemaVariant(makeVariant({ provinces: [p] }));
    expect(result.initialState.supplyCenters).toEqual([
      { nation: "england", province: "lon" },
    ]);
  });

  it("neutral SC (no homeNation) is not included in supplyCenters", () => {
    const p = makeProvince({ id: "bel", type: "coastal", supplyCenter: true });
    const result = toSchemaVariant(makeVariant({ provinces: [p] }));
    expect(result.initialState.supplyCenters).toHaveLength(0);
  });

  it("non-SC province is not included in supplyCenters", () => {
    const p = makeProvince({
      id: "gas",
      type: "coastal",
      homeNation: "france",
      supplyCenter: false,
    });
    const result = toSchemaVariant(makeVariant({ provinces: [p] }));
    expect(result.initialState.supplyCenters).toHaveLength(0);
  });

  it("multiple units and supply centers are collected across provinces", () => {
    const provinces = [
      makeProvince({
        id: "lon",
        type: "coastal",
        homeNation: "england",
        supplyCenter: true,
        startingUnit: { type: "Fleet" },
      }),
      makeProvince({
        id: "par",
        type: "land",
        homeNation: "france",
        supplyCenter: true,
        startingUnit: { type: "Army" },
      }),
      makeProvince({ id: "nth", type: "sea" }),
    ];
    const result = toSchemaVariant(makeVariant({ provinces }));
    expect(result.initialState.units).toHaveLength(2);
    expect(result.initialState.supplyCenters).toHaveLength(2);
  });
});
