import { useState, useRef } from "react";
import { Upload, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import { AppHeader } from "@/components/common/AppHeader";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LayerAssignment } from "@/components/dsvg/LayerAssignment";
import { LayerPreview } from "@/components/dsvg/LayerPreview";
import { NamedCoastEditor } from "@/components/dsvg/NamedCoastEditor";
import { UnitPositionEditor } from "@/components/dsvg/UnitPositionEditor";
import { DsvgExport } from "@/components/dsvg/DsvgExport";
import { parseSvgTree, flattenTree, validateAnySvg } from "@/utils/svgTree";
import type { SvgTreeNode } from "@/utils/svgTree";
import type { LayerAssignments, NamedCoastEntry } from "@/types/dsvg";
import type { LayerPreviewHandle } from "@/components/dsvg/LayerPreview";
import type { NamedCoastEditorHandle } from "@/components/dsvg/NamedCoastEditor";
import type { UnitPositionEditorHandle } from "@/components/dsvg/UnitPositionEditor";

type Step = "upload" | "assign" | "preview" | "named-coasts" | "unit-positions" | "done";

function autoDetectAssignments(svgTree: SvgTreeNode[]): LayerAssignments {
  const flat = flattenTree(svgTree);
  const find = (target: string) =>
    flat.find(n => n.name.toLowerCase() === target)?.key ?? null;
  return {
    provinces: find("provinces"),
    namedCoasts: find("named-coasts"),
    unitPositions: find("unit-positions"),
    provinceNames: find("names"),
    borders: find("borders"),
    supplyCenters: find("scs"),
  };
}

const DEFAULT_ASSIGNMENTS: LayerAssignments = {
  provinces: null,
  namedCoasts: null,
  unitPositions: null,
  provinceNames: null,
  borders: null,
  supplyCenters: null,
};

const STEP_TITLES: Record<Exclude<Step, "upload">, string> = {
  assign: "Assign layers",
  preview: "Province abbreviations",
  "named-coasts": "Named coasts",
  "unit-positions": "Unit positions",
  done: "Review & export",
};

const STEP_SUBTITLES: Record<Exclude<Step, "upload">, string> = {
  assign: "Map your SVG layers to provinces and named coasts.",
  preview: "Review the province layer naming. Each should be a three-letter code.",
  "named-coasts": "Assign parent provinces and abbreviations to each named coast.",
  "unit-positions": "Assign a three-letter code to each unit position marker.",
  done: "Toggle layer visibility and download your dSVG file.",
};

const DSVG_STEPS = [
  { key: "upload",         label: "Upload"          },
  { key: "assign",         label: "Assign layers"   },
  { key: "preview",        label: "Abbreviations"   },
  { key: "named-coasts",   label: "Named coasts"    },
  { key: "unit-positions", label: "Unit positions"  },
  { key: "done",           label: "Export"          },
];

const PREV_STEP: Record<Exclude<Step, "upload">, Step> = {
  assign: "upload",
  preview: "assign",
  "named-coasts": "preview",
  "unit-positions": "named-coasts",
  done: "unit-positions",
};

