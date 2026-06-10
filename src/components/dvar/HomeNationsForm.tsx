import { forwardRef, useImperativeHandle, useState, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildHomeNationPreviewSvg } from "@/utils/dvarPreview";
import { aspectRatioFromSvg } from "@/utils/svgAspect";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import type { HomeNationsData } from "@/types/dvar";

export interface HomeNationsFormHandle {
  submit: () => void;
  getValues: () => HomeNationsData;
}

interface HomeNationsFormProps {
  svgContent: string;
  scProvinces: Array<{ id: string; name: string; type: string; namedCoasts: Array<{ id: string; name: string }> }>;
  nations: Array<{ id: string; name: string; color: string }>;
  defaultValues: HomeNationsData;
  onSubmit: (data: HomeNationsData) => void;
}

export const HomeNationsForm = forwardRef<HomeNationsFormHandle, HomeNationsFormProps>(
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
      getValues: () => assignment,
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
    const previewUrl = useSvgObjectUrl(previewSvg);
    const aspectRatio = useMemo(() => aspectRatioFromSvg(svgContent), [svgContent]);

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
        <p className="text-sm text-muted-foreground rounded-md border px-4 py-3">
          Currently, we do not support Neutral units. You can assign them, but the game will not render them.
        </p>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-2">
            {sortedProvinces.map(province => {
              const entry = assignment[province.id] ?? { nation: "", startingUnit: null, startingCoast: null };
              const isEmpty = !entry.nation;
              const isLand = province.type === "land";

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
                        <SelectItem value="neutral">Neutral</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* A / F / N toggle */}
                    <div className="flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-1">
                      {(["army", "fleet", "none"] as const).map(unit => {
                        const disableFleet = unit === "fleet" && isLand;
                        const disabled = isEmpty || disableFleet;
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
                            {unit === "army" ? "A" : unit === "fleet" ? "F" : "N"}
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
                        <SelectTrigger size="sm" className={cn("h-7 w-auto text-xs", coastErrors.has(province.id) && "border-destructive")}>
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
            <div className="w-full overflow-hidden rounded-lg border" style={{ aspectRatio }}>
              {previewUrl && (
                <img src={previewUrl} alt="Map preview" className="h-full w-full object-contain" />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

HomeNationsForm.displayName = "HomeNationsForm";
