import { forwardRef, useImperativeHandle, useRef, useState, useMemo } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { buildProvincePreviewSvg } from "@/utils/dvarPreview";
import { detectSCProvinces } from "@/utils/dvarScDetect";
import { aspectRatioFromSvg } from "@/utils/svgAspect";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { provinceTypesFormSchema, type ProvinceTypesFormValues } from "./schemas";

export interface ProvinceTypesFormHandle {
  getValues: () => ProvinceTypesFormValues;
}

interface ProvinceTypesFormProps {
  formId: string;
  svgContent: string;
  namedCoastParentIds: Set<string>;
  defaultValues: ProvinceTypesFormValues;
  onSubmit: (values: ProvinceTypesFormValues) => void;
}

const PROVINCE_TYPE_COLORS: Record<string, string> = {
  land: "#22c55e",
  coastal: "#fde047",
  sea: "#3b82f6",
};

export const ProvinceTypesForm = forwardRef<ProvinceTypesFormHandle, ProvinceTypesFormProps>(function ProvinceTypesForm({ formId, svgContent, namedCoastParentIds, defaultValues, onSubmit }, ref) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<ProvinceTypesFormValues>({
    resolver: zodResolver(provinceTypesFormSchema),
    defaultValues,
  });

  const { control, handleSubmit, setValue, formState: { errors } } = form;

  useImperativeHandle(ref, () => ({ getValues: () => form.getValues() }), [form]);

  const watchedProvinces = useWatch({ control, name: "provinces" });

  const hasSCLayer = useMemo(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    return !!doc.getElementById("foreground")?.querySelector("#supply-centers");
  }, [svgContent]);

  const [scSkipped, setScSkipped] = useState<string[]>([]);

  const handleAutoDetectSCs = () => {
    const { detected, skipped } = detectSCProvinces(svgContent);
    defaultValues.provinces.forEach((province, i) => {
      setValue(`provinces.${i}.supplyCenter`, detected.has(province.id));
    });
    setScSkipped(skipped);
  };

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
  const previewUrl = useSvgObjectUrl(previewSvg);
  const aspectRatio = useMemo(() => aspectRatioFromSvg(svgContent), [svgContent]);

  const handleGroupFocus = (id: string) => {
    if (blurTimer.current !== null) clearTimeout(blurTimer.current);
    setHighlightedId(id);
  };
  const handleGroupBlur = () => { blurTimer.current = setTimeout(() => setHighlightedId(null), 0); };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)}>
      {hasErrors && (
        <p className="mb-4 text-sm text-destructive">Please select a type (L/C/S) for every province before proceeding.</p>
      )}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between pr-2 pb-1">
            {hasSCLayer ? (
              <Button type="button" variant="outline" size="sm" onClick={handleAutoDetectSCs}>
                <Wand2 className="h-3 w-3" />
                Auto-detect SCs
              </Button>
            ) : (
              <span />
            )}
            <span className="text-xs text-muted-foreground">
              {watchedProvinces.filter(p => p.supplyCenter).length} supply center{watchedProvinces.filter(p => p.supplyCenter).length !== 1 ? "s" : ""} selected
            </span>
          </div>
          {scSkipped.length > 0 && (
            <div className="mb-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <div className="flex gap-1.5">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Auto-detection skipped {scSkipped.length} province{scSkipped.length !== 1 ? "s" : ""} due to geometry errors — check these manually:{" "}
                  <span className="font-mono">{scSkipped.join(", ")}</span>
                </span>
              </div>
            </div>
          )}
          <div className="max-h-[70vh] space-y-0.5 overflow-y-auto pr-2">
            {defaultValues.provinces.map((province, i) => (
              <div
                key={province.id}
                onMouseEnter={() => setHighlightedId(province.id)}
                onMouseLeave={() => setHighlightedId(null)}
                onFocus={() => handleGroupFocus(province.id)}
                onBlur={handleGroupBlur}
              >
                <div className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 transition-colors",
                  highlightedId === province.id ? "bg-yellow-50 dark:bg-yellow-950/30" : "hover:bg-muted/40"
                )}>
                  <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
                    {province.id}
                  </span>
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
                            <span className={cn(
                              "rounded px-1 py-0.5 text-xs font-medium transition-colors",
                              field.value === t
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            )}>
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
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        <span className="text-xs text-muted-foreground">SC</span>
                      </label>
                    )}
                  />
                </div>
                {namedCoastParentIds.has(province.id) && (
                  <p className="px-2 pb-0.5 text-xs text-muted-foreground underline">
                    This is a named-coast province, so the main province is land.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="sticky top-8 self-start">
          <div className="w-full overflow-hidden rounded-lg border" style={{ aspectRatio }}>
            {previewUrl && <img src={previewUrl} alt="Map preview" className="h-full w-full object-contain" />}
          </div>
        </div>
      </div>
    </form>
  );
});

ProvinceTypesForm.displayName = "ProvinceTypesForm";
