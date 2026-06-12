/**
 * Defensive normalization of an imported `.dvar` file. `JSON.parse` output was
 * previously cast straight to {@link DvarJson}; a file missing e.g. a province's
 * `adjacencies` array then crashed the pre-fill render with no recovery path.
 * This sanitizer accepts anything, keeps every well-formed entry, and reports
 * what it had to drop so the user is told instead of silently losing data.
 */

import type {
  DvarJson,
  DvarJsonNamedCoast,
  DvarJsonNation,
  DvarJsonProvince,
  DvarJsonAdjacency,
  VictoryCondition,
} from "@/types/dvar";

export interface SanitizedDvarImport {
  dvar: DvarJson;
  dropped: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && isFinite(v) ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function sanitizeAdjacencies(v: unknown, owner: string, dropped: string[]): DvarJsonAdjacency[] {
  const result: DvarJsonAdjacency[] = [];
  for (const entry of arr(v)) {
    if (isRecord(entry) && typeof entry.to === "string") {
      result.push({ to: entry.to, pass: str(entry.pass) ?? "army" });
    } else {
      dropped.push(`${owner}: malformed adjacency entry dropped`);
    }
  }
  return result;
}

export function sanitizeDvarImport(raw: unknown): SanitizedDvarImport | null {
  if (!isRecord(raw)) return null;
  const dropped: string[] = [];

  const nations: DvarJsonNation[] = [];
  for (const entry of arr(raw.nations)) {
    if (isRecord(entry) && typeof entry.id === "string") {
      nations.push({
        id: entry.id,
        name: str(entry.name) ?? entry.id,
        color: str(entry.color) ?? "#888888",
      });
    } else {
      dropped.push("nations: malformed nation entry dropped");
    }
  }

  const provinces: DvarJsonProvince[] = [];
  for (const entry of arr(raw.provinces)) {
    if (isRecord(entry) && typeof entry.id === "string") {
      provinces.push({
        id: entry.id,
        name: str(entry.name) ?? entry.id,
        type: str(entry.type) ?? "",
        supplyCenter: bool(entry.supplyCenter) ?? false,
        adjacencies: sanitizeAdjacencies(entry.adjacencies, `province ${entry.id}`, dropped),
        ...(str(entry.homeNation) !== undefined ? { homeNation: str(entry.homeNation) } : {}),
      });
    } else {
      dropped.push("provinces: malformed province entry dropped");
    }
  }

  const namedCoasts: DvarJsonNamedCoast[] = [];
  for (const entry of arr(raw.namedCoasts)) {
    if (isRecord(entry) && typeof entry.id === "string") {
      namedCoasts.push({
        id: entry.id,
        name: str(entry.name) ?? entry.id,
        parentProvince: str(entry.parentProvince) ?? entry.id.split("/")[0],
        adjacencies: sanitizeAdjacencies(entry.adjacencies, `coast ${entry.id}`, dropped),
      });
    } else {
      dropped.push("namedCoasts: malformed coast entry dropped");
    }
  }

  const initialStateRaw = isRecord(raw.initialState) ? raw.initialState : {};
  const phaseRaw = isRecord(initialStateRaw.phase) ? initialStateRaw.phase : {};

  const supplyCenters = arr(initialStateRaw.supplyCenters).flatMap(entry => {
    if (isRecord(entry) && typeof entry.province === "string" && typeof entry.nation === "string") {
      return [{ province: entry.province, nation: entry.nation }];
    }
    dropped.push("initialState.supplyCenters: malformed entry dropped");
    return [];
  });

  const units = arr(initialStateRaw.units).flatMap(entry => {
    if (isRecord(entry) && typeof entry.location === "string" && typeof entry.nation === "string") {
      return [{ nation: entry.nation, type: str(entry.type) ?? "Army", location: entry.location }];
    }
    dropped.push("initialState.units: malformed entry dropped");
    return [];
  });

  const ppRaw = isRecord(raw.phaseProgression) ? raw.phaseProgression : {};
  const transitions = arr(ppRaw.transitions).flatMap(entry => {
    if (
      isRecord(entry) &&
      isRecord(entry.from) && typeof entry.from.season === "string" && typeof entry.from.type === "string" &&
      isRecord(entry.to) && typeof entry.to.season === "string" && typeof entry.to.type === "string"
    ) {
      return [{
        from: { season: entry.from.season, type: entry.from.type },
        to: { season: entry.to.season, type: entry.to.type, yearDelta: num(entry.to.yearDelta) ?? 0 },
        ...(isRecord(entry.condition) ? { condition: entry.condition } : {}),
      }];
    }
    dropped.push("phaseProgression.transitions: malformed entry dropped");
    return [];
  });

  const victoryConditions = arr(raw.victoryConditions).flatMap(entry => {
    if (!isRecord(entry) || typeof entry.type !== "string") {
      dropped.push("victoryConditions: malformed entry dropped");
      return [];
    }
    if (entry.type === "supply-center-majority" && num(entry.supplyCenters) !== undefined) {
      return [{ type: "supply-center-majority", supplyCenters: num(entry.supplyCenters)! } as VictoryCondition];
    }
    if (
      entry.type === "timed-resolution" &&
      num(entry.year) !== undefined &&
      (entry.resolution === "most-supply-centers" || entry.resolution === "shared-draw")
    ) {
      return [{ type: "timed-resolution", year: num(entry.year)!, resolution: entry.resolution } as VictoryCondition];
    }
    if (entry.type === "province-control" && Array.isArray(entry.provinces)) {
      return [{
        type: "province-control",
        provinces: entry.provinces.filter((p): p is string => typeof p === "string"),
        ...(num(entry.year) !== undefined ? { year: num(entry.year) } : {}),
      } as VictoryCondition];
    }
    dropped.push(`victoryConditions: unrecognized condition "${entry.type}" dropped`);
    return [];
  });

  const dominanceRules = arr(raw.dominanceRules).flatMap(entry => {
    if (isRecord(entry) && typeof entry.province === "string" && typeof entry.nation === "string") {
      return [{
        province: entry.province,
        nation: entry.nation,
        dependencies: arr(entry.dependencies).flatMap(dep =>
          isRecord(dep) && typeof dep.province === "string" && typeof dep.nation === "string"
            ? [{ province: dep.province, nation: dep.nation }]
            : []
        ),
      }];
    }
    dropped.push("dominanceRules: malformed rule dropped");
    return [];
  });

  const dvar: DvarJson = {
    id: str(raw.id),
    name: str(raw.name),
    description: str(raw.description),
    author: str(raw.author),
    rules: str(raw.rules),
    nations,
    provinces,
    namedCoasts,
    initialState: {
      phase: {
        year: num(phaseRaw.year),
        season: str(phaseRaw.season),
        type: str(phaseRaw.type),
      },
      supplyCenters,
      units,
    },
    phaseProgression: {
      seasons: arr(ppRaw.seasons).filter((s): s is string => typeof s === "string"),
      transitions,
    },
    victoryConditions,
    adjudicationModifiers: arr(raw.adjudicationModifiers).filter(
      (m): m is string => typeof m === "string"
    ),
    dominanceRules,
  };

  return { dvar, dropped };
}
