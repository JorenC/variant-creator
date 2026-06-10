import { describe, it, expect, vi, beforeEach } from "vitest";

// Paths that share the same bracketed tag, e.g. "[adj-ab]", are treated as intersecting.
vi.mock("../geometry", () => ({
  detectPathIntersections: vi.fn((pathA: string, pathB: string) => {
    const tagA = pathA.match(/\[([^\]]+)\]/)?.[1];
    const tagB = pathB.match(/\[([^\]]+)\]/)?.[1];
    return tagA !== undefined && tagA === tagB;
  }),
}));

import {
  buildEmptyDvarAdjacencyMap,
  autoDetectDvarAdjacencies,
  toggleDvarAdjacency,
  toggleDvarAdjacencyWithCoasts,
  setDvarAdjacencyPass,
  getIsolatedIds,
} from "../dvarAdjacency";

beforeEach(() => vi.clearAllMocks());

// ─── buildEmptyDvarAdjacencyMap ───────────────────────────────────────────────

describe("buildEmptyDvarAdjacencyMap", () => {
  it("returns an entry with an empty array for each id", () => {
    const map = buildEmptyDvarAdjacencyMap(["a", "b", "c"]);
    expect(map).toEqual({ a: [], b: [], c: [] });
  });

  it("returns an empty object for no ids", () => {
    expect(buildEmptyDvarAdjacencyMap([])).toEqual({});
  });
});

// ─── autoDetectDvarAdjacencies ────────────────────────────────────────────────

describe("autoDetectDvarAdjacencies – province ↔ province (no named coasts)", () => {
  it("land ↔ land → army", () => {
    const shapes = [
      { id: "a", paths: ["[ab]"] },
      { id: "b", paths: ["[ab]"] },
    ];
    const types = { a: "land", b: "land" };
    const map = autoDetectDvarAdjacencies(shapes, [], types);
    expect(map["a"]).toContainEqual({ to: "b", pass: "army" });
    expect(map["b"]).toContainEqual({ to: "a", pass: "army" });
  });

  it("coastal ↔ coastal → both", () => {
    const shapes = [
      { id: "a", paths: ["[ab]"] },
      { id: "b", paths: ["[ab]"] },
    ];
    const types = { a: "coastal", b: "coastal" };
    const map = autoDetectDvarAdjacencies(shapes, [], types);
    expect(map["a"][0].pass).toBe("both");
  });

  it("coastal ↔ land → army", () => {
    const shapes = [
      { id: "a", paths: ["[ab]"] },
      { id: "b", paths: ["[ab]"] },
    ];
    const types = { a: "coastal", b: "land" };
    const map = autoDetectDvarAdjacencies(shapes, [], types);
    expect(map["a"][0].pass).toBe("army");
  });

  it("sea ↔ sea → fleet", () => {
    const shapes = [
      { id: "a", paths: ["[ab]"] },
      { id: "b", paths: ["[ab]"] },
    ];
    const types = { a: "sea", b: "sea" };
    const map = autoDetectDvarAdjacencies(shapes, [], types);
    expect(map["a"][0].pass).toBe("fleet");
  });

  it("sea ↔ coastal → fleet", () => {
    const shapes = [
      { id: "a", paths: ["[ab]"] },
      { id: "b", paths: ["[ab]"] },
    ];
    const types = { a: "sea", b: "coastal" };
    const map = autoDetectDvarAdjacencies(shapes, [], types);
    expect(map["a"][0].pass).toBe("fleet");
  });

  it("non-adjacent provinces produce no adjacency", () => {
    const shapes = [
      { id: "a", paths: ["[a-only]"] },
      { id: "b", paths: ["[b-only]"] },
    ];
    const map = autoDetectDvarAdjacencies(shapes, [], {});
    expect(map["a"]).toHaveLength(0);
    expect(map["b"]).toHaveLength(0);
  });

  it("adjacencies are symmetric", () => {
    const shapes = [
      { id: "a", paths: ["[ab]"] },
      { id: "b", paths: ["[ab]"] },
    ];
    const map = autoDetectDvarAdjacencies(shapes, [], { a: "land", b: "land" });
    expect(map["a"].find(x => x.to === "b")).toBeDefined();
    expect(map["b"].find(x => x.to === "a")).toBeDefined();
  });
});

