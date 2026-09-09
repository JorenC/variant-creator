import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { extractDsvgProvinceShapes, buildProvincePreviewSvg } from "@/utils/dvarPreview";
import { prepareShape, disposeShape } from "@/utils/geometry";
import { aspectRatioFromViewBox } from "@/utils/svgAspect";
import { useSvgObjectUrl } from "@/hooks/useSvgObjectUrl";
import { octagon, arrow, formatCoord, type Point } from "@/utils/orderPrimitives";
import {
  UNIT_RADIUS,
  UNIT_STROKE_WIDTH,
  UNIT_LABEL_FONT_SIZE,
  UNIT_LABEL_BASELINE_DY,
  ORDER_LINE_WIDTH,
  ORDER_ARROW_WIDTH,
  ORDER_ARROW_LENGTH,
  ORDER_STROKE_WIDTH,
  ORDER_DASH,
  ORDER_SUCCESS_COLOR,
  HOLD_OCTAGON_SIZE,
  MIN_UNIT_SCALE,
  MAX_UNIT_SCALE,
} from "@/utils/unitRenderMetrics";
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

const STEP = 0.05;
const clamp = (value: number): number =>
  Math.min(MAX_UNIT_SCALE, Math.max(MIN_UNIT_SCALE, value));

type PreviewUnit = { province: string; type: "army" | "fleet"; color: string };
type PreviewOrder = { from: string; to?: string; kind: "hold" | "move" | "support" };

/**
 * Faithful port of `unitToken` from diplicity-react's mapRenderer.ts — a
 * nation-coloured circle of radius `UNIT_RADIUS * scale` with a black "A"/"F"
 * label. The `+ UNIT_LABEL_BASELINE_DY` baseline nudge is scaled along with the
 * font size so the glyph stays centred in the circle at every scale — the whole
 * token is then a uniform zoom of its scale-1 rendering about `(cx, cy)`.
 */
function unitTokenMarkup(cx: number, cy: number, type: "army" | "fleet", color: string, scale: number): string {
  const label = type === "army" ? "A" : "F";
  return (
    `<circle cx="${formatCoord(cx)}" cy="${formatCoord(cy)}" r="${formatCoord(UNIT_RADIUS * scale)}"` +
    ` fill="${color}" stroke="black" stroke-width="${formatCoord(UNIT_STROKE_WIDTH * scale)}"/>` +
    `<text x="${formatCoord(cx)}" y="${formatCoord(cy + UNIT_LABEL_BASELINE_DY * scale)}"` +
    ` font-size="${formatCoord(UNIT_LABEL_FONT_SIZE * scale)}" font-weight="bold" fill="black" text-anchor="middle">${label}</text>`
  );
}

/** Mirror of `holdMarkup`: a transparent octagon stroked at the order line width. */
function holdMarkup(at: Point, scale: number): string {
  return octagon({
    x: at.x,
    y: at.y,
    size: HOLD_OCTAGON_SIZE * scale,
    fill: "transparent",
    stroke: ORDER_SUCCESS_COLOR,
    strokeWidth: ORDER_LINE_WIDTH * scale,
  });
}

/**
 * Mirror of the plain-move arrow in `moveOrderParts`. Support orders reuse the
 * same primitive with the scaled `ORDER_DASH` pattern; production curves the
 * support arrow, but every width/length is identical, which is what the scale
 * preview needs to show.
 */
function orderArrowMarkup(from: Point, to: Point, color: string, scale: number, dashed: boolean): string {
  return arrow({
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    lineWidth: ORDER_LINE_WIDTH * scale,
    arrowWidth: ORDER_ARROW_WIDTH * scale,
    arrowLength: ORDER_ARROW_LENGTH * scale,
    strokeWidth: ORDER_STROKE_WIDTH * scale,
    offset: UNIT_RADIUS * scale,
    stroke: ORDER_SUCCESS_COLOR,
    fill: color,
    dash: dashed
      ? { length: ORDER_DASH.length * scale, spacing: ORDER_DASH.spacing * scale }
      : undefined,
  });
}

export const UnitScalingForm = forwardRef<UnitScalingFormHandle, UnitScalingFormProps>(
  ({ svgContent, provinces, homeNationsData, extraUnits, adjacenciesData, nations, defaultValue, onSubmit }, ref) => {
    const [scale, setScale] = useState(clamp(defaultValue));

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

    const centers = useMemo(() => {
      const next: Record<string, { x: number; y: number }> = {};
      for (const shape of shapes) {
        if (!neededIds.has(shape.id)) continue;
        const prepared = prepareShape(shape.paths);
        if (prepared.bounds) {
          next[shape.id] = {
            x: prepared.bounds.x + prepared.bounds.width / 2,
            y: prepared.bounds.y + prepared.bounds.height / 2,
          };
        }
        disposeShape(prepared);
      }
      return next;
    }, [shapes, neededIds]);

    // Units first, then orders on top — the same layer order as
    // DiplicityMap.render(). Uses the ported primitives + shared metrics so
    // sizes track diplicity-react's renderer exactly at any scale.
    const overlayMarkup = useMemo(() => {
      const units = previewUnits
        .map(unit => {
          const c = centers[unit.province];
          return c ? unitTokenMarkup(c.x, c.y, unit.type, unit.color, scale) : "";
        })
        .join("");
      const orders = previewOrders
        .map(order => {
          const from = centers[order.from];
          if (!from) return "";
          if (order.kind === "hold") return holdMarkup(from, scale);
          const to = order.to ? centers[order.to] : undefined;
          if (!to) return "";
          const unit = previewUnits.find(u => u.province === order.from);
          return orderArrowMarkup(from, to, unit?.color ?? "#6b7280", scale, order.kind === "support");
        })
        .join("");
      return `${units}${orders}`;
    }, [previewUnits, previewOrders, centers, scale]);

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
              min={MIN_UNIT_SCALE}
              max={MAX_UNIT_SCALE}
              step={STEP}
              value={scale}
              onChange={e => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next)) return;
                setScale(clamp(next));
              }}
              className="w-24"
            />
          </div>
          <Slider
            id="unit-scale"
            min={MIN_UNIT_SCALE}
            max={MAX_UNIT_SCALE}
            step={STEP}
            value={[scale]}
            onValueChange={([next]) => setScale(next)}
          />
          <p className="text-sm text-muted-foreground">
            1 = default size. Below 1 shrinks units and order arrows relative to the map, above 1 enlarges them. The map itself is unaffected.
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
                <g key={shape.id}>
                  {shape.paths.map((d, i) => (
                    <path key={i} d={d} fill="#fde047" fillOpacity={0.25} stroke="none" />
                  ))}
                </g>
              ))}
            <g dangerouslySetInnerHTML={{ __html: overlayMarkup }} />
          </svg>
        </div>
      </div>
    );
  }
);

UnitScalingForm.displayName = "UnitScalingForm";
