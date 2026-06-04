import {
  useState,
  useRef,
  useId,
  useMemo,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Upload,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Map as MapIcon,
  Plus,
  Trash2,
  Wand2,
  MousePointer,
  Pencil,
  AlertTriangle,
  GripVertical,
  Download,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NationColorPicker } from "@/components/common/NationColorPicker";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { validateDsvg, parseDsvg } from "@/utils/parseDsvg";
import {
  buildProvincePreviewSvg,
  buildHomeNationPreviewSvg,
  extractDsvgProvinceShapes,
  extractDsvgNamedCoastShapes,
} from "@/utils/dvarPreview";
import {
  buildEmptyDvarAdjacencyMap,
  autoDetectDvarAdjacencies,
  toggleDvarAdjacency,
  setDvarAdjacencyPass,
} from "@/utils/dvarAdjacency";
import type { ParsedDsvg } from "@/utils/parseDsvg";
import type { DvarAdjacencyMap, PassType } from "@/utils/dvarAdjacency";

type Step =
  | "upload"
  | "reconcile"
  | "basic-info"
  | "nations"
  | "provinces"
  | "home-nations"
  | "adjacencies"
  | "dominance-rules"
  | "phase-progression"
  | "victory-conditions"
  | "adjudication-modifiers"
  | "export";

type HomeNationsData = Record<string, { nation: string; startingUnit: "army" | "fleet" | null; startingCoast: string | null }>;

interface DominanceRuleEntry {
  enabled: boolean;
  provinceOccupier: string; // nationId | "neutral" | "empty"
  conditions: Record<string, string>; // scId -> nationId | "neutral" | "empty"
}

type DominanceRulesData = Record<string, DominanceRuleEntry>;

type PhaseType = "Movement" | "Retreat" | "Adjustment";

interface PhaseEntry {
  season: string;
  type: PhaseType;
  yearDelta: number;
}

type PhaseProgressionData = PhaseEntry[];

type VictoryConditionType = "supply-center-majority" | "timed-resolution" | "province-control";

type VictoryCondition =
  | { type: "supply-center-majority"; supplyCenters: number }
  | { type: "timed-resolution"; year: number; resolution: "most-supply-centers" | "shared-draw" }
  | { type: "province-control"; provinces: string[]; year?: number };

type VictoryConditionsData = VictoryCondition[];

const DEFAULT_VICTORY_CONDITIONS: VictoryConditionsData = [
  { type: "supply-center-majority", supplyCenters: 18 },
];

const DEFAULT_PHASE_ENTRIES: PhaseProgressionData = [
  { season: "Spring", type: "Movement",   yearDelta: 0 },
  { season: "Spring", type: "Retreat",    yearDelta: 0 },
  { season: "Fall",   type: "Movement",   yearDelta: 0 },
  { season: "Fall",   type: "Retreat",    yearDelta: 0 },
  { season: "Fall",   type: "Adjustment", yearDelta: 1 },
];

// ─── Schemas ──────────────────────────────────────────────────────────────────

const basicInfoSchema = z.object({
  name: z.string().min(1, "Name is required"),
  id: z
    .string()
    .min(1, "ID is required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  description: z.string().min(1, "Description is required"),
  author: z.string().min(1, "Author is required"),
  startYear: z.number({ message: "Required" }).int(),
  rules: z.string(),
});

const nationSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color"),
});

const nationsSchema = z.object({
  nations: z
    .array(nationSchema)
    .min(1, "At least one nation is required")
    .refine(
      nations => {
        const names = nations
          .map(n => n.name.toLowerCase().trim())
          .filter(Boolean);
        return new Set(names).size === names.length;
      },
      { message: "Nation names must be unique" }
    ),
});

const namedCoastEntrySchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
});

const provinceEntrySchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  type: z.enum(["land", "sea", "coastal"], { error: "Province type is required" }),
  supplyCenter: z.boolean(),
  namedCoasts: z.array(namedCoastEntrySchema),
});

const provincesFormSchema = z.object({
  provinces: z.array(provinceEntrySchema),
});