describe("autoDetectDvarAdjacencies – named coast interactions", () => {
  it("coast ↔ coast → fleet", () => {
    const provinces = [{ id: "spa", paths: ["[spa-only]"] }];
    const coasts = [
      { id: "spa/nc", parentId: "spa", paths: ["[nc-sc]"] },
      { id: "spa/sc", parentId: "spa", paths: ["[nc-sc]"] },
    ];
    const map = autoDetectDvarAdjacencies(provinces, coasts, { spa: "namedCoasts" });
    expect(map["spa/nc"]).toContainEqual({ to: "spa/sc", pass: "fleet" });
    expect(map["spa/sc"]).toContainEqual({ to: "spa/nc", pass: "fleet" });
  });

  it("coast ↔ sea → fleet", () => {
    const provinces = [
      { id: "spa", paths: ["[spa-only]"] },
      { id: "mid", paths: ["[nc-mid]"] },
    ];
    const coasts = [{ id: "spa/nc", parentId: "spa", paths: ["[nc-mid]"] }];
    const types = { spa: "namedCoasts", mid: "sea" };
    const map = autoDetectDvarAdjacencies(provinces, coasts, types);
    expect(map["spa/nc"]).toContainEqual({ to: "mid", pass: "fleet" });
    expect(map["mid"]).toContainEqual({ to: "spa/nc", pass: "fleet" });
  });

  it("coast ↔ coastal province (no coasts of its own) → fleet", () => {
    const provinces = [
      { id: "spa", paths: ["[spa-only]"] },
      { id: "mar", paths: ["[nc-mar]"] },
    ];
    const coasts = [{ id: "spa/nc", parentId: "spa", paths: ["[nc-mar]"] }];
    const types = { spa: "namedCoasts", mar: "coastal" };
    const map = autoDetectDvarAdjacencies(provinces, coasts, types);
    expect(map["spa/nc"]).toContainEqual({ to: "mar", pass: "fleet" });
  });

  it("coast ↔ land province → skipped (no adjacency added)", () => {
    const provinces = [
      { id: "spa", paths: ["[spa-only]"] },
      { id: "gas", paths: ["[nc-gas]"] },
    ];
    const coasts = [{ id: "spa/nc", parentId: "spa", paths: ["[nc-gas]"] }];
    const types = { spa: "namedCoasts", gas: "land" };
    const map = autoDetectDvarAdjacencies(provinces, coasts, types);
    expect(map["spa/nc"].find(x => x.to === "gas")).toBeUndefined();
    expect(map["gas"].find(x => x.to === "spa/nc")).toBeUndefined();
  });

  it("coast ↔ province that itself has named coasts → skipped", () => {
    // Two namedCoast parents share a border — their connection goes via coast↔coast, not coast↔parent
    const provinces = [
      { id: "spa", paths: ["[spa-por]"] },
      { id: "por", paths: ["[spa-por]"] },
    ];
    const coasts = [
      { id: "spa/nc", parentId: "spa", paths: ["[nc-only]"] },
      { id: "por/wc", parentId: "por", paths: ["[wc-only]"] },
    ];
    const types = { spa: "namedCoasts", por: "namedCoasts" };
    const map = autoDetectDvarAdjacencies(provinces, coasts, types);
    // spa/nc should not link to por, because por has coasts of its own
    expect(map["spa/nc"].find(x => x.to === "por")).toBeUndefined();
  });

  it("namedCoasts parent ↔ land province → army (no fleet via parent body)", () => {
    const provinces = [
      { id: "spa", paths: ["[spa-gas]"] },
      { id: "gas", paths: ["[spa-gas]"] },
    ];
    const coasts = [{ id: "spa/nc", parentId: "spa", paths: ["[nc-only]"] }];
    const types = { spa: "namedCoasts", gas: "land" };
    const map = autoDetectDvarAdjacencies(provinces, coasts, types);
    expect(map["spa"]).toContainEqual({ to: "gas", pass: "army" });
    expect(map["gas"]).toContainEqual({ to: "spa", pass: "army" });
  });

  it("namedCoasts parent ↔ sea → skipped entirely (fleet goes through coast subprovinces)", () => {
    const provinces = [
      { id: "spa", paths: ["[spa-mid]"] },
      { id: "mid", paths: ["[spa-mid]"] },
    ];
    const coasts = [{ id: "spa/nc", parentId: "spa", paths: ["[nc-only]"] }];
    const types = { spa: "namedCoasts", mid: "sea" };
    const map = autoDetectDvarAdjacencies(provinces, coasts, types);
    expect(map["spa"].find(x => x.to === "mid")).toBeUndefined();
    expect(map["mid"].find(x => x.to === "spa")).toBeUndefined();
  });
});

