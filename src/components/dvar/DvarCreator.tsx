import { useState, useRef, useId } from "react";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import { sanitizeDvarImport } from "@/utils/dvarImport";
import { AppHeader } from "@/components/common/AppHeader";
import {
  Upload,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
  Download,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { validateDsvg, parseDsvg } from "@/utils/parseDsvg";
import { buildEmptyDvarAdjacencyMap } from "@/utils/dvarAdjacency";
import { computeMismatches, applyIdRemapping, collectPreFillWarnings } from "@/utils/dvarReconcile";
import {
  buildInitialProvinces,
  buildInitialDominanceRules,
  assemblePartialDvar,
  orderTransitionsIntoChain,
  reconcileHomeNationsWithProvinces,
  DEFAULT_PHASE_ENTRIES,
  DEFAULT_VICTORY_CONDITIONS,
  NEUTRAL_NATION,
} from "@/utils/dvarAssemble";
import type { ParsedDsvg } from "@/utils/parseDsvg";
import type { DvarAdjacencyMap, PassType } from "@/utils/dvarAdjacency";
import type {
  Step,
  HomeNationsData,
  HomeNationsFormValues,
  ExtraUnit,
  DominanceRulesData,
  PhaseProgressionData,
  PhaseType,
  VictoryConditionsData,
  ProvincesFormValues,
  DvarJson,
  ReconcileMap,
  ReconcileMismatches,
} from "@/types/dvar";
import type {
  BasicInfoValues,
  NationsValues,
  ProvinceNamesFormValues,
  ProvinceTypesFormValues,
} from "@/components/dvar/schemas";
import { DVAR_STEPS, STEP_META } from "@/components/dvar/steps";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ReconcileStep } from "@/components/dvar/ReconcileStep";
import { BasicInfoForm, type BasicInfoFormHandle } from "@/components/dvar/BasicInfoForm";
import { NationsForm, type NationsFormHandle } from "@/components/dvar/NationsForm";
import { ProvinceNamesForm, type ProvinceNamesFormHandle } from "@/components/dvar/ProvinceNamesForm";
import { ProvinceTypesForm, type ProvinceTypesFormHandle } from "@/components/dvar/ProvinceTypesForm";
import { HomeNationsForm, type HomeNationsFormHandle } from "@/components/dvar/HomeNationsForm";
import { AdjacenciesForm, type AdjacenciesFormHandle } from "@/components/dvar/AdjacenciesForm";
import { DominanceRulesForm, type DominanceRulesFormHandle } from "@/components/dvar/DominanceRulesForm";
import { PhaseProgressionForm, type PhaseProgressionFormHandle } from "@/components/dvar/PhaseProgressionForm";
import { VictoryConditionsForm, type VictoryConditionsFormHandle } from "@/components/dvar/VictoryConditionsForm";
import { AdjudicationModifiersForm, type AdjudicationModifiersFormHandle } from "@/components/dvar/AdjudicationModifiersForm";
import { ExportStep } from "@/components/dvar/ExportStep";

