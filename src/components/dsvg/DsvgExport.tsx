import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Download, ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle, Upload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { buildDsvgOutput, buildVisibilityPreviewSvg } from "@/utils/svgBuild";
import { analyzeSvgFonts, embedFonts } from "@/utils/fontEmbed";
import type { SvgFontInfo } from "@/utils/fontEmbed";
import type { SvgTreeNode } from "@/utils/svgTree";
import type { LayerAssignments, NamedCoastEntry } from "@/types/dsvg";

interface DsvgExportProps {
  svgContent: string;
  assignments: LayerAssignments;
  unitPositionCodes: Record<string, string>;
  namedCoastEntries: NamedCoastEntry[];
  tree: SvgTreeNode[];
  fileName: string;
}

// Checks that required layers are direct children of the root <svg> element,
// matching what the diplicity-react dsvgParser.findLayer() expects.
function validateDsvgStructure(svgContent: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const errors: string[] = [];

  if (doc.querySelector("parsererror")) {
    return ["Output SVG is not valid XML."];
  }

  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== "svg") {
    return ["Output root element is not <svg>."];
  }
  if (!root.getAttribute("viewBox")) {
    errors.push("Output SVG is missing a viewBox attribute.");
  }

  const rootLayerIds = new Set(
    Array.from(root.children)
      .filter(el => el.tagName.toLowerCase() === "g")
      .map(el => el.getAttribute("id"))
      .filter((id): id is string => id !== null)
  );

  for (const required of ["provinces", "unit-positions", "supply-centers"]) {
    if (!rootLayerIds.has(required)) {
      errors.push(`Layer <g id="${required}"> is missing as a direct child of <svg>.`);
    }
  }

  return errors;
}

