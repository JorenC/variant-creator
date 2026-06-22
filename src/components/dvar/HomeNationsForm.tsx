import { forwardRef, useImperativeHandle, useState, useMemo } from "react";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NEUTRAL_NATION } from "@/utils/dvarAssemble";
import { buildHomeNationPreviewSvg, extractDsvgProvinceShapes } from "@/utils/dvarPreview";
import { aspectRatioFromViewBox } from "@/utils/svgAspect";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import type { ExtraUnit, HomeNationsData, HomeNationsFormValues } from "@/types/dvar";

type Province = { id: string; name: string; type: string; namedCoasts: Array<{ id: string; name: string }> };

export interface HomeNationsFormHandle {
  submit: () => void;
  getValues: () => HomeNationsFormValues;
}

interface HomeNationsFormProps {
  svgContent: string;
  scProvinces: Province[];
  allProvinces: Province[];
  nations: Array<{ id: string; name: string; color: string }>;
  defaultValues: HomeNationsData;
  defaultExtraUnits?: ExtraUnit[];
  onSubmit: (data: HomeNationsFormValues) => void;
}

interface ValidationErrors {
  coastErrors: Set<string>;
  terrainErrors: Set<string>;
  incompleteExtra: Set<string>;
  coastExtra: Set<string>;
  duplicateExtra: Set<string>;
  conflictExtra: Set<string>;
  conflictHome: Set<string>;
}