// ─── toggleDvarAdjacency ──────────────────────────────────────────────────────

describe("toggleDvarAdjacency", () => {
  it("adds adjacency in both directions when not present", () => {
    const map = { a: [], b: [] };
    const result = toggleDvarAdjacency(map, "a", "b");
    expect(result["a"]).toContainEqual({ to: "b", pass: "both" });
    expect(result["b"]).toContainEqual({ to: "a", pass: "both" });
  });

  it("uses provided defaultPass", () => {
    const map = { a: [], b: [] };
    const result = toggleDvarAdjacency(map, "a", "b", "fleet");
    expect(result["a"][0].pass).toBe("fleet");
  });

  it("removes adjacency in both directions when already present", () => {
    const map = {
      a: [{ to: "b", pass: "both" as const }],
      b: [{ to: "a", pass: "both" as const }],
    };
    const result = toggleDvarAdjacency(map, "a", "b");
    expect(result["a"].find(x => x.to === "b")).toBeUndefined();
    expect(result["b"].find(x => x.to === "a")).toBeUndefined();
  });

  it("creates missing map keys when toggling in", () => {
    const result = toggleDvarAdjacency({}, "x", "y");
    expect(result["x"]).toContainEqual({ to: "y", pass: "both" });
    expect(result["y"]).toContainEqual({ to: "x", pass: "both" });
  });

  it("does not mutate the original map", () => {
    const map = { a: [{ to: "c", pass: "army" as const }], b: [] };
    toggleDvarAdjacency(map, "a", "b");
    expect(map["a"]).toHaveLength(1);
    expect(map["b"]).toHaveLength(0);
  });
});

// ─── toggleDvarAdjacencyWithCoasts ───────────────────────────────────────────

describe("toggleDvarAdjacencyWithCoasts", () => {
  it("adds province↔province with defaultPass when no connection exists", () => {
    const map = { a: [], b: [] };
    const result = toggleDvarAdjacencyWithCoasts(map, "a", "b", [], [], "both");
    expect(result["a"]).toContainEqual({ to: "b", pass: "both" });
    expect(result["b"]).toContainEqual({ to: "a", pass: "both" });
  });

  it("adds province↔coast links with fleet pass", () => {
    const map = { a: [], b: [], "b/nc": [] };
    const result = toggleDvarAdjacencyWithCoasts(map, "a", "b", ["b/nc"], [], "both");
    expect(result["a"]).toContainEqual({ to: "b/nc", pass: "fleet" });
    expect(result["b/nc"]).toContainEqual({ to: "a", pass: "fleet" });
  });

  it("adds coast↔province links with fleet pass", () => {
    const map = { a: [], "a/nc": [], b: [] };
    const result = toggleDvarAdjacencyWithCoasts(map, "a", "b", [], ["a/nc"], "both");
    expect(result["a/nc"]).toContainEqual({ to: "b", pass: "fleet" });
    expect(result["b"]).toContainEqual({ to: "a/nc", pass: "fleet" });
  });

  it("adds coast↔coast links with fleet pass", () => {
    const map = { a: [], "a/nc": [], b: [], "b/nc": [] };
    const result = toggleDvarAdjacencyWithCoasts(map, "a", "b", ["b/nc"], ["a/nc"], "both");
    expect(result["a/nc"]).toContainEqual({ to: "b/nc", pass: "fleet" });
    expect(result["b/nc"]).toContainEqual({ to: "a/nc", pass: "fleet" });
  });

  it("removes all links (province and coast) when any connection already exists", () => {
    const map = {
      a: [{ to: "b", pass: "both" as const }],
      b: [{ to: "a", pass: "both" as const }],
      "a/nc": [{ to: "b/nc", pass: "fleet" as const }],
      "b/nc": [{ to: "a/nc", pass: "fleet" as const }],
    };
    const result = toggleDvarAdjacencyWithCoasts(map, "a", "b", ["b/nc"], ["a/nc"], "both");
    expect(result["a"].find(x => x.to === "b")).toBeUndefined();
    expect(result["b"].find(x => x.to === "a")).toBeUndefined();
    expect(result["a/nc"].find(x => x.to === "b/nc")).toBeUndefined();
    expect(result["b/nc"].find(x => x.to === "a/nc")).toBeUndefined();
  });

  it("triggers removal when only a coast link exists (not the province link)", () => {
    const map = {
      a: [],
      b: [],
      "a/nc": [{ to: "b/nc", pass: "fleet" as const }],
      "b/nc": [{ to: "a/nc", pass: "fleet" as const }],
    };
    const result = toggleDvarAdjacencyWithCoasts(map, "a", "b", ["b/nc"], ["a/nc"], "both");
    expect(result["a/nc"].find(x => x.to === "b/nc")).toBeUndefined();
  });

  it("does not mutate the original map", () => {
    const map = { a: [], b: [] };
    toggleDvarAdjacencyWithCoasts(map, "a", "b", [], [], "army");
    expect(map["a"]).toHaveLength(0);
  });
});

