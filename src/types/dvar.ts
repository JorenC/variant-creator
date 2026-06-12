/**
 * Shared domain types for the dVAR Creator.
 *
 * These describe the in-progress variant data the wizard collects, the shape of an
 * existing `.dvar` file being imported, and the inputs to dVAR assembly. Logic in
 * `src/utils` and the dVAR step components both import from here.
 *
 * Zod schemas and their inferred form-value types live in
 * `src/components/dvar/schemas.ts` (co-located with the forms that use them).
 */

import type { DvarAdjacencyMap } from "@/utils/dvarAdjacency";

// ─── Wizard steps ──────────────────────────────────────────────────────────────

export type Step =
  | "upload"
  | "reconcile"
  | "basic-info"
  | "nations"
  | "province-names"
  | "province-types"
  | "home-nations"
  | "adjacencies"
  | "dominance-rules"
  | "phase-progression"
  | "victory-conditions"
  | "adjudication-modifiers"
  | "export";

// ─── Collected wizard data ──────────────────────────────────────────────────────

export type HomeNationsData = Record<
  string,
  { nation: string; startingUnit: "army" | "fleet" | null; startingCoast: string | null }
>;

export interface ExtraUnit {
  id: string;
  province: string;
  nation: string;
  unit: "army" | "fleet" | null;
  coast: string | null;
}

export interface HomeNationsFormValues {
  assignments: HomeNationsData;
  extraUnits: ExtraUnit[];
}

export interface DominanceRuleEntry {
  enabled: boolean;
  provinceOccupier: string; // nationId | "neutral" | "empty"
  conditions: Record<string, string>; // scId -> nationId | "neutral" | "empty"
}

export type DominanceRulesData = Record<string, DominanceRuleEntry>;

export type PhaseType = "Movement" | "Retreat" | "Adjustment";

export interface PhaseEntry {
  season: string;
  type: PhaseType;
  yearDelta: number;
}

export type PhaseProgressionData = PhaseEntry[];

export type VictoryConditionType =
  | "supply-center-majority"
  | "timed-resolution"
  | "province-control";

export type VictoryCondition =
  | { type: "supply-center-majority"; supplyCenters: number }
  | { type: "timed-resolution"; year: number; resolution: "most-supply-centers" | "shared-draw" }
  | { type: "province-control"; provinces: string[]; year?: number };

export type VictoryConditionsData = VictoryCondition[];

/**
 * Combined province + named-coast data carried across the naming and typing steps.
 * (The Zod form schemas only cover a subset of these fields at a time.)
 */
export interface ProvincesFormValues {
  provinces: Array<{
    id: string;
    name: string;
    type: "land" | "sea" | "coastal";
    supplyCenter: boolean;
    namedCoasts: Array<{ id: string; name: string }>;
  }>;
}

// ─── Imported `.dvar` file shape ────────────────────────────────────────────────

export interface DvarJsonAdjacency { to: string; pass: string; }
export interface DvarJsonNation { id: string; name: string; color: string; }
export interface DvarJsonNamedCoast { id: string; name: string; parentProvince: string; adjacencies: DvarJsonAdjacency[]; }
export interface DvarJsonProvince { id: string; name: string; type: string; supplyCenter: boolean; adjacencies: DvarJsonAdjacency[]; homeNation?: string; }
export interface DvarJsonUnit { nation: string; type: string; location: string; }
export interface DvarJsonSupplyCenter { nation: string; province: string; }
export interface DvarJsonPhaseTransition { from: { season: string; type: string }; to: { season: string; type: string; yearDelta: number }; condition?: Record<string, unknown>; }
export interface DvarJsonDomRule { province: string; nation: string; dependencies: Array<{ province: string; nation: string }>; }

export interface DvarJson {
  id?: string;
  name?: string;
  description?: string;
  author?: string;
  rules?: string;
  nations?: DvarJsonNation[];
  provinces?: DvarJsonProvince[];
  namedCoasts?: DvarJsonNamedCoast[];
  initialState?: {
    phase?: { year?: number; season?: string; type?: string };
    supplyCenters?: DvarJsonSupplyCenter[];
    units?: DvarJsonUnit[];
  };
  phaseProgression?: { seasons?: string[]; transitions?: DvarJsonPhaseTransition[]; };
  victoryConditions?: VictoryCondition[];
  adjudicationModifiers?: string[];
  dominanceRules?: DvarJsonDomRule[];
}

// ─── dSVG ⇄ dVAR ID reconciliation ──────────────────────────────────────────────

export type ReconcileMap = Record<string, string | null>;

export interface ReconcileMismatches {
  missingProvinces: string[];
  missingCoasts: string[];
  newProvinces: string[];
  newCoasts: string[];
}

// ─── dVAR assembly input ────────────────────────────────────────────────────────

/** All collected wizard data, assembled by {@link assembleDvar} into a `.dvar` object. */
export interface AssembleDvarInput {
  basicInfo: {
    id: string;
    name: string;
    description: string;
    author: string;
    startYear: number;
    rules: string;
  };
  nations: Array<{ id: string; name: string; color: string }>;
  provincesData: ProvincesFormValues;
  homeNationsData: HomeNationsData;
  extraUnits: ExtraUnit[];
  adjacenciesData: DvarAdjacencyMap;
  dominanceRulesData: DominanceRulesData;
  phaseProgressionData: PhaseProgressionData;
  victoryConditionsData: VictoryConditionsData;
  adjudicationModifiersData: string[];
}
