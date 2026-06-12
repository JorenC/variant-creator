/**
 * dVAR domain logic: ID slugging, building the initial province / dominance-rule
 * scaffolds from a parsed dSVG, and assembling collected wizard data into the final
 * `.dvar` JSON object. Pure logic — no DOM, no React.
 */

import type { ParsedDsvg } from "@/utils/parseDsvg";
import type { DvarAdjacencyMap } from "@/utils/dvarAdjacency";
import type {
  AssembleDvarInput,
  DominanceRulesData,
  ExtraUnit,
  HomeNationsData,
  PhaseProgressionData,
  ProvincesFormValues,
  VictoryConditionsData,
} from "@/types/dvar";

export const DEFAULT_VICTORY_CONDITIONS: VictoryConditionsData = [
  { type: "supply-center-majority", supplyCenters: 18 },
];

export const DEFAULT_PHASE_ENTRIES: PhaseProgressionData = [
  { season: "Spring", type: "Movement",   yearDelta: 0 },
  { season: "Spring", type: "Retreat",    yearDelta: 0 },
  { season: "Fall",   type: "Movement",   yearDelta: 0 },
  { season: "Fall",   type: "Retreat",    yearDelta: 0 },
  { season: "Fall",   type: "Adjustment", yearDelta: 1 },
];

/** Converts a human name to a lowercase, hyphenated ID slug. */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Orders phase transitions into chain order by following each transition's
 * `to` phase to the transition that starts from it.
 *
 * The wizard represents the progression as an ordered list and re-links each
 * entry to the next on export, so importing a file whose transitions are
 * listed in any other (equally valid) order would silently rewire the state
 * machine. Returns the input order unchanged when no unambiguous chain exists
 * (broken links, branches, or conditional transitions).
 */
export function orderTransitionsIntoChain<
  T extends {
    from: { season: string; type: string };
    to: { season: string; type: string };
    condition?: unknown;
  }
>(transitions: T[], start?: { season: string; type: string }): T[] {
  if (transitions.length <= 1) return transitions;
  if (transitions.some(t => t.condition)) return transitions;

  const byFrom = new Map<string, T>();
  for (const t of transitions) {
    const key = `${t.from.season}/${t.from.type}`;
    if (byFrom.has(key)) return transitions;
    byFrom.set(key, t);
  }

  const startKey = start ? `${start.season}/${start.type}` : `${transitions[0].from.season}/${transitions[0].from.type}`;
  let current = byFrom.get(startKey) ?? transitions[0];

  const ordered: T[] = [];
  const visited = new Set<string>();
  for (let i = 0; i < transitions.length; i++) {
    const key = `${current.from.season}/${current.from.type}`;
    if (visited.has(key)) return transitions;
    visited.add(key);
    ordered.push(current);
    const next = byFrom.get(`${current.to.season}/${current.to.type}`);
    if (!next) return ordered.length === transitions.length ? ordered : transitions;
    current = next;
  }
  return ordered.length === transitions.length ? ordered : transitions;
}

/**
 * Brings home-nation assignments and extra units back in sync after the
 * province list changed (SC flags or terrain types edited on an earlier step).
 * Without this, a fleet assigned to a province that is later retyped to land
 * survives in stale state and is exported as an illegal starting unit.
 */
export function reconcileHomeNationsWithProvinces(
  homeNations: HomeNationsData,
  extraUnits: ExtraUnit[] | null,
  provinces: ProvincesFormValues["provinces"],
): { homeNations: HomeNationsData; extraUnits: ExtraUnit[] | null } {
  const byId = new Map(provinces.map(p => [p.id, p]));

  const unitAllowed = (unit: "army" | "fleet" | null, type: string): boolean =>
    unit === null || (unit === "army" ? type !== "sea" : type !== "land");

  const nextHomeNations: HomeNationsData = {};
  for (const p of provinces) {
    if (!p.supplyCenter) continue;
    const entry = homeNations[p.id] ?? { nation: "", startingUnit: null, startingCoast: null };
    const startingUnit = unitAllowed(entry.startingUnit, p.type) ? entry.startingUnit : null;
    const coastValid =
      startingUnit === "fleet" &&
      entry.startingCoast !== null &&
      p.namedCoasts.some(c => c.id === entry.startingCoast);
    nextHomeNations[p.id] = {
      nation: entry.nation,
      startingUnit,
      startingCoast: coastValid ? entry.startingCoast : null,
    };
  }

  const nextExtraUnits = extraUnits?.map(eu => {
    const p = eu.province ? byId.get(eu.province) : undefined;
    if (!p) return { ...eu, province: "", unit: null, coast: null };
    const unit = unitAllowed(eu.unit, p.type) ? eu.unit : null;
    const coastValid = unit === "fleet" && eu.coast !== null && p.namedCoasts.some(c => c.id === eu.coast);
    return { ...eu, unit, coast: coastValid ? eu.coast : null };
  }) ?? null;

  return { homeNations: nextHomeNations, extraUnits: nextExtraUnits };
}

