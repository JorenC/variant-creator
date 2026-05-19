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

export function parseDsvg(svgContent: string): ParsedDsvg {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");

  const provinceIds: string[] = [];
  const namedCoastIds: string[] = [];

  const provincesLayer = doc.getElementById("provinces");
  if (provincesLayer) {
    for (const child of Array.from(provincesLayer.children)) {
      const id = child.getAttribute("id");
      if (id) provinceIds.push(id);
    }
  }

  const namedCoastsLayer = doc.getElementById("named-coasts");
  if (namedCoastsLayer) {
    for (const child of Array.from(namedCoastsLayer.children)) {
      const id = child.getAttribute("id");
      if (id) namedCoastIds.push(id);
    }
  }

  return { provinceIds, namedCoastIds };
}
