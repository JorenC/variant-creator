import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { extractDsvgProvinceShapes, buildProvincePreviewSvg } from "@/utils/dvarPreview";
import { aspectRatioFromViewBox } from "@/utils/svgAspect";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import type { DvarAdjacencyMap } from "@/utils/dvarAdjacency";
import type { ExtraUnit, HomeNationsData, ProvincesFormValues } from "@/types/dvar";

export interface UnitScalingFormHandle {
  submit: () => void;
  getValues: () => number;
}

interface UnitScalingFormProps {
  svgContent: string;
  provinces: ProvincesFormValues["provinces"];
  homeNationsData: HomeNationsData;
  extraUnits: ExtraUnit[];
  adjacenciesData: DvarAdjacencyMap;
  nations: Array<{ id: string; name: string; color: string }>;
  defaultValue: number;
  onSubmit: (value: number) => void;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

// Illustrative sizes only — approximate the proportions of diplicity-react's
// production unit/order rendering (packages/web .../InteractiveMap/mapRenderer.ts)
// closely enough to judge relative scale. Not a pixel-for-pixel port.
const BASE_UNIT_RADIUS = 10;
const BASE_HOLD_RING_RADIUS = 14;
const BASE_LINE_WIDTH = 3;
const BASE_ARROW_WIDTH = 6;
const BASE_ARROW_LENGTH = 10;

type PreviewUnit = { province: string; type: "army" | "fleet"; color: string };
type PreviewOrder = { from: string; to?: string; kind: "hold" | "move" | "support" };

function arrowHeadPoints(from: { x: number; y: number }, to: { x: number; y: number }, scale: number): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = BASE_ARROW_LENGTH * scale;
  const width = BASE_ARROW_WIDTH * scale;
  const backX = to.x - length * Math.cos(angle);
  const backY = to.y - length * Math.sin(angle);
  const perpX = Math.sin(angle) * width;
  const perpY = -Math.cos(angle) * width;
  return [
    `${to.x},${to.y}`,
    `${backX + perpX},${backY + perpY}`,
    `${backX - perpX},${backY - perpY}`,
  ].join(" ");
}

