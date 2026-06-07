import type { VariantDefinition, Province, NamedCoast } from "@/types/variant";

type PhaseType = "Movement" | "Retreat" | "Adjustment";

interface SchemaAdjacency {
  to: string;
  pass: "army" | "fleet" | "both";
}

interface SchemaProvince {
  id: string;
  name: string;
  type: "land" | "sea" | "coastal";
  supplyCenter: boolean;
  homeNation?: string;
  adjacencies: SchemaAdjacency[];
}

interface SchemaNamedCoast {
  id: string;
  name: string;
  parentProvince: string;
  adjacencies: SchemaAdjacency[];
}

interface SchemaNation {
  id: string;
  name: string;
  color: string;
}

interface PhaseTransition {
  from: { season: string; type: PhaseType };
  to: { season: string; type: PhaseType; yearDelta: number };
}

interface SchemaPhaseProgression {
  seasons: string[];
  transitions: PhaseTransition[];
}

interface SchemaUnit {
  nation: string;
  type: "Army" | "Fleet";
  location: string;
}

interface SchemaSupplyCenter {
  nation: string;
  province: string;
}

interface SchemaInitialState {
  phase: { season: string; year: number; type: PhaseType };
  units: SchemaUnit[];
  supplyCenters: SchemaSupplyCenter[];
}

type SchemaVictoryCondition =
  | { type: "supply-center-majority"; supplyCenters: number }
  | { type: "timed-resolution"; year: number; resolution: "most-supply-centers" | "shared-draw" }
  | { type: "province-control"; provinces: string[]; year?: number };

export interface SchemaVariant {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  author: string;
  victoryConditions: SchemaVictoryCondition[];
  phaseProgression: SchemaPhaseProgression;
  nations: SchemaNation[];
  provinces: SchemaProvince[];
  namedCoasts: SchemaNamedCoast[];
  initialState: SchemaInitialState;
}

const DEFAULT_PHASE_PROGRESSION: SchemaPhaseProgression = {
  seasons: ["Spring", "Fall"],
  transitions: [
    { from: { season: "Spring", type: "Movement" }, to: { season: "Spring", type: "Retreat", yearDelta: 0 } },
    { from: { season: "Spring", type: "Retreat" }, to: { season: "Fall", type: "Movement", yearDelta: 0 } },
    { from: { season: "Fall", type: "Movement" }, to: { season: "Fall", type: "Retreat", yearDelta: 0 } },
    { from: { season: "Fall", type: "Retreat" }, to: { season: "Fall", type: "Adjustment", yearDelta: 0 } },
    { from: { season: "Fall", type: "Adjustment" }, to: { season: "Spring", type: "Movement", yearDelta: 1 } },
  ],
};

function toKebabId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

type InternalProvinceType = "land" | "sea" | "coastal" | "namedCoasts";

function inferPass(fromType: InternalProvinceType, toType: InternalProvinceType): "army" | "fleet" | "both" {
  // namedCoasts province bodies are army-only; fleet access goes through coast subprovinces
  if (fromType === "namedCoasts" || toType === "namedCoasts") return "army";
  if (fromType === "sea" || toType === "sea") return "fleet";
  if (fromType === "coastal" && toType === "coastal") return "both";
  return "army";
}

function convertAdjacencies(province: Province, allProvinces: Province[]): SchemaAdjacency[] {
  return province.adjacencies.map((toId) => {
    if (toId.includes("/")) {
      return { to: toId, pass: "fleet" as const };
    }
    const target = allProvinces.find((p) => p.id === toId);
    if (!target) return { to: toId, pass: "army" as const };
    return { to: toId, pass: inferPass(province.type, target.type) };
  });
}

function convertProvince(province: Province, allProvinces: Province[]): SchemaProvince {
  const schemaType: "land" | "sea" | "coastal" =
    province.type === "namedCoasts" ? "land" : province.type;

  const result: SchemaProvince = {
    id: province.id,
    name: province.name,
    type: schemaType,
    supplyCenter: province.supplyCenter,
    adjacencies: convertAdjacencies(province, allProvinces),
  };

  if (province.homeNation !== null) result.homeNation = province.homeNation;

  return result;
}

function convertNamedCoast(namedCoast: NamedCoast): SchemaNamedCoast {
  return {
    id: namedCoast.id,
    name: namedCoast.name,
    parentProvince: namedCoast.parentId,
    adjacencies: namedCoast.adjacencies.map((toId) => ({ to: toId, pass: "fleet" as const })),
  };
}

function buildInitialState(variant: VariantDefinition): SchemaInitialState {
  const units: SchemaUnit[] = [];
  const supplyCenters: SchemaSupplyCenter[] = [];

  for (const province of variant.provinces) {
    if (province.startingUnit && province.homeNation) {
      units.push({
        nation: province.homeNation,
        type: province.startingUnit.type,
        location: province.startingUnit.coast ?? province.id,
      });
    }
    if (province.supplyCenter && province.homeNation) {
      supplyCenters.push({ nation: province.homeNation, province: province.id });
    }
  }

  return {
    phase: { season: "Spring", year: variant.startYear, type: "Movement" },
    units,
    supplyCenters,
  };
}

export function toSchemaVariant(variant: VariantDefinition): SchemaVariant {
  const id = toKebabId(variant.name) || "my-variant";

  return {
    schemaVersion: 1,
    id,
    name: variant.name,
    description: variant.description,
    author: variant.author,
    victoryConditions: [{ type: "supply-center-majority", supplyCenters: variant.soloVictorySCCount }],
    phaseProgression: DEFAULT_PHASE_PROGRESSION,
    nations: variant.nations.map((n) => ({ id: n.id, name: n.name, color: n.color })),
    provinces: variant.provinces.map((p) => convertProvince(p, variant.provinces)),
    namedCoasts: variant.namedCoasts.map(convertNamedCoast),
    initialState: buildInitialState(variant),
  };
}

export function downloadSchemaJson(variant: VariantDefinition): void {
  const schema = toSchemaVariant(variant);
  const json = JSON.stringify(schema, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${schema.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
