import {
  useMemo,
  useEffect,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { AlertCircle, Wand2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buildPreviewSvg } from "@/utils/svgPreview";
import { extractProvinces } from "@/utils/svgProvinces";
import { autoDetectUnitProvinces } from "@/utils/svgAutoDetect";
import type { LayerAssignments } from "@/components/dsvg/LayerAssignment";

export interface UnitPositionEditorHandle {
  validate: () => Record<string, string> | null;
}

interface UnitPositionEditorProps {
  svgContent: string;
  assignments: LayerAssignments;
  provinceAbbrs: Record<string, string>;
}

// Accepts "stp" (province) or "stp/river" (named coast, any length suffix)
const CODE_PATTERN = /^[a-zA-Z]{3}(\/[a-zA-Z]+)?$/;
const CODE_ERROR = 'Must be 3 letters, or "xxx/name" for a named coast (e.g. stp/sc or stp/river).';

function validateCode(
  svgId: string,
  value: string,
  codes: Record<string, string>
): string | null {
  if (!value || !CODE_PATTERN.test(value)) return CODE_ERROR;
  const duplicate = Object.entries(codes).some(
    ([id, code]) => id !== svgId && code.toLowerCase() === value.toLowerCase()
  );
  if (duplicate) return "Duplicate code.";
  return null;
}

export const UnitPositionEditor = forwardRef<
  UnitPositionEditorHandle,
  UnitPositionEditorProps
>(({ svgContent, assignments, provinceAbbrs }, ref) => {
  const filteredSvg = useMemo(
    () => buildPreviewSvg(svgContent, assignments),
    [svgContent, assignments]
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([filteredSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [filteredSvg]);

  const { viewBox, provinces: elements } = useMemo(
    () => extractProvinces(svgContent, assignments.unitPositions),
    [svgContent, assignments.unitPositions]
  );

  const namedCoastCount = useMemo(
    () =>
      assignments.namedCoasts
        ? extractProvinces(svgContent, assignments.namedCoasts).provinces.length
        : 0,
    [svgContent, assignments.namedCoasts]
  );
  const provinceCount = useMemo(
    () => Object.keys(provinceAbbrs).length,
    [provinceAbbrs]
  );
  const expectedCount = provinceCount + namedCoastCount;
  const countMismatch = expectedCount > 0 && elements.length !== expectedCount;

  const aspectRatio = useMemo(() => {
    const parts = viewBox.split(/\s+/).map(Number);
    return parts.length >= 4 && parts[2] > 0 && parts[3] > 0
      ? `${parts[2]} / ${parts[3]}`
      : undefined;
  }, [viewBox]);

  const [codes, setCodes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    elements.forEach(({ svgId }) => {
      const slashIdx = svgId.indexOf("/");
      if (slashIdx !== -1) {
        const prefix = svgId.slice(0, slashIdx);
        const coastPart = svgId.slice(slashIdx + 1);
        initial[svgId] = `${prefix.slice(0, 3).toLowerCase()}/${coastPart.toLowerCase()}`;
      } else {
        initial[svgId] = svgId.slice(0, 3).toLowerCase();
      }
    });
    setCodes(initial);
    setErrors({});
    setFocusedId(null);
  }, [elements]);

  useImperativeHandle(
    ref,
    () => ({
      validate() {
        if (countMismatch) return null;
        const invalid = elements.filter(
          el => !CODE_PATTERN.test(codes[el.svgId] ?? "")
        );
        if (invalid.length > 0) {
          const newErrors: Record<string, string> = {};
          invalid.forEach(el => {
            newErrors[el.svgId] = CODE_ERROR;
          });
          setErrors(prev => ({ ...prev, ...newErrors }));
          requestAnimationFrame(() => {
            const firstInput = inputRefs.current[invalid[0].svgId];
            firstInput?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            firstInput?.focus();
          });
          return null;
        }
        return { ...codes };
      },
    }),
    [codes, elements, countMismatch]
  );

  const handleCodeChange = (svgId: string, value: string) => {
    setCodes(prev => ({ ...prev, [svgId]: value }));
    if (errors[svgId]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[svgId];
        return next;
      });
    }
  };

  const handleFocus = (svgId: string) => setFocusedId(svgId);

  const handleBlur = (svgId: string) => {
    const value = codes[svgId] ?? "";
    const error = validateCode(svgId, value, codes);
    if (error) {
      setErrors(prev => ({ ...prev, [svgId]: error }));
    } else {
      setErrors(prev => {
        const next = { ...prev };
        delete next[svgId];
        return next;
      });
      setFocusedId(null);
    }
  };

  const handleAutoDetect = () => {
    const detected = autoDetectUnitProvinces(
      svgContent,
      assignments.unitPositions,
      assignments.provinces,
      provinceAbbrs
    );
    if (Object.keys(detected).length > 0) {
      setCodes(prev => ({ ...prev, ...detected }));
      setErrors(prev => {
        const next = { ...prev };
        for (const id of Object.keys(detected)) delete next[id];
        return next;
      });
    }
  };

  const focusedPaths =
    focusedId != null
      ? (elements.find(el => el.svgId === focusedId)?.pathData ?? [])
      : [];

  const formContent = !assignments.unitPositions ? (
    <p className="text-sm text-muted-foreground">
      No unit-positions layer was selected. You can proceed to the next step.
    </p>
  ) : elements.length === 0 ? (
    <p className="text-sm text-muted-foreground">
      No objects found in the unit-positions layer.
    </p>
  ) : (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Unit positions ({elements.length})</p>
        <Button variant="outline" size="sm" onClick={handleAutoDetect}>
          <Wand2 className="h-3.5 w-3.5" />
          Auto-detect
        </Button>
      </div>
      {countMismatch && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {elements.length} unit position{elements.length !== 1 ? "s" : ""}{" "}
            found, {expectedCount} expected ({provinceCount}{" "}
            {provinceCount === 1 ? "province" : "provinces"}
            {namedCoastCount > 0
              ? ` + ${namedCoastCount} named ${namedCoastCount === 1 ? "coast" : "coasts"}`
              : ""}
            ).
          </span>
        </div>
      )}
      <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto pr-1">
        {elements.map(({ svgId }) => {
          const error = errors[svgId];
          return (
            <div key={svgId} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate font-mono text-xs text-muted-foreground">
                  {svgId}
                </span>
                <Input
                  ref={el => {
                    inputRefs.current[svgId] = el;
                  }}
                  value={codes[svgId] ?? ""}
                  maxLength={20}
                  aria-invalid={!!error}
                  onChange={e => handleCodeChange(svgId, e.target.value)}
                  onFocus={() => handleFocus(svgId)}
                  onBlur={() => handleBlur(svgId)}
                  className="h-7 font-mono text-sm"
                />
              </div>
              {error && (
                <div className="flex items-center gap-1 pl-[7.5rem] text-xs text-destructive">
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
        The code must match the province abbreviation the unit sits in. If your SVG element IDs are named correctly, this fills in automatically.
      </p>
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

UnitPositionEditor.displayName = "UnitPositionEditor";