// ─── setDvarAdjacencyPass ─────────────────────────────────────────────────────

describe("setDvarAdjacencyPass", () => {
  it("updates pass type in both directions", () => {
    const map = {
      a: [{ to: "b", pass: "army" as const }],
      b: [{ to: "a", pass: "army" as const }],
    };
    const result = setDvarAdjacencyPass(map, "a", "b", "fleet");
    expect(result["a"].find(x => x.to === "b")?.pass).toBe("fleet");
    expect(result["b"].find(x => x.to === "a")?.pass).toBe("fleet");
  });

  it("leaves other adjacencies untouched", () => {
    const map = {
      a: [
        { to: "b", pass: "army" as const },
        { to: "c", pass: "both" as const },
      ],
      b: [{ to: "a", pass: "army" as const }],
      c: [{ to: "a", pass: "both" as const }],
    };
    const result = setDvarAdjacencyPass(map, "a", "b", "fleet");
    expect(result["a"].find(x => x.to === "c")?.pass).toBe("both");
  });

  it("is a no-op when the pair does not exist", () => {
    const map = { a: [], b: [] };
    const result = setDvarAdjacencyPass(map, "a", "b", "fleet");
    expect(result["a"]).toHaveLength(0);
    expect(result["b"]).toHaveLength(0);
  });

  it("does not mutate the original map", () => {
    const map = {
      a: [{ to: "b", pass: "army" as const }],
      b: [{ to: "a", pass: "army" as const }],
    };
    setDvarAdjacencyPass(map, "a", "b", "fleet");
    expect(map["a"][0].pass).toBe("army");
  });
});

// ─── getIsolatedIds ───────────────────────────────────────────────────────────

describe("getIsolatedIds", () => {
  it("returns ids with empty adjacency array", () => {
    const map = { a: [{ to: "b", pass: "army" as const }], b: [], c: [] };
    expect(getIsolatedIds(["a", "b", "c"], map)).toEqual(["b", "c"]);
  });

  it("returns ids absent from the map", () => {
    const map = { a: [{ to: "b", pass: "army" as const }] };
    expect(getIsolatedIds(["a", "b"], map)).toEqual(["b"]);
  });

  it("returns empty array when all ids have adjacencies", () => {
    const map = {
      a: [{ to: "b", pass: "army" as const }],
      b: [{ to: "a", pass: "army" as const }],
    };
    expect(getIsolatedIds(["a", "b"], map)).toEqual([]);
  });

  it("returns empty array for empty id list", () => {
    expect(getIsolatedIds([], {})).toEqual([]);
  });
});