export function DvarCreator() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [parsedDsvg, setParsedDsvgState] = useState<ParsedDsvg | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingDvar, setIsDraggingDvar] = useState(false);
  const [basicInfo, setBasicInfo] = useState<BasicInfoValues | null>(null);
  const [nations, setNations] = useState<NationsValues["nations"] | null>(null);
  const [provincesData, setProvincesData] = useState<ProvincesFormValues | null>(null);
  const [homeNationsData, setHomeNationsData] = useState<HomeNationsData | null>(null);
  const [extraUnitsData, setExtraUnitsData] = useState<ExtraUnit[] | null>(null);
  const [adjacenciesData, setAdjacenciesData] = useState<DvarAdjacencyMap | null>(null);
  const [dominanceRulesData, setDominanceRulesData] = useState<DominanceRulesData | null>(null);
  const [phaseProgressionData, setPhaseProgressionData] = useState<PhaseProgressionData | null>(null);
  const [victoryConditionsData, setVictoryConditionsData] = useState<VictoryConditionsData | null>(null);
  const [adjudicationModifiersData, setAdjudicationModifiersData] = useState<string[] | null>(null);
  const [neutralName, setNeutralName] = useState<string>(NEUTRAL_NATION.name);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dvarInputRef = useRef<HTMLInputElement>(null);
  const [pendingDvar, setPendingDvar] = useState<DvarJson | null>(null);
  const [pendingDvarFileName, setPendingDvarFileName] = useState<string | null>(null);
  const [pendingDvarDropped, setPendingDvarDropped] = useState<string[]>([]);
  const [exportDownloaded, setExportDownloaded] = useState(false);
  const [dvarError, setDvarError] = useState<string | null>(null);
  const [reconcileMismatches, setReconcileMismatches] = useState<ReconcileMismatches | null>(null);
  const [provinceReconcileMap, setProvinceReconcileMap] = useState<ReconcileMap>({});
  const [coastReconcileMap, setCoastReconcileMap] = useState<ReconcileMap>({});
  const [preFillWarnings, setPreFillWarnings] = useState<string[]>([]);
  const basicInfoRef = useRef<BasicInfoFormHandle>(null);
  const nationsRef = useRef<NationsFormHandle>(null);
  const provinceNamesRef = useRef<ProvinceNamesFormHandle>(null);
  const provinceTypesRef = useRef<ProvinceTypesFormHandle>(null);
  const homeNationsRef = useRef<HomeNationsFormHandle>(null);
  const adjacenciesRef = useRef<AdjacenciesFormHandle>(null);
  const dominanceRulesRef = useRef<DominanceRulesFormHandle>(null);
  const phaseProgressionRef = useRef<PhaseProgressionFormHandle>(null);
  const victoryConditionsRef = useRef<VictoryConditionsFormHandle>(null);
  const adjudicationModifiersRef = useRef<AdjudicationModifiersFormHandle>(null);
  const hasWork = step !== "upload" || svgContent !== null || pendingDvar !== null;
  const { allowNavigation } = useUnsavedWorkGuard(hasWork && !(step === "export" && exportDownloaded));

  const basicInfoFormId = useId();
  const nationsFormId = useId();
  const provinceNamesFormId = useId();
  const provinceTypesFormId = useId();

  const processDvarFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".dvar")) {
      setDvarError("Please upload a .dvar file.");
      return;
    }
    try {
      const content = await file.text();
      const sanitized = sanitizeDvarImport(JSON.parse(content));
      if (!sanitized) {
        setPendingDvar(null);
        setPendingDvarFileName(null);
        setDvarError("Invalid .dvar file — expected a JSON object.");
        return;
      }
      setPendingDvar(sanitized.dvar);
      setPendingDvarFileName(file.name);
      setPendingDvarDropped(sanitized.dropped);
      setDvarError(null);
    } catch {
      setPendingDvar(null);
      setPendingDvarFileName(null);
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

    // nations — non-playable powers (e.g. the auto-generated neutral) are not
    // user-editable nations; strip them here and fold their ownership back into
    // the "neutral" sentinel below so the wizard round-trips them transparently.
    const nonPlayableIds = new Set((dvar.nations ?? []).filter(n => n.non_playable).map(n => n.id));
    const ownerOf = (nation: string) => (nonPlayableIds.has(nation) ? "neutral" : nation);
    setNations(
      (dvar.nations ?? [])
        .filter(n => !n.non_playable)
        .map(n => ({ id: n.id, name: n.name, color: n.color }))
    );
    const importedNeutral = (dvar.nations ?? []).find(n => n.non_playable);
    setNeutralName(importedNeutral?.name ?? NEUTRAL_NATION.name);

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

    // home nations + extra units
    const scNationMap = Object.fromEntries((dvar.initialState?.supplyCenters ?? []).map(sc => [sc.province, ownerOf(sc.nation)]));
    const homeNations: HomeNationsData = {};
    for (const p of provinces) {
      if (!p.supplyCenter) continue;
      homeNations[p.id] = { nation: scNationMap[p.id] ?? "", startingUnit: null, startingCoast: null };
    }
    const extraUnits: ExtraUnit[] = [];
    for (const unit of dvar.initialState?.units ?? []) {
      const provinceId = unit.location.includes("/") ? unit.location.split("/")[0] : unit.location;
      const unitNation = ownerOf(unit.nation);
      const homeNation = scNationMap[provinceId];
      if (homeNation && homeNation === unitNation && homeNations[provinceId]) {
        homeNations[provinceId] = {
          ...homeNations[provinceId],
          startingUnit: unit.type === "Army" ? "army" : "fleet",
          startingCoast: unit.location.includes("/") ? unit.location : null,
        };
      } else {
        extraUnits.push({
          id: crypto.randomUUID(),
          province: provinceId,
          nation: unitNation,
          unit: unit.type === "Army" ? "army" : "fleet",
          coast: unit.location.includes("/") ? unit.location : null,
        });
      }
    }
    setHomeNationsData(homeNations);
    setExtraUnitsData(extraUnits.length > 0 ? extraUnits : null);

    // dominance rules: start from the auto-detected structure, then overlay enabled rules.
    // Map file owners back to the form's sentinels: the neutral power (capital
    // "Neutral" sentinel or any non-playable nation id) becomes "neutral", and
    // the unowned marker "Empty" becomes "empty".
    const domOwner = (n: string) =>
      n === "Empty" ? "empty" : n === "Neutral" || nonPlayableIds.has(n) ? "neutral" : n;
    const baseDR = buildInitialDominanceRules(adjacencyMap, provinces);
    for (const rule of dvar.dominanceRules ?? []) {
      if (!baseDR[rule.province]) {
        baseDR[rule.province] = { enabled: true, provinceOccupier: domOwner(rule.nation), conditions: {} };
      } else {
        baseDR[rule.province].enabled = true;
        baseDR[rule.province].provinceOccupier = domOwner(rule.nation);
      }
      for (const dep of rule.dependencies) {
        baseDR[rule.province].conditions[dep.province] = domOwner(dep.nation);
      }
    }
    setDominanceRulesData(baseDR);

    // phase progression: each entry[i] = { from.season, from.type, to.yearDelta }.
    // The wizard re-links entries in list order on export, so order the
    // transitions into their actual from→to chain first — the file format
    // makes no ordering guarantee.
    const phase = dvar.initialState?.phase;
    const transitions = orderTransitionsIntoChain(
      dvar.phaseProgression?.transitions ?? [],
      phase?.season && phase?.type ? { season: phase.season, type: phase.type } : undefined
    );
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

    setPreFillWarnings([...pendingDvarDropped, ...collectPreFillWarnings(dvar)]);
  };

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".d.svg")) {
      setError(
        file.name.toLowerCase().endsWith(".svg")
          ? "This looks like a regular SVG file. A .d.svg is a specially prepared file — create one using the dSVG Creator first."
          : "Please upload a .d.svg file. Create one using the dSVG Creator first."
      );
      return;
    }

    try {
      const content = await file.text();
      const validationError = validateDsvg(content);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setFileName(file.name);
      setSvgContent(content);
      setParsedDsvgState(parseDsvg(content));
    } catch {
      setError("Could not read the file. Please try again.");
    }
  };

  // The upload step is gated behind an explicit Continue so the optional dVAR
  // can still be attached after the dSVG — auto-advancing on dSVG upload made
  // the pre-fill slot unreachable for anyone who uploaded in the other order.
  const handleUploadContinue = () => {
    if (!parsedDsvg) return;
    if (pendingDvar) {
      const mismatches = computeMismatches(pendingDvar, parsedDsvg);
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

  const handleDvarDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingDvar(false);
    const file = e.dataTransfer.files[0];
    if (file) processDvarFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const resetAll = () => {
    setStep("upload");
    setFileName(null);
    setSvgContent(null);
    setParsedDsvgState(null);
    setError(null);
    setBasicInfo(null);
    setNations(null);
    setProvincesData(null);
    setHomeNationsData(null);
    setExtraUnitsData(null);
    setAdjacenciesData(null);
    setDominanceRulesData(null);
    setPhaseProgressionData(null);
    setVictoryConditionsData(null);
    setAdjudicationModifiersData(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPendingDvar(null);
    setPendingDvarFileName(null);
    setDvarError(null);
    if (dvarInputRef.current) dvarInputRef.current.value = "";
    setReconcileMismatches(null);
    setProvinceReconcileMap({});
    setCoastReconcileMap({});
    setPreFillWarnings([]);
    setPendingDvarDropped([]);
    setExportDownloaded(false);
  };

  const handleClear = () => {
    if (
      hasWork &&
      !window.confirm("Clearing discards everything you've entered in this wizard. Clear anyway?")
    ) {
      return;
    }
    resetAll();
  };

  // Reads the active step's in-progress form values through its imperative
  // handle, commits them to wizard state, and returns the updated snapshot.
  // Used by both Back navigation (so going back never discards edits) and
  // "Save progress".
  const captureCurrentStep = () => {
    let currentBasicInfo = basicInfo;
    let currentNations = nations;
    let currentProvincesData = provincesData;
    let currentHomeNationsData = homeNationsData;
    let currentExtraUnitsData = extraUnitsData;
    let currentAdjacenciesData = adjacenciesData;
    let currentDominanceRulesData = dominanceRulesData;
    let currentPhaseProgressionData = phaseProgressionData;
    let currentVictoryConditionsData = victoryConditionsData;
    let currentAdjudicationModifiersData = adjudicationModifiersData;

    if (step === "basic-info" && basicInfoRef.current) {
      currentBasicInfo = basicInfoRef.current.getValues();
      setBasicInfo(currentBasicInfo);
    } else if (step === "nations" && nationsRef.current) {
      currentNations = nationsRef.current.getValues();
      setNations(currentNations);
    } else if (step === "province-names" && provinceNamesRef.current && parsedDsvg) {
      const formValues = provinceNamesRef.current.getValues();
      const base = (provincesData && provincesData.provinces.length > 0)
        ? provincesData.provinces
        : buildInitialProvinces(parsedDsvg);
      const nameMap = new Map(formValues.provinces.map(p => [p.id, p]));
      currentProvincesData = {
        provinces: base.map(p => {
          const n = nameMap.get(p.id);
          return {
            ...p,
            name: n?.name ?? p.name,
            namedCoasts: p.namedCoasts.map((c, j) => ({
              ...c,
              name: n?.namedCoasts[j]?.name ?? c.name,
            })),
          };
        }),
      };
      setProvincesData(currentProvincesData);
    } else if (step === "province-types" && provinceTypesRef.current && parsedDsvg) {
      const formValues = provinceTypesRef.current.getValues();
      const base = (provincesData && provincesData.provinces.length > 0)
        ? provincesData.provinces
        : buildInitialProvinces(parsedDsvg);
      const typeMap = new Map(formValues.provinces.map(p => [p.id, p]));
      currentProvincesData = {
        provinces: base.map(p => {
          const t = typeMap.get(p.id);
          return { ...p, type: t?.type ?? p.type, supplyCenter: t?.supplyCenter ?? p.supplyCenter };
        }),
      };
      setProvincesData(currentProvincesData);
    } else if (step === "home-nations" && homeNationsRef.current) {
      const vals = homeNationsRef.current.getValues();
      currentHomeNationsData = vals.assignments;
      currentExtraUnitsData = vals.extraUnits;
      setHomeNationsData(currentHomeNationsData);
      setExtraUnitsData(currentExtraUnitsData);
    } else if (step === "adjacencies" && adjacenciesRef.current) {
      currentAdjacenciesData = adjacenciesRef.current.getValues();
      setAdjacenciesData(currentAdjacenciesData);
    } else if (step === "dominance-rules" && dominanceRulesRef.current) {
      currentDominanceRulesData = dominanceRulesRef.current.getValues();
      setDominanceRulesData(currentDominanceRulesData);
    } else if (step === "phase-progression" && phaseProgressionRef.current) {
      currentPhaseProgressionData = phaseProgressionRef.current.getValues();
      setPhaseProgressionData(currentPhaseProgressionData);
    } else if (step === "victory-conditions" && victoryConditionsRef.current) {
      currentVictoryConditionsData = victoryConditionsRef.current.getValues();
      setVictoryConditionsData(currentVictoryConditionsData);
    } else if (step === "adjudication-modifiers" && adjudicationModifiersRef.current) {
      currentAdjudicationModifiersData = adjudicationModifiersRef.current.getValues();
      setAdjudicationModifiersData(currentAdjudicationModifiersData);
    }

    return {
      basicInfo: currentBasicInfo,
      nations: currentNations,
      provincesData: currentProvincesData,
      homeNationsData: currentHomeNationsData,
      extraUnitsData: currentExtraUnitsData,
      adjacenciesData: currentAdjacenciesData,
      dominanceRulesData: currentDominanceRulesData,
      phaseProgressionData: currentPhaseProgressionData,
      victoryConditionsData: currentVictoryConditionsData,
      adjudicationModifiersData: currentAdjudicationModifiersData,
    };
  };

  const handleBack = () => {
    if (step === "reconcile" || step === "basic-info") {
      if (
        window.confirm(
          "Going back to the upload step clears everything you've entered in this wizard. Continue?"
        )
      ) {
        resetAll();
      }
      return;
    }
    // Snapshot in-progress edits so going back never discards them.
    captureCurrentStep();
    if (step === "nations") setStep("basic-info");
    if (step === "province-names") setStep("nations");
    if (step === "province-types") setStep("province-names");
    if (step === "home-nations") setStep("province-types");
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
    setStep("province-names");
  };

  const handleProvinceNamesSubmit = (values: ProvinceNamesFormValues) => {
    const base = (provincesData && provincesData.provinces.length > 0)
      ? provincesData.provinces
      : buildInitialProvinces(parsedDsvg!);
    const nameMap = new Map(values.provinces.map(p => [p.id, p]));
    const merged = base.map(p => {
      const n = nameMap.get(p.id);
      return {
        ...p,
        name: n?.name ?? p.name,
        namedCoasts: p.namedCoasts.map((c, j) => ({
          ...c,
          name: n?.namedCoasts[j]?.name ?? c.name,
        })),
      };
    });
    setProvincesData({ provinces: merged });
    setStep("province-types");
  };

  const handleProvinceTypesSubmit = (values: ProvinceTypesFormValues) => {
    const base = (provincesData && provincesData.provinces.length > 0)
      ? provincesData.provinces
      : buildInitialProvinces(parsedDsvg!);
    const typeMap = new Map(values.provinces.map(p => [p.id, p]));
    const merged = base.map(p => {
      const t = typeMap.get(p.id);
      return { ...p, type: t?.type ?? p.type, supplyCenter: t?.supplyCenter ?? p.supplyCenter };
    });
    setProvincesData({ provinces: merged });
    setAdjacenciesData(
      prev => prev ?? buildEmptyDvarAdjacencyMap([
        ...merged.map(p => p.id),
        ...merged.flatMap(p => p.namedCoasts.map(c => c.id)),
      ])
    );
    // Keep dependent unit data consistent with the (possibly re-edited)
    // SC flags and terrain types: drop entries for de-flagged SCs, add
    // blanks for new ones, and clear units that no longer fit the terrain.
    const reconciled = reconcileHomeNationsWithProvinces(homeNationsData ?? {}, extraUnitsData, merged);
    setHomeNationsData(reconciled.homeNations);
    setExtraUnitsData(reconciled.extraUnits);
    setStep("home-nations");
  };

  const handleHomeNationsSubmit = (data: HomeNationsFormValues) => {
    setHomeNationsData(data.assignments);
    setExtraUnitsData(data.extraUnits);
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
    const snapshot = captureCurrentStep();
    const output = assemblePartialDvar(
      snapshot.basicInfo, snapshot.nations, snapshot.provincesData, snapshot.homeNationsData,
      snapshot.adjacenciesData, snapshot.dominanceRulesData, snapshot.phaseProgressionData,
      snapshot.victoryConditionsData, snapshot.adjudicationModifiersData, snapshot.extraUnitsData,
    );
    const id = snapshot.basicInfo?.id?.trim() || fileName?.replace(/\.d\.svg$/i, "") || "draft";
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
    step === "province-names" ? provinceNamesFormId :
    step === "province-types" ? provinceTypesFormId :
    null;

  return (
    <>
    <AppHeader
      steps={DVAR_STEPS}
      currentStep={step === "reconcile" ? "upload" : step}
      title="dVAR creator"
      filename={fileName}
      onClear={handleClear}
    />
    <div className="flex min-h-screen flex-col items-center p-8">
      <div className="flex w-full max-w-5xl flex-col gap-6">
        {step === "upload" ? (
          <>
            <div>
              <h1 className="text-3xl font-bold">Upload your dSVG</h1>
              <p className="mt-1 text-muted-foreground">
                Upload a dSVG file to begin building your variant definition.
              </p>
            </div>

            <p className="text-sm text-muted-foreground rounded-md border px-4 py-3">
              In this tool you will add the metadata for your variant — province names, nations, connections, and victory conditions. The dSVG is needed first so the tool can parse the map. If you already have a dVAR from a previous session or an existing variant you want to update, upload it alongside the dSVG and all known information will be auto-filled, so you can move through quickly and only fix what has changed.
            </p>

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
                    isDragging || svgContent
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-muted-foreground/50"
                  )}
                >
                  {svgContent ? (
                    <>
                      <MapIcon className="h-10 w-10 text-primary" />
                      <p className="text-center text-sm font-medium">{fileName}</p>
                      <p className="text-center text-xs text-muted-foreground">
                        {parsedDsvg?.provinceIds.length ?? 0} provinces detected
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-muted-foreground" />
                      <p className="text-center text-sm text-muted-foreground">
                        Drop a <span className="font-mono font-medium">.d.svg</span> file here or click to upload
                      </p>
                    </>
                  )}
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
                <p className="text-xs text-muted-foreground">
                  If updating an existing variant, upload your previous <span className="font-mono">.dvar</span> alongside the dSVG — in either order.
                </p>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => dvarInputRef.current?.click()}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ")
                      dvarInputRef.current?.click();
                  }}
                  onDrop={handleDvarDrop}
                  onDragOver={e => { e.preventDefault(); setIsDraggingDvar(true); }}
                  onDragLeave={e => { e.preventDefault(); setIsDraggingDvar(false); }}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 transition-colors",
                    isDraggingDvar
                      ? "border-primary bg-primary/5"
                      : pendingDvar
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-muted-foreground/50"
                  )}
                >
                  {pendingDvar ? (
                    <>
                      <Download className="h-10 w-10 text-primary" />
                      <p className="text-center text-sm font-medium">{pendingDvarFileName}</p>
                      <p className="text-center text-xs text-muted-foreground">Will pre-fill your settings on continue</p>
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

            <div className="flex justify-end">
              <Button disabled={!parsedDsvg} onClick={handleUploadContinue}>
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : step === "reconcile" ? (
          <>
            <div>
              <h1 className="text-3xl font-bold">Reconcile IDs</h1>
              <p className="mt-1 text-muted-foreground">
                Map dVAR IDs that are missing from the uploaded dSVG to their new equivalents.
              </p>
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
            <div>
              <h1 className="text-3xl font-bold">
                {STEP_META[step as Exclude<Step, "upload" | "reconcile">].title}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {STEP_META[step as Exclude<Step, "upload" | "reconcile">].subtitle}
              </p>
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
                ref={basicInfoRef}
                formId={basicInfoFormId}
                defaultValues={basicInfo ?? undefined}
                onSubmit={handleBasicInfoSubmit}
              />
            )}

            {step === "nations" && (
              <NationsForm
                ref={nationsRef}
                formId={nationsFormId}
                defaultValues={nations ? { nations } : undefined}
                onSubmit={handleNationsSubmit}
              />
            )}

            {step === "province-names" && svgContent && parsedDsvg && (() => {
              const base = (provincesData && provincesData.provinces.length > 0)
                ? [...provincesData.provinces].sort((a, b) => a.id.localeCompare(b.id))
                : buildInitialProvinces(parsedDsvg);
              return (
                <ProvinceNamesForm
                  ref={provinceNamesRef}
                  formId={provinceNamesFormId}
                  svgContent={svgContent}
                  defaultValues={{ provinces: base.map(p => ({ id: p.id, name: p.name, namedCoasts: p.namedCoasts.map(c => ({ id: c.id, name: c.name })) })) }}
                  onSubmit={handleProvinceNamesSubmit}
                />
              );
            })()}

            {step === "province-types" && svgContent && parsedDsvg && (() => {
              const base = (provincesData && provincesData.provinces.length > 0)
                ? [...provincesData.provinces].sort((a, b) => a.id.localeCompare(b.id))
                : buildInitialProvinces(parsedDsvg);
              const namedCoastParentIds = new Set(
                base.filter(p => p.namedCoasts.length > 0).map(p => p.id)
              );
              return (
                <ProvinceTypesForm
                  ref={provinceTypesRef}
                  formId={provinceTypesFormId}
                  svgContent={svgContent}
                  namedCoastParentIds={namedCoastParentIds}
                  defaultValues={{
                    provinces: base.map(p => ({
                      id: p.id,
                      type: namedCoastParentIds.has(p.id) && !p.type ? "land" : p.type,
                      supplyCenter: p.supplyCenter,
                    })),
                  }}
                  onSubmit={handleProvinceTypesSubmit}
                />
              );
            })()}

            {step === "home-nations" && svgContent && homeNationsData && provincesData && nations && (
              <HomeNationsForm
                ref={homeNationsRef}
                svgContent={svgContent}
                scProvinces={provincesData.provinces.filter(p => p.supplyCenter)}
                allProvinces={provincesData.provinces}
                nations={nations}
                defaultValues={homeNationsData}
                defaultExtraUnits={extraUnitsData ?? undefined}
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
                onDownloaded={() => setExportDownloaded(true)}
                onLeaveApproved={allowNavigation}
                basicInfo={basicInfo}
                nations={nations}
                provincesData={provincesData}
                homeNationsData={homeNationsData}
                extraUnits={extraUnitsData ?? []}
                adjacenciesData={adjacenciesData}
                dominanceRulesData={dominanceRulesData}
                phaseProgressionData={phaseProgressionData}
                victoryConditionsData={victoryConditionsData}
                adjudicationModifiersData={adjudicationModifiersData ?? []}
                neutralName={neutralName}
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
          onChange={e => { const f = e.target.files?.[0]; if (f) processDvarFile(f); e.target.value = ""; }}
          className="hidden"
          aria-label="Upload dVAR file"
        />
      </div>
    </div>

    <Dialog open={preFillWarnings.length > 0} onOpenChange={open => { if (!open) setPreFillWarnings([]); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Elements dropped</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The following data from your dVAR could not be carried over and was dropped:
        </p>
        <ul className="space-y-1">
          {preFillWarnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              {w}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={() => setPreFillWarnings([])}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