export const HomeNationsForm = forwardRef<HomeNationsFormHandle, HomeNationsFormProps>(
  ({ svgContent, scProvinces, allProvinces, nations, defaultValues, defaultExtraUnits, onSubmit }, ref) => {
    const sortedProvinces = useMemo(
      () => [...scProvinces].sort((a, b) => a.id.localeCompare(b.id)),
      [scProvinces]
    );
    const sortedAllProvinces = useMemo(
      () => [...allProvinces].sort((a, b) => a.name.localeCompare(b.name)),
      [allProvinces]
    );
    const allProvincesMap = useMemo(
      () => new Map(allProvinces.map(p => [p.id, p])),
      [allProvinces]
    );

    const [assignment, setAssignment] = useState<HomeNationsData>(defaultValues);
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [extraUnitsEnabled, setExtraUnitsEnabled] = useState(
      () => (defaultExtraUnits?.length ?? 0) > 0
    );
    const [extraUnits, setExtraUnits] = useState<ExtraUnit[]>(defaultExtraUnits ?? []);

    const validationErrors = useMemo((): ValidationErrors => {
      const empty: ValidationErrors = {
        coastErrors: new Set(),
        terrainErrors: new Set(),
        incompleteExtra: new Set(),
        coastExtra: new Set(),
        duplicateExtra: new Set(),
        conflictExtra: new Set(),
        conflictHome: new Set(),
      };
      if (!submitAttempted) return empty;

      const coastErrors = new Set<string>();
      for (const province of sortedProvinces) {
        const entry = assignment[province.id];
        if (entry?.startingUnit === "fleet" && province.namedCoasts.length > 0 && !entry.startingCoast) {
          coastErrors.add(province.id);
        }
      }

      // Terrain mismatches can also arrive as stale data (province retyped on
      // an earlier step after the unit was assigned), so check on submit too.
      const terrainErrors = new Set<string>();
      for (const province of sortedProvinces) {
        const unit = assignment[province.id]?.startingUnit ?? null;
        if ((unit === "fleet" && province.type === "land") || (unit === "army" && province.type === "sea")) {
          terrainErrors.add(province.id);
        }
      }

      const incompleteExtra = new Set<string>();
      const coastExtra = new Set<string>();
      const duplicateExtra = new Set<string>();
      const conflictExtra = new Set<string>();
      const conflictHome = new Set<string>();

      if (extraUnitsEnabled) {
        for (const eu of extraUnits) {
          if (!eu.province || !eu.nation || !eu.unit) incompleteExtra.add(eu.id);
        }

        for (const eu of extraUnits) {
          if (eu.unit === "fleet" && eu.province) {
            const prov = allProvincesMap.get(eu.province);
            if (prov && prov.namedCoasts.length > 0 && !eu.coast) coastExtra.add(eu.id);
          }
        }

        const provinceCounts = new Map<string, number>();
        for (const eu of extraUnits) {
          if (eu.province) provinceCounts.set(eu.province, (provinceCounts.get(eu.province) ?? 0) + 1);
        }
        for (const eu of extraUnits) {
          if (eu.province && (provinceCounts.get(eu.province) ?? 0) > 1) duplicateExtra.add(eu.id);
        }

        const homeSCWithUnit = new Set(
          sortedProvinces
            .filter(p => (assignment[p.id]?.startingUnit ?? null) !== null)
            .map(p => p.id)
        );
        for (const eu of extraUnits) {
          if (eu.province && homeSCWithUnit.has(eu.province)) {
            conflictExtra.add(eu.id);
            conflictHome.add(eu.province);
          }
        }
      }

      return { coastErrors, terrainErrors, incompleteExtra, coastExtra, duplicateExtra, conflictExtra, conflictHome };
    }, [submitAttempted, sortedProvinces, assignment, extraUnits, extraUnitsEnabled, allProvincesMap]);

    const hasAnyError = useMemo(() => {
      const e = validationErrors;
      return (
        e.coastErrors.size > 0 ||
        e.terrainErrors.size > 0 ||
        e.incompleteExtra.size > 0 ||
        e.coastExtra.size > 0 ||
        e.duplicateExtra.size > 0 ||
        e.conflictExtra.size > 0
      );
    }, [validationErrors]);

    useImperativeHandle(ref, () => ({
      submit: () => {
        setSubmitAttempted(true);

        const hasCoastErrors = sortedProvinces.some(province => {
          const entry = assignment[province.id];
          return entry?.startingUnit === "fleet" && province.namedCoasts.length > 0 && !entry.startingCoast;
        });

        const hasTerrainErrors = sortedProvinces.some(province => {
          const unit = assignment[province.id]?.startingUnit ?? null;
          return (unit === "fleet" && province.type === "land") || (unit === "army" && province.type === "sea");
        });

        let hasExtraErrors = false;
        if (extraUnitsEnabled) {
          for (const eu of extraUnits) {
            if (!eu.province || !eu.nation || !eu.unit) { hasExtraErrors = true; break; }
          }
          if (!hasExtraErrors) {
            for (const eu of extraUnits) {
              if (eu.unit === "fleet" && eu.province) {
                const prov = allProvincesMap.get(eu.province);
                if (prov && prov.namedCoasts.length > 0 && !eu.coast) { hasExtraErrors = true; break; }
              }
            }
          }
          if (!hasExtraErrors) {
            for (const eu of extraUnits) {
              const prov = eu.province ? allProvincesMap.get(eu.province) : undefined;
              if (!prov) continue;
              if ((eu.unit === "fleet" && prov.type === "land") || (eu.unit === "army" && prov.type === "sea")) {
                hasExtraErrors = true;
                break;
              }
            }
          }
          if (!hasExtraErrors) {
            const counts = new Map<string, number>();
            for (const eu of extraUnits) {
              if (eu.province) counts.set(eu.province, (counts.get(eu.province) ?? 0) + 1);
            }
            if ([...counts.values()].some(c => c > 1)) hasExtraErrors = true;
          }
          if (!hasExtraErrors) {
            const homeSCWithUnit = new Set(
              sortedProvinces.filter(p => assignment[p.id]?.startingUnit !== null).map(p => p.id)
            );
            if (extraUnits.some(eu => eu.province && homeSCWithUnit.has(eu.province))) hasExtraErrors = true;
          }
        }

        if (hasCoastErrors || hasTerrainErrors || hasExtraErrors) return;
        onSubmit({ assignments: assignment, extraUnits: extraUnitsEnabled ? extraUnits : [] });
      },
      getValues: () => ({ assignments: assignment, extraUnits: extraUnitsEnabled ? extraUnits : [] }),
    }), [assignment, extraUnits, extraUnitsEnabled, onSubmit, sortedProvinces, allProvincesMap]);

    const provinceColors = useMemo(() => {
      const nationColorMap: Record<string, string> = {};
      for (const n of nations) nationColorMap[n.id] = n.color;
      const colors: Record<string, string> = {};
      for (const [id, entry] of Object.entries(assignment)) {
        if (entry.nation === "neutral") {
          colors[id] = NEUTRAL_NATION.color;
        } else if (entry.nation) {
          const color = nationColorMap[entry.nation];
          if (color) colors[id] = color;
        }
      }
      return colors;
    }, [assignment, nations]);

    // The highlight is drawn as an inline overlay; baking it into the preview
    // SVG would re-serialize and re-decode the whole map on every mouseover.
    const previewSvg = useMemo(
      () => buildHomeNationPreviewSvg(svgContent, provinceColors, null),
      [svgContent, provinceColors]
    );
    const previewUrl = useSvgObjectUrl(previewSvg);
    const { shapes: provinceShapes, viewBox } = useMemo(
      () => extractDsvgProvinceShapes(svgContent),
      [svgContent]
    );
    const aspectRatio = useMemo(() => aspectRatioFromViewBox(viewBox), [viewBox]);

    const addExtraUnit = () => {
      setExtraUnits(prev => [
        ...prev,
        { id: crypto.randomUUID(), province: "", nation: "", unit: null, coast: null },
      ]);
    };

    const removeExtraUnit = (id: string) => {
      setExtraUnits(prev => prev.filter(eu => eu.id !== id));
    };

    const updateExtraUnit = (id: string, patch: Partial<ExtraUnit>) => {
      setExtraUnits(prev => prev.map(eu => eu.id === id ? { ...eu, ...patch } : eu));
    };

    if (sortedProvinces.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No supply centers defined. Go back and mark provinces as SC in the Provinces step.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        {validationErrors.coastErrors.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Some fleets require a coast selection. Please select a coast for each fleet marked below.
          </div>
        )}
        {validationErrors.terrainErrors.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Some starting units don't match their province's terrain (army at sea or fleet on land). Fix the units marked below.
          </div>
        )}
        {hasAnyError && (validationErrors.incompleteExtra.size > 0 || validationErrors.coastExtra.size > 0 || validationErrors.duplicateExtra.size > 0 || validationErrors.conflictExtra.size > 0) && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {validationErrors.conflictExtra.size > 0
              ? "A province cannot have both a home nation unit and an extra unit. Remove the conflict below."
              : validationErrors.duplicateExtra.size > 0
              ? "Each province can only appear once in the extra units list."
              : validationErrors.coastExtra.size > 0
              ? "Some extra fleets require a coast selection."
              : "Please fill in all fields for each extra unit."}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-2">
            {sortedProvinces.map(province => {
              const entry = assignment[province.id] ?? { nation: "", startingUnit: null, startingCoast: null };
              const isEmpty = !entry.nation;
              const isLand = province.type === "land";
              const isConflict = validationErrors.conflictHome.has(province.id);

              return (
                <div
                  key={province.id}
                  onMouseEnter={() => setHighlightedId(province.id)}
                  onMouseLeave={() => setHighlightedId(null)}
                  className={cn(
                    "rounded-md px-2 py-1.5 transition-colors",
                    isConflict
                      ? "bg-destructive/5 ring-1 ring-destructive/50"
                      : highlightedId === province.id
                      ? "bg-yellow-50 dark:bg-yellow-950/30"
                      : "hover:bg-muted/40"
                  )}
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
                      {province.id}
                    </span>
                    <span className="text-sm font-medium">{province.name}</span>
                  </div>

                  <div className="ml-[4.5rem] flex items-center gap-2">
                    {/* Owner dropdown */}
                    <Select
                      value={entry.nation || "__empty__"}
                      onValueChange={val => {
                        const nation = val === "__empty__" ? "" : val;
                        setAssignment(prev => ({
                          ...prev,
                          [province.id]: {
                            ...prev[province.id],
                            nation,
                            startingUnit: nation === "" ? null : prev[province.id]?.startingUnit ?? null,
                            startingCoast: null,
                          },
                        }));
                      }}
                    >
                      <SelectTrigger className="h-7 flex-1 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__empty__">Empty</SelectItem>
                        <SelectSeparator />
                        {nations.map(n => (
                          <SelectItem key={n.id} value={n.id}>
                            <span className="flex items-center gap-1.5">
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: n.color }}
                              />
                              {n.name}
                            </span>
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value="neutral">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: NEUTRAL_NATION.color }}
                            />
                            Neutral
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {/* A / F / N toggle */}
                    <div className="flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-1">
                      {(["army", "fleet", "none"] as const).map(unit => {
                        const disableFleet = unit === "fleet" && isLand;
                        const disableArmy = unit === "army" && province.type === "sea";
                        const disabled = isEmpty || disableFleet || disableArmy;
                        const active =
                          unit === "none"
                            ? !isEmpty && entry.startingUnit === null
                            : entry.startingUnit === unit;
                        return (
                          <button
                            key={unit}
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                              setAssignment(prev => ({
                                ...prev,
                                [province.id]: {
                                  ...prev[province.id],
                                  startingUnit: unit === "none" ? null : active ? null : unit,
                                  startingCoast: null,
                                },
                              }))
                            }
                            className={cn(
                              "rounded px-1.5 py-0.5 text-xs font-medium transition-colors",
                              active
                                ? "bg-primary text-primary-foreground"
                                : disabled
                                ? "cursor-not-allowed text-muted-foreground/30"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {unit === "army" ? "A" : unit === "fleet" ? "F" : "No"}
                          </button>
                        );
                      })}
                    </div>

                    {/* Coast selector */}
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
                        <SelectTrigger size="sm" className={cn("h-7 w-auto text-xs", validationErrors.coastErrors.has(province.id) && "border-destructive")}>
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

                  {validationErrors.coastErrors.has(province.id) && (
                    <p className="ml-[4.5rem] mt-0.5 text-xs text-destructive">Select a coast for this fleet.</p>
                  )}
                  {validationErrors.terrainErrors.has(province.id) && (
                    <p className="ml-[4.5rem] mt-0.5 text-xs text-destructive">This unit type cannot start on this terrain.</p>
                  )}
                  {isConflict && (
                    <p className="ml-[4.5rem] mt-0.5 text-xs text-destructive">Conflicts with an extra unit on this province.</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="sticky top-8 self-start">
            <div className="relative w-full overflow-hidden rounded-lg border" style={{ aspectRatio }}>
              {previewUrl && (
                <img src={previewUrl} alt="Map preview" className="absolute inset-0 h-full w-full object-contain" />
              )}
              <svg viewBox={viewBox} className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
                {highlightedId &&
                  provinceShapes
                    .filter(s => s.id === highlightedId)
                    .map(shape =>
                      shape.paths.map((d, i) => (
                        <path key={i} d={d} fill="#fde047" fillOpacity={0.7} />
                      ))
                    )}
              </svg>
            </div>
          </div>
        </div>

        {/* Extra units section */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="extra-units-toggle"
              checked={extraUnitsEnabled}
              onCheckedChange={checked => {
                setExtraUnitsEnabled(!!checked);
                if (!checked) setExtraUnits([]);
              }}
            />
            <div className="space-y-0.5">
              <Label htmlFor="extra-units-toggle" className="cursor-pointer text-sm font-medium">
                Units without Home Centers
              </Label>
              <p className="text-xs text-muted-foreground">
                Add units on non-SC centers, or centers owned by another nation
              </p>
            </div>
          </div>

          {extraUnitsEnabled && (
            <div className="space-y-2">
              {extraUnits.map(eu => {
                const selectedProvince = eu.province ? allProvincesMap.get(eu.province) : undefined;
                const isLand = selectedProvince?.type === "land";
                const hasNamedCoasts = (selectedProvince?.namedCoasts.length ?? 0) > 0;
                const hasError =
                  validationErrors.incompleteExtra.has(eu.id) ||
                  validationErrors.coastExtra.has(eu.id) ||
                  validationErrors.duplicateExtra.has(eu.id) ||
                  validationErrors.conflictExtra.has(eu.id);

                return (
                  <div
                    key={eu.id}
                    className={cn(
                      "flex flex-wrap items-center gap-2 rounded-md p-2",
                      hasError ? "bg-destructive/5 ring-1 ring-destructive/50" : "bg-muted/30"
                    )}
                  >
                    {/* Province dropdown */}
                    <Select
                      value={eu.province || "__empty__"}
                      onValueChange={val => {
                        const province = val === "__empty__" ? "" : val;
                        updateExtraUnit(eu.id, { province, unit: null, coast: null });
                      }}
                    >
                      <SelectTrigger className={cn("h-7 w-44 text-xs", !eu.province && validationErrors.incompleteExtra.has(eu.id) && "border-destructive")}>
                        <SelectValue placeholder="Province…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__empty__">Select province…</SelectItem>
                        <SelectSeparator />
                        {sortedAllProvinces.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="flex items-center gap-1.5">
                              <span className="font-mono text-muted-foreground">{p.id}</span>
                              <span>{p.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Unit owner dropdown */}
                    <Select
                      value={eu.nation || "__empty__"}
                      onValueChange={val => {
                        const nation = val === "__empty__" ? "" : val;
                        updateExtraUnit(eu.id, { nation });
                      }}
                    >
                      <SelectTrigger className={cn("h-7 w-36 text-xs", !eu.nation && validationErrors.incompleteExtra.has(eu.id) && "border-destructive")}>
                        <SelectValue placeholder="Unit owner…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__empty__">Select nation…</SelectItem>
                        <SelectSeparator />
                        {nations.map(n => (
                          <SelectItem key={n.id} value={n.id}>
                            <span className="flex items-center gap-1.5">
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: n.color }}
                              />
                              {n.name}
                            </span>
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value="neutral">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: NEUTRAL_NATION.color }}
                            />
                            Neutral
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {/* A / F toggle */}
                    <div className={cn(
                      "flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-1",
                      !eu.unit && validationErrors.incompleteExtra.has(eu.id) && "border-destructive"
                    )}>
                      {(["army", "fleet"] as const).map(unit => {
                        const isSea = selectedProvince?.type === "sea";
                        const disabled = (unit === "fleet" && !!isLand) || (unit === "army" && isSea);
                        const active = eu.unit === unit;
                        return (
                          <button
                            key={unit}
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                              updateExtraUnit(eu.id, {
                                unit: active ? null : unit,
                                coast: null,
                              })
                            }
                            className={cn(
                              "rounded px-1.5 py-0.5 text-xs font-medium transition-colors",
                              active
                                ? "bg-primary text-primary-foreground"
                                : disabled
                                ? "cursor-not-allowed text-muted-foreground/30"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {unit === "army" ? "A" : "F"}
                          </button>
                        );
                      })}
                    </div>

                    {/* Coast selector for extra units */}
                    {eu.unit === "fleet" && hasNamedCoasts && (
                      <Select
                        value={eu.coast ?? ""}
                        onValueChange={val => updateExtraUnit(eu.id, { coast: val || null })}
                      >
                        <SelectTrigger size="sm" className={cn("h-7 w-auto text-xs", validationErrors.coastExtra.has(eu.id) && "border-destructive")}>
                          <SelectValue placeholder="Coast…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(selectedProvince?.namedCoasts ?? []).map(coast => (
                            <SelectItem key={coast.id} value={coast.id}>
                              {coast.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Error label */}
                    {hasError && (
                      <span className="text-xs text-destructive">
                        {validationErrors.conflictExtra.has(eu.id)
                          ? "Province already has a home unit"
                          : validationErrors.duplicateExtra.has(eu.id)
                          ? "Duplicate province"
                          : validationErrors.coastExtra.has(eu.id)
                          ? "Select a coast"
                          : "Fill in all fields"}
                      </span>
                    )}

                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeExtraUnit(eu.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}

              <Button variant="outline" size="sm" onClick={addExtraUnit}>
                <Plus className="h-3.5 w-3.5" />
                Add unit
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }
);

HomeNationsForm.displayName = "HomeNationsForm";
