import { useNavigate } from "react-router-dom";
import { Download, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assembleDvar } from "@/utils/dvarAssemble";
import type { AssembleDvarInput, VictoryCondition } from "@/types/dvar";

export function ExportStep(props: AssembleDvarInput) {
  const { basicInfo, nations, provincesData, homeNationsData, phaseProgressionData, victoryConditionsData, dominanceRulesData } = props;
  const navigate = useNavigate();

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

      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={handleDownload} className="w-full sm:w-auto">
          <Download className="h-4 w-4" />
          Download {basicInfo.id}.dvar
        </Button>
        <Button size="lg" variant="outline" onClick={() => navigate("/upload-diplicity")}>
          Continue to Upload to Diplicity
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
