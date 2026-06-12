import { forwardRef, useImperativeHandle, useState, useMemo, useRef, useEffect } from "react";
import { Wand2, MousePointer, Pencil, ChevronUp, ChevronDown, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  buildProvincePreviewSvg,
  extractDsvgProvinceShapes,
  extractDsvgNamedCoastShapes,
} from "@/utils/dvarPreview";
import {
  autoDetectDvarAdjacencies,
  toggleDvarAdjacency,
  setDvarAdjacencyPass,
} from "@/utils/dvarAdjacency";
import type { DvarAdjacencyMap, PassType } from "@/utils/dvarAdjacency";
import { aspectRatioFromViewBox } from "@/utils/svgAspect";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";

export interface AdjacenciesFormHandle {
  submit: () => void;
  getValues: () => DvarAdjacencyMap;
}

interface AdjacenciesFormProps {
  svgContent: string;
  provinceNames: Record<string, string>;
  provinceTypes: Record<string, string>;
  namedCoastsByParent: Record<string, string[]>;
  coastNames: Record<string, string>;
  defaultValues: DvarAdjacencyMap;
  onSubmit: (adjacencyMap: DvarAdjacencyMap) => void;
}

export const AdjacenciesForm = forwardRef<AdjacenciesFormHandle, AdjacenciesFormProps>(
  ({ svgContent, provinceNames, provinceTypes, namedCoastsByParent, defaultValues, onSubmit }, ref) => {
    const [adjacencyMap, setAdjacencyMap] = useState<DvarAdjacencyMap>(defaultValues);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);

    interface CoastConnectionDialog {
      fromProvinceId: string;
      fromCoasts: string[];
      toProvinceId: string;
      toCoasts: string[];
      defaultPass: PassType;
    }
    const [coastConnectionDialog, setCoastConnectionDialog] = useState<CoastConnectionDialog | null>(null);
    const [dialogFromId, setDialogFromId] = useState<string>("");
    const [dialogToId, setDialogToId] = useState<string>("");

    useImperativeHandle(ref, () => ({
      submit: () => onSubmit(adjacencyMap),
      getValues: () => adjacencyMap,
    }));

    const { shapes, viewBox } = useMemo(
      () => extractDsvgProvinceShapes(svgContent),
      [svgContent]
    );

    const aspectRatio = useMemo(() => aspectRatioFromViewBox(viewBox), [viewBox]);

    const basePreviewSvg = useMemo(
      () => buildProvincePreviewSvg(svgContent, null),
      [svgContent]
    );
    const basePreviewUrl = useSvgObjectUrl(basePreviewSvg);

    const listItems = useMemo(
      () => shapes.map(shape => ({ id: shape.id })),
      [shapes]
    );

    const coastToParent = useMemo(() => {
      const map: Record<string, string> = {};
      for (const [parentId, coasts] of Object.entries(namedCoastsByParent)) {
        for (const coastId of coasts) map[coastId] = parentId;
      }
      return map;
    }, [namedCoastsByParent]);

    const selectedItem = listItems[selectedIndex] ?? null;
    const selectedId = selectedItem?.id ?? null;

    interface UnifiedAdj { fromId: string; to: string; pass: PassType; }
    const currentAdjacencies = useMemo((): UnifiedAdj[] => {
      if (!selectedId) return [];
      const coasts = namedCoastsByParent[selectedId] ?? [];
      const parentAdjs = (adjacencyMap[selectedId] ?? []).map(adj => ({
        fromId: selectedId, to: adj.to, pass: adj.pass,
      }));
      const coastAdjs = coasts.flatMap(coastId =>
        (adjacencyMap[coastId] ?? []).map(adj => ({
          fromId: coastId, to: adj.to, pass: adj.pass,
        }))
      );
      return [...parentAdjs, ...coastAdjs];
    }, [selectedId, adjacencyMap, namedCoastsByParent]);

    const adjacentTypeMap = useMemo(() => {
      const passRank: Record<PassType, number> = { army: 1, fleet: 2, both: 3 };
      const map = new Map<string, PassType>();
      for (const adj of currentAdjacencies) {
        const parentId = coastToParent[adj.to] ?? adj.to;
        const existing = map.get(parentId);
        if (!existing || passRank[adj.pass] > passRank[existing]) {
          map.set(parentId, adj.pass);
        }
      }
      return map;
    }, [currentAdjacencies, coastToParent]);

    const coastShapes = useMemo(
      () => extractDsvgNamedCoastShapes(svgContent).shapes,
      [svgContent]
    );

    const totalAdjacencies = useMemo(() => {
      let count = 0;
      for (const adjs of Object.values(adjacencyMap)) count += adjs.length;
      return count / 2;
    }, [adjacencyMap]);

    const passBreakdown = useMemo(() => {
      const counts = { fleet: 0, army: 0, both: 0 };
      for (const adjs of Object.values(adjacencyMap)) {
        for (const adj of adjs) counts[adj.pass]++;
      }
      return { fleet: counts.fleet / 2, army: counts.army / 2, both: counts.both / 2 };
    }, [adjacencyMap]);

    const isolatedIds = useMemo(
      () => listItems.map(item => item.id).filter(id => {
        const coasts = namedCoastsByParent[id] ?? [];
        return [id, ...coasts].every(sid => !adjacencyMap[sid] || adjacencyMap[sid].length === 0);
      }),
      [listItems, adjacencyMap, namedCoastsByParent]
    );

    const handleAutoDetect = () => {
      if (
        totalAdjacencies > 0 &&
        !window.confirm(
          "Auto-detect replaces all existing connections, including ones you added or edited manually. Replace them?"
        )
      ) {
        return;
      }
      const { shapes: coastShapes } = extractDsvgNamedCoastShapes(svgContent);
      const namedCoastShapesWithParent = coastShapes.map(s => ({
        ...s,
        parentId: s.id.split("/")[0],
      }));
      const detected = autoDetectDvarAdjacencies(shapes, namedCoastShapesWithParent, provinceTypes);
      setAdjacencyMap(detected);
    };

    const handleProvinceClick = (clickedProvinceId: string) => {
      if (!isEditMode) {
        const idx = listItems.findIndex(item => item.id === clickedProvinceId);
        if (idx !== -1) setSelectedIndex(idx);
        return;
      }
      if (!selectedId || clickedProvinceId === selectedId) return;

      const fromCoasts = namedCoastsByParent[selectedId] ?? [];
      const toCoasts = namedCoastsByParent[clickedProvinceId] ?? [];
      const defaultPass: PassType =
        provinceTypes[selectedId] === "sea" || provinceTypes[clickedProvinceId] === "sea"
          ? "fleet"
          : provinceTypes[selectedId] === "coastal" && provinceTypes[clickedProvinceId] === "coastal"
            ? "both"
            : "army";

      if (fromCoasts.length > 0 || toCoasts.length > 0) {
        setCoastConnectionDialog({ fromProvinceId: selectedId, fromCoasts, toProvinceId: clickedProvinceId, toCoasts, defaultPass });
        setDialogFromId(selectedId);
        setDialogToId(clickedProvinceId);
      } else {
        setAdjacencyMap(prev => toggleDvarAdjacency(prev, selectedId, clickedProvinceId, defaultPass));
      }
    };

    const handleCoastDialogConfirm = () => {
      if (!coastConnectionDialog) return;
      const fromId = dialogFromId;
      const toId = dialogToId;
      const pass: PassType =
        fromId !== coastConnectionDialog.fromProvinceId || toId !== coastConnectionDialog.toProvinceId
          ? "fleet"
          : coastConnectionDialog.defaultPass;
      setAdjacencyMap(prev => toggleDvarAdjacency(prev, fromId, toId, pass));
      setCoastConnectionDialog(null);
    };

    const handleRemove = (fromId: string, adjTo: string) => {
      setAdjacencyMap(prev => toggleDvarAdjacency(prev, fromId, adjTo));
    };

    const handlePassChange = (fromId: string, adjTo: string, pass: PassType) => {
      setAdjacencyMap(prev => setDvarAdjacencyPass(prev, fromId, adjTo, pass));
    };

    const getName = (id: string) => provinceNames[id] ?? id;

    const getDisplayName = (id: string) => {
      const parentId = coastToParent[id];
      if (parentId) return `${getName(parentId)} (${getName(id)})`;
      return getName(id);
    };

    const ADJACENT_FILLS: Record<PassType, string> = {
      army: "#90EE90",
      fleet: "#87CEEB",
      both: "#FFE066",
    };
    const ADJACENT_STROKES: Record<PassType, string> = {
      army: "#4CAF50",
      fleet: "#2196F3",
      both: "#D97706",
    };

    const getProvinceFill = (id: string) => {
      if (id === selectedId) return { fill: "#EF4444", fillOpacity: 0.85 };
      const adjType = adjacentTypeMap.get(id);
      if (adjType !== undefined) return { fill: ADJACENT_FILLS[adjType], fillOpacity: 0.85 };
      if (id === hoveredId) return { fill: "#ffffff", fillOpacity: 0.2 };
      return { fill: "transparent", fillOpacity: 0 };
    };

    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const el = listRef.current?.querySelector(`[data-list-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={handleAutoDetect}>
            <Wand2 className="h-4 w-4" />
            Auto-Detect
          </Button>
          <span className="text-sm text-muted-foreground">
            {Math.round(totalAdjacencies)} connection{totalAdjacencies !== 1 ? "s" : ""}
            {totalAdjacencies > 0 && (
              <> · {Math.round(passBreakdown.fleet)} fleet · {Math.round(passBreakdown.army)} army · {Math.round(passBreakdown.both)} both</>
            )}
          </span>
        </div>

        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground space-y-2">
          <p>
            Adjacencies define which provinces border each other. <span className="font-medium text-foreground">Auto-detect is recommended</span>, but the result must be reviewed carefully — every adjacent province pair needs a connection.
          </p>
          <p>
            <span className="font-medium text-foreground">Coast-to-coast connections</span> are auto-set to <span className="font-mono text-foreground">both</span> (army + fleet). Change these to <span className="font-mono text-foreground">army</span> if the two provinces only share a land border with no navigable water between them — fleets should not be able to cross.
          </p>
          <p>
            <span className="font-medium text-foreground">Named-coast provinces:</span> add an <span className="font-mono text-foreground">army</span> connection between the main province and any bordering coast or land province. Add a <span className="font-mono text-foreground">fleet</span> connection between the named-coast subprovince (e.g. <span className="font-mono">stp/nc</span>) and the bordering sea or coastal provinces that fleets may enter from that coast.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <p className="mb-1.5 font-medium">Pass type guide</p>
          <ul className="space-y-0.5 text-muted-foreground">
            <li><span className="font-mono font-medium text-foreground">both</span> — coastal ↔ coastal sharing a coastline</li>
            <li><span className="font-mono font-medium text-foreground">fleet</span> — sea ↔ sea, or sea ↔ coastal</li>
            <li><span className="font-mono font-medium text-foreground">army</span> — land ↔ land, or coastal ↔ coastal with no shared coast (land bridge)</li>
          </ul>
        </div>

        <div className="relative w-full overflow-hidden rounded-lg border" style={{ aspectRatio }}>
          {basePreviewUrl && (
            <img
              src={basePreviewUrl}
              alt="Map"
              className="absolute inset-0 h-full w-full"
            />
          )}
          <svg
            viewBox={viewBox}
            className="absolute inset-0 h-full w-full"
            style={{ cursor: isEditMode ? "crosshair" : "pointer" }}
          >
            {shapes.map(shape => {
              const { fill, fillOpacity } = getProvinceFill(shape.id);
              const isSelected = shape.id === selectedId;
              return (
                <g
                  key={shape.id}
                  onClick={() => handleProvinceClick(shape.id)}
                  onMouseEnter={() => setHoveredId(shape.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {shape.paths.map((d, i) => (
                    <path
                      key={i}
                      d={d}
                      fill={fill}
                      fillOpacity={fillOpacity}
                      stroke={isSelected ? "#B91C1C" : "transparent"}
                      strokeWidth={isSelected ? 2 : 0}
                    />
                  ))}
                </g>
              );
            })}
            {coastShapes.flatMap(coast => {
              const parentId = coast.id.split("/")[0];
              const isParentSelected = parentId === selectedId;
              const adjType = adjacentTypeMap.get(parentId);
              if (!isParentSelected && adjType === undefined) return [];
              const stroke = isParentSelected ? "#B91C1C" : ADJACENT_STROKES[adjType!];
              return coast.paths.map((d, i) => (
                <path
                  key={`${coast.id}-${i}`}
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2}
                  pointerEvents="none"
                />
              ));
            })}
          </svg>
        </div>

        <div className="flex justify-center gap-1">
          <Button
            variant={!isEditMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditMode(false)}
          >
            <MousePointer className="h-4 w-4" />
            Select
          </Button>
          <Button
            variant={isEditMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditMode(true)}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>

        <div className="grid grid-cols-[220px_1fr] gap-4">
          <div className="flex flex-col gap-1">
            <div
              ref={listRef}
              className="max-h-[400px] overflow-y-auto rounded-lg border"
            >
            {listItems.map((item, idx) => (
              <button
                key={item.id}
                data-list-index={idx}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={cn(
                  "w-full px-2 py-1.5 text-left transition-colors",
                  idx === selectedIndex
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/50"
                )}
              >
                <div className={cn("truncate font-mono text-xs", idx === selectedIndex ? "text-primary-foreground" : "text-muted-foreground")}>
                  {item.id}
                </div>
                <div className={cn("truncate text-sm", idx === selectedIndex && "text-primary-foreground")}>
                  {getName(item.id)}
                </div>
              </button>
            ))}
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={selectedIndex === 0}
                onClick={() => setSelectedIndex(i => Math.max(0, i - 1))}
              >
                <ChevronUp className="h-4 w-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={selectedIndex >= listItems.length - 1}
                onClick={() => setSelectedIndex(i => Math.min(listItems.length - 1, i + 1))}
              >
                <ChevronDown className="h-4 w-4" />
                Next
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50">
                <tr className="border-b">
                  <th className="px-4 py-2.5 text-left font-medium">
                    Adjacent to {getName(selectedId ?? "")}
                  </th>
                  <th className="w-28 px-4 py-2.5 text-left font-medium">Pass</th>
                  <th className="w-16 px-4 py-2.5 text-right font-medium">Remove</th>
                </tr>
              </thead>
              <tbody>
                {currentAdjacencies.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-3 text-center text-muted-foreground"
                    >
                      {isEditMode
                        ? "Click provinces on the map to add adjacencies."
                        : "Switch to Edit mode, then click provinces on the map."}
                    </td>
                  </tr>
                ) : (
                  currentAdjacencies.map(adj => {
                    const fromCoastName = adj.fromId !== selectedId ? getName(adj.fromId) : null;
                    return (
                      <tr key={`${adj.fromId}-${adj.to}`} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-2">
                          {fromCoastName && (
                            <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                              {fromCoastName}
                            </span>
                          )}
                          {getDisplayName(adj.to)}
                        </td>
                        <td className="px-4 py-2">
                          <Select
                            value={adj.pass}
                            onValueChange={val =>
                              handlePassChange(adj.fromId, adj.to, val as PassType)
                            }
                          >
                            <SelectTrigger size="sm" className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="army">army</SelectItem>
                              <SelectItem value="fleet">fleet</SelectItem>
                              <SelectItem value="both">both</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(adj.fromId, adj.to)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {isolatedIds.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">
                {isolatedIds.length} province{isolatedIds.length !== 1 ? "s" : ""} with no adjacencies
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isolatedIds.map(id => getName(id)).join(", ")}
              </p>
            </div>
          </div>
        )}

        {coastConnectionDialog && (
          <Dialog open onOpenChange={(open) => { if (!open) setCoastConnectionDialog(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Connection</DialogTitle>
                <DialogDescription>
                  Choose which sub-provinces to connect.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {coastConnectionDialog.fromCoasts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      From which part of {getName(coastConnectionDialog.fromProvinceId)}?
                    </p>
                    <div className="space-y-1">
                      {[coastConnectionDialog.fromProvinceId, ...coastConnectionDialog.fromCoasts].map(id => {
                        const alreadyConn = (adjacencyMap[id] ?? []).some(a => a.to === dialogToId);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setDialogFromId(id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                              dialogFromId === id
                                ? "border-primary bg-primary/10 font-medium"
                                : "hover:bg-muted/50",
                              alreadyConn && "opacity-50"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <span>{getName(id)}</span>
                              <span className="ml-2 font-mono text-xs text-muted-foreground">{id}</span>
                            </div>
                            {alreadyConn && (
                              <span className="shrink-0 text-xs text-muted-foreground">connected</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {coastConnectionDialog.toCoasts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      To which part of {getName(coastConnectionDialog.toProvinceId)}?
                    </p>
                    <div className="space-y-1">
                      {[coastConnectionDialog.toProvinceId, ...coastConnectionDialog.toCoasts].map(id => {
                        const alreadyConn = (adjacencyMap[dialogFromId] ?? []).some(a => a.to === id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setDialogToId(id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                              dialogToId === id
                                ? "border-primary bg-primary/10 font-medium"
                                : "hover:bg-muted/50",
                              alreadyConn && "opacity-50"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <span>{getName(id)}</span>
                              <span className="ml-2 font-mono text-xs text-muted-foreground">{id}</span>
                            </div>
                            {alreadyConn && (
                              <span className="shrink-0 text-xs text-muted-foreground">connected</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCoastConnectionDialog(null)}>
                  Cancel
                </Button>
                <Button onClick={handleCoastDialogConfirm}>
                  {(adjacencyMap[dialogFromId] ?? []).some(a => a.to === dialogToId) ? "Remove" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }
);

AdjacenciesForm.displayName = "AdjacenciesForm";
