/** Fallback CSS `aspect-ratio` when an SVG has no usable viewBox. */
export const FALLBACK_ASPECT_RATIO = "16 / 9";

/** Derives a CSS `aspect-ratio` value (`"w / h"`) from a viewBox string. */
export function aspectRatioFromViewBox(viewBox: string): string {
  const parts = viewBox.split(/\s+/).map(Number);
  return parts.length >= 4 && parts[2] > 0 && parts[3] > 0
    ? `${parts[2]} / ${parts[3]}`
    : FALLBACK_ASPECT_RATIO;
}

/** Derives a CSS `aspect-ratio` value (`"w / h"`) from an SVG document's viewBox. */
export function aspectRatioFromSvg(svgContent: string): string {
  const doc = new DOMParser().parseFromString(svgContent, "image/svg+xml");
  const viewBox = doc.documentElement.getAttribute("viewBox") ?? "";
  return aspectRatioFromViewBox(viewBox);
}