/**
 * Seeds a dominance-rule entry for every non-SC province, pre-listing the supply
 * centers it borders as (initially "empty") conditions.
 */
export function buildInitialDominanceRules(
  adjacenciesData: DvarAdjacencyMap,
  provinces: Array<{ id: string; supplyCenter: boolean }>
): DominanceRulesData {
  const scSet = new Set(provinces.filter(p => p.supplyCenter).map(p => p.id));
  const result: DominanceRulesData = {};
  for (const province of provinces) {
    if (province.supplyCenter) continue;
    const scIds = (adjacenciesData[province.id] ?? [])
      .map(a => a.to)
      .filter(id => scSet.has(id));
    result[province.id] = {
      enabled: false,
      provinceOccupier: "empty",
      conditions: Object.fromEntries(scIds.map(scId => [scId, "empty"])),
    };
  }
  return result;
}

/** Builds the initial province rows (sorted, named after their IDs, type unset) from a dSVG. */
export function buildInitialProvinces(dsvg: ParsedDsvg): ProvincesFormValues["provinces"] {
  const coastsByParent = new Map<string, string[]>();
  for (const coastId of dsvg.namedCoastIds) {
    const parent = coastId.split("/")[0];
    const existing = coastsByParent.get(parent) ?? [];
    coastsByParent.set(parent, [...existing, coastId]);
  }
  return [...dsvg.provinceIds].sort((a, b) => a.localeCompare(b)).map(id => ({
    id,
    name: id,
    // intentionally unselected — user must choose; Zod rejects "" on submit
    type: "" as "land" | "sea" | "coastal",
    supplyCenter: false,
    namedCoasts: (coastsByParent.get(id) ?? []).map(coastId => ({
      id: coastId,
      name: coastId,
    })),
  }));
}