function validatePositionConsistency(svgContent: string): { missing: string[]; unknown: string[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");

  const shapeIds = new Set<string>();
  for (const layer of [doc.getElementById("provinces"), doc.getElementById("named-coasts")]) {
    if (!layer) continue;
    for (const el of Array.from(layer.querySelectorAll("path"))) {
      const id = el.getAttribute("id");
      if (id) shapeIds.add(id);
    }
  }

  const circleIds = new Set<string>();
  const upLayer = doc.getElementById("unit-positions");
  if (upLayer) {
    for (const el of Array.from(upLayer.querySelectorAll("circle"))) {
      const id = el.getAttribute("id");
      if (id) circleIds.add(id);
    }
  }

  return {
    missing: [...shapeIds].filter(id => !circleIds.has(id)).sort(),
    unknown: [...circleIds].filter(id => !shapeIds.has(id)).sort(),
  };
}

export function DsvgExport({ svgContent, assignments, unitPositionCodes, namedCoastEntries, tree, fileName }: DsvgExportProps) {
  const navigate = useNavigate();
  const displayNodes = useMemo(
    () => tree.flatMap(n => (n.children.length > 0 ? n.children : [n])),
    [tree]
  );

  // Split displayNodes into background/foreground based on position relative to provinces
  const { backgroundItems, foregroundItems } = useMemo(() => {
    const assignedKeySet = new Set(
      [
        assignments.provinces,
        assignments.namedCoasts,
        assignments.unitPositions,
        assignments.provinceNames,
        assignments.borders,
        assignments.supplyCenters,
      ].filter((k): k is string => k !== null)
    );
    const provincesIdx = assignments.provinces
      ? displayNodes.findIndex(n => n.key === assignments.provinces)
      : -1;
    const bg: SvgTreeNode[] = [];
    const fg: SvgTreeNode[] = [];
    displayNodes.forEach((node, i) => {
      if (assignedKeySet.has(node.key)) return;
      if (provincesIdx === -1 || i < provincesIdx) bg.push(node);
      else fg.push(node);
    });
    return { backgroundItems: bg, foregroundItems: fg };
  }, [displayNodes, assignments]);

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () => new Set(tree.flatMap(n => (n.children.length > 0 ? n.children : [n])).map(n => n.key))
  );

  const toggleLeaf = (key: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (keys: string[]) => {
    setVisibleKeys(prev => {
      const allOn = keys.every(k => prev.has(k));
      const next = new Set(prev);
      keys.forEach(k => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const groupCheckedState = (keys: string[]): boolean | "indeterminate" => {
    if (keys.length === 0) return true;
    const on = keys.filter(k => visibleKeys.has(k)).length;
    if (on === keys.length) return true;
    if (on === 0) return false;
    return "indeterminate";
  };

  const previewSvg = useMemo(
    () => buildVisibilityPreviewSvg(svgContent, displayNodes, visibleKeys),
    [svgContent, displayNodes, visibleKeys]
  );

  const [embedFontsEnabled, setEmbedFontsEnabled] = useState(true);
  const [fontCheckLoading, setFontCheckLoading] = useState(false);
  const [fontCheckError, setFontCheckError] = useState(false);
  const [fontCheckRetry, setFontCheckRetry] = useState(0);
  const [fontInfo, setFontInfo] = useState<SvgFontInfo | null>(null);
  const [uploadedFonts, setUploadedFonts] = useState<Map<string, ArrayBuffer>>(new Map());
  const [isDownloading, setIsDownloading] = useState(false);
  const [structureErrors, setStructureErrors] = useState<string[]>([]);
  const [positionErrors, setPositionErrors] = useState<{ missing: string[]; unknown: string[] } | null>(null);
  const [buildWarnings, setBuildWarnings] = useState<string[]>([]);
  const [embedFailed, setEmbedFailed] = useState(false);
  const preEmbedOutputRef = useRef<string | null>(null);

  useEffect(() => {
    if (!embedFontsEnabled) {
      setFontInfo(null);
      setFontCheckError(false);
      setUploadedFonts(new Map());
      return;
    }
    let cancelled = false;
    setFontCheckLoading(true);
    setFontCheckError(false);
    setFontInfo(null);
    analyzeSvgFonts(svgContent).then(info => {
      if (!cancelled) {
        setFontInfo(info);
        setFontCheckLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setFontCheckLoading(false);
        setFontCheckError(true);
      }
    });
    return () => { cancelled = true; };
  }, [embedFontsEnabled, svgContent, fontCheckRetry]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = new Blob([previewSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewSvg]);

  const aspectRatio = useMemo(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    const vb = doc.documentElement.getAttribute("viewBox") ?? "";
    const parts = vb.split(/\s+/).map(Number);
    return parts.length >= 4 && parts[2] > 0 && parts[3] > 0
      ? `${parts[2]} / ${parts[3]}`
      : undefined;
  }, [svgContent]);

  const triggerDownload = (output: string) => {
    const baseName = fileName.replace(/\.svg$/i, "");
    const blob = new Blob([output], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.d.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    setStructureErrors([]);
    setPositionErrors(null);
    setBuildWarnings([]);
    setEmbedFailed(false);
    preEmbedOutputRef.current = null;
    try {
      const collectedWarnings: string[] = [];
      let output = buildDsvgOutput(svgContent, assignments, unitPositionCodes, namedCoastEntries, collectedWarnings);

      const structErrors = validateDsvgStructure(output);
      if (structErrors.length > 0) {
        setStructureErrors(structErrors);
        setBuildWarnings(collectedWarnings);
        return;
      }

      const validation = validatePositionConsistency(output);
      if (validation.missing.length > 0 || validation.unknown.length > 0) {
        setPositionErrors(validation);
        setBuildWarnings(collectedWarnings);
        return;
      }
      setBuildWarnings(collectedWarnings);

      if (embedFontsEnabled && fontInfo) {
        preEmbedOutputRef.current = output;
        try {
          output = await embedFonts(output, fontInfo, uploadedFonts);
        } catch {
          setEmbedFailed(true);
          return;
        }
      }
      triggerDownload(output);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadWithoutFonts = () => {
    if (preEmbedOutputRef.current) triggerDownload(preEmbedOutputRef.current);
  };

  // Assigned layers in canonical output order, skipping unassigned ones
  const assignedLayers = (
    [
      { label: "provinces", key: assignments.provinces },
      { label: "named-coasts", key: assignments.namedCoasts },
      { label: "unit-positions", key: assignments.unitPositions },
      { label: "province-names", key: assignments.provinceNames },
      { label: "borders", key: assignments.borders },
      { label: "supply-centers", key: assignments.supplyCenters },
    ] as { label: string; key: string | null }[]
  ).filter((l): l is { label: string; key: string } => l.key !== null);

  const bgKeys = backgroundItems.map(n => n.key);
  const fgKeys = foregroundItems.map(n => n.key);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-4">
        <div className="flex max-h-[70vh] flex-col overflow-y-auto pr-1">
          <GroupRow
            label="background"
            checked={groupCheckedState(bgKeys)}
            onToggle={() => toggleGroup(bgKeys)}
          >
            {backgroundItems.map(node => (
              <LeafRow
                key={node.key}
                id={node.key}
                name={node.name}
                checked={visibleKeys.has(node.key)}
                onToggle={() => toggleLeaf(node.key)}
              />
            ))}
          </GroupRow>

          {assignedLayers.map(({ label, key }) => (
            <div key={key} className="flex items-center gap-1.5 py-0.5">
              <div className="w-4 shrink-0" />
              <Checkbox
                id={key}
                checked={visibleKeys.has(key)}
                onCheckedChange={() => toggleLeaf(key)}
              />
              <Label htmlFor={key} className="cursor-pointer font-mono text-xs">
                {label}
              </Label>
            </div>
          ))}

          <GroupRow
            label="foreground"
            checked={groupCheckedState(fgKeys)}
            onToggle={() => toggleGroup(fgKeys)}
          >
            {foregroundItems.map(node => (
              <LeafRow
                key={node.key}
                id={node.key}
                name={node.name}
                checked={visibleKeys.has(node.key)}
                onToggle={() => toggleLeaf(node.key)}
              />
            ))}
          </GroupRow>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="embed-fonts"
              checked={embedFontsEnabled}
              onCheckedChange={(c) => setEmbedFontsEnabled(c === true)}
            />
            <Label htmlFor="embed-fonts" className="cursor-pointer text-sm">
              Embed fonts
            </Label>
          </div>

          {embedFontsEnabled && (
            <div className="rounded-md border px-3 py-2 text-xs">
              {fontCheckLoading ? (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking fonts…
                </div>
              ) : fontCheckError ? (
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    Font analysis failed
                  </div>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => setFontCheckRetry(r => r + 1)}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </Button>
                </div>
              ) : fontInfo && fontInfo.fonts.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {fontInfo.fonts.map(font => (
                    <FontStatusRow
                      key={font.family}
                      family={font.family}
                      availableOnGoogle={font.availableOnGoogle}
                      uploaded={uploadedFonts.has(font.family)}
                      onUpload={(buf) =>
                        setUploadedFonts(prev => new Map([...prev, [font.family, buf]]))
                      }
                    />
                  ))}
                </div>
              ) : fontInfo ? (
                <span className="text-muted-foreground">No fonts detected in SVG</span>
              ) : null}
            </div>
          )}
        </div>

        {buildWarnings.length > 0 && (
          <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Group detection warnings — review if export looks wrong
            </div>
            {buildWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}

        {structureErrors.length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              dSVG structure invalid — the server will reject this file
            </div>
            {structureErrors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}

        {positionErrors && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Unit-position ID mismatch — the server will reject this file
            </div>
            {positionErrors.missing.length > 0 && (
              <p>
                <span className="font-semibold">Provinces with no position circle:</span>{" "}
                {positionErrors.missing.map(id => (
                  <span key={id} className="font-mono mx-0.5">{id}</span>
                ))}
              </p>
            )}
            {positionErrors.unknown.length > 0 && (
              <p>
                <span className="font-semibold">Position circles with no matching province:</span>{" "}
                {positionErrors.unknown.map(id => (
                  <span key={id} className="font-mono mx-0.5">{id}</span>
                ))}
              </p>
            )}
            <p className="text-muted-foreground">
              Fix these IDs in your source SVG and re-upload to resolve.
            </p>
          </div>
        )}

        {embedFailed && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Font embed failed. Try again, or{" "}
              <button
                type="button"
                className="underline"
                onClick={handleDownloadWithoutFonts}
              >
                download anyway
              </button>{" "}
              to download without embedded fonts.
            </div>
          </div>
        )}

        <Button onClick={handleDownload} disabled={isDownloading || fontCheckLoading || fontCheckError}>
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {isDownloading ? "Embedding…" : "Download dSVG"}
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative w-full" style={{ aspectRatio }}>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="SVG layer preview"
              className="h-full w-full rounded-lg border object-contain"
            />
          )}
        </div>

        <p className="text-sm text-muted-foreground rounded-md border px-4 py-3">
          The SVG should now be ready for download. You can check the layers to see if everything looks good and if the fonts were embedded correctly. After this, you can continue with the dVAR creator to add the metadata.
        </p>

        <Button variant="outline" onClick={() => navigate("/dvar-creator")}>
          Continue to dVAR creator
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface FontStatusRowProps {
  family: string;
  availableOnGoogle: boolean;
  uploaded: boolean;
  onUpload: (buffer: ArrayBuffer) => void;
}

function FontStatusRow({ family, availableOnGoogle, uploaded, onUpload }: FontStatusRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpload(await file.arrayBuffer());
    e.target.value = "";
  };

  const resolved = availableOnGoogle || uploaded;

  return (
    <div className="flex items-center gap-1.5">
      {resolved ? (
        <CheckCircle2 className={`h-3 w-3 shrink-0 ${uploaded && !availableOnGoogle ? "text-blue-500" : "text-green-500"}`} />
      ) : (
        <AlertCircle className="h-3 w-3 shrink-0 text-amber-500" />
      )}
      <span className={`font-mono ${!resolved ? "text-amber-600 dark:text-amber-400" : ""}`}>
        {family}
      </span>
      {!availableOnGoogle && !uploaded && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".woff2"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="link"
            size="sm"
            className="ml-auto h-auto p-0 text-xs"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3 w-3" />
            Upload .woff2
          </Button>
        </>
      )}
      {uploaded && (
        <span className="ml-auto text-muted-foreground">uploaded</span>
      )}
    </div>
  );
}

interface GroupRowProps {
  label: string;
  checked: boolean | "indeterminate";
  onToggle: () => void;
  children: React.ReactNode;
}

function GroupRow({ label, checked, onToggle, children }: GroupRowProps) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <div className="flex items-center gap-1.5 py-0.5">
        <button
          type="button"
          className="flex w-4 shrink-0 items-center justify-center text-muted-foreground"
          onClick={() => setOpen(o => !o)}
        >
          <Chevron className="h-3 w-3" />
        </button>
        <Checkbox
          id={`group-${label}`}
          checked={checked}
          onCheckedChange={onToggle}
        />
        <Label
          htmlFor={`group-${label}`}
          className="cursor-pointer font-mono text-xs font-medium"
        >
          {label}
        </Label>
      </div>
      {open && <div className="ml-[22px] flex flex-col">{children}</div>}
    </div>
  );
}

interface LeafRowProps {
  id: string;
  name: string;
  checked: boolean;
  onToggle: () => void;
}

function LeafRow({ id, name, checked, onToggle }: LeafRowProps) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <Checkbox id={id} checked={checked} onCheckedChange={onToggle} />
      <Label htmlFor={id} className="cursor-pointer font-mono text-xs">
        {name}
      </Label>
    </div>
  );
}
