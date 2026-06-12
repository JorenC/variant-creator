import {
  useMemo,
  useEffect,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import type React from "react";
import { AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { buildPreviewSvg } from "@/utils/svgPreview";
import { extractProvinces, extractLayerPaths, detectAmbiguousGroups } from "@/utils/svgProvinces";
import type { LayerAssignments, NamedCoastEntry } from "@/types/dsvg";

export type { NamedCoastEntry };

export interface NamedCoastEditorHandle {
  /** Validates all entries; returns them when complete, null when invalid. */
  validate: () => NamedCoastEntry[] | null;
  /** Current values without validation, for snapshotting on Back navigation. */
  getData: () => NamedCoastEntry[];
}

interface NamedCoastEditorProps {
  svgContent: string;
  assignments: LayerAssignments;
  provinceAbbrs: Record<string, string>;
  /** Previously entered coast data, restored when revisiting this step. */
  defaultEntries?: NamedCoastEntry[];
}

interface CoastState {
  parentProvince: string;
  coastAbbr: string;
}

export const NamedCoastEditor = forwardRef<
  NamedCoastEditorHandle,
  NamedCoastEditorProps
>(({ svgContent, assignments, provinceAbbrs, defaultEntries }, ref) => {
  const namedCoastsKey = assignments.namedCoasts;

  const { viewBox, provinces: coastElements } = useMemo(
    () => extractProvinces(svgContent, namedCoastsKey),
    [svgContent, namedCoastsKey]
  );

  const aspectRatio = useMemo(() => {
    const parts = viewBox.split(/\s+/).map(Number);
    return parts.length >= 4 && parts[2] > 0 && parts[3] > 0
      ? `${parts[2]} / ${parts[3]}`
      : undefined;
  }, [viewBox]);

  const filteredSvg = useMemo(
    () => buildPreviewSvg(svgContent, assignments),
    [svgContent, assignments]
  );

  const ambiguousGroups = useMemo(
    () => (namedCoastsKey ? detectAmbiguousGroups(svgContent, namedCoastsKey) : []),
    [svgContent, namedCoastsKey]
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([filteredSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [filteredSvg]);

  const provincePaths = useMemo(
    () => extractLayerPaths(svgContent, assignments.provinces),
    [svgContent, assignments.provinces]
  );

  const [entries, setEntries] = useState<Record<string, CoastState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const provinceAbbrSet = new Set(Object.values(provinceAbbrs));
    const defaults = new Map((defaultEntries ?? []).map(e => [e.svgId, e]));
    const initial: Record<string, CoastState> = {};
    coastElements.forEach(({ svgId }) => {
      const previous = defaults.get(svgId);
      if (previous && (previous.parentProvince || previous.coastAbbr)) {
        initial[svgId] = { parentProvince: previous.parentProvince, coastAbbr: previous.coastAbbr };
        return;
      }
      const slashIdx = svgId.indexOf("/");
      if (slashIdx !== -1) {
        const prefix = svgId.slice(0, slashIdx);
        const coastPart = svgId.slice(slashIdx + 1);
        const candidate = prefix.slice(0, 3).toLowerCase();
        if (provinceAbbrSet.has(candidate)) {
          initial[svgId] = { parentProvince: candidate, coastAbbr: coastPart };
          return;
        }
      }
      initial[svgId] = { parentProvince: "", coastAbbr: "" };
    });
    setEntries(initial);
    setErrors({});
    setFocusedId(null);
  }, [coastElements, provinceAbbrs, defaultEntries]);

  useImperativeHandle(
    ref,
    () => {
      const collect = () =>
        coastElements.map(({ svgId }) => ({
          svgId,
          parentProvince: entries[svgId]?.parentProvince ?? "",
          coastAbbr: entries[svgId]?.coastAbbr ?? "",
        }));
      return {
        getData: collect,
        validate() {
          // Incomplete entries used to pass through silently; the coast then
          // kept its raw SVG id in the export, which the server rejects
          // (named-coast ids must be "parent/coast").
          const newErrors: Record<string, string> = {};
          const data = collect();
          for (const entry of data) {
            if (!entry.parentProvince) {
              newErrors[entry.svgId] = "Select a parent province.";
            } else if (!entry.coastAbbr) {
              newErrors[entry.svgId] = "Enter a coast abbreviation.";
            } else if (!/^[a-zA-Z]+$/.test(entry.coastAbbr)) {
              newErrors[entry.svgId] = "Only letters are allowed.";
            }
          }
          const byFullId = new Map<string, string[]>();
          for (const entry of data) {
            if (!entry.parentProvince || !entry.coastAbbr) continue;
            const full = `${entry.parentProvince}/${entry.coastAbbr}`.toLowerCase();
            byFullId.set(full, [...(byFullId.get(full) ?? []), entry.svgId]);
          }
          for (const [full, ids] of byFullId) {
            if (ids.length > 1) {
              for (const id of ids) newErrors[id] = `Duplicate coast id "${full}".`;
            }
          }
          if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return null;
          }
          setErrors({});
          return data;
        },
      };
    },
    [coastElements, entries]
  );

  const handleFocus = (svgId: string) => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setFocusedId(svgId);
  };

  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => setFocusedId(null), 100);
  };

  const handleParentChange = (svgId: string, value: string) => {
    setEntries(prev => ({
      ...prev,
      [svgId]: { ...prev[svgId], parentProvince: value },
    }));
  };

  const handleCoastAbbrChange = (svgId: string, value: string) => {
    setEntries(prev => ({
      ...prev,
      [svgId]: { ...prev[svgId], coastAbbr: value },
    }));
    if (errors[svgId]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[svgId];
        return next;
      });
    }
  };

  const handleCoastAbbrBlur = (svgId: string) => {
    handleBlur();
    const value = entries[svgId]?.coastAbbr ?? "";
    if (value && !/^[a-zA-Z]+$/.test(value)) {
      setErrors(prev => ({ ...prev, [svgId]: "Only letters are allowed." }));
    } else {
      setErrors(prev => {
        const next = { ...prev };
        delete next[svgId];
        return next;
      });
    }
  };

  const focusedPaths =
    focusedId != null
      ? (coastElements.find(p => p.svgId === focusedId)?.pathData ?? [])
      : [];

  const provinceOptions = [...new Set(Object.values(provinceAbbrs))].sort();

  const formContent =
    !namedCoastsKey ? (
      <p className="text-sm text-muted-foreground">
        No named-coast layer was selected. You can proceed to the next step.
      </p>
    ) : coastElements.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        No objects found in the named-coast layer.
      </p>
    ) : (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">
          Named coasts ({coastElements.length})
        </p>

        <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-[140px_1fr_72px] gap-2 pb-1 text-xs font-medium text-muted-foreground">
            <span>Layer ID</span>
            <span>Parent province</span>
            <span>Coast</span>
          </div>

          {coastElements.map(({ svgId }) => {
            const error = errors[svgId];
            return (
              <div key={svgId} className="flex flex-col gap-0.5">
                <div className="grid grid-cols-[140px_1fr_72px] items-center gap-2">
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {svgId}
                  </span>

                  <Select
                    value={entries[svgId]?.parentProvince ?? ""}
                    onValueChange={value => handleParentChange(svgId, value)}
                  >
                    <SelectTrigger
                      className="w-full"
                      onFocus={() => handleFocus(svgId)}
                      onBlur={handleBlur}
                    >
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {provinceOptions.map(abbr => (
                        <SelectItem key={abbr} value={abbr}>
                          {abbr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    value={entries[svgId]?.coastAbbr ?? ""}
                    maxLength={8}
                    placeholder="nc"
                    aria-invalid={!!error}
                    onChange={e => handleCoastAbbrChange(svgId, e.target.value)}
                    onFocus={() => handleFocus(svgId)}
                    onBlur={() => handleCoastAbbrBlur(svgId)}
                    className="font-mono text-sm"
                  />
                </div>

                {error && (
                  <div className="col-start-3 flex items-center gap-1 pl-[calc(140px+1fr+0.5rem)] text-xs text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground rounded-md border px-4 py-3">
        Link each named coast to its parent province using the dropdown, then add its abbreviation code (e.g. <code className="font-mono">nc</code>, <code className="font-mono">sc</code>). If your SVG IDs follow the <code className="font-mono">province/coast</code> convention (e.g. <code className="font-mono">stp/nc</code>), this fills in automatically. The full coast identifier needs to match the named coast exactly — for example <code className="font-mono">kie/sc</code> or <code className="font-mono">mek/river</code>.
      </p>
      {ambiguousGroups.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Some groups have mixed labeling:{" "}
            {ambiguousGroups.map(id => (
              <code key={id} className="font-mono">{id}</code>
            )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ", ", el], [])}.
            {" "}Labeled children will be expanded individually; unlabeled children will be merged into one shape. Verify the coast count is correct.
          </span>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {formContent}

      <div className="relative w-full" style={{ aspectRatio }}>
        {previewUrl && (
          <>
            <img
              src={previewUrl}
              alt="SVG layer preview"
              className="h-full w-full rounded-lg border object-contain"
            />
            <svg
              viewBox={viewBox}
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              {provincePaths.map((d, i) => (
                <path
                  key={`p-${i}`}
                  d={d}
                  fill="black"
                  fillOpacity="0.1"
                  stroke="none"
                />
              ))}
              {focusedPaths.map((d, i) => (
                <path key={i} d={d} fill="yellow" fillOpacity="0.6" />
              ))}
            </svg>
          </>
        )}
      </div>
      </div>
    </div>
  );
});

NamedCoastEditor.displayName = "NamedCoastEditor";