/** Assembles all collected wizard data into a `.dvar` JSON object. */
export function assembleDvar({
  basicInfo,
  nations,
  provincesData,
  homeNationsData,
  extraUnits,
  adjacenciesData,
  dominanceRulesData,
  phaseProgressionData,
  victoryConditionsData,
  adjudicationModifiersData,
}: AssembleDvarInput): Record<string, unknown> {
  const provinces = provincesData.provinces.map(p => {
    const entry = homeNationsData[p.id];
    const result: Record<string, unknown> = {
      id: p.id,
      name: p.name,
      type: p.type,
      supplyCenter: p.supplyCenter,
      adjacencies: (adjacenciesData[p.id] ?? []).map(a => ({ to: a.to, pass: a.pass })),
    };
    if (entry?.nation && entry.nation !== "" && entry.nation !== "neutral") {
      result.homeNation = entry.nation;
    }
    return result;
  });

  const namedCoasts = provincesData.provinces.flatMap(p =>
    p.namedCoasts.map(coast => ({
      id: coast.id,
      name: coast.name,
      parentProvince: p.id,
      adjacencies: (adjacenciesData[coast.id] ?? []).map(a => ({
        to: a.to,
        pass: "fleet" as const,
      })),
    }))
  );

  const homeUnits = Object.entries(homeNationsData)
    .filter(([, v]) => v.startingUnit !== null && v.nation && v.nation !== "" && v.nation !== "neutral")
    .map(([provinceId, v]) => ({
      nation: v.nation,
      type: v.startingUnit === "army" ? "Army" : "Fleet",
      location: v.startingUnit === "fleet" && v.startingCoast ? v.startingCoast : provinceId,
    }));

  const extraUnitsList = (extraUnits ?? [])
    .filter(eu => eu.province && eu.nation && eu.unit && eu.nation !== "neutral")
    .map(eu => ({
      nation: eu.nation,
      type: eu.unit === "army" ? "Army" : "Fleet",
      location: eu.unit === "fleet" && eu.coast ? eu.coast : eu.province,
    }));

  const units = [...homeUnits, ...extraUnitsList];

  const supplyCenters = Object.entries(homeNationsData)
    .filter(([, v]) => v.nation && v.nation !== "" && v.nation !== "neutral")
    .map(([provinceId, v]) => ({ nation: v.nation, province: provinceId }));

  const seasons = [...new Set(phaseProgressionData.map(e => e.season))];
  const transitions = phaseProgressionData.map((entry, i) => {
    const next = phaseProgressionData[(i + 1) % phaseProgressionData.length];
    return {
      from: { season: entry.season, type: entry.type },
      to: { season: next.season, type: next.type, yearDelta: entry.yearDelta },
    };
  });

  const dominanceRules = Object.entries(dominanceRulesData)
    .filter(([, e]) => e.enabled && e.provinceOccupier && e.provinceOccupier !== "empty")
    .map(([provinceId, e]) => ({
      province: provinceId,
      // "neutral" is the form's internal sentinel; the file format spells it
      // "Neutral" (matching dependency entries and existing variants).
      nation: e.provinceOccupier === "neutral" ? "Neutral" : e.provinceOccupier,
      dependencies: Object.entries(e.conditions)
        .map(([depProvince, nation]) => ({
          province: depProvince,
          nation: nation === "neutral" ? "Neutral" : nation === "empty" ? "Empty" : nation,
        })),
    }));

  const output: Record<string, unknown> = {
    schemaVersion: 1,
    id: basicInfo.id,
    name: basicInfo.name,
    description: basicInfo.description,
    author: basicInfo.author,
    victoryConditions: victoryConditionsData,
    phaseProgression: { seasons, transitions },
    nations: nations.map(n => ({ id: n.id, name: n.name, color: n.color })),
    provinces,
    namedCoasts,
    initialState: {
      phase: {
        season: phaseProgressionData[0]?.season ?? "Spring",
        year: basicInfo.startYear,
        type: phaseProgressionData[0]?.type ?? "Movement",
      },
      units,
      supplyCenters,
    },
  };

  if (basicInfo.rules?.trim()) output.rules = basicInfo.rules;
  if (adjudicationModifiersData.length > 0) output.adjudicationModifiers = adjudicationModifiersData;
  if (dominanceRules.length > 0) output.dominanceRules = dominanceRules;

  return output;
}

/** Like {@link assembleDvar} but tolerates partial/empty data, for "save progress" downloads. */
export function assemblePartialDvar(
  basicInfo: AssembleDvarInput["basicInfo"] | null,
  nations: AssembleDvarInput["nations"] | null,
  provincesData: ProvincesFormValues | null,
  homeNationsData: AssembleDvarInput["homeNationsData"] | null,
  adjacenciesData: DvarAdjacencyMap | null,
  dominanceRulesData: DominanceRulesData | null,
  phaseProgressionData: PhaseProgressionData | null,
  victoryConditionsData: VictoryConditionsData | null,
  adjudicationModifiersData: string[] | null,
  extraUnits: ExtraUnit[] | null,
): Record<string, unknown> {
  return assembleDvar({
    basicInfo: basicInfo ?? { id: "", name: "", description: "", author: "", startYear: 1901, rules: "" },
    nations: nations ?? [],
    provincesData: provincesData ?? { provinces: [] },
    homeNationsData: homeNationsData ?? {},
    extraUnits: extraUnits ?? [],
    adjacenciesData: adjacenciesData ?? {},
    dominanceRulesData: dominanceRulesData ?? {},
    phaseProgressionData: phaseProgressionData ?? [],
    victoryConditionsData: victoryConditionsData ?? [],
    adjudicationModifiersData: adjudicationModifiersData ?? [],
  });
}