type BasicInfoValues = z.infer<typeof basicInfoSchema>;
type NationsValues = z.infer<typeof nationsSchema>;
type ProvincesFormValues = z.infer<typeof provincesFormSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildInitialDominanceRules(
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

function buildInitialProvinces(dsvg: ParsedDsvg): ProvincesFormValues["provinces"] {
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

// ─── dVAR import types ────────────────────────────────────────────────────────

interface DvarJsonAdjacency { to: string; pass: string; }
interface DvarJsonNation { id: string; name: string; color: string; }
interface DvarJsonNamedCoast { id: string; name: string; parentProvince: string; adjacencies: DvarJsonAdjacency[]; }
interface DvarJsonProvince { id: string; name: string; type: string; supplyCenter: boolean; adjacencies: DvarJsonAdjacency[]; homeNation?: string; }
interface DvarJsonUnit { nation: string; type: string; location: string; }
interface DvarJsonSupplyCenter { nation: string; province: string; }
interface DvarJsonPhaseTransition { from: { season: string; type: string }; to: { season: string; type: string; yearDelta: number }; }
interface DvarJsonDomRule { province: string; nation: string; dependencies: Array<{ province: string; nation: string }>; }

interface DvarJson {
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

const DEFAULT_COLORS = [
  "#2196F3",
  "#00BCD4",
  "#607D8B",
  "#F44336",
  "#4CAF50",
  "#9C27B0",
  "#FFC107",
  "#FF5722",
  "#1565C0",
  "#009688",
  "#E91E63",
  "#795548",
];

// ─── Reconcile helpers ────────────────────────────────────────────────────────

type ReconcileMap = Record<string, string | null>;

interface ReconcileMismatches {
  missingProvinces: string[];
  missingCoasts: string[];
  newProvinces: string[];
  newCoasts: string[];
}

function computeMismatches(dvar: DvarJson, dsvg: ParsedDsvg): ReconcileMismatches {
  const dvarProvinceIds = new Set((dvar.provinces ?? []).map(p => p.id));
  const dvarCoastIds = new Set((dvar.namedCoasts ?? []).map(c => c.id));
  const dsvgProvinceIds = new Set(dsvg.provinceIds);
  const dsvgCoastIds = new Set(dsvg.namedCoastIds);
  return {
    missingProvinces: [...dvarProvinceIds].filter(id => !dsvgProvinceIds.has(id)),
    missingCoasts: [...dvarCoastIds].filter(id => !dsvgCoastIds.has(id)),
    newProvinces: [...dsvgProvinceIds].filter(id => !dvarProvinceIds.has(id)),
    newCoasts: [...dsvgCoastIds].filter(id => !dvarCoastIds.has(id)),
  };
}

function applyIdRemapping(
  dvar: DvarJson,
  provinceMap: ReconcileMap,
  coastMap: ReconcileMap,
): DvarJson {
  const remapProvince = (id: string): string | null =>
    id in provinceMap ? provinceMap[id] : id;
  const remapCoast = (id: string): string | null =>
    id in coastMap ? coastMap[id] : id;
  const remapAdjTo = (to: string): string | null => {
    if (to in coastMap) return coastMap[to];
    if (to in provinceMap) return provinceMap[to];
    return to;
  };
  const remapLocation = (loc: string): string | null =>
    loc.includes("/") ? remapCoast(loc) : remapProvince(loc);

  const provinces = (dvar.provinces ?? [])
    .map(p => {
      const newId = remapProvince(p.id);
      if (newId === null) return null;
      return {
        ...p,
        id: newId,
        adjacencies: p.adjacencies
          .map(a => { const t = remapAdjTo(a.to); return t === null ? null : { ...a, to: t }; })
          .filter((a): a is DvarJsonAdjacency => a !== null),
      };
    })
    .filter((p): p is DvarJsonProvince => p !== null);

  const namedCoasts = (dvar.namedCoasts ?? [])
    .map(c => {
      const newId = remapCoast(c.id);
      if (newId === null) return null;
      const newParent = remapProvince(c.parentProvince);
      if (newParent === null) return null;
      return {
        ...c,
        id: newId,
        parentProvince: newParent,
        adjacencies: c.adjacencies
          .map(a => { const t = remapAdjTo(a.to); return t === null ? null : { ...a, to: t }; })
          .filter((a): a is DvarJsonAdjacency => a !== null),
      };
    })
    .filter((c): c is DvarJsonNamedCoast => c !== null);

  const supplyCenters = (dvar.initialState?.supplyCenters ?? [])
    .map(sc => { const p = remapProvince(sc.province); return p === null ? null : { ...sc, province: p }; })
    .filter((sc): sc is DvarJsonSupplyCenter => sc !== null);

  const units = (dvar.initialState?.units ?? [])
    .map(u => { const l = remapLocation(u.location); return l === null ? null : { ...u, location: l }; })
    .filter((u): u is DvarJsonUnit => u !== null);

  const dominanceRules = (dvar.dominanceRules ?? [])
    .map(rule => {
      const p = remapProvince(rule.province);
      if (p === null) return null;
      const dependencies = rule.dependencies
        .map(dep => { const d = remapProvince(dep.province); return d === null ? null : { ...dep, province: d }; })
        .filter((d): d is { province: string; nation: string } => d !== null);
      return { ...rule, province: p, dependencies };
    })
    .filter((r): r is DvarJsonDomRule => r !== null);

  const victoryConditions = (dvar.victoryConditions ?? []).map(vc => {
    if (vc.type !== "province-control") return vc;
    return {
      ...vc,
      provinces: vc.provinces
        .map(id => remapProvince(id))
        .filter((id): id is string => id !== null),
    };
  });

  return {
    ...dvar,
    provinces,
    namedCoasts,
    dominanceRules,
    victoryConditions,
    initialState: dvar.initialState
      ? { ...dvar.initialState, supplyCenters, units }
      : undefined,
  };
}

// ─── ReconcileStep component ──────────────────────────────────────────────────

interface ReconcileStepProps {
  mismatches: ReconcileMismatches;
  provinceMap: ReconcileMap;
  coastMap: ReconcileMap;
  onProvinceMapChange: (map: ReconcileMap) => void;
  onCoastMapChange: (map: ReconcileMap) => void;
}

function ReconcileStep({
  mismatches,
  provinceMap,
  coastMap,
  onProvinceMapChange,
  onCoastMapChange,
}: ReconcileStepProps) {
  const claimedProvince = new Set(
    Object.values(provinceMap).filter((v): v is string => v !== null)
  );
  const claimedCoast = new Set(
    Object.values(coastMap).filter((v): v is string => v !== null)
  );

  const unclaimedProvinces = mismatches.newProvinces.filter(id => !claimedProvince.has(id));
  const unclaimedCoasts = mismatches.newCoasts.filter(id => !claimedCoast.has(id));

  const setProvinceMapping = (oldId: string, newId: string | null) =>
    onProvinceMapChange({ ...provinceMap, [oldId]: newId });
  const setCoastMapping = (oldId: string, newId: string | null) =>
    onCoastMapChange({ ...coastMap, [oldId]: newId });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <p className="font-medium text-amber-900 dark:text-amber-200">ID mismatches detected</p>
          <p className="text-amber-800 dark:text-amber-300">
            Some province or coast IDs in your dVAR do not exist in the uploaded dSVG. Map each
            old ID to its replacement, or leave it as "Drop" to discard its dVAR data.
          </p>
        </div>
      </div>

      {mismatches.missingProvinces.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Provinces</p>
          <div className="space-y-2">
            {mismatches.missingProvinces.map(oldId => {
              const current = provinceMap[oldId];
              const available = mismatches.newProvinces.filter(
                id => !claimedProvince.has(id) || id === current
              );
              return (
                <div key={oldId} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate font-mono text-xs text-muted-foreground">
                    {oldId}
                  </span>
                  <span className="text-xs text-muted-foreground">→</span>
                  <Select
                    value={current ?? "__drop__"}
                    onValueChange={val => setProvinceMapping(oldId, val === "__drop__" ? null : val)}
                  >
                    <SelectTrigger className="h-8 w-52 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__drop__">
                        <span className="italic text-muted-foreground">Drop (discard data)</span>
                      </SelectItem>
                      {available.map(newId => (
                        <SelectItem key={newId} value={newId}>{newId}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mismatches.missingCoasts.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Named Coasts</p>
          <div className="space-y-2">
            {mismatches.missingCoasts.map(oldId => {
              const current = coastMap[oldId];
              const available = mismatches.newCoasts.filter(
                id => !claimedCoast.has(id) || id === current
              );
              return (
                <div key={oldId} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate font-mono text-xs text-muted-foreground">
                    {oldId}
                  </span>
                  <span className="text-xs text-muted-foreground">→</span>
                  <Select
                    value={current ?? "__drop__"}
                    onValueChange={val => setCoastMapping(oldId, val === "__drop__" ? null : val)}
                  >
                    <SelectTrigger className="h-8 w-52 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__drop__">
                        <span className="italic text-muted-foreground">Drop (discard data)</span>
                      </SelectItem>
                      {available.map(newId => (
                        <SelectItem key={newId} value={newId}>{newId}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(unclaimedProvinces.length > 0 || unclaimedCoasts.length > 0) && (
        <div className="space-y-2 rounded-lg border bg-muted/40 px-4 py-3">
          <p className="text-sm font-medium">New in dSVG — will be added as blanks</p>
          <p className="text-xs text-muted-foreground">
            These IDs exist in the dSVG but aren't mapped to any dVAR entry. They'll be added
            with empty data for you to fill in during the Provinces step.
          </p>
          {unclaimedProvinces.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {unclaimedProvinces.map(id => (
                <span key={id} className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs">
                  {id}
                </span>
              ))}
            </div>
          )}
          {unclaimedCoasts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {unclaimedCoasts.map(id => (
                <span key={id} className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {id}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Root component ────────────────────────────────────────────────────────────

const STEP_META: Record<Exclude<Step, "upload" | "reconcile">, { title: string; subtitle: string }> = {
  "basic-info": {
    title: "Basic Info",
    subtitle: "Set the identity and metadata for your variant.",
  },
  nations: {
    title: "Nations",
    subtitle: "Define the playable powers, their names, and their colours.",
  },
  provinces: {
    title: "Provinces",
    subtitle: "Name every province and coast. Hover a row to locate it on the map.",
  },
  "home-nations": {
    title: "Home Nations",
    subtitle: "Assign each supply center to a home nation, or mark it neutral.",
  },
  adjacencies: {
    title: "Adjacencies",
    subtitle:
      "Define which provinces border each other and what unit types may cross each connection.",
  },
  "dominance-rules": {
    title: "Dominance Rules",
    subtitle: "Optionally define conditions under which a province is dominated, based on adjacent supply center control.",
  },
  "phase-progression": {
    title: "Phase Progression",
    subtitle: "Define the sequence of game phases and how the year advances.",
  },
  "victory-conditions": {
    title: "Victory Conditions",
    subtitle: "Define how the game can end. Add multiple conditions — the first to fire wins.",
  },
  "adjudication-modifiers": {
    title: "Game Rules",
    subtitle: "Configure adjudicator rule modifiers for this variant.",
  },
  export: {
    title: "Review & Export",
    subtitle: "Check your variant settings and download the .dvar file.",
  },
};

export function DvarCreator() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [parsedDsvg, setParsedDsvgState] = useState<ParsedDsvg | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [basicInfo, setBasicInfo] = useState<BasicInfoValues | null>(null);
  const [nations, setNations] = useState<NationsValues["nations"] | null>(null);
  const [provincesData, setProvincesData] = useState<ProvincesFormValues | null>(null);
  const [homeNationsData, setHomeNationsData] = useState<HomeNationsData | null>(null);
  const [adjacenciesData, setAdjacenciesData] = useState<DvarAdjacencyMap | null>(null);
  const [dominanceRulesData, setDominanceRulesData] = useState<DominanceRulesData | null>(null);
  const [phaseProgressionData, setPhaseProgressionData] = useState<PhaseProgressionData | null>(null);
  const [victoryConditionsData, setVictoryConditionsData] = useState<VictoryConditionsData | null>(null);
  const [adjudicationModifiersData, setAdjudicationModifiersData] = useState<string[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dvarInputRef = useRef<HTMLInputElement>(null);
  const [pendingDvar, setPendingDvar] = useState<DvarJson | null>(null);
  const [pendingDvarFileName, setPendingDvarFileName] = useState<string | null>(null);
  const [dvarError, setDvarError] = useState<string | null>(null);
  const [reconcileMismatches, setReconcileMismatches] = useState<ReconcileMismatches | null>(null);
  const [provinceReconcileMap, setProvinceReconcileMap] = useState<ReconcileMap>({});
  const [coastReconcileMap, setCoastReconcileMap] = useState<ReconcileMap>({});
  const homeNationsRef = useRef<HomeNationsFormHandle>(null);
  const adjacenciesRef = useRef<AdjacenciesFormHandle>(null);
  const dominanceRulesRef = useRef<DominanceRulesFormHandle>(null);
  const phaseProgressionRef = useRef<PhaseProgressionFormHandle>(null);
  const victoryConditionsRef = useRef<VictoryConditionsFormHandle>(null);
  const adjudicationModifiersRef = useRef<AdjudicationModifiersFormHandle>(null);
  const basicInfoFormId = useId();
  const nationsFormId = useId();
  const provincesFormId = useId();

  const processDvarFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".dvar")) {
      setDvarError("Please upload a .dvar file.");
      return;
    }
    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as DvarJson;
      setPendingDvar(parsed);
      setPendingDvarFileName(file.name);
      setDvarError(null);
    } catch {
      setDvarError("Invalid .dvar file — could not parse JSON.");
    }
  };

  const applyDvarPreFill = (dvar: DvarJson) => {
    // basic info
    setBasicInfo({
      id: dvar.id ?? "",
      name: dvar.name ?? "",
      description: dvar.description ?? "",
      author: dvar.author ?? "",
      startYear: dvar.initialState?.phase?.year ?? 1901,
      rules: dvar.rules ?? "",
    });

    // nations
    const nationsRaw = dvar.nations ?? [];
    setNations(nationsRaw);

    // provinces + namedCoasts
    const namedCoastsRaw = dvar.namedCoasts ?? [];
    const coastsByParent = new Map<string, Array<{ id: string; name: string }>>();
    for (const coast of namedCoastsRaw) {
      const existing = coastsByParent.get(coast.parentProvince) ?? [];
      coastsByParent.set(coast.parentProvince, [...existing, { id: coast.id, name: coast.name }]);
    }
    const provincesRaw = dvar.provinces ?? [];
    const provinces = provincesRaw.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type as "land" | "sea" | "coastal",
      supplyCenter: p.supplyCenter,
      namedCoasts: coastsByParent.get(p.id) ?? [],
    }));
    setProvincesData({ provinces });

    // adjacencies (provinces + named coasts in one map)
    const adjacencyMap: DvarAdjacencyMap = {};
    for (const p of provincesRaw) {
      adjacencyMap[p.id] = p.adjacencies.map(a => ({ to: a.to, pass: a.pass as PassType }));
    }
    for (const coast of namedCoastsRaw) {
      adjacencyMap[coast.id] = coast.adjacencies.map(a => ({ to: a.to, pass: "fleet" as PassType }));
    }
    setAdjacenciesData(adjacencyMap);

    // home nations
    const scNationMap = Object.fromEntries((dvar.initialState?.supplyCenters ?? []).map(sc => [sc.province, sc.nation]));
    const unitByProvince = new Map<string, DvarJsonUnit>();
    for (const unit of dvar.initialState?.units ?? []) {
      const provinceId = unit.location.includes("/") ? unit.location.split("/")[0] : unit.location;
      unitByProvince.set(provinceId, unit);
    }
    const homeNations: HomeNationsData = {};
    for (const p of provinces) {
      if (!p.supplyCenter) continue;
      const unit = unitByProvince.get(p.id);
      homeNations[p.id] = {
        nation: scNationMap[p.id] ?? "",
        startingUnit: unit ? (unit.type === "Army" ? "army" : "fleet") : null,
        startingCoast: unit && unit.location.includes("/") ? unit.location : null,
      };
    }
    setHomeNationsData(homeNations);

    // dominance rules: start from the auto-detected structure, then overlay enabled rules
    const baseDR = buildInitialDominanceRules(adjacencyMap, provinces);
    for (const rule of dvar.dominanceRules ?? []) {
      if (!baseDR[rule.province]) {
        baseDR[rule.province] = { enabled: true, provinceOccupier: rule.nation, conditions: {} };
      } else {
        baseDR[rule.province].enabled = true;
        baseDR[rule.province].provinceOccupier = rule.nation === "Neutral" ? "neutral" : rule.nation;
      }
      for (const dep of rule.dependencies) {
        baseDR[rule.province].conditions[dep.province] = dep.nation === "Neutral" ? "neutral" : dep.nation === "Empty" ? "empty" : dep.nation;
      }
    }
    setDominanceRulesData(baseDR);

    // phase progression: each entry[i] = { from.season, from.type, to.yearDelta }
    const transitions = dvar.phaseProgression?.transitions ?? [];
    const phaseEntries: PhaseProgressionData = transitions.map(t => ({
      season: t.from.season,
      type: t.from.type as PhaseType,
      yearDelta: t.to.yearDelta,
    }));
    setPhaseProgressionData(phaseEntries.length > 0 ? phaseEntries : [...DEFAULT_PHASE_ENTRIES]);

    // victory conditions
    const vc = dvar.victoryConditions ?? [];
    setVictoryConditionsData(vc.length > 0 ? vc : [...DEFAULT_VICTORY_CONDITIONS]);

    // adjudication modifiers
    setAdjudicationModifiersData(dvar.adjudicationModifiers ?? []);
  };

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".d.svg")) {
      setError(
        "Please upload a .d.svg file. Create one using the dSVG Creator first."
      );
      return;
    }

    const content = await file.text();
    const validationError = validateDsvg(content);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setFileName(file.name);
    setSvgContent(content);
    const parsed = parseDsvg(content);
    setParsedDsvgState(parsed);

    if (pendingDvar) {
      const mismatches = computeMismatches(pendingDvar, parsed);
      if (mismatches.missingProvinces.length > 0 || mismatches.missingCoasts.length > 0) {
        const initProvinceMap: ReconcileMap = {};
        for (const id of mismatches.missingProvinces) initProvinceMap[id] = null;
        const initCoastMap: ReconcileMap = {};
        for (const id of mismatches.missingCoasts) initCoastMap[id] = null;
        setReconcileMismatches(mismatches);
        setProvinceReconcileMap(initProvinceMap);
        setCoastReconcileMap(initCoastMap);
        setStep("reconcile");
      } else {
        applyDvarPreFill(pendingDvar);
        setStep("basic-info");
      }
    } else {
      setStep("basic-info");
    }
  };

  const handleReconcileConfirm = () => {
    if (!pendingDvar || !reconcileMismatches) return;

    const remapped = applyIdRemapping(pendingDvar, provinceReconcileMap, coastReconcileMap);

    const claimedProvinces = new Set(
      Object.values(provinceReconcileMap).filter((v): v is string => v !== null)
    );
    const claimedCoasts = new Set(
      Object.values(coastReconcileMap).filter((v): v is string => v !== null)
    );

    const brandNewProvinces = reconcileMismatches.newProvinces.filter(
      id => !claimedProvinces.has(id)
    );
    const brandNewCoasts = reconcileMismatches.newCoasts.filter(
      id => !claimedCoasts.has(id)
    );

    const augmented: DvarJson = {
      ...remapped,
      provinces: [
        ...(remapped.provinces ?? []),
        ...brandNewProvinces.map(id => ({
          id,
          name: id,
          type: "land",
          supplyCenter: false,
          adjacencies: [],
        })),
      ],
      namedCoasts: [
        ...(remapped.namedCoasts ?? []),
        ...brandNewCoasts.map(id => ({
          id,
          name: id,
          parentProvince: id.split("/")[0],
          adjacencies: [],
        })),
      ],
    };

    applyDvarPreFill(augmented);
    setStep("basic-info");
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleClear = () => {
    setStep("upload");
    setFileName(null);
    setSvgContent(null);
    setParsedDsvgState(null);
    setError(null);
    setBasicInfo(null);
    setNations(null);
    setProvincesData(null);
    setHomeNationsData(null);
    setAdjacenciesData(null);
    setDominanceRulesData(null);
    setPhaseProgressionData(null);
    setVictoryConditionsData(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPendingDvar(null);
    setPendingDvarFileName(null);
    setDvarError(null);
    if (dvarInputRef.current) dvarInputRef.current.value = "";
    setReconcileMismatches(null);
    setProvinceReconcileMap({});
    setCoastReconcileMap({});
  };

  const handleBack = () => {
    if (step === "reconcile") handleClear();
    if (step === "basic-info") handleClear();
    if (step === "nations") setStep("basic-info");
    if (step === "provinces") setStep("nations");
    if (step === "home-nations") setStep("provinces");
    if (step === "adjacencies") setStep("home-nations");
    if (step === "dominance-rules") setStep("adjacencies");
    if (step === "phase-progression") setStep("dominance-rules");
    if (step === "victory-conditions") setStep("phase-progression");
    if (step === "adjudication-modifiers") setStep("victory-conditions");
    if (step === "export") setStep("adjudication-modifiers");
  };

  const handleBasicInfoSubmit = (values: BasicInfoValues) => {
    setBasicInfo(values);
    setStep("nations");
  };

  const handleNationsSubmit = (values: NationsValues) => {
    setNations(values.nations);
    setStep("provinces");
  };

  const handleProvincesSubmit = (values: ProvincesFormValues) => {
    setProvincesData(values);
    setAdjacenciesData(
      prev => prev ?? buildEmptyDvarAdjacencyMap([
        ...values.provinces.map(p => p.id),
        ...values.provinces.flatMap(p => p.namedCoasts.map(c => c.id)),
      ])
    );
    setHomeNationsData(prev => {
      if (prev !== null) return prev;
      const initial: HomeNationsData = {};
      for (const p of values.provinces) {
        if (p.supplyCenter) initial[p.id] = { nation: "", startingUnit: null, startingCoast: null };
      }
      return initial;
    });
    setStep("home-nations");
  };

  const handleHomeNationsSubmit = (data: HomeNationsData) => {
    setHomeNationsData(data);
    setStep("adjacencies");
  };

  const handleAdjacenciesSubmit = (data: DvarAdjacencyMap) => {
    setAdjacenciesData(data);
    setDominanceRulesData(prev =>
      prev ?? buildInitialDominanceRules(data, provincesData?.provinces ?? [])
    );
    setStep("dominance-rules");
  };

  const handleDominanceRulesSubmit = (data: DominanceRulesData) => {
    setDominanceRulesData(data);
    setPhaseProgressionData(prev => prev ?? [...DEFAULT_PHASE_ENTRIES]);
    setStep("phase-progression");
  };

  const handlePhaseProgressionSubmit = (data: PhaseProgressionData) => {
    setPhaseProgressionData(data);
    setVictoryConditionsData(prev => prev ?? [...DEFAULT_VICTORY_CONDITIONS]);
    setStep("victory-conditions");
  };

  const handleVictoryConditionsSubmit = (data: VictoryConditionsData) => {
    setVictoryConditionsData(data);
    setAdjudicationModifiersData(prev => prev ?? []);
    setStep("adjudication-modifiers");
  };

  const handleAdjudicationModifiersSubmit = (data: string[]) => {
    setAdjudicationModifiersData(data);
    setStep("export");
  };

  const handleSaveProgress = () => {
    const output = assemblePartialDvar(
      basicInfo, nations, provincesData, homeNationsData,
      adjacenciesData, dominanceRulesData, phaseProgressionData,
      victoryConditionsData, adjudicationModifiersData,
    );
    const id = basicInfo?.id?.trim() || fileName?.replace(/\.d\.svg$/i, "") || "draft";
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.dvar`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentFormId =
    step === "basic-info" ? basicInfoFormId :
    step === "nations" ? nationsFormId :
    step === "provinces" ? provincesFormId :
    null;

  return (
    <div className="flex min-h-screen flex-col items-center p-8">
      <div className="flex w-full max-w-5xl flex-col gap-6">
        {step === "upload" ? (
          <>
            <div>
              <h1 className="text-3xl font-bold">dVAR Creator</h1>
              <p className="mt-1 text-muted-foreground">
                Upload a dSVG file to begin building your variant definition.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Required: dSVG */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">
                  dSVG Map <span className="text-destructive">*</span>
                </Label>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ")
                      fileInputRef.current?.click();
                  }}
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 transition-colors",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-muted-foreground/50"
                  )}
                >
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <p className="text-center text-sm text-muted-foreground">
                    Drop a <span className="font-mono font-medium">.d.svg</span> file here or click to upload
                  </p>
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}
              </div>

              {/* Optional: dVAR pre-fill */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">
                  Existing dVAR{" "}
                  <span className="text-xs font-normal text-muted-foreground">(optional — pre-fills all settings)</span>
                </Label>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => dvarInputRef.current?.click()}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ")
                      dvarInputRef.current?.click();
                  }}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 transition-colors",
                    pendingDvar
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-muted-foreground/50"
                  )}
                >
                  {pendingDvar ? (
                    <>
                      <Download className="h-10 w-10 text-primary" />
                      <p className="text-center text-sm font-medium">{pendingDvarFileName}</p>
                      <p className="text-center text-xs text-muted-foreground">Upload your dSVG to continue</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-muted-foreground" />
                      <p className="text-center text-sm text-muted-foreground">
                        Drop a <span className="font-mono font-medium">.dvar</span> file here or click to upload
                      </p>
                    </>
                  )}
                </div>
                {dvarError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {dvarError}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : step === "reconcile" ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">Reconcile IDs</h1>
                <p className="mt-1 text-muted-foreground">
                  Map dVAR IDs that are missing from the uploaded dSVG to their new equivalents.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 pt-1">
                <span className="text-sm text-muted-foreground">{fileName}</span>
                <Button variant="ghost" size="sm" onClick={handleClear}>
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              </div>
            </div>

            {reconcileMismatches && (
              <ReconcileStep
                mismatches={reconcileMismatches}
                provinceMap={provinceReconcileMap}
                coastMap={coastReconcileMap}
                onProvinceMapChange={setProvinceReconcileMap}
                onCoastMapChange={setCoastReconcileMap}
              />
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleReconcileConfirm}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">
                  {STEP_META[step as Exclude<Step, "upload" | "reconcile">].title}
                </h1>
                <p className="mt-1 text-muted-foreground">
                  {STEP_META[step as Exclude<Step, "upload" | "reconcile">].subtitle}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 pt-1">
                <span className="text-sm text-muted-foreground">{fileName}</span>
                <Button variant="ghost" size="sm" onClick={handleClear}>
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              </div>
            </div>

            {step === "basic-info" && parsedDsvg && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapIcon className="h-4 w-4" />
                <span>{parsedDsvg.provinceIds.length} provinces detected</span>
                {parsedDsvg.namedCoastIds.length > 0 && (
                  <span>· {parsedDsvg.namedCoastIds.length} named coasts</span>
                )}
              </div>
            )}

            {step === "basic-info" && (
              <BasicInfoForm
                formId={basicInfoFormId}
                defaultValues={basicInfo ?? undefined}
                onSubmit={handleBasicInfoSubmit}
              />
            )}

            {step === "nations" && (
              <NationsForm
                formId={nationsFormId}
                defaultValues={nations ? { nations } : undefined}
                onSubmit={handleNationsSubmit}
              />
            )}

            {step === "provinces" && svgContent && parsedDsvg && (
              <ProvincesForm
                formId={provincesFormId}
                svgContent={svgContent}
                defaultValues={
                  provincesData
                    ? { provinces: [...provincesData.provinces].sort((a, b) => a.id.localeCompare(b.id)) }
                    : { provinces: buildInitialProvinces(parsedDsvg) }
                }
                onSubmit={handleProvincesSubmit}
              />
            )}

            {step === "home-nations" && svgContent && homeNationsData && provincesData && nations && (
              <HomeNationsForm
                ref={homeNationsRef}
                svgContent={svgContent}
                scProvinces={provincesData.provinces.filter(p => p.supplyCenter)}
                nations={nations}
                defaultValues={homeNationsData}
                onSubmit={handleHomeNationsSubmit}
              />
            )}

            {step === "adjacencies" && svgContent && adjacenciesData && (
              <AdjacenciesForm
                ref={adjacenciesRef}
                svgContent={svgContent}
                provinceNames={
                  provincesData
                    ? {
                        ...Object.fromEntries(
                          provincesData.provinces.map(p => [p.id, p.name])
                        ),
                        ...Object.fromEntries(
                          provincesData.provinces.flatMap(p =>
                            p.namedCoasts.map(c => [c.id, c.name])
                          )
                        ),
                      }
                    : {}
                }
                provinceTypes={
                  provincesData
                    ? Object.fromEntries(
                        provincesData.provinces.map(p => [p.id, p.type])
                      )
                    : {}
                }
                namedCoastsByParent={Object.fromEntries(
                  (provincesData?.provinces ?? [])
                    .filter(p => p.namedCoasts.length > 0)
                    .map(p => [p.id, p.namedCoasts.map(c => c.id)])
                )}
                coastNames={Object.fromEntries(
                  (provincesData?.provinces ?? []).flatMap(p =>
                    p.namedCoasts.map(c => [c.id, c.name])
                  )
                )}
                defaultValues={adjacenciesData}
                onSubmit={handleAdjacenciesSubmit}
              />
            )}

            {step === "dominance-rules" && svgContent && dominanceRulesData && provincesData && nations && homeNationsData && adjacenciesData && (
              <DominanceRulesForm
                ref={dominanceRulesRef}
                svgContent={svgContent}
                provinces={provincesData.provinces}
                nations={nations}
                homeNationsData={homeNationsData}
                adjacenciesData={adjacenciesData}
                defaultValues={dominanceRulesData}
                onSubmit={handleDominanceRulesSubmit}
              />
            )}

            {step === "phase-progression" && phaseProgressionData && (
              <PhaseProgressionForm
                ref={phaseProgressionRef}
                defaultValues={phaseProgressionData}
                onSubmit={handlePhaseProgressionSubmit}
              />
            )}

            {step === "victory-conditions" && victoryConditionsData && (
              <VictoryConditionsForm
                ref={victoryConditionsRef}
                provinces={provincesData?.provinces ?? []}
                defaultValues={victoryConditionsData}
                onSubmit={handleVictoryConditionsSubmit}
              />
            )}

            {step === "adjudication-modifiers" && adjudicationModifiersData !== null && (
              <AdjudicationModifiersForm
                ref={adjudicationModifiersRef}
                defaultValues={adjudicationModifiersData}
                onSubmit={handleAdjudicationModifiersSubmit}
              />
            )}

            {step === "export" && basicInfo && nations && provincesData && homeNationsData && adjacenciesData && dominanceRulesData && phaseProgressionData && victoryConditionsData && (
              <ExportStep
                basicInfo={basicInfo}
                nations={nations}
                provincesData={provincesData}
                homeNationsData={homeNationsData}
                adjacenciesData={adjacenciesData}
                dominanceRulesData={dominanceRulesData}
                phaseProgressionData={phaseProgressionData}
                victoryConditionsData={victoryConditionsData}
                adjudicationModifiersData={adjudicationModifiersData ?? []}
              />
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveProgress}>
                  <Save className="h-4 w-4" />
                  Save progress
                </Button>

                {step !== "export" && (
                  step === "home-nations" ? (
                    <Button onClick={() => homeNationsRef.current?.submit()}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : step === "adjacencies" ? (
                    <Button onClick={() => adjacenciesRef.current?.submit()}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : step === "dominance-rules" ? (
                    <Button onClick={() => dominanceRulesRef.current?.submit()}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : step === "phase-progression" ? (
                    <Button onClick={() => phaseProgressionRef.current?.submit()}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : step === "victory-conditions" ? (
                    <Button onClick={() => victoryConditionsRef.current?.submit()}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : step === "adjudication-modifiers" ? (
                    <Button onClick={() => adjudicationModifiersRef.current?.submit()}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : currentFormId ? (
                    <Button type="submit" form={currentFormId}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : null
                )}
              </div>
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".svg"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Upload dSVG file"
        />
        <input
          ref={dvarInputRef}
          type="file"
          accept=".dvar"
          onChange={e => { const f = e.target.files?.[0]; if (f) processDvarFile(f); }}
          className="hidden"
          aria-label="Upload dVAR file"
        />
      </div>
    </div>
  );
}

// ─── BasicInfoForm ─────────────────────────────────────────────────────────────

interface BasicInfoFormProps {
  formId: string;
  defaultValues?: Partial<BasicInfoValues>;
  onSubmit: (values: BasicInfoValues) => void;
}

function BasicInfoForm({ formId, defaultValues, onSubmit }: BasicInfoFormProps) {
  const idEdited = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<BasicInfoValues>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: {
      name: "",
      id: "",
      description: "",
      author: "",
      startYear: 1901,
      rules: "",
      ...defaultValues,
    },
  });

  const { onChange: rhfNameOnChange, ...nameRegisterRest } = register("name");
  const { onChange: rhfIdOnChange, ...idRegisterRest } = register("id");

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit)}
      className="max-w-xl space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor={`${formId}-name`}>Name *</Label>
        <Input
          id={`${formId}-name`}
          {...nameRegisterRest}
          onChange={e => {
            rhfNameOnChange(e);
            if (!idEdited.current) {
              setValue("id", toSlug(e.target.value), { shouldValidate: true });
            }
          }}
          placeholder="e.g., Classical Europe"
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-id`}>ID *</Label>
        <Input
          id={`${formId}-id`}
          {...idRegisterRest}
          onChange={e => {
            idEdited.current = true;
            rhfIdOnChange(e);
          }}
          placeholder="e.g., classical-europe"
          aria-invalid={!!errors.id}
        />
        <p className="text-xs text-muted-foreground">
          Auto-generated from name. Lowercase letters, numbers, and hyphens only.
        </p>
        {errors.id && (
          <p className="text-sm text-destructive">{errors.id.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-description`}>Description *</Label>
        <Textarea
          id={`${formId}-description`}
          {...register("description")}
          placeholder="One or two sentences describing the variant."
          rows={2}
          aria-invalid={!!errors.description}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-author`}>Author *</Label>
        <Input
          id={`${formId}-author`}
          {...register("author")}
          placeholder="e.g., Allan B. Calhamer"
          aria-invalid={!!errors.author}
        />
        {errors.author && (
          <p className="text-sm text-destructive">{errors.author.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-startYear`}>Start year *</Label>
        <Input
          id={`${formId}-startYear`}
          type="number"
          className="w-36"
          {...register("startYear", { valueAsNumber: true })}
          aria-invalid={!!errors.startYear}
        />
        {errors.startYear && (
          <p className="text-sm text-destructive">{errors.startYear.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-rules`}>
          Rules{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={`${formId}-rules`}
          {...register("rules")}
          placeholder="Long-form, player-facing rules text."
          rows={4}
        />
      </div>
    </form>
  );
}

// ─── NationsForm ───────────────────────────────────────────────────────────────

interface NationsFormProps {
  formId: string;
  defaultValues?: Partial<NationsValues>;
  onSubmit: (values: NationsValues) => void;
}

function NationsForm({ formId, defaultValues, onSubmit }: NationsFormProps) {
  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NationsValues>({
    resolver: zodResolver(nationsSchema),
    defaultValues: {
      nations: defaultValues?.nations ?? [
        { id: "", name: "", color: DEFAULT_COLORS[0] },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "nations" });
  const watchedNations = watch("nations");

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit)}
      className="max-w-xl space-y-4"
    >
      {errors.nations?.root && (
        <p className="text-sm text-destructive">{errors.nations.root.message}</p>
      )}

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3"
          >
            <NationColorPicker
              value={watchedNations[index]?.color ?? DEFAULT_COLORS[0]}
              onChange={color =>
                setValue(`nations.${index}.color`, color, { shouldValidate: true })
              }
            />

            <div className="flex-1">
              <Input
                {...register(`nations.${index}.name`, {
                  onChange: e => {
                    setValue(`nations.${index}.id`, toSlug(e.target.value));
                  },
                })}
                placeholder="Nation name"
                aria-invalid={!!errors.nations?.[index]?.name}
              />
              {errors.nations?.[index]?.name && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.nations[index]?.name?.message}
                </p>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              disabled={fields.length <= 1}
              aria-label="Remove nation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() =>
          append({
            id: "",
            name: "",
            color: DEFAULT_COLORS[fields.length % DEFAULT_COLORS.length],
          })
        }
      >
        <Plus className="h-4 w-4" />
        Add Nation
      </Button>
    </form>
  );
}

// ─── ProvincesForm ─────────────────────────────────────────────────────────────

interface ProvincesFormProps {
  formId: string;
  svgContent: string;
  defaultValues: ProvincesFormValues;
  onSubmit: (values: ProvincesFormValues) => void;
}

const PROVINCE_TYPE_COLORS: Record<string, string> = {
  land: "#3b82f6",
  coastal: "#22c55e",
  sea: "#fde047",
};

function ProvincesForm({ formId, svgContent, defaultValues, onSubmit }: ProvincesFormProps) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProvincesFormValues>({
    resolver: zodResolver(provincesFormSchema),
    defaultValues,
  });

  const watchedProvinces = watch("provinces");

  const typeColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of watchedProvinces) {
      const color = p.type ? PROVINCE_TYPE_COLORS[p.type] : undefined;
      if (color) map[p.id] = color;
    }
    return map;
  }, [watchedProvinces]);

  const previewSvg = useMemo(
    () => buildProvincePreviewSvg(svgContent, highlightedId, typeColorMap),
    [svgContent, highlightedId, typeColorMap]
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = new Blob([previewSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewSvg]);

  const aspectRatio = useMemo(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const vb = doc.documentElement.getAttribute("viewBox") ?? "";
    const parts = vb.split(/\s+/).map(Number);
    return parts.length >= 4 && parts[2] > 0 && parts[3] > 0
      ? `${parts[2]} / ${parts[3]}`
      : "16 / 9";
  }, [svgContent]);

  const handleGroupFocus = (id: string) => {
    if (blurTimer.current !== null) clearTimeout(blurTimer.current);
    setHighlightedId(id);
  };

  const handleGroupBlur = () => {
    blurTimer.current = setTimeout(() => setHighlightedId(null), 0);
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)}>
      {hasErrors && (
        <p className="mb-4 text-sm text-destructive">
          Please fill in all names and select a type (L/C/S) for every province before proceeding.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-1">
        <div className="pr-2 text-right text-xs text-muted-foreground">
          {watchedProvinces.filter(p => p.supplyCenter).length} supply center{watchedProvinces.filter(p => p.supplyCenter).length !== 1 ? "s" : ""} selected
        </div>
        <div className="max-h-[70vh] space-y-0.5 overflow-y-auto pr-2">
          {defaultValues.provinces.map((province, i) => (
            <div
              key={province.id}
              onMouseEnter={() => setHighlightedId(province.id)}
              onMouseLeave={() => setHighlightedId(null)}
              onFocus={() => handleGroupFocus(province.id)}
              onBlur={handleGroupBlur}
            >
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 transition-colors",
                  highlightedId === province.id
                    ? "bg-yellow-50 dark:bg-yellow-950/30"
                    : "hover:bg-muted/40"
                )}
              >
                <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
                  {province.id}
                </span>
                <Input
                  {...register(`provinces.${i}.name`)}
                  placeholder="Human name"
                  autoComplete="off"
                  aria-invalid={!!errors.provinces?.[i]?.name}
                  className="h-7 text-sm"
                />
                <div className={cn(
                  "flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1",
                  errors.provinces?.[i]?.type && "border-destructive"
                )}>
                  {(["land", "sea", "coastal"] as const).map(t => (
                    <Controller
                      key={t}
                      control={control}
                      name={`provinces.${i}.type`}
                      render={({ field }) => (
                        <label className="relative flex cursor-pointer items-center">
                          <input
                            type="radio"
                            className="absolute opacity-0 w-0 h-0"
                            value={t}
                            checked={field.value === t}
                            onChange={() => field.onChange(t)}
                          />
                          <span
                            className={cn(
                              "rounded px-1 py-0.5 text-xs font-medium transition-colors",
                              field.value === t
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {t[0].toUpperCase()}
                          </span>
                        </label>
                      )}
                    />
                  ))}
                </div>
                <Controller
                  control={control}
                  name={`provinces.${i}.supplyCenter`}
                  render={({ field }) => (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <span className="text-xs text-muted-foreground">SC</span>
                    </label>
                  )}
                />
              </div>

              {province.namedCoasts.length > 0 && (
                <div className="ml-4 space-y-0.5 border-l-2 border-muted pl-3">
                  {province.namedCoasts.map((coast, j) => (
                    <div
                      key={coast.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1 transition-colors",
                        highlightedId === province.id
                          ? "bg-yellow-50 dark:bg-yellow-950/30"
                          : "hover:bg-muted/40"
                      )}
                    >
                      <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
                        {coast.id}
                      </span>
                      <Input
                        {...register(`provinces.${i}.namedCoasts.${j}.name`)}
                        placeholder="Human name"
                        autoComplete="off"
                        aria-invalid={
                          !!errors.provinces?.[i]?.namedCoasts?.[j]?.name
                        }
                        className="h-7 text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        </div>

        <div className="sticky top-8 self-start">
          <div
            className="w-full overflow-hidden rounded-lg border"
            style={{ aspectRatio }}
          >
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Map preview"
                className="h-full w-full object-contain"
              />
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

// ─── HomeNationsForm ──────────────────────────────────────────────────────────

interface HomeNationsFormHandle {
  submit: () => void;
}

interface HomeNationsFormProps {
  svgContent: string;
  scProvinces: Array<{ id: string; name: string; namedCoasts: Array<{ id: string; name: string }> }>;
  nations: Array<{ id: string; name: string; color: string }>;
  defaultValues: HomeNationsData;
  onSubmit: (data: HomeNationsData) => void;
}

const HomeNationsForm = forwardRef<HomeNationsFormHandle, HomeNationsFormProps>(
  ({ svgContent, scProvinces, nations, defaultValues, onSubmit }, ref) => {
    const sortedProvinces = useMemo(
      () => [...scProvinces].sort((a, b) => a.id.localeCompare(b.id)),
      [scProvinces]
    );
    const [assignment, setAssignment] = useState<HomeNationsData>(defaultValues);
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const [submitAttempted, setSubmitAttempted] = useState(false);

    const coastErrors = useMemo((): Set<string> => {
      if (!submitAttempted) return new Set();
      const errors = new Set<string>();
      for (const province of sortedProvinces) {
        const entry = assignment[province.id];
        if (entry?.startingUnit === "fleet" && province.namedCoasts.length > 0 && !entry.startingCoast) {
          errors.add(province.id);
        }
      }
      return errors;
    }, [submitAttempted, sortedProvinces, assignment]);

    useImperativeHandle(ref, () => ({
      submit: () => {
        setSubmitAttempted(true);
        const hasErrors = sortedProvinces.some(province => {
          const entry = assignment[province.id];
          return entry?.startingUnit === "fleet" && province.namedCoasts.length > 0 && !entry.startingCoast;
        });
        if (hasErrors) return;
        onSubmit(assignment);
      },
    }), [assignment, onSubmit, sortedProvinces]);

    const provinceColors = useMemo(() => {
      const nationColorMap: Record<string, string> = {};
      for (const n of nations) nationColorMap[n.id] = n.color;
      const colors: Record<string, string> = {};
      for (const [id, entry] of Object.entries(assignment)) {
        if (entry.nation && entry.nation !== "neutral") {
          const color = nationColorMap[entry.nation];
          if (color) colors[id] = color;
        }
      }
      return colors;
    }, [assignment, nations]);

    const previewSvg = useMemo(
      () => buildHomeNationPreviewSvg(svgContent, provinceColors, highlightedId),
      [svgContent, provinceColors, highlightedId]
    );

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    useEffect(() => {
      const blob = new Blob([previewSvg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }, [previewSvg]);

    const aspectRatio = useMemo(() => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, "image/svg+xml");
      const vb = doc.documentElement.getAttribute("viewBox") ?? "";
      const parts = vb.split(/\s+/).map(Number);
      return parts.length >= 4 && parts[2] > 0 && parts[3] > 0
        ? `${parts[2]} / ${parts[3]}`
        : "16 / 9";
    }, [svgContent]);

    const options = useMemo(() => [
      { value: "", label: "Empty" },
      { value: "neutral", label: "Neutral", color: undefined },
      ...nations.map(n => ({ value: n.id, label: n.name, color: n.color })),
    ], [nations]);

    if (sortedProvinces.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No supply centers defined. Go back and mark provinces as SC in the Provinces step.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {coastErrors.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Some fleets require a coast selection. Please select a coast for each fleet marked below.
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-2">
          {sortedProvinces.map(province => {
            const entry = assignment[province.id] ?? { nation: "", startingUnit: null };
            return (
              <div
                key={province.id}
                onMouseEnter={() => setHighlightedId(province.id)}
                onMouseLeave={() => setHighlightedId(null)}
                className={cn(
                  "rounded-md px-2 py-1.5 transition-colors",
                  highlightedId === province.id
                    ? "bg-yellow-50 dark:bg-yellow-950/30"
                    : "hover:bg-muted/40"
                )}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
                    {province.id}
                  </span>
                  <span className="text-sm font-medium">{province.name}</span>
                </div>
                <div className="ml-[4.5rem] flex flex-wrap gap-1">
                  {options.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setAssignment(prev => ({
                          ...prev,
                          [province.id]: { ...prev[province.id], nation: opt.value },
                        }))
                      }
                      className={cn(
                        "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors",
                        entry.nation === opt.value
                          ? "bg-primary text-primary-foreground"
                          : "border text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {opt.color && (
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: opt.color }}
                        />
                      )}
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="ml-[4.5rem] mt-1 flex flex-wrap items-center gap-1">
                  {(["none", "army", "fleet"] as const).map(unit => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() =>
                        setAssignment(prev => ({
                          ...prev,
                          [province.id]: {
                            ...prev[province.id],
                            startingUnit: unit === "none" ? null : unit,
                            startingCoast: null,
                          },
                        }))
                      }
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs capitalize transition-colors",
                        entry.startingUnit === (unit === "none" ? null : unit)
                          ? "bg-primary text-primary-foreground"
                          : "border text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {unit}
                    </button>
                  ))}
                  {entry.startingUnit === "fleet" && province.namedCoasts.length > 0 && (
                    <Select
                      value={entry.startingCoast ?? ""}
                      onValueChange={val =>
                        setAssignment(prev => ({
                          ...prev,
                          [province.id]: { ...prev[province.id], startingCoast: val || null },
                        }))
                      }
                    >
                      <SelectTrigger size="sm" className={cn("h-6 w-auto text-xs", coastErrors.has(province.id) && "border-destructive")}>
                        <SelectValue placeholder="Coast…" />
                      </SelectTrigger>
                      <SelectContent>
                        {province.namedCoasts.map(coast => (
                          <SelectItem key={coast.id} value={coast.id}>
                            {coast.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {coastErrors.has(province.id) && (
                  <p className="ml-[4.5rem] mt-0.5 text-xs text-destructive">Select a coast for this fleet.</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="sticky top-8 self-start">
          <div
            className="w-full overflow-hidden rounded-lg border"
            style={{ aspectRatio }}
          >
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Map preview"
                className="h-full w-full object-contain"
              />
            )}
          </div>
        </div>
        </div>
      </div>
    );
  }
);

HomeNationsForm.displayName = "HomeNationsForm";

// ─── AdjacenciesForm ──────────────────────────────────────────────────────────

interface AdjacenciesFormHandle {
  submit: () => void;
}

interface AdjacenciesFormProps {
  svgContent: string;
  provinceNames: Record<string, string>;
  provinceTypes: Record<string, string>;
  namedCoastsByParent: Record<string, string[]>;
  coastNames: Record<string, string>;
  defaultValues: DvarAdjacencyMap;
  onSubmit: (adjacencyMap: DvarAdjacencyMap) => void;
}

const AdjacenciesForm = forwardRef<AdjacenciesFormHandle, AdjacenciesFormProps>(
  ({ svgContent, provinceNames, provinceTypes, namedCoastsByParent, defaultValues, onSubmit }, ref) => {
    const [adjacencyMap, setAdjacencyMap] = useState<DvarAdjacencyMap>(defaultValues);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);

    interface CoastConnectionDialog {
      fromProvinceId: string;
      fromCoasts: string[];
      toProvinceId: string;
      toCoasts: string[];
      defaultPass: PassType;
    }
    const [coastConnectionDialog, setCoastConnectionDialog] = useState<CoastConnectionDialog | null>(null);
    const [dialogFromId, setDialogFromId] = useState<string>("");
    const [dialogToId, setDialogToId] = useState<string>("");

    useImperativeHandle(ref, () => ({
      submit: () => onSubmit(adjacencyMap),
    }));

    const { shapes, viewBox } = useMemo(
      () => extractDsvgProvinceShapes(svgContent),
      [svgContent]
    );

    const aspectRatio = useMemo(() => {
      const parts = viewBox.split(/\s+/).map(Number);
      return parts.length >= 4 && parts[2] > 0 && parts[3] > 0
        ? `${parts[2]} / ${parts[3]}`
        : "16 / 9";
    }, [viewBox]);

    const basePreviewSvg = useMemo(
      () => buildProvincePreviewSvg(svgContent, null),
      [svgContent]
    );
    const [basePreviewUrl, setBasePreviewUrl] = useState<string | null>(null);
    useEffect(() => {
      const blob = new Blob([basePreviewSvg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      setBasePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }, [basePreviewSvg]);

    const listItems = useMemo(
      () => shapes.map(shape => ({ id: shape.id })),
      [shapes]
    );

    const coastToParent = useMemo(() => {
      const map: Record<string, string> = {};
      for (const [parentId, coasts] of Object.entries(namedCoastsByParent)) {
        for (const coastId of coasts) map[coastId] = parentId;
      }
      return map;
    }, [namedCoastsByParent]);

    const selectedItem = listItems[selectedIndex] ?? null;
    const selectedId = selectedItem?.id ?? null;

    interface UnifiedAdj { fromId: string; to: string; pass: PassType; }
    const currentAdjacencies = useMemo((): UnifiedAdj[] => {
      if (!selectedId) return [];
      const coasts = namedCoastsByParent[selectedId] ?? [];
      const parentAdjs = (adjacencyMap[selectedId] ?? []).map(adj => ({
        fromId: selectedId, to: adj.to, pass: adj.pass,
      }));
      const coastAdjs = coasts.flatMap(coastId =>
        (adjacencyMap[coastId] ?? []).map(adj => ({
          fromId: coastId, to: adj.to, pass: adj.pass,
        }))
      );
      return [...parentAdjs, ...coastAdjs];
    }, [selectedId, adjacencyMap, namedCoastsByParent]);

    const adjacentTypeMap = useMemo(() => {
      const passRank: Record<PassType, number> = { army: 1, fleet: 2, both: 3 };
      const map = new Map<string, PassType>();
      for (const adj of currentAdjacencies) {
        const parentId = coastToParent[adj.to] ?? adj.to;
        const existing = map.get(parentId);
        if (!existing || passRank[adj.pass] > passRank[existing]) {
          map.set(parentId, adj.pass);
        }
      }
      return map;
    }, [currentAdjacencies, coastToParent]);

    const coastShapes = useMemo(
      () => extractDsvgNamedCoastShapes(svgContent).shapes,
      [svgContent]
    );

    const totalAdjacencies = useMemo(() => {
      let count = 0;
      for (const adjs of Object.values(adjacencyMap)) count += adjs.length;
      return count / 2;
    }, [adjacencyMap]);

    const passBreakdown = useMemo(() => {
      const counts = { fleet: 0, army: 0, both: 0 };
      for (const adjs of Object.values(adjacencyMap)) {
        for (const adj of adjs) counts[adj.pass]++;
      }
      return { fleet: counts.fleet / 2, army: counts.army / 2, both: counts.both / 2 };
    }, [adjacencyMap]);

    const isolatedIds = useMemo(
      () => listItems.map(item => item.id).filter(id => {
        const coasts = namedCoastsByParent[id] ?? [];
        return [id, ...coasts].every(sid => !adjacencyMap[sid] || adjacencyMap[sid].length === 0);
      }),
      [listItems, adjacencyMap, namedCoastsByParent]
    );

    const handleAutoDetect = () => {
      const { shapes: coastShapes } = extractDsvgNamedCoastShapes(svgContent);
      const namedCoastShapesWithParent = coastShapes.map(s => ({
        ...s,
        parentId: s.id.split("/")[0],
      }));
      const detected = autoDetectDvarAdjacencies(shapes, namedCoastShapesWithParent, provinceTypes);
      setAdjacencyMap(detected);
    };

    const handleProvinceClick = (clickedProvinceId: string) => {
      if (!isEditMode) {
        const idx = listItems.findIndex(item => item.id === clickedProvinceId);
        if (idx !== -1) setSelectedIndex(idx);
        return;
      }
      if (!selectedId || clickedProvinceId === selectedId) return;

      const fromCoasts = namedCoastsByParent[selectedId] ?? [];
      const toCoasts = namedCoastsByParent[clickedProvinceId] ?? [];
      const defaultPass: PassType =
        provinceTypes[selectedId] === "sea" || provinceTypes[clickedProvinceId] === "sea"
          ? "fleet"
          : provinceTypes[selectedId] === "coastal" && provinceTypes[clickedProvinceId] === "coastal"
            ? "both"
            : "army";

      if (fromCoasts.length > 0 || toCoasts.length > 0) {
        setCoastConnectionDialog({ fromProvinceId: selectedId, fromCoasts, toProvinceId: clickedProvinceId, toCoasts, defaultPass });
        setDialogFromId(selectedId);
        setDialogToId(clickedProvinceId);
      } else {
        setAdjacencyMap(prev => toggleDvarAdjacency(prev, selectedId, clickedProvinceId, defaultPass));
      }
    };

    const handleCoastDialogConfirm = () => {
      if (!coastConnectionDialog) return;
      const fromId = dialogFromId;
      const toId = dialogToId;
      const pass: PassType =
        fromId !== coastConnectionDialog.fromProvinceId || toId !== coastConnectionDialog.toProvinceId
          ? "fleet"
          : coastConnectionDialog.defaultPass;
      setAdjacencyMap(prev => toggleDvarAdjacency(prev, fromId, toId, pass));
      setCoastConnectionDialog(null);
    };

    const handleRemove = (fromId: string, adjTo: string) => {
      setAdjacencyMap(prev => toggleDvarAdjacency(prev, fromId, adjTo));
    };

    const handlePassChange = (fromId: string, adjTo: string, pass: PassType) => {
      setAdjacencyMap(prev => setDvarAdjacencyPass(prev, fromId, adjTo, pass));
    };

    const getName = (id: string) => provinceNames[id] ?? id;

    const getDisplayName = (id: string) => {
      const parentId = coastToParent[id];
      if (parentId) return `${getName(parentId)} (${getName(id)})`;
      return getName(id);
    };

    const ADJACENT_FILLS: Record<PassType, string> = {
      army: "#90EE90",
      fleet: "#87CEEB",
      both: "#FFE066",
    };
    const ADJACENT_STROKES: Record<PassType, string> = {
      army: "#4CAF50",
      fleet: "#2196F3",
      both: "#D97706",
    };

    const getProvinceFill = (id: string) => {
      if (id === selectedId) return { fill: "#EF4444", fillOpacity: 0.85 };
      const adjType = adjacentTypeMap.get(id);
      if (adjType !== undefined) return { fill: ADJACENT_FILLS[adjType], fillOpacity: 0.85 };
      if (id === hoveredId) return { fill: "#ffffff", fillOpacity: 0.2 };
      return { fill: "transparent", fillOpacity: 0 };
    };

    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const el = listRef.current?.querySelector(`[data-list-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={handleAutoDetect}>
            <Wand2 className="h-4 w-4" />
            Auto-Detect
          </Button>
          <span className="text-sm text-muted-foreground">
            {Math.round(totalAdjacencies)} connection{totalAdjacencies !== 1 ? "s" : ""}
            {totalAdjacencies > 0 && (
              <> · {Math.round(passBreakdown.fleet)} fleet · {Math.round(passBreakdown.army)} army · {Math.round(passBreakdown.both)} both</>
            )}
          </span>
        </div>

        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <p className="mb-1.5 font-medium">Pass type guide</p>
          <ul className="space-y-0.5 text-muted-foreground">
            <li><span className="font-mono font-medium text-foreground">both</span> — coastal ↔ coastal sharing a coastline</li>
            <li><span className="font-mono font-medium text-foreground">fleet</span> — sea ↔ sea, or sea ↔ coastal</li>
            <li><span className="font-mono font-medium text-foreground">army</span> — land ↔ land, or coastal ↔ coastal with no shared coast (land bridge)</li>
          </ul>
        </div>

        <div className="relative w-full overflow-hidden rounded-lg border" style={{ aspectRatio }}>
          {basePreviewUrl && (
            <img
              src={basePreviewUrl}
              alt="Map"
              className="absolute inset-0 h-full w-full"
            />
          )}
          <svg
            viewBox={viewBox}
            className="absolute inset-0 h-full w-full"
            style={{ cursor: isEditMode ? "crosshair" : "pointer" }}
          >
            {shapes.map(shape => {
              const { fill, fillOpacity } = getProvinceFill(shape.id);
              const isSelected = shape.id === selectedId;
              return (
                <g
                  key={shape.id}
                  onClick={() => handleProvinceClick(shape.id)}
                  onMouseEnter={() => setHoveredId(shape.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {shape.paths.map((d, i) => (
                    <path
                      key={i}
                      d={d}
                      fill={fill}
                      fillOpacity={fillOpacity}
                      stroke={isSelected ? "#B91C1C" : "transparent"}
                      strokeWidth={isSelected ? 2 : 0}
                    />
                  ))}
                </g>
              );
            })}
            {coastShapes.flatMap(coast => {
              const parentId = coast.id.split("/")[0];
              const isParentSelected = parentId === selectedId;
              const adjType = adjacentTypeMap.get(parentId);
              if (!isParentSelected && adjType === undefined) return [];
              const stroke = isParentSelected ? "#B91C1C" : ADJACENT_STROKES[adjType!];
              return coast.paths.map((d, i) => (
                <path
                  key={`${coast.id}-${i}`}
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2}
                  pointerEvents="none"
                />
              ));
            })}
          </svg>
        </div>

        <div className="flex justify-center gap-1">
          <Button
            variant={!isEditMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditMode(false)}
          >
            <MousePointer className="h-4 w-4" />
            Select
          </Button>
          <Button
            variant={isEditMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditMode(true)}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>

        <div className="grid grid-cols-[220px_1fr] gap-4">
          <div className="flex flex-col gap-1">
            <div
              ref={listRef}
              className="max-h-[400px] overflow-y-auto rounded-lg border"
            >
            {listItems.map((item, idx) => (
              <button
                key={item.id}
                data-list-index={idx}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={cn(
                  "w-full px-2 py-1.5 text-left transition-colors",
                  idx === selectedIndex
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/50"
                )}
              >
                <div className={cn("truncate font-mono text-xs", idx === selectedIndex ? "text-primary-foreground" : "text-muted-foreground")}>
                  {item.id}
                </div>
                <div className={cn("truncate text-sm", idx === selectedIndex && "text-primary-foreground")}>
                  {getName(item.id)}
                </div>
              </button>
            ))}
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={selectedIndex === 0}
                onClick={() => setSelectedIndex(i => Math.max(0, i - 1))}
              >
                <ChevronUp className="h-4 w-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={selectedIndex >= listItems.length - 1}
                onClick={() => setSelectedIndex(i => Math.min(listItems.length - 1, i + 1))}
              >
                <ChevronDown className="h-4 w-4" />
                Next
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50">
                <tr className="border-b">
                  <th className="px-4 py-2.5 text-left font-medium">
                    Adjacent to {getName(selectedId ?? "")}
                  </th>
                  <th className="w-28 px-4 py-2.5 text-left font-medium">Pass</th>
                  <th className="w-16 px-4 py-2.5 text-right font-medium">Remove</th>
                </tr>
              </thead>
              <tbody>
                {currentAdjacencies.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-3 text-center text-muted-foreground"
                    >
                      {isEditMode
                        ? "Click provinces on the map to add adjacencies."
                        : "Switch to Edit mode, then click provinces on the map."}
                    </td>
                  </tr>
                ) : (
                  currentAdjacencies.map(adj => {
                    const fromCoastName = adj.fromId !== selectedId ? getName(adj.fromId) : null;
                    return (
                      <tr key={`${adj.fromId}-${adj.to}`} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-2">
                          {fromCoastName && (
                            <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                              {fromCoastName}
                            </span>
                          )}
                          {getDisplayName(adj.to)}
                        </td>
                        <td className="px-4 py-2">
                          <Select
                            value={adj.pass}
                            onValueChange={val =>
                              handlePassChange(adj.fromId, adj.to, val as PassType)
                            }
                          >
                            <SelectTrigger size="sm" className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="army">army</SelectItem>
                              <SelectItem value="fleet">fleet</SelectItem>
                              <SelectItem value="both">both</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(adj.fromId, adj.to)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {isolatedIds.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                {isolatedIds.length} province{isolatedIds.length !== 1 ? "s" : ""} with no adjacencies
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isolatedIds.map(id => getName(id)).join(", ")}
              </p>
            </div>
          </div>
        )}

        {coastConnectionDialog && (
          <Dialog open onOpenChange={(open) => { if (!open) setCoastConnectionDialog(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Connection</DialogTitle>
                <DialogDescription>
                  Choose which sub-provinces to connect.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {coastConnectionDialog.fromCoasts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      From which part of {getName(coastConnectionDialog.fromProvinceId)}?
                    </p>
                    <div className="space-y-1">
                      {[coastConnectionDialog.fromProvinceId, ...coastConnectionDialog.fromCoasts].map(id => {
                        const alreadyConn = (adjacencyMap[id] ?? []).some(a => a.to === dialogToId);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setDialogFromId(id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                              dialogFromId === id
                                ? "border-primary bg-primary/10 font-medium"
                                : "hover:bg-muted/50",
                              alreadyConn && "opacity-50"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <span>{getName(id)}</span>
                              <span className="ml-2 font-mono text-xs text-muted-foreground">{id}</span>
                            </div>
                            {alreadyConn && (
                              <span className="shrink-0 text-xs text-muted-foreground">connected</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {coastConnectionDialog.toCoasts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      To which part of {getName(coastConnectionDialog.toProvinceId)}?
                    </p>
                    <div className="space-y-1">
                      {[coastConnectionDialog.toProvinceId, ...coastConnectionDialog.toCoasts].map(id => {
                        const alreadyConn = (adjacencyMap[dialogFromId] ?? []).some(a => a.to === id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setDialogToId(id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                              dialogToId === id
                                ? "border-primary bg-primary/10 font-medium"
                                : "hover:bg-muted/50",
                              alreadyConn && "opacity-50"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <span>{getName(id)}</span>
                              <span className="ml-2 font-mono text-xs text-muted-foreground">{id}</span>
                            </div>
                            {alreadyConn && (
                              <span className="shrink-0 text-xs text-muted-foreground">connected</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCoastConnectionDialog(null)}>
                  Cancel
                </Button>
                <Button onClick={handleCoastDialogConfirm}>
                  {(adjacencyMap[dialogFromId] ?? []).some(a => a.to === dialogToId) ? "Remove" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }
);

AdjacenciesForm.displayName = "AdjacenciesForm";

// ─── DominanceRulesForm ───────────────────────────────────────────────────────

interface DominanceRulesFormHandle {
  submit: () => void;
}

interface DominanceRulesFormProps {
  svgContent: string;
  provinces: Array<{ id: string; name: string; supplyCenter: boolean }>;
  nations: Array<{ id: string; name: string; color: string }>;
  homeNationsData: HomeNationsData;
  adjacenciesData: DvarAdjacencyMap;
  defaultValues: DominanceRulesData;
  onSubmit: (data: DominanceRulesData) => void;
}

const DominanceRulesForm = forwardRef<DominanceRulesFormHandle, DominanceRulesFormProps>(
  ({ svgContent, provinces, nations, homeNationsData, adjacenciesData, defaultValues, onSubmit }, ref) => {
    const [rulesData, setRulesData] = useState<DominanceRulesData>(() => {
      const normalized: DominanceRulesData = {};
      for (const [id, entry] of Object.entries(defaultValues)) {
        normalized[id] = {
          ...entry,
          provinceOccupier: entry.provinceOccupier || "empty",
          conditions: Object.fromEntries(
            Object.entries(entry.conditions).map(([k, v]) => [k, v || "empty"])
          ),
        };
      }
      return normalized;
    });
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [addScDialogProvince, setAddScDialogProvince] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({ submit: () => onSubmit(rulesData) }));

    const { shapes, viewBox } = useMemo(() => extractDsvgProvinceShapes(svgContent), [svgContent]);

    const aspectRatio = useMemo(() => {
      const parts = viewBox.split(/\s+/).map(Number);
      return parts.length >= 4 && parts[2] > 0 && parts[3] > 0
        ? `${parts[2]} / ${parts[3]}`
        : "16 / 9";
    }, [viewBox]);

    const provinceMap = useMemo(
      () => new Map(provinces.map(p => [p.id, p])),
      [provinces]
    );

    const nationColorMap = useMemo(
      () => new Map(nations.map(n => [n.id, n.color])),
      [nations]
    );

    const borderingSCsPerProvince = useMemo(() => {
      const result: Record<string, string[]> = {};
      for (const province of provinces) {
        const scIds = (adjacenciesData[province.id] ?? [])
          .map(a => a.to)
          .filter(id => provinceMap.get(id)?.supplyCenter ?? false);
        if (scIds.length > 0) result[province.id] = scIds;
      }
      return result;
    }, [provinces, adjacenciesData, provinceMap]);

    const nonScProvinces = useMemo(
      () => provinces.filter(p => !p.supplyCenter).sort((a, b) => a.id.localeCompare(b.id)),
      [provinces]
    );

    const allSCs = useMemo(
      () => provinces.filter(p => p.supplyCenter).sort((a, b) => a.id.localeCompare(b.id)),
      [provinces]
    );

    const provinceColors = useMemo(() => {
      const colors: Record<string, string> = {};
      for (const [scId, entry] of Object.entries(homeNationsData)) {
        if (entry.nation && entry.nation !== "neutral") {
          const color = nationColorMap.get(entry.nation);
          if (color) colors[scId] = color;
        }
      }
      return colors;
    }, [homeNationsData, nationColorMap]);

    const basePreviewSvg = useMemo(
      () => buildHomeNationPreviewSvg(svgContent, provinceColors, null),
      [svgContent, provinceColors]
    );
    const [basePreviewUrl, setBasePreviewUrl] = useState<string | null>(null);
    useEffect(() => {
      const blob = new Blob([basePreviewSvg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      setBasePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }, [basePreviewSvg]);

    const getName = (id: string) => provinceMap.get(id)?.name ?? id;

    const getScColor = (scId: string) => {
      const nationId = homeNationsData[scId]?.nation;
      return nationId ? (nationColorMap.get(nationId) ?? "#e2e8f0") : "#e2e8f0";
    };

    const setEnabled = (provinceId: string, enabled: boolean) => {
      setRulesData(prev => {
        const existing = prev[provinceId] ?? { provinceOccupier: "empty", conditions: {} };
        let conditions = existing.conditions;
        if (enabled) {
          const adjacent = borderingSCsPerProvince[provinceId] ?? [];
          const missing = Object.fromEntries(
            adjacent.filter(scId => !(scId in conditions)).map(scId => [scId, "empty"])
          );
          if (Object.keys(missing).length > 0) conditions = { ...conditions, ...missing };
        }
        return { ...prev, [provinceId]: { ...existing, conditions, enabled } };
      });
    };

    const setProvinceOccupier = (provinceId: string, value: string) => {
      setRulesData(prev => ({
        ...prev,
        [provinceId]: { ...prev[provinceId], provinceOccupier: value },
      }));
    };

    const setCondition = (provinceId: string, scId: string, value: string) => {
      setRulesData(prev => ({
        ...prev,
        [provinceId]: {
          ...prev[provinceId],
          conditions: { ...prev[provinceId]?.conditions, [scId]: value },
        },
      }));
    };

    const removeCondition = (provinceId: string, scId: string) => {
      setRulesData(prev => {
        const entry = prev[provinceId];
        if (!entry) return prev;
        const conditions = Object.fromEntries(
          Object.entries(entry.conditions).filter(([k]) => k !== scId)
        );
        return { ...prev, [provinceId]: { ...entry, conditions } };
      });
    };

    const addCondition = (provinceId: string, scId: string) => {
      setRulesData(prev => ({
        ...prev,
        [provinceId]: {
          ...(prev[provinceId] ?? { enabled: false, provinceOccupier: "empty", conditions: {} }),
          conditions: { ...(prev[provinceId]?.conditions ?? {}), [scId]: "empty" },
        },
      }));
    };

    const NationSelect = ({
      value,
      onValueChange,
    }: {
      value: string;
      onValueChange: (val: string) => void;
    }) => (
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger size="sm" className="flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {nations.map(n => (
            <SelectItem key={n.id} value={n.id}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: n.color }}
                />
                {n.name}
              </span>
            </SelectItem>
          ))}
          <SelectItem value="neutral">Neutral</SelectItem>
          <SelectItem value="empty">Empty</SelectItem>
        </SelectContent>
      </Select>
    );

    return (
      <>
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-2">
            {nonScProvinces.length === 0 ? (
              <p className="text-sm text-muted-foreground">No non-SC provinces found.</p>
            ) : (
              nonScProvinces.map(province => {
                const entry = rulesData[province.id];
                const isEnabled = entry?.enabled ?? false;
                const conditionSCIds = Object.keys(entry?.conditions ?? {});
                const availableSCsToAdd = allSCs.filter(sc => !(sc.id in (entry?.conditions ?? {})));

                return (
                  <div
                    key={province.id}
                    onMouseEnter={() => setHoveredId(province.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={cn(
                      "rounded-md border p-2.5 transition-colors",
                      hoveredId === province.id
                        ? "bg-yellow-50 dark:bg-yellow-950/30"
                        : "hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`dr-${province.id}`}
                        checked={isEnabled}
                        onCheckedChange={checked => setEnabled(province.id, !!checked)}
                      />
                      <label
                        htmlFor={`dr-${province.id}`}
                        className="cursor-pointer text-sm font-medium"
                      >
                        {province.name}
                      </label>
                      {!isEnabled && conditionSCIds.length > 0 && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {conditionSCIds.length} SC{conditionSCIds.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {isEnabled && (
                      <div className="ml-6 mt-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-24 shrink-0 text-xs text-muted-foreground">
                            province owned by
                          </span>
                          <NationSelect
                            value={entry?.provinceOccupier ?? "empty"}
                            onValueChange={val => setProvinceOccupier(province.id, val)}
                          />
                        </div>

                        {conditionSCIds.length > 0 && (
                          <p className="text-xs text-muted-foreground">if:</p>
                        )}

                        {conditionSCIds.map(scId => (
                          <div key={scId} className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: getScColor(scId) }}
                            />
                            <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
                              {getName(scId)}
                            </span>
                            <NationSelect
                              value={entry?.conditions[scId] ?? "empty"}
                              onValueChange={val => setCondition(province.id, scId, val)}
                            />
                            <button
                              type="button"
                              onClick={() => removeCondition(province.id, scId)}
                              className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                              aria-label={`Remove ${getName(scId)}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}

                        {availableSCsToAdd.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setAddScDialogProvince(province.id)}
                            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add SC dependency
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="sticky top-8 self-start">
            <div className="relative w-full overflow-hidden rounded-lg border" style={{ aspectRatio }}>
              {basePreviewUrl && (
                <img src={basePreviewUrl} alt="Map" className="absolute inset-0 h-full w-full" />
              )}
              <svg
                viewBox={viewBox}
                className="absolute inset-0 h-full w-full"
                style={{ pointerEvents: "none" }}
              >
                {hoveredId &&
                  shapes
                    .filter(s => s.id === hoveredId)
                    .map(shape =>
                      shape.paths.map((d, i) => (
                        <path key={i} d={d} fill="#fde047" fillOpacity={0.5} />
                      ))
                    )}
              </svg>
            </div>
          </div>
        </div>

        <Dialog
          open={addScDialogProvince !== null}
          onOpenChange={open => { if (!open) setAddScDialogProvince(null); }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add SC Dependency</DialogTitle>
              {addScDialogProvince && (
                <DialogDescription>
                  Choose a supply center to add as a condition for{" "}
                  <strong>{provinces.find(p => p.id === addScDialogProvince)?.name ?? addScDialogProvince}</strong>.
                </DialogDescription>
              )}
            </DialogHeader>
            {addScDialogProvince && (() => {
              const currentConditions = rulesData[addScDialogProvince]?.conditions ?? {};
              const available = allSCs.filter(sc => !(sc.id in currentConditions));
              return available.length === 0 ? (
                <p className="text-sm text-muted-foreground">All supply centers are already added.</p>
              ) : (
                <div className="max-h-72 space-y-0.5 overflow-y-auto">
                  {available.map(sc => (
                    <button
                      key={sc.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        addCondition(addScDialogProvince, sc.id);
                        setAddScDialogProvince(null);
                      }}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: getScColor(sc.id) }}
                      />
                      <span>{sc.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{sc.id}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

DominanceRulesForm.displayName = "DominanceRulesForm";

// ─── PhaseProgressionForm ─────────────────────────────────────────────────────

interface PhaseProgressionFormHandle {
  submit: () => void;
}

interface PhaseProgressionFormProps {
  defaultValues: PhaseProgressionData;
  onSubmit: (data: PhaseProgressionData) => void;
}

const PhaseProgressionForm = forwardRef<PhaseProgressionFormHandle, PhaseProgressionFormProps>(
  ({ defaultValues, onSubmit }, ref) => {
    const [entries, setEntries] = useState<PhaseProgressionData>(defaultValues);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    useImperativeHandle(ref, () => ({ submit: () => onSubmit(entries) }));

    const updateEntry = <K extends keyof PhaseEntry>(index: number, key: K, value: PhaseEntry[K]) => {
      setEntries(prev => prev.map((e, i) => (i === index ? { ...e, [key]: value } : e)));
    };

    const removeEntry = (index: number) => {
      setEntries(prev => prev.filter((_, i) => i !== index));
    };

    const addEntry = () => {
      setEntries(prev => [...prev, { season: "Spring", type: "Movement", yearDelta: 0 }]);
    };

    const handleDragStart = (index: number) => setDragIndex(index);

    const handleDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDragOverIndex(index);
    };

    const handleDrop = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }
      setEntries(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(index, 0, moved);
        return next;
      });
      setDragIndex(null);
      setDragOverIndex(null);
    };

    const handleDragEnd = () => {
      setDragIndex(null);
      setDragOverIndex(null);
    };

    return (
      <div className="space-y-3 max-w-xl">
        <div className="space-y-1">
          {entries.map((entry, index) => (
            <div
              key={index}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => handleDragOver(e, index)}
              onDrop={e => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
                dragOverIndex === index && dragIndex !== index
                  ? "border-primary bg-primary/5"
                  : "bg-muted/20",
                dragIndex === index && "opacity-40"
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />

              <Input
                value={entry.season}
                onChange={e => updateEntry(index, "season", e.target.value)}
                placeholder="Season"
                className="h-7 w-28 text-sm"
              />

              <Select
                value={entry.type}
                onValueChange={val => updateEntry(index, "type", val as PhaseType)}
              >
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Movement">Movement</SelectItem>
                  <SelectItem value="Retreat">Retreat</SelectItem>
                  <SelectItem value="Adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground whitespace-nowrap">year +</span>
                <Input
                  type="number"
                  min={0}
                  value={entry.yearDelta}
                  onChange={e => updateEntry(index, "yearDelta", Math.max(0, parseInt(e.target.value) || 0))}
                  className="h-7 w-14 text-sm"
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7 shrink-0"
                onClick={() => removeEntry(index)}
                disabled={entries.length <= 1}
                aria-label="Remove phase"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={addEntry}>
          <Plus className="h-4 w-4" />
          Add Phase
        </Button>

        <p className="text-xs text-muted-foreground">
          Phases run top to bottom and loop back. The last phase's "year +" increments the year on wrap-around.
        </p>
      </div>
    );
  }
);

PhaseProgressionForm.displayName = "PhaseProgressionForm";

// ─── VictoryConditionsForm ────────────────────────────────────────────────────

interface VictoryConditionsFormHandle {
  submit: () => void;
}

interface VictoryConditionsFormProps {
  provinces: Array<{ id: string; name: string }>;
  defaultValues: VictoryConditionsData;
  onSubmit: (data: VictoryConditionsData) => void;
}

const VictoryConditionsForm = forwardRef<VictoryConditionsFormHandle, VictoryConditionsFormProps>(
  ({ provinces, defaultValues, onSubmit }, ref) => {
    const [conditions, setConditions] = useState<VictoryConditionsData>(defaultValues);

    useImperativeHandle(ref, () => ({ submit: () => onSubmit(conditions) }));

    const addCondition = () => {
      setConditions(prev => [...prev, { type: "supply-center-majority", supplyCenters: 18 }]);
    };

    const removeCondition = (index: number) => {
      setConditions(prev => prev.filter((_, i) => i !== index));
    };

    const setConditionType = (index: number, type: VictoryConditionType) => {
      setConditions(prev =>
        prev.map((c, i) => {
          if (i !== index) return c;
          if (type === "supply-center-majority") return { type, supplyCenters: 18 };
          if (type === "timed-resolution") return { type, year: 1900, resolution: "most-supply-centers" as const };
          return { type: "province-control", provinces: [] };
        })
      );
    };

    const updateCondition = (index: number, updates: object) => {
      setConditions(prev =>
        prev.map((c, i) => (i === index ? { ...c, ...updates } as VictoryCondition : c))
      );
    };

    const LABELS: Record<VictoryConditionType, string> = {
      "supply-center-majority": "Supply center majority",
      "timed-resolution": "Timed resolution",
      "province-control": "Province control",
    };

    return (
      <div className="max-w-xl space-y-3">
        {conditions.map((condition, index) => (
          <div key={index} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Select
                value={condition.type}
                onValueChange={val => setConditionType(index, val as VictoryConditionType)}
              >
                <SelectTrigger size="sm" className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LABELS) as VictoryConditionType[]).map(t => (
                    <SelectItem key={t} value={t}>{LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => removeCondition(index)}
                disabled={conditions.length <= 1}
                aria-label="Remove condition"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {condition.type === "supply-center-majority" && (
              <div className="flex items-center gap-3">
                <Label className="text-sm shrink-0">Supply centers to win</Label>
                <Input
                  type="number"
                  min={1}
                  value={condition.supplyCenters}
                  onChange={e =>
                    updateCondition(index, { supplyCenters: Math.max(1, parseInt(e.target.value) || 1) })
                  }
                  className="h-7 w-20 text-sm"
                />
              </div>
            )}

            {condition.type === "timed-resolution" && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Label className="text-sm shrink-0 w-20">End year</Label>
                  <Input
                    type="number"
                    value={condition.year}
                    onChange={e =>
                      updateCondition(index, { year: parseInt(e.target.value) || 1900 })
                    }
                    className="h-7 w-28 text-sm"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-sm shrink-0 w-20">Resolution</Label>
                  <Select
                    value={condition.resolution}
                    onValueChange={val =>
                      updateCondition(index, { resolution: val as "most-supply-centers" | "shared-draw" })
                    }
                  >
                    <SelectTrigger size="sm" className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="most-supply-centers">Most supply centers wins</SelectItem>
                      <SelectItem value="shared-draw">Shared draw</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {condition.type === "province-control" && (
              <div className="space-y-2">
                <Label className="text-sm">Provinces to control</Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {provinces.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No provinces defined.</p>
                  ) : (
                    [...provinces].sort((a, b) => a.id.localeCompare(b.id)).map(p => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40">
                        <Checkbox
                          checked={condition.provinces.includes(p.id)}
                          onCheckedChange={checked => {
                            const next = checked
                              ? [...condition.provinces, p.id]
                              : condition.provinces.filter(id => id !== p.id);
                            updateCondition(index, { provinces: next });
                          }}
                        />
                        <span className="text-sm">{p.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-sm shrink-0">From year</Label>
                  <Input
                    type="number"
                    value={condition.year ?? ""}
                    placeholder="Any year"
                    onChange={e => {
                      const val = e.target.value === "" ? undefined : parseInt(e.target.value);
                      updateCondition(index, { year: val });
                    }}
                    className="h-7 w-28 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">optional</span>
                </div>
              </div>
            )}
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={addCondition}>
          <Plus className="h-4 w-4" />
          Add Condition
        </Button>
      </div>
    );
  }
);

VictoryConditionsForm.displayName = "VictoryConditionsForm";

// ─── Adjudication modifiers step ──────────────────────────────────────────────

interface AdjudicationModifiersFormHandle {
  submit: () => void;
}

interface AdjudicationModifiersFormProps {
  defaultValues: string[];
  onSubmit: (data: string[]) => void;
}

const AdjudicationModifiersForm = forwardRef<AdjudicationModifiersFormHandle, AdjudicationModifiersFormProps>(
  ({ defaultValues, onSubmit }, ref) => {
    const [buildAnywhere, setBuildAnywhere] = useState(
      defaultValues.includes("allow-builds-in-non-home-centers")
    );

    useImperativeHandle(ref, () => ({
      submit: () => {
        const modifiers: string[] = [];
        if (buildAnywhere) modifiers.push("allow-builds-in-non-home-centers");
        onSubmit(modifiers);
      },
    }));

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Game Rules</h2>
          <p className="text-sm text-muted-foreground">Configure adjudicator rule modifiers for this variant.</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            checked={buildAnywhere}
            onCheckedChange={checked => setBuildAnywhere(checked === true)}
            className="mt-0.5"
          />
          <div>
            <p className="font-medium">Build anywhere</p>
            <p className="text-sm text-muted-foreground">
              Nations may build in any vacant owned supply center, not only home centers.
            </p>
          </div>
        </label>
      </div>
    );
  }
);

AdjudicationModifiersForm.displayName = "AdjudicationModifiersForm";

// ─── Partial dVAR assembly (for save-progress) ───────────────────────────────

function assemblePartialDvar(
  basicInfo: BasicInfoValues | null,
  nations: NationsValues["nations"] | null,
  provincesData: ProvincesFormValues | null,
  homeNationsData: HomeNationsData | null,
  adjacenciesData: DvarAdjacencyMap | null,
  dominanceRulesData: DominanceRulesData | null,
  phaseProgressionData: PhaseProgressionData | null,
  victoryConditionsData: VictoryConditionsData | null,
  adjudicationModifiersData: string[] | null,
): Record<string, unknown> {
  return assembleDvar({
    basicInfo: basicInfo ?? { id: "", name: "", description: "", author: "", startYear: 1901, rules: "" },
    nations: nations ?? [],
    provincesData: provincesData ?? { provinces: [] },
    homeNationsData: homeNationsData ?? {},
    adjacenciesData: adjacenciesData ?? {},
    dominanceRulesData: dominanceRulesData ?? {},
    phaseProgressionData: phaseProgressionData ?? [],
    victoryConditionsData: victoryConditionsData ?? [],
    adjudicationModifiersData: adjudicationModifiersData ?? [],
  });
}

// ─── Export step ──────────────────────────────────────────────────────────────

interface ExportStepProps {
  basicInfo: BasicInfoValues;
  nations: NationsValues["nations"];
  provincesData: ProvincesFormValues;
  homeNationsData: HomeNationsData;
  adjacenciesData: DvarAdjacencyMap;
  dominanceRulesData: DominanceRulesData;
  phaseProgressionData: PhaseProgressionData;
  victoryConditionsData: VictoryConditionsData;
  adjudicationModifiersData: string[];
}

function assembleDvar({
  basicInfo,
  nations,
  provincesData,
  homeNationsData,
  adjacenciesData,
  dominanceRulesData,
  phaseProgressionData,
  victoryConditionsData,
  adjudicationModifiersData,
}: ExportStepProps): Record<string, unknown> {
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

  const units = Object.entries(homeNationsData)
    .filter(([, v]) => v.startingUnit !== null && v.nation && v.nation !== "" && v.nation !== "neutral")
    .map(([provinceId, v]) => ({
      nation: v.nation,
      type: v.startingUnit === "army" ? "Army" : "Fleet",
      location: v.startingUnit === "fleet" && v.startingCoast ? v.startingCoast : provinceId,
    }));

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
      nation: e.provinceOccupier,
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

function ExportStep(props: ExportStepProps) {
  const { basicInfo, nations, provincesData, homeNationsData, phaseProgressionData, victoryConditionsData, dominanceRulesData } = props;

  const scCount = provincesData.provinces.filter(p => p.supplyCenter).length;
  const namedCoastCount = provincesData.provinces.reduce((n, p) => n + p.namedCoasts.length, 0);
  const unitCount = Object.values(homeNationsData).filter(v => v.startingUnit !== null && v.nation && v.nation !== "" && v.nation !== "neutral").length;
  const activeDominanceRules = Object.values(dominanceRulesData).filter(e => e.enabled).length;
  const nationMap = Object.fromEntries(nations.map(n => [n.id, n]));

  const handleDownload = () => {
    const output = assembleDvar(props);
    const json = JSON.stringify(output, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${basicInfo.id}.dvar`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const vcLabel = (vc: VictoryCondition): string => {
    if (vc.type === "supply-center-majority") return `Solo at ${vc.supplyCenters} supply centers`;
    if (vc.type === "timed-resolution")
      return `End at ${vc.year} — ${vc.resolution === "most-supply-centers" ? "most SCs wins" : "shared draw"}`;
    const ps = vc.provinces.join(", ");
    return vc.year ? `Control ${ps} from ${vc.year}` : `Control ${ps}`;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">

        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Variant</p>
          <p className="font-semibold">{basicInfo.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{basicInfo.id}</p>
          <p className="text-sm text-muted-foreground">{basicInfo.author} · start {basicInfo.startYear}</p>
        </div>

        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nations</p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {nations.map(n => (
              <span key={n.id} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: n.color }} />
                {n.name}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Map</p>
          <p className="text-sm">{provincesData.provinces.length} provinces · {scCount} supply centers</p>
          {namedCoastCount > 0 && <p className="text-sm">{namedCoastCount} named coasts</p>}
          <p className="text-sm">{unitCount} starting unit{unitCount !== 1 ? "s" : ""}</p>
          {activeDominanceRules > 0 && (
            <p className="text-sm">{activeDominanceRules} dominance rule{activeDominanceRules !== 1 ? "s" : ""}</p>
          )}
        </div>

        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phase Progression</p>
          <p className="text-sm leading-relaxed">
            {phaseProgressionData.map((e, i) => (
              <span key={i}>
                {e.season} {e.type}
                {e.yearDelta > 0 && <span className="text-muted-foreground"> (+{e.yearDelta}yr)</span>}
                {i < phaseProgressionData.length - 1 && " → "}
              </span>
            ))}
          </p>
        </div>

        <div className="rounded-lg border p-4 space-y-1 sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Victory Conditions</p>
          <ul className="space-y-0.5">
            {victoryConditionsData.map((vc, i) => (
              <li key={i} className="text-sm">{i + 1}. {vcLabel(vc)}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border p-4 space-y-1 sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Starting Units</p>
          {unitCount === 0 ? (
            <p className="text-sm text-muted-foreground">No starting units defined.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {Object.entries(homeNationsData)
                .filter(([, v]) => v.startingUnit !== null && v.nation && v.nation !== "" && v.nation !== "neutral")
                .map(([provinceId, v]) => {
                  const nation = nationMap[v.nation];
                  const location = v.startingUnit === "fleet" && v.startingCoast ? v.startingCoast : provinceId;
                  return (
                    <span key={provinceId} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                      {nation && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: nation.color }} />}
                      {v.startingUnit === "army" ? "A" : "F"} {location}
                    </span>
                  );
                })}
            </div>
          )}
        </div>

      </div>

      <Button size="lg" onClick={handleDownload} className="w-full sm:w-auto">
        <Download className="h-4 w-4" />
        Download {basicInfo.id}.dvar
      </Button>
    </div>
  );
}
