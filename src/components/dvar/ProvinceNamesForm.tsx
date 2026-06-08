import { forwardRef, useImperativeHandle, useRef, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { buildProvincePreviewSvg } from "@/utils/dvarPreview";
import { aspectRatioFromSvg } from "@/utils/svgAspect";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { provinceNamesFormSchema, type ProvinceNamesFormValues } from "./schemas";

export interface ProvinceNamesFormHandle {
  getValues: () => ProvinceNamesFormValues;
}

interface ProvinceNamesFormProps {
  formId: string;
  svgContent: string;
  defaultValues: ProvinceNamesFormValues;
  onSubmit: (values: ProvinceNamesFormValues) => void;
}

export const ProvinceNamesForm = forwardRef<ProvinceNamesFormHandle, ProvinceNamesFormProps>(function ProvinceNamesForm({ formId, svgContent, defaultValues, onSubmit }, ref) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<ProvinceNamesFormValues>({
    resolver: zodResolver(provinceNamesFormSchema),
    defaultValues,
  });

  const { register, handleSubmit, formState: { errors } } = form;

  useImperativeHandle(ref, () => ({ getValues: () => form.getValues() }), [form]);

  const previewSvg = useMemo(
    () => buildProvincePreviewSvg(svgContent, highlightedId),
    [svgContent, highlightedId]
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
        <p className="mb-4 text-sm text-destructive">Please fill in all names before proceeding.</p>
      )}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 px-2 pb-1 text-xs font-medium text-muted-foreground">
            <span className="w-16 shrink-0">Abbreviation</span>
            <span>Human name</span>
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
                <div className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 transition-colors",
                  highlightedId === province.id ? "bg-yellow-50 dark:bg-yellow-950/30" : "hover:bg-muted/40"
                )}>
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
                </div>
                {province.namedCoasts.length > 0 && (
                  <div className="ml-4 space-y-0.5 border-l-2 border-muted pl-3">
                    {province.namedCoasts.map((coast, j) => (
                      <div key={coast.id} className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1 transition-colors",
                        highlightedId === province.id ? "bg-yellow-50 dark:bg-yellow-950/30" : "hover:bg-muted/40"
                      )}>
                        <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
                          {coast.id}
                        </span>
                        <Input
                          {...register(`provinces.${i}.namedCoasts.${j}.name`)}
                          placeholder="Human name"
                          autoComplete="off"
                          aria-invalid={!!errors.provinces?.[i]?.namedCoasts?.[j]?.name}
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
          <div className="w-full overflow-hidden rounded-lg border" style={{ aspectRatio }}>
            {previewUrl && <img src={previewUrl} alt="Map preview" className="h-full w-full object-contain" />}
          </div>
        </div>
      </div>
    </form>
  );
});

ProvinceNamesForm.displayName = "ProvinceNamesForm";
