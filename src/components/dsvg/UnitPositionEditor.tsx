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
import type { LayerAssignments, NamedCoastEntry } from "@/types/dsvg";

export interface UnitPositionEditorHandle {
  validate: () => Record<string, string> | null;
  /** Current values without validation, for snapshotting on Back navigation. */
  getValues: () => Record<string, string>;
}

interface UnitPositionEditorProps {
  svgContent: string;
  assignments: LayerAssignments;
  provinceAbbrs: Record<string, string>;
  namedCoastEntries: NamedCoastEntry[];
  /** Previously entered codes, restored when revisiting this step. */
  defaultCodes?: Record<string, string>;
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
>(({ svgContent, assignments, provinceAbbrs, namedCoastEntries, defaultCodes }, ref) => {
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
  const [summaryErrors, setSummaryErrors] = useState<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const mismatchDetails = useMemo(() => {
    if (!countMismatch) return null;
    const validCodesSet = new Set<string>([
      ...Object.values(provinceAbbrs).map(v => v.toLowerCase()),
      ...namedCoastEntries.map(e =>
        `${e.parentProvince}/${e.coastAbbr}`.toLowerCase()
      ),
    ]);
    const assignedCodesSet = new Set<string>(
      elements
        .map(el => (codes[el.svgId] ?? "").toLowerCase())
        .filter(c => c.length > 0)
    );
    const missingProvinces = [...validCodesSet].filter(
      c => !assignedCodesSet.has(c)
    );
    const extraPositions = elements
      .map(el => (codes[el.svgId] ?? el.svgId).toLowerCase())
      .filter(c => !validCodesSet.has(c));
    return { missingProvinces, extraPositions };
  }, [countMismatch, provinceAbbrs, namedCoastEntries, elements, codes]);

  useEffect(() => {
    const initial: Record<string, string> = {};
    elements.forEach(({ svgId }) => {
      const previous = defaultCodes?.[svgId];
      if (previous) {
        initial[svgId] = previous;
        return;
      }
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
  }, [elements, defaultCodes]);

  useImperativeHandle(
    ref,
    () => ({
      validate() {
        if (countMismatch) return null;

        const newErrors: Record<string, string> = {};

        // Check 1: format
        for (const el of elements) {
          if (!CODE_PATTERN.test(codes[el.svgId] ?? "")) {
            newErrors[el.svgId] = CODE_ERROR;
          }
        }

        // Check 2: duplicates
        const seen = new Map<string, string[]>();
        for (const el of elements) {
          const lower = (codes[el.svgId] ?? "").toLowerCase();
          if (!seen.has(lower)) seen.set(lower, []);
          seen.get(lower)!.push(el.svgId);
        }
        for (const [code, ids] of seen) {
          if (ids.length > 1) {
            for (const id of ids) {
              newErrors[id] = `Duplicate code "${code}".`;
            }
          }
        }

        // Check 3: existence — each code must match a province abbr or named coast
        const validCodes = new Set<string>([
          ...Object.values(provinceAbbrs).map(v => v.toLowerCase()),
          ...namedCoastEntries.map(e =>
            `${e.parentProvince}/${e.coastAbbr}`.toLowerCase()
          ),
        ]);
        for (const el of elements) {
          const lower = (codes[el.svgId] ?? "").toLowerCase();
          if (CODE_PATTERN.test(lower) && !validCodes.has(lower)) {
            newErrors[el.svgId] = `"${lower}" does not match any province or named coast.`;
          }
        }

        // Check 4: coverage — every province and named coast must have a unit position
        const assignedCodes = new Set(
          Object.values(codes).map(v => v.toLowerCase())
        );
        const missing: string[] = [];
        for (const abbr of Object.values(provinceAbbrs)) {
          if (!assignedCodes.has(abbr.toLowerCase())) {
            missing.push(`Province '${abbr}' has no unit position.`);
          }
        }
        for (const entry of namedCoastEntries) {
          const code = `${entry.parentProvince}/${entry.coastAbbr}`.toLowerCase();
          if (!assignedCodes.has(code)) {
            missing.push(`Named coast '${code}' has no unit position.`);
          }
        }

        if (Object.keys(newErrors).length > 0 || missing.length > 0) {
          setErrors(prev => ({ ...prev, ...newErrors }));
          setSummaryErrors(missing);
          requestAnimationFrame(() => {
            const firstId = elements.find(el => newErrors[el.svgId])?.svgId;
            if (firstId) {
              inputRefs.current[firstId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              inputRefs.current[firstId]?.focus();
            }
          });
          return null;
        }

        setSummaryErrors([]);
        return { ...codes };
      },
      getValues() {
        return { ...codes };
      },
    }),
    [codes, elements, countMismatch, provinceAbbrs, namedCoastEntries]
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
    if (summaryErrors.length > 0) setSummaryErrors([]);
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
    <p className="text-sm text-destructive">
      No unit-positions layer was assigned. Go back to the Assign layers step and
      select one — every province needs a unit-position marker.
    </p>
  ) : elements.length === 0 ? (
    <p className="text-sm text-destructive">
      No objects found in the unit-positions layer. Every province needs a
      unit-position marker; check that the right layer is assigned.
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
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <div className="flex items-center gap-2">
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
          {mismatchDetails && (
            <ul className="mt-1 list-disc pl-9 font-mono">
              {mismatchDetails.missingProvinces.map(p => (
                <li key={p}>province — {p}</li>
              ))}
              {mismatchDetails.extraPositions.map(p => (
                <li key={p}>unit-position — {p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {summaryErrors.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Some provinces have no unit position:</span>
          </div>
          <ul className="mt-1 list-disc pl-9">
            {summaryErrors.map(msg => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
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