export const UnitScalingForm = forwardRef<UnitScalingFormHandle, UnitScalingFormProps>(
  ({ svgContent, provinces, homeNationsData, extraUnits, adjacenciesData, nations, defaultValue, onSubmit }, ref) => {
    const [scale, setScale] = useState(defaultValue);

    useImperativeHandle(ref, () => ({
      submit: () => onSubmit(scale),
      getValues: () => scale,
    }));

    const { shapes, viewBox } = useMemo(() => extractDsvgProvinceShapes(svgContent), [svgContent]);
    const aspectRatio = useMemo(() => aspectRatioFromViewBox(viewBox), [viewBox]);
    const basePreviewSvg = useMemo(() => buildProvincePreviewSvg(svgContent, null), [svgContent]);
    const basePreviewUrl = useSvgObjectUrl(basePreviewSvg);

    const previewUnits = useMemo((): PreviewUnit[] => {
      const nationColor = (nationId: string): string => nations.find(n => n.id === nationId)?.color ?? "#6b7280";
      const fromHome = Object.entries(homeNationsData)
        .filter((entry): entry is [string, HomeNationsData[string] & { startingUnit: "army" | "fleet" }] =>
          entry[1].startingUnit !== null && entry[1].nation !== ""
        )
        .slice(0, 3)
        .map(([province, v]) => ({ province, type: v.startingUnit, color: nationColor(v.nation) }));
      const fromExtra = extraUnits
        .filter((eu): eu is ExtraUnit & { province: string; unit: "army" | "fleet" } =>
          eu.province !== "" && eu.unit !== null && eu.nation !== ""
        )
        .slice(0, Math.max(0, 3 - fromHome.length))
        .map(eu => ({ province: eu.province, type: eu.unit, color: nationColor(eu.nation) }));
      const combined = [...fromHome, ...fromExtra];
      if (combined.length > 0) return combined;
      // No starting units defined yet — show illustrative tokens so the
      // preview isn't empty for a variant still in progress.
      return provinces.slice(0, 2).map((p, i) => ({
        province: p.id,
        type: i === 0 ? ("army" as const) : ("fleet" as const),
        color: "#6b7280",
      }));
    }, [homeNationsData, extraUnits, provinces, nations]);

    const previewOrders = useMemo((): PreviewOrder[] => {
      const orders: PreviewOrder[] = [];
      if (previewUnits[0]) orders.push({ from: previewUnits[0].province, kind: "hold" });
      if (previewUnits[1]) {
        const adj = adjacenciesData[previewUnits[1].province]?.[0];
        if (adj) orders.push({ from: previewUnits[1].province, to: adj.to, kind: "move" });
      }
      if (previewUnits[2]) {
        const adj = adjacenciesData[previewUnits[2].province]?.[0];
        if (adj) orders.push({ from: previewUnits[2].province, to: adj.to, kind: "support" });
      }
      return orders;
    }, [previewUnits, adjacenciesData]);

    const neededIds = useMemo(() => {
      const ids = new Set<string>();
      for (const u of previewUnits) ids.add(u.province);
      for (const o of previewOrders) {
        ids.add(o.from);
        if (o.to) ids.add(o.to);
      }
      return ids;
    }, [previewUnits, previewOrders]);

    const groupRefs = useRef<Map<string, SVGGElement>>(new Map());
    const [centers, setCenters] = useState<Record<string, { x: number; y: number }>>({});

    useLayoutEffect(() => {
      const next: Record<string, { x: number; y: number }> = {};
      for (const id of neededIds) {
        const el = groupRefs.current.get(id);
        if (!el) continue;
        const box = el.getBBox();
        next[id] = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }
      setCenters(next);
    }, [neededIds, shapes]);

    return (
      <div className="space-y-6">
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <label htmlFor="unit-scale" className="font-medium">
              Unit &amp; order scale
            </label>
            <Input
              id="unit-scale-input"
              type="number"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.05}
              value={scale}
              onChange={e => {
                const next = Number(e.target.value);
                if (!isFinite(next)) return;
                setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)));
              }}
              className="w-24"
            />
          </div>
          <Slider
            id="unit-scale"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.05}
            value={[scale]}
            onValueChange={([next]) => setScale(next)}
          />
          <p className="text-sm text-muted-foreground">
            1 = default size. Below 1 shrinks units and order arrows relative to the map, above 1 enlarges them.
          </p>
        </div>

        <div className="relative w-full overflow-hidden rounded-lg border" style={{ aspectRatio }}>
          {basePreviewUrl && (
            <img src={basePreviewUrl} alt="Map preview" className="absolute inset-0 h-full w-full" />
          )}
          <svg viewBox={viewBox} className="absolute inset-0 h-full w-full">
            {shapes
              .filter(shape => neededIds.has(shape.id))
              .map(shape => (
                <g
                  key={shape.id}
                  ref={el => {
                    if (el) groupRefs.current.set(shape.id, el);
                  }}
                >
                  {shape.paths.map((d, i) => (
                    <path key={i} d={d} fill="#fde047" fillOpacity={0.25} stroke="none" />
                  ))}
                </g>
              ))}

            {previewOrders.map((order, i) => {
              const from = centers[order.from];
              if (!from) return null;
              if (order.kind === "hold") {
                return (
                  <circle
                    key={i}
                    cx={from.x}
                    cy={from.y}
                    r={BASE_HOLD_RING_RADIUS * scale}
                    fill="none"
                    stroke="#111827"
                    strokeWidth={2 * scale}
                  />
                );
              }
              const to = order.to ? centers[order.to] : undefined;
              if (!to) return null;
              const dashed = order.kind === "support";
              return (
                <g key={i}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="#111827"
                    strokeWidth={BASE_LINE_WIDTH * scale}
                    strokeDasharray={dashed ? `${6 * scale} ${4 * scale}` : undefined}
                  />
                  <polygon points={arrowHeadPoints(from, to, scale)} fill="#111827" />
                </g>
              );
            })}

            {previewUnits.map((unit, i) => {
              const c = centers[unit.province];
              if (!c) return null;
              const r = BASE_UNIT_RADIUS * scale;
              return unit.type === "army" ? (
                <circle key={i} cx={c.x} cy={c.y} r={r} fill={unit.color} stroke="#111827" strokeWidth={1.5} />
              ) : (
                <rect
                  key={i}
                  x={c.x - r}
                  y={c.y - r}
                  width={r * 2}
                  height={r * 2}
                  fill={unit.color}
                  stroke="#111827"
                  strokeWidth={1.5}
                />
              );
            })}
          </svg>
        </div>
      </div>
    );
  }
);

UnitScalingForm.displayName = "UnitScalingForm";