export function DSvgCreator() {
  const [step, setStep] = useState<Step>("upload");
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [tree, setTree] = useState<SvgTreeNode[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [assignments, setAssignments] =
    useState<LayerAssignments>(DEFAULT_ASSIGNMENTS);
  const [provinceAbbrs, setProvinceAbbrs] = useState<Record<string, string>>(
    {}
  );
  const [unitPositionCodes, setUnitPositionCodes] = useState<Record<string, string>>({});
  const [namedCoastEntries, setNamedCoastEntries] = useState<NamedCoastEntry[]>([]);

  const [assignError, setAssignError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const layerPreviewRef = useRef<LayerPreviewHandle>(null);
  const namedCoastEditorRef = useRef<NamedCoastEditorHandle>(null);
  const unitPositionEditorRef = useRef<UnitPositionEditorHandle>(null);

  const { allowNavigation } = useUnsavedWorkGuard(step !== "upload");

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setError("Please upload an SVG file.");
      return;
    }

    try {
      const content = await file.text();
      const validationError = validateAnySvg(content);
      if (validationError) {
        setError(validationError);
        return;
      }

      const parsed = parseSvgTree(content);
      setError(null);
      setFileName(file.name);
      setSvgContent(content);
      setTree(parsed);
      setAssignments(autoDetectAssignments(parsed));
      setProvinceAbbrs({});
      setUnitPositionCodes({});
      setNamedCoastEntries([]);
      setStep("assign");
    } catch {
      setError("Could not read the file. Please try again.");
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleClear = () => {
    if (
      step !== "upload" &&
      !window.confirm("Clearing discards everything you've entered in this wizard. Clear anyway?")
    ) {
      return;
    }
    setStep("upload");
    setSvgContent(null);
    setTree(null);
    setFileName(null);
    setError(null);
    setAssignments(DEFAULT_ASSIGNMENTS);
    setProvinceAbbrs({});
    setUnitPositionCodes({});
    setNamedCoastEntries([]);
    setAssignError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleNext = () => {
    if (step === "assign") {
      if (!assignments.provinces || !assignments.unitPositions) {
        setAssignError(
          "Provinces and Unit Positions layers are required — assign both before continuing."
        );
        return;
      }
      setAssignError(null);
      setStep("preview");
      return;
    }
    if (step === "preview") {
      const abbrs = layerPreviewRef.current?.validate();
      if (abbrs) {
        setProvinceAbbrs(abbrs);
        setStep("named-coasts");
      }
      return;
    }
    if (step === "named-coasts") {
      const entries = namedCoastEditorRef.current?.validate();
      if (entries) {
        setNamedCoastEntries(entries);
        setStep("unit-positions");
      }
      return;
    }
    if (step === "unit-positions") {
      const codes = unitPositionEditorRef.current?.validate();
      if (codes) {
        setUnitPositionCodes(codes);
        setStep("done");
      }
      return;
    }
  };

  // Snapshot the active step's in-progress values (without validating) so
  // going back never discards them.
  const handleBack = () => {
    if (step === "preview" && layerPreviewRef.current) {
      setProvinceAbbrs(layerPreviewRef.current.getValues());
    } else if (step === "named-coasts" && namedCoastEditorRef.current) {
      setNamedCoastEntries(namedCoastEditorRef.current.getData());
    } else if (step === "unit-positions" && unitPositionEditorRef.current) {
      setUnitPositionCodes(unitPositionEditorRef.current.getValues());
    }
    setStep(PREV_STEP[step as Exclude<Step, "upload">]);
  };

  return (
    <>
    <AppHeader
      steps={DSVG_STEPS}
      currentStep={step}
      title="dSVG creator"
      filename={fileName}
      onClear={handleClear}
    />
    <div className="flex min-h-screen flex-col items-center p-8">
      <div className="flex w-full max-w-5xl flex-col gap-6">
        {step === "upload" ? (
          <>
            <div>
              <h1 className="text-3xl font-bold">dSVG creator</h1>
              <p className="mt-1 text-muted-foreground">
                This tool takes your SVG map file and produces a <strong>dSVG</strong>{" "}file that Diplicity can read. We&apos;ll walk through it step by step.
              </p>
            </div>

            <p className="text-sm text-muted-foreground rounded-md border px-4 py-3">
              If you need to make small changes to the map (e.g. adjust a border), you can re-upload the new exported SVG and generate a fresh dSVG — as long as your objects are still named the same and none were added. You don&apos;t need to update the dVAR file unless connections, supply centers, or other game-rule data changed.
            </p>

            <p className="font-medium">Upload your SVG to start</p>

            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ")
                  fileInputRef.current?.click();
              }}
              onDrop={handleDrop}
              onDragOver={e => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={e => {
                e.preventDefault();
                setIsDragging(false);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              )}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-center text-muted-foreground">
                Drop any SVG here or click to upload
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <h1 className="text-3xl font-bold">
                {STEP_TITLES[step as Exclude<Step, "upload">]}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {STEP_SUBTITLES[step as Exclude<Step, "upload">]}
              </p>
            </div>

            {step === "assign" && tree && (
              <>
                <LayerAssignment
                  tree={tree}
                  assignments={assignments}
                  onChange={a => { setAssignments(a); setAssignError(null); }}
                />
                {assignError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {assignError}
                  </div>
                )}
              </>
            )}

            {step === "preview" && svgContent && (
              <LayerPreview
                ref={layerPreviewRef}
                svgContent={svgContent}
                assignments={assignments}
                defaultAbbrs={Object.keys(provinceAbbrs).length > 0 ? provinceAbbrs : undefined}
              />
            )}

            {step === "named-coasts" && svgContent && (
              <NamedCoastEditor
                ref={namedCoastEditorRef}
                svgContent={svgContent}
                assignments={assignments}
                provinceAbbrs={provinceAbbrs}
                defaultEntries={namedCoastEntries.length > 0 ? namedCoastEntries : undefined}
              />
            )}

            {step === "unit-positions" && svgContent && (
              <UnitPositionEditor
                ref={unitPositionEditorRef}
                svgContent={svgContent}
                assignments={assignments}
                provinceAbbrs={provinceAbbrs}
                namedCoastEntries={namedCoastEntries}
                defaultCodes={Object.keys(unitPositionCodes).length > 0 ? unitPositionCodes : undefined}
              />
            )}

            {step === "done" && svgContent && tree && (
              <DsvgExport
                svgContent={svgContent}
                assignments={assignments}
                unitPositionCodes={unitPositionCodes}
                namedCoastEntries={namedCoastEntries}
                tree={tree}
                fileName={fileName ?? "map.svg"}
                onLeaveApproved={allowNavigation}
              />
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>

              {step !== "done" && (
                <Button onClick={handleNext}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".svg"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Upload SVG file"
        />
      </div>
    </div>
    </>
  );
}
