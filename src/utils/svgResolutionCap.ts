import { scaleSubtree, fmt } from "@/utils/svgTransform";

// Matches diplicity-react's rasterizeSvg budget (packages/web/src/components/
// GameMapCanvas/rasterizeSvg.ts) so an exported dSVG is never re-downscaled
// (and blurred) by the renderer at game-board render time.
export const MAX_DSVG_PIXELS = 4_000_000;

export interface ResolutionCapResult {
  output: string;
  capped: boolean;
  originalWidth: number;
  originalHeight: number;
  scaledWidth: number;
  scaledHeight: number;
}

function scaleLengthAttr(el: Element, name: string, scale: number): void {
  const raw = el.getAttribute(name);
  if (raw === null) return;
  const match = raw.match(/^(-?[\d.]+)(.*)$/);
  if (!match) return;
  const value = parseFloat(match[1]);
  if (Number.isNaN(value)) return;
  el.setAttribute(name, `${fmt(value * scale)}${match[2]}`);
}

// Caps the built dSVG's viewBox area to `maxPixels`, scaling all geometry
// down uniformly (never up) so the exported file never exceeds the
// renderer's own rasterisation budget. A no-op when the viewBox is
// missing/invalid or already within budget.
export function capDsvgResolution(
  svgContent: string,
  maxPixels: number = MAX_DSVG_PIXELS
): ResolutionCapResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const root = doc.documentElement;

  const viewBox = root.getAttribute("viewBox");
  const parts = viewBox?.trim().split(/\s+/).map(Number) ?? [];
  const noop = (width: number, height: number): ResolutionCapResult => ({
    output: svgContent,
    capped: false,
    originalWidth: width,
    originalHeight: height,
    scaledWidth: width,
    scaledHeight: height,
  });

  if (parts.length !== 4 || parts.some(Number.isNaN) || parts[2] <= 0 || parts[3] <= 0) {
    return noop(0, 0);
  }

  const [minX, minY, width, height] = parts;
  const area = width * height;
  if (area <= maxPixels) return noop(width, height);

  const scale = Math.sqrt(maxPixels / area);
  scaleSubtree(root, scale);

  const newMinX = minX * scale;
  const newMinY = minY * scale;
  const newWidth = width * scale;
  const newHeight = height * scale;
  root.setAttribute("viewBox", `${fmt(newMinX)} ${fmt(newMinY)} ${fmt(newWidth)} ${fmt(newHeight)}`);
  scaleLengthAttr(root, "width", scale);
  scaleLengthAttr(root, "height", scale);

  return {
    output: new XMLSerializer().serializeToString(doc),
    capped: true,
    originalWidth: width,
    originalHeight: height,
    scaledWidth: newWidth,
    scaledHeight: newHeight,
  };
}
