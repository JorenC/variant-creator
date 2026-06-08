import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildEmptyDvarAdjacencyMap,
  autoDetectDvarAdjacencies,
  toggleDvarAdjacency,
  toggleDvarAdjacencyWithCoasts,
  setDvarAdjacencyPass,
  getIsolatedIds,
} from "../dvarAdjacency";

vi.mock("../geometry", () => ({
  detectPathIntersections: vi.fn(),
}));

import { detectPathIntersections } from "../geometry";
const mockDetect = vi.mocked(detectPathIntersections);

beforeEach(() => {
  mockDetect.mockReset();
});

// ---------------------------------------------------------------------------
// buildEmptyDvarAdjacencyMap
// ---------------------------------------------------------------------------

describe("buildEmptyDvarAdjacencyMap", () => {
  it("creates a key with an empty array for every id", () => {
    const map = buildEmptyDvarAdjacencyMap(["par", "bur", "bre"]);
    expect(Object.keys(map).sort()).toEqual(["bre", "bur", "par"]);
    for (const v of Object.values(map)) expect(v).toEqual([]);
  });

  it("returns an empty object for an empty id list", () => {
    expect(buildEmptyDvarAdjacencyMap([])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// autoDetectDvarAdjacencies — province ↔ province (no named coasts)
// ---------------------------------------------------------------------------

describe("autoDetectDvarAdjacencies — province ↔ province (no named coasts)", () => {
  it("army pass for land ↔ land", () => {
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [{ id: "par", paths: ["p"] }, { id: "bur", paths: ["p"] }],
      [],
      { par: "land", bur: "land" }
    );
    expect(map["par"]).toEqual([{ to: "bur", pass: "army" }]);
    expect(map["bur"]).toEqual([{ to: "par", pass: "army" }]);
  });

  it("both pass for coastal ↔ coastal", () => {
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [{ id: "bre", paths: ["p"] }, { id: "pic", paths: ["p"] }],
      [],
      { bre: "coastal", pic: "coastal" }
    );
    expect(map["bre"][0].pass).toBe("both");
    expect(map["pic"][0].pass).toBe("both");
  });

  it("fleet pass for sea ↔ coastal", () => {
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [{ id: "mid", paths: ["p"] }, { id: "bre", paths: ["p"] }],
      [],
      { mid: "sea", bre: "coastal" }
    );
    expect(map["mid"][0].pass).toBe("fleet");
    expect(map["bre"][0].pass).toBe("fleet");
  });

  it("fleet pass for sea ↔ sea", () => {
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [{ id: "mid", paths: ["p"] }, { id: "nat", paths: ["p"] }],
      [],
      { mid: "sea", nat: "sea" }
    );
    expect(map["mid"][0].pass).toBe("fleet");
  });

  it("army pass for land ↔ coastal", () => {
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [{ id: "par", paths: ["p"] }, { id: "bre", paths: ["p"] }],
      [],
      { par: "land", bre: "coastal" }
    );
    expect(map["par"][0].pass).toBe("army");
  });

  it("no adjacency added when paths do not intersect", () => {
    mockDetect.mockReturnValue(false);
    const map = autoDetectDvarAdjacencies(
      [{ id: "par", paths: ["p"] }, { id: "ber", paths: ["p"] }],
      [],
      { par: "land", ber: "land" }
    );
    expect(map["par"]).toEqual([]);
    expect(map["ber"]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// autoDetectDvarAdjacencies — province ↔ province (one or both have named coasts)
// ---------------------------------------------------------------------------

describe("autoDetectDvarAdjacencies — province ↔ province with named coasts", () => {
  it("adds army adjacency when named-coast province borders a land province", () => {
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [{ id: "spa", paths: ["p"] }, { id: "gas", paths: ["p"] }],
      [{ id: "spa/nc", parentId: "spa", paths: ["p"] }, { id: "spa/sc", parentId: "spa", paths: ["p"] }],
      { spa: "coastal", gas: "land" }
    );
    expect(map["spa"].some(a => a.to === "gas" && a.pass === "army")).toBe(true);
    expect(map["gas"].some(a => a.to === "spa" && a.pass === "army")).toBe(true);
  });

  it("skips the province ↔ province link when the sea neighbour borders a named-coast province (line 77)", () => {
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [{ id: "spa", paths: ["p"] }, { id: "mid", paths: ["p"] }],
      [{ id: "spa/nc", parentId: "spa", paths: ["p"] }, { id: "spa/sc", parentId: "spa", paths: ["p"] }],
      { spa: "coastal", mid: "sea" }
    );
    // Fleet access to spa is only via the named coasts — no spa↔mid at province level
    expect(map["spa"].some(a => a.to === "mid")).toBe(false);
    expect(map["mid"].some(a => a.to === "spa")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// autoDetectDvarAdjacencies — named coast (subprovince) ↔ province
// ---------------------------------------------------------------------------

describe("autoDetectDvarAdjacencies — subprovince ↔ province", () => {
  it("fleet link for coast ↔ sea province", () => {
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [{ id: "gas", paths: ["p"] }, { id: "mid", paths: ["p"] }],
      [{ id: "spa/nc", parentId: "spa", paths: ["p"] }],
      { gas: "land", mid: "sea" }
    );
    expect(map["spa/nc"].some(a => a.to === "mid" && a.pass === "fleet")).toBe(true);
    expect(map["mid"].some(a => a.to === "spa/nc" && a.pass === "fleet")).toBe(true);
  });

  it("fleet link for coast ↔ coastal province", () => {
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [{ id: "gas", paths: ["p"] }],
      [{ id: "spa/nc", parentId: "spa", paths: ["p"] }],
      { gas: "coastal" }
    );
    expect(map["spa/nc"].some(a => a.to === "gas" && a.pass === "fleet")).toBe(true);
    expect(map["gas"].some(a => a.to === "spa/nc" && a.pass === "fleet")).toBe(true);
  });

  it("no link for coast ↔ land province", () => {
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [{ id: "gas", paths: ["p"] }],
      [{ id: "spa/nc", parentId: "spa", paths: ["p"] }],
      { gas: "land" }
    );
    expect(map["spa/nc"]).toEqual([]);
    expect(map["gas"]).toEqual([]);
  });

  it("skips coast ↔ province when that province itself has named coasts", () => {
    // spa/nc intersects with por, but por also has named coasts → skip
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [{ id: "por", paths: ["p"] }],
      [
        { id: "spa/nc", parentId: "spa", paths: ["p"] },
        { id: "por/nc", parentId: "por", paths: ["p"] },
      ],
      { por: "coastal" }
    );
    expect(map["spa/nc"].some(a => a.to === "por")).toBe(false);
    expect(map["por"].some(a => a.to === "spa/nc")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// autoDetectDvarAdjacencies — named coast ↔ named coast (subprovince ↔ subprovince)
// ---------------------------------------------------------------------------

describe("autoDetectDvarAdjacencies — subprovince ↔ subprovince", () => {
  it("always fleet regardless of parent province types", () => {
    mockDetect.mockReturnValue(true);
    const map = autoDetectDvarAdjacencies(
      [],
      [
        { id: "spa/nc", parentId: "spa", paths: ["p"] },
        { id: "por/sc", parentId: "por", paths: ["p"] },
      ],
      { spa: "coastal", por: "coastal" }
    );
    expect(map["spa/nc"]).toEqual([{ to: "por/sc", pass: "fleet" }]);
    expect(map["por/sc"]).toEqual([{ to: "spa/nc", pass: "fleet" }]);
  });
});

// ---------------------------------------------------------------------------
// toggleDvarAdjacency
// ---------------------------------------------------------------------------

describe("toggleDvarAdjacency", () => {
  it("adds a bidirectional link when none exists", () => {
    const base = buildEmptyDvarAdjacencyMap(["par", "bur"]);
    const result = toggleDvarAdjacency(base, "par", "bur");
    expect(result["par"]).toEqual([{ to: "bur", pass: "both" }]);
    expect(result["bur"]).toEqual([{ to: "par", pass: "both" }]);
  });

  it("uses the supplied defaultPass", () => {
    const base = buildEmptyDvarAdjacencyMap(["par", "bur"]);
    const result = toggleDvarAdjacency(base, "par", "bur", "army");
    expect(result["par"][0].pass).toBe("army");
    expect(result["bur"][0].pass).toBe("army");
  });

  it("removes the bidirectional link when it already exists", () => {
    const base = buildEmptyDvarAdjacencyMap(["par", "bur"]);
    const after1 = toggleDvarAdjacency(base, "par", "bur");
    const after2 = toggleDvarAdjacency(after1, "par", "bur");
    expect(after2["par"]).toEqual([]);
    expect(after2["bur"]).toEqual([]);
  });

  it("does not mutate the original map", () => {
    const base = buildEmptyDvarAdjacencyMap(["par", "bur"]);
    toggleDvarAdjacency(base, "par", "bur");
    expect(base["par"]).toEqual([]);
  });

  it("preserves other existing adjacencies", () => {
    const base: Record<string, { to: string; pass: "army" | "fleet" | "both" }[]> = {
      par: [{ to: "bre", pass: "army" }],
      bur: [],
      bre: [{ to: "par", pass: "army" }],
    };
    const result = toggleDvarAdjacency(base, "par", "bur");
    expect(result["par"].some(a => a.to === "bre")).toBe(true);
    expect(result["par"].some(a => a.to === "bur")).toBe(true);
  });

  it("auto-creates missing keys for provinces not yet in the map", () => {
    const result = toggleDvarAdjacency({}, "par", "bur");
    expect(result["par"]).toEqual([{ to: "bur", pass: "both" }]);
    expect(result["bur"]).toEqual([{ to: "par", pass: "both" }]);
  });
});

// ---------------------------------------------------------------------------
// toggleDvarAdjacencyWithCoasts
// ---------------------------------------------------------------------------

describe("toggleDvarAdjacencyWithCoasts", () => {
  it("adds main↔main plus main↔coast and coast↔coast links when no connection exists", () => {
    const base = buildEmptyDvarAdjacencyMap(["spa", "spa/nc", "spa/sc", "mid"]);
    const result = toggleDvarAdjacencyWithCoasts(base, "mid", "spa", ["spa/nc", "spa/sc"], [], "fleet");

    expect(result["mid"].some(a => a.to === "spa" && a.pass === "fleet")).toBe(true);
    expect(result["spa"].some(a => a.to === "mid")).toBe(true);

    expect(result["mid"].some(a => a.to === "spa/nc" && a.pass === "fleet")).toBe(true);
    expect(result["mid"].some(a => a.to === "spa/sc" && a.pass === "fleet")).toBe(true);
    expect(result["spa/nc"].some(a => a.to === "mid")).toBe(true);
    expect(result["spa/sc"].some(a => a.to === "mid")).toBe(true);
  });

  it("adds fromCoast↔toId and fromCoast↔toCoast fleet links when fromCoasts are provided", () => {
    const base = buildEmptyDvarAdjacencyMap(["spa", "spa/nc", "spa/sc", "por", "por/nc"]);
    const result = toggleDvarAdjacencyWithCoasts(
      base, "spa", "por", ["por/nc"], ["spa/nc", "spa/sc"], "army"
    );

    // main↔main
    expect(result["spa"].some(a => a.to === "por" && a.pass === "army")).toBe(true);
    // fromCoast↔toId
    expect(result["spa/nc"].some(a => a.to === "por" && a.pass === "fleet")).toBe(true);
    expect(result["spa/sc"].some(a => a.to === "por" && a.pass === "fleet")).toBe(true);
    // fromCoast↔toCoast
    expect(result["spa/nc"].some(a => a.to === "por/nc" && a.pass === "fleet")).toBe(true);
    expect(result["spa/sc"].some(a => a.to === "por/nc" && a.pass === "fleet")).toBe(true);
    // fromId↔toCoast
    expect(result["spa"].some(a => a.to === "por/nc" && a.pass === "fleet")).toBe(true);
  });

  it("removes all links across the group when any connection already exists (main↔main)", () => {
    const base = buildEmptyDvarAdjacencyMap(["spa", "spa/nc", "spa/sc", "mid"]);
    const after1 = toggleDvarAdjacencyWithCoasts(base, "mid", "spa", ["spa/nc", "spa/sc"], [], "fleet");
    const after2 = toggleDvarAdjacencyWithCoasts(after1, "mid", "spa", ["spa/nc", "spa/sc"], [], "fleet");

    expect(after2["mid"]).toEqual([]);
    expect(after2["spa"]).toEqual([]);
    expect(after2["spa/nc"]).toEqual([]);
    expect(after2["spa/sc"]).toEqual([]);
  });

  it("removes all links when existing connection is only on a coast (hasAnyConnection via coast)", () => {
    // Manually set up a state where only mid↔spa/nc exists
    const base: Record<string, { to: string; pass: "army" | "fleet" | "both" }[]> = {
      mid: [{ to: "spa/nc", pass: "fleet" }],
      spa: [],
      "spa/nc": [{ to: "mid", pass: "fleet" }],
      "spa/sc": [],
    };
    const result = toggleDvarAdjacencyWithCoasts(base, "mid", "spa", ["spa/nc", "spa/sc"], [], "fleet");
    // hasAnyConnection should be true → remove all
    expect(result["mid"]).toEqual([]);
    expect(result["spa/nc"]).toEqual([]);
  });

  it("does not mutate the original map", () => {
    const base = buildEmptyDvarAdjacencyMap(["spa", "mid"]);
    toggleDvarAdjacencyWithCoasts(base, "mid", "spa", [], [], "fleet");
    expect(base["mid"]).toEqual([]);
  });

  it("does not add duplicate links when called with no coasts", () => {
    const base = buildEmptyDvarAdjacencyMap(["par", "bur"]);
    const result = toggleDvarAdjacencyWithCoasts(base, "par", "bur", [], [], "army");
    expect(result["par"].filter(a => a.to === "bur")).toHaveLength(1);
    expect(result["bur"].filter(a => a.to === "par")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// setDvarAdjacencyPass
// ---------------------------------------------------------------------------

describe("setDvarAdjacencyPass", () => {
  it("updates pass type bidirectionally", () => {
    const base: Record<string, { to: string; pass: "army" | "fleet" | "both" }[]> = {
      par: [{ to: "bur", pass: "army" }],
      bur: [{ to: "par", pass: "army" }],
    };
    const result = setDvarAdjacencyPass(base, "par", "bur", "both");
    expect(result["par"][0].pass).toBe("both");
    expect(result["bur"][0].pass).toBe("both");
  });

  it("does not affect unrelated adjacencies", () => {
    const base: Record<string, { to: string; pass: "army" | "fleet" | "both" }[]> = {
      par: [{ to: "bur", pass: "army" }, { to: "bre", pass: "fleet" }],
      bur: [{ to: "par", pass: "army" }],
      bre: [{ to: "par", pass: "fleet" }],
    };
    const result = setDvarAdjacencyPass(base, "par", "bur", "both");
    expect(result["par"].find(a => a.to === "bre")?.pass).toBe("fleet");
    expect(result["bre"][0].pass).toBe("fleet");
  });

  it("does not mutate the original map", () => {
    const base: Record<string, { to: string; pass: "army" | "fleet" | "both" }[]> = {
      par: [{ to: "bur", pass: "army" }],
      bur: [{ to: "par", pass: "army" }],
    };
    setDvarAdjacencyPass(base, "par", "bur", "fleet");
    expect(base["par"][0].pass).toBe("army");
  });

  it("is a no-op when the link does not exist", () => {
    const base = buildEmptyDvarAdjacencyMap(["par", "bur"]);
    const result = setDvarAdjacencyPass(base, "par", "bur", "fleet");
    expect(result["par"]).toEqual([]);
    expect(result["bur"]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getIsolatedIds
// ---------------------------------------------------------------------------

describe("getIsolatedIds", () => {
  it("returns ids with no adjacencies", () => {
    const map = { par: [], bur: [{ to: "par", pass: "army" as const }], ber: [] };
    expect(getIsolatedIds(["par", "bur", "ber"], map)).toEqual(["par", "ber"]);
  });

  it("returns empty array when all ids have at least one adjacency", () => {
    const map = {
      par: [{ to: "bur", pass: "army" as const }],
      bur: [{ to: "par", pass: "army" as const }],
    };
    expect(getIsolatedIds(["par", "bur"], map)).toEqual([]);
  });

  it("treats ids missing from the map as isolated", () => {
    const map: Record<string, { to: string; pass: "army" | "fleet" | "both" }[]> = {};
    expect(getIsolatedIds(["par"], map)).toEqual(["par"]);
  });

  it("returns all ids when the map is empty", () => {
    expect(getIsolatedIds(["par", "bur"], {})).toEqual(["par", "bur"]);
  });
});
