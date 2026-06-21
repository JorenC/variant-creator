import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assembleDvar, NEUTRAL_NATION } from "@/utils/dvarAssemble";
import { DvarSchema } from "@/utils/dvarSchema";
import { validateDvarSemantics } from "@/utils/dvarValidate";
import type { AssembleDvarInput, ExtraUnit, VictoryCondition } from "@/types/dvar";

interface ExportStepProps extends AssembleDvarInput {
  /** Notifies the wizard that a valid .dvar was downloaded (lifts leave guards). */
  onDownloaded?: () => void;
  /** Lifts the wizard's in-app navigation guard for the upcoming navigate. */
  onLeaveApproved?: () => void;
}

export function ExportStep(props: ExportStepProps) {
  const { basicInfo, nations, provincesData, homeNationsData, extraUnits, phaseProgressionData, victoryConditionsData, dominanceRulesData, onDownloaded, onLeaveApproved } = props;
  const navigate = useNavigate();
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [neutralName, setNeutralName] = useState(props.neutralName?.trim() || NEUTRAL_NATION.name);

  const hasNeutral =
    Object.values(homeNationsData).some(v => v.nation === "neutral") ||
    (extraUnits ?? []).some((eu: ExtraUnit) => eu.nation === "neutral") ||
    Object.values(dominanceRulesData).some(
      e => e.enabled && (e.provinceOccupier === "neutral" || Object.values(e.conditions).includes("neutral"))
    );

  const handleContinue = () => {
    if (
      !hasDownloaded &&
      !window.confirm(
        "You haven't downloaded the .dvar file yet — leaving this page discards your work. Continue anyway?"
      )
    ) {
      return;
    }
    onLeaveApproved?.();
    navigate("/upload-diplicity");
  };

  const scCount = provincesData.provinces.filter(p => p.supplyCenter).length;
  const namedCoastCount = provincesData.provinces.reduce((n, p) => n + p.namedCoasts.length, 0);
  const homeUnitCount = Object.values(homeNationsData).filter(v => v.startingUnit !== null && v.nation && v.nation !== "").length;
  const extraUnitCount = (extraUnits ?? []).filter((eu: ExtraUnit) => eu.province && eu.nation && eu.unit).length;
  const unitCount = homeUnitCount + extraUnitCount;
  const activeDominanceRules = Object.values(dominanceRulesData).filter(e => e.enabled).length;
  const nationMap = Object.fromEntries([...nations, NEUTRAL_NATION].map(n => [n.id, n]));

  const handleDownload = () => {
    setSchemaError(null);
    const output = assembleDvar({ ...props, neutralName });
    const result = DvarSchema.safeParse(output);
    if (!result.success) {
      const messages = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("\n");
      setSchemaError(messages);
      return;
    }
    // The server additionally enforces reference integrity and adjacency
    // symmetry; surface those failures here instead of at upload time.
    const semanticErrors = validateDvarSemantics(result.data);
    if (semanticErrors.length > 0) {
      setSchemaError(semanticErrors.join("\n"));
      return;
    }
    setHasDownloaded(true);
    onDownloaded?.();
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

        {hasNeutral && (
          <div className="rounded-lg border p-4 space-y-2 sm:col-span-2">
            <Label htmlFor="neutral-name" className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: NEUTRAL_NATION.color }} />
              Neutral power name
            </Label>
            <Input
              id="neutral-name"
              value={neutralName}
              onChange={e => setNeutralName(e.target.value)}
              placeholder={NEUTRAL_NATION.name}
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Supply centers and units assigned to Neutral belong to this auto-generated, non-playable power.
            </p>
          </div>
        )}

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
                .filter(([, v]) => v.startingUnit !== null && v.nation && v.nation !== "")
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
              {(extraUnits ?? [])
                .filter((eu: ExtraUnit) => eu.province && eu.nation && eu.unit)
                .map((eu: ExtraUnit) => {
                  const nation = nationMap[eu.nation];
                  const location = eu.unit === "fleet" && eu.coast ? eu.coast : eu.province;
                  return (
                    <span key={eu.id} className="flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs">
                      {nation && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: nation.color }} />}
                      {eu.unit === "army" ? "A" : "F"} {location}
                    </span>
                  );
                })}
            </div>
          )}
        </div>

      </div>

      {schemaError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive space-y-1.5">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Schema validation failed — this file cannot be uploaded to Diplicity
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs">{schemaError}</pre>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={handleDownload} className="w-full sm:w-auto">
          <Download className="h-4 w-4" />
          Download {basicInfo.id}.dvar
        </Button>
        <Button size="lg" variant="outline" onClick={handleContinue}>
          Continue to Upload to Diplicity
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
