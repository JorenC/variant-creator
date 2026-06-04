export interface ParsedDsvg {
  provinceIds: string[];
  namedCoastIds: string[];
}

export function validateDsvg(svgContent: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  if (doc.querySelector("parseerror")) return "Invalid SVG file.";
  if (doc.documentElement.tagName.toLowerCase() !== "svg") return "File is not an SVG.";
  if (!doc.getElementById("provinces"))
    return "Not a valid dSVG file — missing 'provinces' layer. Create one with the dSVG Creator first.";
  return null;
}

function collectLayerIds(el: Element, result: string[]): void {
  for (const child of Array.from(el.children)) {
    const id = child.getAttribute("id");
    if (id) {
      result.push(id);
    } else {
      collectLayerIds(child, result);
    }
  }
}

export function parseDsvg(svgContent: string): ParsedDsvg {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");

  const provinceIds: string[] = [];
  const namedCoastIds: string[] = [];

  const provincesLayer = doc.getElementById("provinces");
  if (provincesLayer) collectLayerIds(provincesLayer, provinceIds);

  const namedCoastsLayer = doc.getElementById("named-coasts");
  if (namedCoastsLayer) collectLayerIds(namedCoastsLayer, namedCoastIds);

  return { provinceIds, namedCoastIds };
}
