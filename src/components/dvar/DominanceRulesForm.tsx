import { forwardRef, useImperativeHandle, useState, useMemo } from "react";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { buildHomeNationPreviewSvg, extractDsvgProvinceShapes } from "@/utils/dvarPreview";
import { aspectRatioFromViewBox } from "@/utils/svgAspect";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import type { DominanceRulesData, HomeNationsData } from "@/types/dvar";
import type { DvarAdjacencyMap } from "@/utils/dvarAdjacency";

export interface DominanceRulesFormHandle {
  submit: () => void;
  getValues: () => DominanceRulesData;
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

export const DominanceRulesForm = forwardRef<DominanceRulesFormHandle, DominanceRulesFormProps>(
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

    useImperativeHandle(ref, () => ({ submit: () => onSubmit(rulesData), getValues: () => rulesData }));

    const { shapes, viewBox } = useMemo(() => extractDsvgProvinceShapes(svgContent), [svgContent]);

    const aspectRatio = useMemo(() => aspectRatioFromViewBox(viewBox), [viewBox]);

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
    const basePreviewUrl = useSvgObjectUrl(basePreviewSvg);

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
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">Dominance Rules (non-SC provinces)</p>
          <p>
            By default, the map colours non-SC provinces if all adjacent SCs are owned by the same power. For starting positions this can look wrong — for example, Gascony would not be coloured French if Spain is empty.
          </p>
          <p>
            Dominance rules let you override this per province. For example: colour Gascony as French <em>if</em> Spain is empty <em>and</em> Marseilles is French. The rule only applies when its conditions match exactly; otherwise the default logic is used. This way the visual boundaries of starting countries can be controlled precisely.
          </p>
          <p>
            This is <span className="font-medium text-foreground">cosmetic only</span> and has no effect on gameplay. It can be skipped entirely.
          </p>
        </div>

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
